import { randomUUID } from 'node:crypto';

import {
  MAP_PLACES_LIMIT,
  MAX_PHOTO_BYTES,
  type CreatePhotoUploadInput,
  type CreatePlacePostInput,
  type MapPlace,
  type MapPlacesQuery,
  type PhotoUpload,
  type PlacePost,
  type PlacePostPage,
  type PlacePostReactions,
  type PlacePostReportInput,
  type PlacePostsQuery,
  type PlacePostStatus,
  type SavedPlacePostsQuery,
} from '@kapp/shared';

import { BadRequestError, NotFoundError, UnauthorizedError } from '../../http/errors';
import { withTimeout } from '../../lib/timeout';
import { ObjectTooLargeError, type ObjectStorage } from '../../storage/object-storage';
import type { Logger, Notifier } from '../notifications/notifier';
import { InvalidImageError, processPhoto } from '../photos/photo-image';
import { bestEffort, newUploadKey, signPhoto, storageCall, UPLOAD_URL_TTL_SECONDS, uploadPrefix, type PhotoKeys } from '../photos/photo-storage';
import { firstName } from '../safety/block-sql';
import { REWARD_RULES } from '../rewards/reward-rules';
import type { RewardsService } from '../rewards/rewards.service';
import type { Page, PlacePostRecord, PlacePostsRepository } from './place-posts.repository';

/**
 * Place posts ("Avasta"): recommend a dog-friendly place with photos, the feed, likes, bookmarks,
 * reports, moderation and the map pins. Photos reuse the M4 pipeline: presigned upload → sharp
 * re-encode to WebP (EXIF/GPS stripped) → private bucket → short-lived signed URLs.
 */
export interface PlacePostsService {
  createUpload(userId: string, input: CreatePhotoUploadInput): Promise<PhotoUpload>;
  create(userId: string, input: CreatePlacePostInput): Promise<PlacePost>;
  feed(viewerId: string | undefined, query: PlacePostsQuery): Promise<PlacePostPage>;
  saved(userId: string, query: SavedPlacePostsQuery): Promise<PlacePostPage>;
  mine(userId: string, query: SavedPlacePostsQuery): Promise<PlacePostPage>;
  get(viewerId: string | undefined, postId: string): Promise<PlacePost>;
  remove(userId: string, postId: string): Promise<void>;
  setLike(userId: string, postId: string, on: boolean): Promise<PlacePostReactions>;
  setSave(userId: string, postId: string, on: boolean): Promise<PlacePostReactions>;
  report(userId: string, postId: string, input: PlacePostReportInput): Promise<{ id: string }>;
  /** Course demo moderation (no admin UI): approve awards the author and notifies; idempotent. */
  moderate(postId: string, decision: 'approve' | 'reject'): Promise<{ status: PlacePostStatus; changed: boolean }>;
  mapPlaces(viewerId: string | undefined, query: MapPlacesQuery): Promise<MapPlace[]>;
}

const POST_NOT_FOUND = 'errors.placePostNotFound';
const UPLOAD_NOT_FOUND = 'errors.uploadNotFound';

export const placePrefix = (postId: string) => `places/${postId}/`;
const placePhotoKeys = (postId: string, photoId: string): PhotoKeys => ({
  imageKey: `places/${postId}/${photoId}/full.webp`,
  thumbnailKey: `places/${postId}/${photoId}/thumb.webp`,
});

export function createPlacePostsService({
  repository,
  storage,
  rewards,
  notifier,
  log,
  timeoutMs,
}: {
  repository: PlacePostsRepository;
  storage: ObjectStorage;
  rewards: Pick<RewardsService, 'settle'>;
  notifier: Notifier;
  log: Logger;
  timeoutMs: number;
}): PlacePostsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);
  const s = <T>(p: Promise<T>, label: string) => storageCall(p, timeoutMs, label);

  async function toPost(record: PlacePostRecord, viewerId: string | undefined): Promise<PlacePost> {
    const photos = await s(Promise.all(record.photos.map((keys) => signPhoto(storage, keys))), 'storage.sign');
    return {
      id: record.id,
      author: { id: record.authorId, firstName: firstName(record.authorName) },
      isMine: record.authorId === viewerId,
      name: record.name,
      category: record.category,
      lat: record.lat,
      lng: record.lng,
      address: record.address,
      amenities: record.amenities,
      body: record.body,
      photos,
      status: record.status,
      likeCount: record.likeCount,
      liked: record.liked,
      saved: record.saved,
      ...(record.distanceKm === undefined ? {} : { distanceKm: Math.round(record.distanceKm * 10) / 10 }),
      createdAt: record.createdAt.toISOString(),
    };
  }

  async function toPage(page: Page, viewerId: string | undefined): Promise<PlacePostPage> {
    return { items: await Promise.all(page.records.map((r) => toPost(r, viewerId))), nextCursor: page.nextCursor };
  }

  async function requireVisible(viewerId: string | undefined, postId: string) {
    const record = await t(repository.findVisible(viewerId, postId), 'placePosts.findVisible');
    if (!record) throw new NotFoundError(POST_NOT_FOUND);
    return record;
  }

  /** Same checks as dog photos: own key, real size, decodable image; the raw upload is deleted after. */
  async function processUpload(uploadKey: string) {
    const info = await s(storage.stat(uploadKey), 'storage.stat');
    if (!info) throw new NotFoundError(UPLOAD_NOT_FOUND);
    if (info.byteSize > MAX_PHOTO_BYTES) {
      await bestEffort(s(storage.remove([uploadKey]), 'storage.removeUpload'));
      throw new BadRequestError('errors.photoTooLarge', { max: MAX_PHOTO_BYTES / 1024 / 1024 });
    }
    let raw: Buffer | null;
    try {
      raw = await s(storage.read(uploadKey, MAX_PHOTO_BYTES), 'storage.read');
    } catch (error) {
      if (!(error instanceof ObjectTooLargeError)) throw error;
      await bestEffort(s(storage.remove([uploadKey]), 'storage.removeUpload'));
      throw new BadRequestError('errors.photoTooLarge', { max: MAX_PHOTO_BYTES / 1024 / 1024 });
    }
    if (!raw) throw new NotFoundError(UPLOAD_NOT_FOUND);
    try {
      return await t(processPhoto(raw), 'photos.process');
    } catch (error) {
      if (!(error instanceof InvalidImageError)) throw error;
      await bestEffort(s(storage.remove([uploadKey]), 'storage.removeUpload'));
      throw new BadRequestError('errors.notAnImage');
    }
  }

  async function reactions(userId: string, postId: string) {
    return t(repository.reactions(userId, postId), 'placePosts.reactions');
  }

  return {
    async createUpload(userId, input) {
      const uploadKey = newUploadKey(userId);
      const signed = await s(storage.createUploadUrl(uploadKey, input, UPLOAD_URL_TTL_SECONDS), 'storage.presignPut');
      return { uploadKey, url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt.toISOString() };
    },

    async create(userId, { photoUploadKeys, ...input }) {
      // Someone else's upload key is "not found", like for dog photos: no turning others' files into posts.
      if (photoUploadKeys.some((key) => !key.startsWith(uploadPrefix(userId)))) throw new NotFoundError(UPLOAD_NOT_FOUND);
      const id = randomUUID();
      const photos: (PhotoKeys & { id: string; position: number })[] = [];
      try {
        // One photo at a time: each decode can take tens of MB, five in parallel would multiply that.
        for (const [position, uploadKey] of photoUploadKeys.entries()) {
          const processed = await processUpload(uploadKey);
          const photoId = randomUUID();
          const keys = placePhotoKeys(id, photoId);
          await s(
            Promise.all([storage.write(keys.imageKey, processed.full, 'image/webp'), storage.write(keys.thumbnailKey, processed.thumbnail, 'image/webp')]),
            'storage.write',
          );
          photos.push({ id: photoId, position, ...keys });
        }
        // Objects first, row last (docs/06): a failure leaves no row pointing at missing objects.
        await t(repository.create({ id, authorId: userId, ...input, photos }), 'placePosts.create');
      } catch (error) {
        await bestEffort(s(storage.removePrefix(placePrefix(id)), 'storage.rollback'));
        throw error;
      }
      // The raw uploads may still contain EXIF/GPS; they must not outlive processing.
      if (photoUploadKeys.length > 0) await bestEffort(s(storage.remove(photoUploadKeys), 'storage.removeUploads'));
      return toPost(await requireVisible(userId, id), userId);
    },

    async feed(viewerId, { lat, lng, radiusKm, category, scope, before, limit }) {
      if (scope === 'friends' && !viewerId) throw new UnauthorizedError();
      const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const page = await t(repository.feed(viewerId, { origin, radiusKm, category, friendsOnly: scope === 'friends', before, limit }), 'placePosts.feed');
      return toPage(page, viewerId);
    },

    async saved(userId, { before, limit }) {
      return toPage(await t(repository.saved(userId, before, limit), 'placePosts.saved'), userId);
    },

    async mine(userId, { before, limit }) {
      return toPage(await t(repository.mine(userId, before, limit), 'placePosts.mine'), userId);
    },

    async get(viewerId, postId) {
      return toPost(await requireVisible(viewerId, postId), viewerId);
    },

    async remove(userId, postId) {
      const removed = await t(repository.remove(userId, postId), 'placePosts.remove');
      if (!removed) throw new NotFoundError(POST_NOT_FOUND);
      // Row first, objects after (best effort), like dog photos. Points already paid for an approved
      // post stay: the ledger is append-only and the post was real when it was approved.
      await bestEffort(s(storage.removePrefix(placePrefix(postId)), 'storage.removePost'));
    },

    async setLike(userId, postId, on) {
      await requireVisible(userId, postId);
      await t(repository.setLike(userId, postId, on), 'placePosts.setLike');
      return reactions(userId, postId);
    },

    async setSave(userId, postId, on) {
      await requireVisible(userId, postId);
      await t(repository.setSave(userId, postId, on), 'placePosts.setSave');
      return reactions(userId, postId);
    },

    async report(userId, postId, { reason, details }) {
      const record = await requireVisible(userId, postId);
      if (record.authorId === userId) throw new BadRequestError('errors.cannotReportSelf');
      return t(repository.report({ postId, reporterId: userId, reason, details }), 'placePosts.report');
    },

    async moderate(postId, decision) {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const result = await t(repository.moderate(postId, status), 'placePosts.moderate');
      if (!result) throw new NotFoundError(POST_NOT_FOUND);
      if (result.changed && status === 'approved') {
        // Points first (settle never throws), then the notification; both are retry-safe.
        await rewards.settle(result.authorId);
        await notifier.notify({
          type: 'place_post_approved',
          recipientId: result.authorId,
          actorId: null,
          data: { postId, placeName: result.name, points: String(REWARD_RULES.placePost.points) },
        });
      } else if (!result.changed) {
        // A moderated post is final: re-deciding would mean taking back paid points (append-only ledger).
        log.warn({ postId, status: result.status }, 'post was already moderated; nothing changed');
      }
      return { status: result.status, changed: result.changed };
    },

    async mapPlaces(viewerId, { minLat, minLng, maxLat, maxLng, tags }) {
      return t(repository.mapPlaces(viewerId, { minLat, minLng, maxLat, maxLng }, tags, MAP_PLACES_LIMIT), 'placePosts.mapPlaces');
    },
  };
}
