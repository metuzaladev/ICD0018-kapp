import { MAX_PHOTOS_PER_DOG, type DogPhoto } from '@kapp/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyDogs } from '@/hooks/use-dogs';
import { photoSource, useAddPhoto, useDeletePhoto, useDogPhotos, useSetProfilePhoto } from '@/hooks/use-photos';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/api';
import { formatDate, localIsoDate } from '@/lib/format';

const COLUMNS = 3;
const GAP = Spacing.two;
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };

/** Same photo when the object path matches; signatures differ between responses. */
const samePhoto = (a: string, b: string) => a.split('?')[0] === b.split('?')[0];

/** Figma 04 / Dog / Photos: thumbnail grid, add from camera or library, long press for actions. */
export default function DogPhotosScreen() {
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
        Alert.alert('Kaamera kasutamine pole lubatud', 'Luba Käpp-il kaamerat kasutada, et koerast pilti teha.', [
          { text: 'Loobu', style: 'cancel' },
          { text: 'Ava seaded', onPress: () => Linking.openSettings() },
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
    Alert.alert('Kustutada foto?', 'Fotot ei saa taastada.', [
      { text: 'Loobu', style: 'cancel' },
      { text: 'Kustuta', style: 'destructive', onPress: () => remove.mutate(photo.id, { onError: (e) => setError(errorMessage(e)) }) },
    ]);
  }

  function openActions(photo: DogPhoto, isProfile: boolean) {
    setError(null);
    Alert.alert(`Foto ${formatDate(localIsoDate(new Date(photo.createdAt)))}`, undefined, [
      isProfile
        ? { text: 'Eemalda profiilipildist', onPress: () => setProfile.mutate(null, { onError: (e) => setError(errorMessage(e)) }) }
        : { text: 'Määra profiilipildiks', onPress: () => setProfile.mutate(photo.id, { onError: (e) => setError(errorMessage(e)) }) },
      { text: 'Kustuta', style: 'destructive', onPress: () => confirmDelete(photo) },
      { text: 'Loobu', style: 'cancel' },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: dog ? `${dog.name} · fotod` : 'Fotod' }} />
      <Screen underHeader>
        <OfflineBanner />
        <FormError message={error} />
        {photos.error && !photos.data ? <FormError message={errorMessage(photos.error)} /> : null}

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label="Pildista" variant="secondary" disabled={add.isPending || full} onPress={() => pick('camera')} />
          </View>
          <View style={styles.action}>
            <Button label="Vali galeriist" variant="secondary" disabled={add.isPending || full} onPress={() => pick('library')} />
          </View>
        </View>
        {add.isPending ? (
          <ThemedText themeColor="muted" accessibilityLiveRegion="polite">
            Laen pilti üles…
          </ThemedText>
        ) : null}
        {full ? <ThemedText themeColor="muted">Koeral on juba {MAX_PHOTOS_PER_DOG} fotot. Lisamiseks kustuta mõni vanem.</ThemedText> : null}
        {photos.isPending ? <ThemedText themeColor="muted">Laen…</ThemedText> : null}
        {photos.data?.length === 0 ? (
          <ThemedText themeColor="muted">Fotosid veel pole. Asukohaandmed eemaldatakse piltidelt enne salvestamist.</ThemedText>
        ) : null}

        <View style={styles.grid}>
          {photos.data?.map((photo) => {
            const isProfile = Boolean(dog?.profilePhoto && samePhoto(dog.profilePhoto.thumbnailUrl, photo.thumbnailUrl));
            return (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={`Foto, lisatud ${formatDate(localIsoDate(new Date(photo.createdAt)))}${isProfile ? ', profiilipilt' : ''}`}
                accessibilityHint="Ava valikud: profiilipilt või kustutamine"
                onPress={() => openActions(photo, isProfile)}
                onLongPress={() => openActions(photo, isProfile)}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <Image
                  source={photoSource(photo.thumbnailUrl)}
                  style={[styles.tile, { width: tile, height: tile, backgroundColor: c.soft, borderColor: isProfile ? c.brand : 'transparent' }]}
                  contentFit="cover"
                  transition={150}
                />
                {isProfile ? (
                  <View style={[styles.badge, { backgroundColor: c.brand }]}>
                    <ThemedText type="micro" style={{ color: c.onBrand }}>
                      PROFIIL
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>
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
