import type { MapPlace, MapTag, PlaceAmenity, PlaceCategory, PlacePostStatus } from '@kapp/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { placePostLikes, placePostPhotos, placePostReports, placePosts, placePostSaves } from '../../db/schema';
import type { PhotoKeys } from '../photos/photo-storage';
import { blockedBetween, friendsBetween } from '../safety/block-sql';

/**
 * Data access for place posts ("Avasta"), reactions, reports and the map pins. Visibility lives in
 * SQL so hidden posts never leave the database: others see a post only when it is approved and
 * nobody has blocked anybody (block-sql.ts); the author always sees their own.
 */

export interface PlacePostRecord {
  id: string;
  authorId: string;
  authorName: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string | null;
  amenities: PlaceAmenity[];
  body: string | null;
  status: PlacePostStatus;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  distanceKm?: number;
  createdAt: Date;
  photos: PhotoKeys[];
}

export interface NewPlacePost {
  id: string;
  authorId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string | null;
  amenities: PlaceAmenity[];
  body: string | null;
  photos: (PhotoKeys & { id: string; position: number })[];
}

export interface FeedFilter {
  origin?: { lat: number; lng: number };
  radiusKm: number;
  category?: PlaceCategory;
  friendsOnly: boolean;
  before?: string;
  limit: number;
}

export interface Page {
  records: PlacePostRecord[];
  nextCursor: string | null;
}

export interface PlacePostsRepository {
  /** Post + photos in one transaction (status pending). */
  create(input: NewPlacePost): Promise<void>;
  /** Approved posts the viewer may see, plus the viewer's own pending ones; newest first. */
  feed(viewerId: string | undefined, filter: FeedFilter): Promise<Page>;
  /** The viewer's bookmarks that are still visible, most recently saved first. */
  saved(viewerId: string, before: string | undefined, limit: number): Promise<Page>;
  /** All of the author's posts in every status, newest first. */
  mine(authorId: string, before: string | undefined, limit: number): Promise<Page>;
  /** Null when missing, not visible to the viewer, or blocked either way (→ 404). */
  findVisible(viewerId: string | undefined, postId: string): Promise<PlacePostRecord | null>;
  /** Only the author's own post; null otherwise. Returns what is needed to clean up storage. */
  remove(authorId: string, postId: string): Promise<{ id: string } | null>;
  /** Idempotent: liking twice leaves one like (primary key). */
  setLike(userId: string, postId: string, on: boolean): Promise<void>;
  setSave(userId: string, postId: string, on: boolean): Promise<void>;
  reactions(userId: string, postId: string): Promise<{ liked: boolean; saved: boolean; likeCount: number }>;
  /** One report per person and post; a repeat returns the first report's id. */
  report(input: { postId: string; reporterId: string; reason: string; details: string | null }): Promise<{ id: string }>;
  /**
   * Moderation (npm run moderate:post): pending → approved/rejected. `changed` is false when the post
   * already had that status (idempotent); null when there is no such post.
   */
  moderate(postId: string, status: 'approved' | 'rejected'): Promise<{ authorId: string; name: string; status: PlacePostStatus; changed: boolean } | null>;
  /** Pins inside a bounding box: approved parks and posts and service providers, each with a map tag. */
  mapPlaces(viewerId: string | undefined, box: { minLat: number; minLng: number; maxLat: number; maxLng: number }, tags: MapTag[] | undefined, limit: number): Promise<MapPlace[]>;
}

type Row = {
  id: string;
  author_id: string;
  author_name: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string | null;
  amenities: PlaceAmenity[] | string;
  body: string | null;
  status: PlacePostStatus;
  like_count: number;
  liked: boolean;
  saved: boolean;
  distance_km: number | null;
  created_at: Date;
};

/** node-postgres returns arrays of a custom enum as the literal "{a,b}" — parse it by hand. */
export function parseEnumArray<T extends string>(value: T[] | string | null): T[] {
  if (Array.isArray(value)) return value;
  if (!value || value === '{}') return [];
  return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean) as T[];
}

const P = sql.raw('p');
const AUTHOR = sql.raw('p.author_id');

/** Who may see post `p`: the author, or anyone when it is approved and nobody blocked anybody. */
function visibleTo(viewerId: string | undefined): SQL {
  if (!viewerId) return sql`p.status = 'approved'`;
  return sql`(p.author_id = ${viewerId} or (p.status = 'approved' and not ${blockedBetween(sql`${viewerId}`, AUTHOR)}))`;
}

function selectColumns(viewerId: string | undefined, origin?: { lat: number; lng: number }): SQL {
  const distance = origin
    ? sql`ST_Distance(${P}.location::geography, ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography) / 1000`
    : sql`null::float8`;
  const viewer = viewerId ?? '';
  return sql`
    p.id, p.author_id, u.name as author_name, p.name, p.category, ST_Y(p.location) as lat, ST_X(p.location) as lng,
    p.address, p.amenities, p.body, p.status, p.created_at,
    (select count(*)::int from place_post_likes l where l.post_id = p.id) as like_count,
    exists (select 1 from place_post_likes l where l.post_id = p.id and l.user_id = ${viewer}) as liked,
    exists (select 1 from place_post_saves s where s.post_id = p.id and s.user_id = ${viewer}) as saved,
    ${distance} as distance_km`;
}

export function createPlacePostsRepository(db: Db): PlacePostsRepository {
  async function withPhotos(rows: Row[]): Promise<PlacePostRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const photos = await db
      .select({ postId: placePostPhotos.postId, imageKey: placePostPhotos.imageKey, thumbnailKey: placePostPhotos.thumbnailKey })
      .from(placePostPhotos)
      .where(sql`${placePostPhotos.postId} in ${ids}`)
      .orderBy(placePostPhotos.postId, placePostPhotos.position);
    const byPost = new Map<string, PhotoKeys[]>();
    for (const { postId, ...keys } of photos) byPost.set(postId, [...(byPost.get(postId) ?? []), keys]);
    return rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
      address: r.address,
      amenities: parseEnumArray(r.amenities),
      body: r.body,
      status: r.status,
      likeCount: r.like_count,
      liked: Boolean(r.liked),
      saved: Boolean(r.saved),
      ...(r.distance_km === null ? {} : { distanceKm: Number(r.distance_km) }),
      createdAt: new Date(r.created_at),
      photos: byPost.get(r.id) ?? [],
    }));
  }

  async function page(query: SQL, limit: number): Promise<Page> {
    const { rows } = await db.execute<Row>(query);
    const records = await withPhotos(rows.slice(0, limit));
    return { records, nextCursor: rows.length > limit ? records[records.length - 1]!.id : null };
  }

  /** Keyset on (created_at, id): stable while new posts arrive. */
  const cursor = (before: string | undefined) =>
    before ? sql`(p.created_at, p.id) < (select c.created_at, c.id from place_posts c where c.id = ${before})` : sql`true`;

  return {
    async create({ id, authorId, name, category, lat, lng, address, amenities, body, photos }) {
      await db.transaction(async (tx) => {
        await tx.insert(placePosts).values({ id, authorId, name, category, location: { x: lng, y: lat }, address, amenities, body });
        if (photos.length > 0) await tx.insert(placePostPhotos).values(photos.map((p) => ({ ...p, postId: id })));
      });
    },

    feed(viewerId, { origin, radiusKm, category, friendsOnly, before, limit }) {
      const conditions: SQL[] = [
        // The author sees own pending posts in the feed; rejected ones only under "Minu postitused".
        viewerId ? sql`(${visibleTo(viewerId)} and (p.status <> 'rejected'))` : visibleTo(undefined),
        cursor(before),
      ];
      if (origin) {
        conditions.push(
          sql`ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography, ${radiusKm * 1000})`,
        );
      }
      if (category) conditions.push(sql`p.category = ${category}`);
      if (friendsOnly && viewerId) conditions.push(friendsBetween(sql`${viewerId}`, AUTHOR));
      return page(
        sql`select ${selectColumns(viewerId, origin)}
            from place_posts p join "user" u on u.id = p.author_id
            where ${sql.join(conditions, sql` and `)}
            order by p.created_at desc, p.id desc
            limit ${limit + 1}`,
        limit,
      );
    },

    saved(viewerId, before, limit) {
      // Paged by the save time, not the post time: "what I saved last" comes first.
      const savedCursor = before
        ? sql`(s.created_at, p.id) < (select s2.created_at, s2.post_id from place_post_saves s2 where s2.post_id = ${before} and s2.user_id = ${viewerId})`
        : sql`true`;
      return page(
        sql`select ${selectColumns(viewerId)}
            from place_post_saves s
            join place_posts p on p.id = s.post_id
            join "user" u on u.id = p.author_id
            where s.user_id = ${viewerId} and ${visibleTo(viewerId)} and ${savedCursor}
            order by s.created_at desc, p.id desc
            limit ${limit + 1}`,
        limit,
      );
    },

    mine(authorId, before, limit) {
      return page(
        sql`select ${selectColumns(authorId)}
            from place_posts p join "user" u on u.id = p.author_id
            where p.author_id = ${authorId} and ${cursor(before)}
            order by p.created_at desc, p.id desc
            limit ${limit + 1}`,
        limit,
      );
    },

    async findVisible(viewerId, postId) {
      const { rows } = await db.execute<Row>(sql`
        select ${selectColumns(viewerId)}
        from place_posts p join "user" u on u.id = p.author_id
        where p.id = ${postId} and ${visibleTo(viewerId)}`);
      const [record] = await withPhotos(rows);
      return record ?? null;
    },

    async remove(authorId, postId) {
      const [row] = await db
        .delete(placePosts)
        .where(and(eq(placePosts.id, postId), eq(placePosts.authorId, authorId)))
        .returning({ id: placePosts.id });
      return row ?? null;
    },

    async setLike(userId, postId, on) {
      if (on) await db.insert(placePostLikes).values({ userId, postId }).onConflictDoNothing();
      else await db.delete(placePostLikes).where(and(eq(placePostLikes.userId, userId), eq(placePostLikes.postId, postId)));
    },

    async setSave(userId, postId, on) {
      if (on) await db.insert(placePostSaves).values({ userId, postId }).onConflictDoNothing();
      else await db.delete(placePostSaves).where(and(eq(placePostSaves.userId, userId), eq(placePostSaves.postId, postId)));
    },

    async reactions(userId, postId) {
      const { rows } = await db.execute<{ liked: boolean; saved: boolean; like_count: number }>(sql`
        select
          exists (select 1 from place_post_likes l where l.post_id = ${postId} and l.user_id = ${userId}) as liked,
          exists (select 1 from place_post_saves s where s.post_id = ${postId} and s.user_id = ${userId}) as saved,
          (select count(*)::int from place_post_likes l where l.post_id = ${postId}) as like_count`);
      const r = rows[0]!;
      return { liked: Boolean(r.liked), saved: Boolean(r.saved), likeCount: r.like_count };
    },

    async report({ postId, reporterId, reason, details }) {
      const [created] = await db
        .insert(placePostReports)
        .values({ postId, reporterId, reason, details })
        .onConflictDoNothing()
        .returning({ id: placePostReports.id });
      if (created) return created;
      const [existing] = await db
        .select({ id: placePostReports.id })
        .from(placePostReports)
        .where(and(eq(placePostReports.postId, postId), eq(placePostReports.reporterId, reporterId)));
      if (!existing) throw new Error('Report neither inserted nor found');
      return existing;
    },

    async moderate(postId, status) {
      // Conditional update: only a pending post changes, so approving twice pays and notifies once.
      const [changed] = await db
        .update(placePosts)
        .set({ status, moderatedAt: sql`now()` })
        .where(and(eq(placePosts.id, postId), eq(placePosts.status, 'pending')))
        .returning({ authorId: placePosts.authorId, name: placePosts.name });
      if (changed) return { ...changed, status, changed: true };
      const [existing] = await db
        .select({ authorId: placePosts.authorId, name: placePosts.name, status: placePosts.status })
        .from(placePosts)
        .where(eq(placePosts.id, postId));
      if (!existing) return null;
      return { authorId: existing.authorId, name: existing.name, status: existing.status, changed: false };
    },

    async mapPlaces(viewerId, { minLat, minLng, maxLat, maxLng }, tags, limit) {
      const box = sql`ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)`;
      const postVisible = viewerId ? sql`not ${blockedBetween(sql`${viewerId}`, AUTHOR)}` : sql`true`;
      const tagFilter = tags && tags.length > 0 ? sql`where pins.tag in ${tags}` : sql``;
      const { rows } = await db.execute<{ id: string; kind: MapPlace['kind']; tag: MapTag; category: string; name: string; lat: number; lng: number }>(sql`
        select * from (
          -- An unfenced park with water is a dog swimming spot (koertepargid.ee import): a "Rannad" pin.
          select k.id, 'park' as kind,
            case when k.water and not k.fenced then 'beaches' else 'parks' end as tag,
            case when k.water and not k.fenced then 'beach' else 'park' end as category,
            k.name, ST_Y(k.location) as lat, ST_X(k.location) as lng
          from parks k where k.status = 'approved' and k.location && ${box}
          union all
          select p.id, 'post' as kind,
            case p.category when 'cafe' then 'cafes' when 'park' then 'parks' when 'beach' then 'beaches' else 'other' end as tag,
            p.category::text as category, p.name, ST_Y(p.location) as lat, ST_X(p.location) as lng
          from place_posts p where p.status = 'approved' and p.location && ${box} and ${postVisible}
          union all
          select s.id, 'provider' as kind, case s.category when 'vet' then 'clinics' else 'services' end as tag,
            s.category::text as category, s.name, ST_Y(s.location) as lat, ST_X(s.location) as lng
          from service_providers s where s.location && ${box}
        ) pins
        ${tagFilter}
        order by pins.name, pins.id
        limit ${limit}`);
      return rows.map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) }));
    },
  };
}
