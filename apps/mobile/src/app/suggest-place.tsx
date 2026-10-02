import {
  createPlacePostInputSchema,
  PLACE_ADDRESS_MAX,
  PLACE_AMENITIES,
  PLACE_NAME_MAX,
  PLACE_POST_BODY_MAX,
  PLACE_POST_MAX_PHOTOS,
  type PlaceAmenity,
  type PlaceCategory,
} from '@kapp/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { IconChip } from '@/components/icon-chip';
import { InfoCard } from '@/components/info-card';
import { LocationPicker } from '@/components/location-picker';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useCreatePlacePost, type PickedPhoto } from '@/hooks/use-explore';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { PLACE_CATEGORY_ICON, SUGGEST_CATEGORIES, toggleAmenity } from '@/lib/explore';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';
import { pointsFor } from '@/lib/rewards';
import { makeCover } from '@/lib/upload-order';
import { setExploreView } from '@/state/explore-view';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
const TILE = 104;

/** 5 decimals ≈ 1 m: a place needs its own point, not the ~100 m rounding used for "nearby" lists. */
const precise = (n: number) => Math.round(n * 100_000) / 100_000;

/**
 * Figma 09 / Explore / Suggest Place (85:8637): photos (≤ 5), place name, location, category,
 * amenities, a short text, "Teenid 15 käppa" and "Postita". The post is `pending` until a
 * moderator approves it; then the server awards the points (amount from GET /me/rewards).
 *
 * Location (docs/16 → M9b-app): a small map with a fixed centre pin the user drags under the place,
 * starting at the device position, plus "Kasuta minu asukohta" and a free-text address. Why not
 * geocoding the address: no geocoder in the stack (a new paid service and another place the
 * address would be sent to); the pin gives the exact point the map needs and the address is what
 * people read on the card.
 */
export default function SuggestPlaceScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const location = useDeviceLocation();
  const create = useCreatePlacePost();
  const points = pointsFor(useRewards().data, 'place_post');

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [amenities, setAmenities] = useState<PlaceAmenity[]>([]);
  const [body, setBody] = useState('');
  const [point, setPoint] = useState(location.origin);
  const [pointChosen, setPointChosen] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [locating, setLocating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The device position may arrive after the screen opened; follow it until the user moves the pin.
  useEffect(() => {
    if (pointChosen) return;
    setPoint(location.origin);
    setRecenter((n) => n + 1);
  }, [location.origin, pointChosen]);

  async function useMyLocation() {
    setFormError(null);
    setLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('location.deniedTitle'), t('suggest.locationDenied'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPoint({ lat: precise(here.coords.latitude), lng: precise(here.coords.longitude) });
      setPointChosen(true);
      setRecenter((n) => n + 1);
      haptic('selection');
    } catch {
      setFormError(t('suggest.locationFailed'));
    } finally {
      setLocating(false);
    }
  }

  async function addPhotos(source: 'camera' | 'library') {
    const remaining = PLACE_POST_MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('photos.cameraDeniedTitle'), t('suggest.cameraDenied'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
    }
    // The library uses the system photo picker, which needs no permission: the user picks.
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS, allowsMultipleSelection: true, selectionLimit: remaining, orderedSelection: true });
    if (result.canceled) return;
    const picked = result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
    setPhotos((list) => [...list, ...picked].slice(0, PLACE_POST_MAX_PHOTOS));
  }

  function choosePhotoSource() {
    Alert.alert(t('suggest.addPhoto'), undefined, [
      { text: t('photos.camera'), onPress: () => void addPhotos('camera') },
      { text: t('photos.library'), onPress: () => void addPhotos('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function photoActions(index: number) {
    Alert.alert(t('suggest.photoTitle', { position: index + 1, total: photos.length }), undefined, [
      ...(index > 0 ? [{ text: t('suggest.makeCover'), onPress: () => setPhotos((list) => makeCover(list, index)) }] : []),
      { text: t('suggest.removePhoto'), style: 'destructive' as const, onPress: () => setPhotos((list) => list.filter((_, i) => i !== index)) },
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }

  async function submit() {
    setFormError(null);
    if (!category) {
      setErrors({ category: t('suggest.chooseCategory') });
      return;
    }
    if (!pointChosen && location.usingFallback) {
      setErrors({ lat: t('suggest.choosePoint') });
      return;
    }
    // Same schema as the API (upload keys come after the photos are uploaded).
    const { data, errors: invalid } = validateForm(createPlacePostInputSchema, {
      name,
      category,
      lat: point.lat,
      lng: point.lng,
      address,
      amenities,
      body,
      photoUploadKeys: [],
    });
    setErrors(invalid ?? {});
    if (!data) return;
    const { photoUploadKeys: _keys, ...input } = data;
    try {
      await create.mutateAsync({ input, photos, onProgress: (done, total) => setProgress({ done, total }) });
      haptic('success');
      AccessibilityInfo.announceForAccessibility(t('suggest.sent'));
      // Back to Avasta, where the new post waits at the top with "Ootab kinnitust".
      setExploreView('feed');
      router.back();
    } catch (e) {
      haptic('error');
      setFormError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress && progress.total > 0 && progress.done < progress.total;

  return (
    <Screen underHeader title={t('suggest.title')} subtitle={t('suggest.subtitle')}>
      <FormError message={formError} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos} style={styles.photosBleed}>
        {photos.map((photo, i) => (
          <PressableScale
            key={photo.uri}
            accessibilityRole="button"
            accessibilityLabel={i === 0 ? t('suggest.photoCoverA11y', { position: i + 1, total: photos.length }) : t('suggest.photoA11y', { position: i + 1, total: photos.length })}
            accessibilityHint={t('suggest.photoHint')}
            onPress={() => photoActions(i)}>
            <Image source={{ uri: photo.uri }} style={[styles.tile, { backgroundColor: c.soft }]} contentFit="cover" accessible={false} />
            <View style={[styles.remove, { backgroundColor: c.surface }]} accessibilityElementsHidden importantForAccessibility="no">
              <Icon name="x" size={14} color={c.text} />
            </View>
          </PressableScale>
        ))}
        {photos.length < PLACE_POST_MAX_PHOTOS ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('suggest.addPhoto')}
            accessibilityHint={t('suggest.addPhotoHint', { max: PLACE_POST_MAX_PHOTOS })}
            onPress={choosePhotoSource}
            style={[styles.tile, styles.add, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Icon name="camera" size={24} color={c.text} />
            <ThemedText type="caption" themeColor="muted" style={styles.addLabel} maxFontSizeMultiplier={1.3}>
              {t('suggest.addPhoto')}
            </ThemedText>
          </PressableScale>
        ) : null}
      </ScrollView>
      <ThemedText type="caption" themeColor="muted">
        {t('suggest.photoNote', { max: PLACE_POST_MAX_PHOTOS })}
      </ThemedText>

      <TextField label={t('suggest.name')} placeholder={t('suggest.namePlaceholder')} value={name} onChangeText={setName} maxLength={PLACE_NAME_MAX} error={errors.name} />
      <TextField
        label={t('suggest.address')}
        placeholder={t('suggest.addressPlaceholder')}
        value={address}
        onChangeText={setAddress}
        maxLength={PLACE_ADDRESS_MAX}
        error={errors.address}
      />

      <ThemedText type="heading" accessibilityRole="header">
        {t('suggest.where')}
      </ThemedText>
      <LocationPicker
        value={point}
        recenter={recenter}
        category={category}
        onChange={(next, byUser) => {
          setPoint({ lat: precise(next.lat), lng: precise(next.lng) });
          if (byUser) setPointChosen(true);
        }}
      />
      <ThemedText type="caption" themeColor={errors.lat ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
        {errors.lat ?? t('suggest.whereHint')}
      </ThemedText>
      <Button label={t('suggest.useMyLocation')} variant="secondary" loading={locating} onPress={useMyLocation} />

      <ThemedText type="heading" accessibilityRole="header">
        {t('suggest.category')}
      </ThemedText>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {SUGGEST_CATEGORIES.map((key) => (
          <IconChip
            key={key}
            role="radio"
            icon={PLACE_CATEGORY_ICON[key]}
            label={t(`explore.categories.${key}`)}
            selected={category === key}
            onPress={() => {
              setCategory(key);
              setErrors((e) => ({ ...e, category: '' }));
            }}
          />
        ))}
      </View>
      {errors.category ? (
        <ThemedText type="caption" themeColor="danger" accessibilityRole="alert">
          {errors.category}
        </ThemedText>
      ) : null}

      <ThemedText type="heading" accessibilityRole="header">
        {t('suggest.amenities')}
      </ThemedText>
      <View style={styles.wrap}>
        {PLACE_AMENITIES.map((key) => {
          const on = amenities.includes(key);
          return (
            <IconChip
              key={key}
              icon={on ? 'check' : 'plus'}
              label={t(`explore.amenities.${key}`)}
              selected={on}
              onPress={() => setAmenities((list) => toggleAmenity(list, key, PLACE_AMENITIES))}
            />
          );
        })}
      </View>

      <TextField
        label={t('suggest.body')}
        placeholder={t('suggest.bodyPlaceholder')}
        value={body}
        onChangeText={setBody}
        maxLength={PLACE_POST_BODY_MAX}
        multiline
        error={errors.body}
      />

      <InfoCard
        title={points !== null ? t('suggest.earnTitle', { count: points }) : t('suggest.earnTitleNoPoints')}
        body={t('suggest.earnBody')}
      />

      {uploading ? (
        <ThemedText themeColor="muted" accessibilityLiveRegion="polite">
          {t('suggest.uploading', { done: progress.done + 1, total: progress.total })}
        </ThemedText>
      ) : null}
      <Button label={t('suggest.submit')} loading={create.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photosBleed: { marginHorizontal: -Spacing.screen, flexGrow: 0 },
  photos: { gap: 10, paddingHorizontal: Spacing.screen },
  // Photo tiles are images (no text inside), so a fixed size is safe.
  tile: { width: TILE, height: TILE, borderRadius: Radius[24] },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, padding: Spacing.one },
  addLabel: { textAlign: 'center' },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
