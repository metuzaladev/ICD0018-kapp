import { MAX_PHOTOS_PER_DOG, type DogPhoto } from '@kapp/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { photoSource, useAddPhoto, useDeletePhoto, useDogPhotos, useSetProfilePhoto } from '@/hooks/use-photos';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatDate, localIsoDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';

const COLUMNS = 3;
const GAP = Spacing.two;
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };

/** Same photo when the object path matches; signatures differ between responses. */
const samePhoto = (a: string, b: string) => a.split('?')[0] === b.split('?')[0];

/** Figma 04 / Dog / Photos: thumbnail grid, add from camera or library, long press for actions. */
export default function DogPhotosScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { width } = useWindowDimensions();
  const dog = useMyDogs().data?.find((d) => d.id === dogId);
  const photos = useDogPhotos(dogId);
  const add = useAddPhoto(dogId);
  const remove = useDeletePhoto(dogId);
  const setProfile = useSetProfilePhoto(dogId);
  const [error, setError] = useState<string | null>(null);

  const tile = Math.floor((width - Spacing.screen * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const full = (photos.data?.length ?? 0) >= MAX_PHOTOS_PER_DOG;

  async function pick(source: 'camera' | 'library') {
    setError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        // iOS asks only once; after a "no" the setting can only be changed in Settings.
        Alert.alert(t('photos.cameraDeniedTitle'), t('photos.cameraDeniedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
    }
    // The library uses the system photo picker, which needs no permission: the user picks.
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    add.mutate({ uri: asset.uri, width: asset.width, height: asset.height }, { onError: (e) => setError(errorMessage(e)) });
  }

  function confirmDelete(photo: DogPhoto) {
    haptic('warning');
    Alert.alert(t('photos.deleteTitle'), t('photos.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(photo.id, { onError: (e) => setError(errorMessage(e)) }) },
    ]);
  }

  function openActions(photo: DogPhoto, isProfile: boolean) {
    setError(null);
    Alert.alert(t('photos.actionsTitle', { date: formatDate(localIsoDate(new Date(photo.createdAt))) }), undefined, [
      isProfile
        ? { text: t('photos.removeProfile'), onPress: () => setProfile.mutate(null, { onError: (e) => setError(errorMessage(e)) }) }
        : { text: t('photos.setProfile'), onPress: () => setProfile.mutate(photo.id, { onError: (e) => setError(errorMessage(e)) }) },
      { text: t('common.delete'), style: 'destructive', onPress: () => confirmDelete(photo) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <>
      {/* The dog's name is not declined, see docs/11 ("Freddy fotoalbum"). */}
      <Screen underHeader title={dog ? t('photos.title', { name: dog.name }) : t('photos.titleFallback')} subtitle={t('photos.subtitle')}>
        <OfflineBanner />
        <FormError message={error} />
        {photos.error && !photos.data ? (
          <ErrorState message={errorMessage(photos.error)} onRetry={() => void photos.refetch()} retrying={photos.isFetching} />
        ) : null}

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label={t('photos.camera')} variant="secondary" disabled={add.isPending || full} onPress={() => pick('camera')} />
          </View>
          <View style={styles.action}>
            <Button label={t('photos.library')} variant="secondary" disabled={add.isPending || full} onPress={() => pick('library')} />
          </View>
        </View>
        {add.isPending ? (
          <ThemedText themeColor="muted" accessibilityLiveRegion="polite">
            {t('photos.uploading')}
          </ThemedText>
        ) : null}
        {full ? <ThemedText themeColor="muted">{t('photos.full', { max: MAX_PHOTOS_PER_DOG })}</ThemedText> : null}
        {photos.isPending ? <SkeletonList rows={1} rowHeight={tile} /> : null}
        {photos.data?.length === 0 ? <EmptyState title={t('photos.empty')} /> : null}

        <View style={styles.grid}>
          {photos.data?.map((photo, i) => {
            const isProfile = Boolean(dog?.profilePhoto && samePhoto(dog.profilePhoto.thumbnailUrl, photo.thumbnailUrl));
            return (
              <Entering key={photo.id} index={i}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t(isProfile ? 'photos.a11yProfile' : 'photos.a11y', {
                    date: formatDate(localIsoDate(new Date(photo.createdAt))),
                  })}
                  accessibilityHint={t('photos.hint')}
                  onPress={() => openActions(photo, isProfile)}
                  onLongPress={() => openActions(photo, isProfile)}>
                  <Image
                    source={photoSource(photo.thumbnailUrl)}
                    style={[styles.tile, { width: tile, height: tile, backgroundColor: c.soft, borderColor: isProfile ? c.brand : 'transparent' }]}
                    contentFit="cover"
                    transition={150}
                  />
                  {isProfile ? (
                    <View style={[styles.badge, { backgroundColor: c.brand }]}>
                      <ThemedText type="micro" style={{ color: c.onBrand }}>
                        {t('photos.badge')}
                      </ThemedText>
                    </View>
                  ) : null}
                </PressableScale>
              </Entering>
            );
          })}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: Radius[12], borderWidth: 2 },
  badge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
});
