import type { Dog } from '@kapp/shared';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { photoSource } from '@/hooks/use-photos';

/**
 * Round profile picture of a dog, or its initial on the soft accent colour when there is none.
 * Decorative: the dog's name is always shown next to it, so VoiceOver skips the image.
 */
export function DogAvatar({ dog, size = 48 }: { dog: Pick<Dog, 'id' | 'name' | 'profilePhoto'>; size?: number }) {
  const c = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (dog.profilePhoto) {
    return (
      <Image
        source={photoSource(dog.profilePhoto.thumbnailUrl)}
        style={[shape, { backgroundColor: c.soft }]}
        contentFit="cover"
        transition={150}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  return (
    <View style={[styles.placeholder, shape, { backgroundColor: c.soft }]} accessibilityElementsHidden importantForAccessibility="no">
      <ThemedText type={size >= 80 ? 'hero' : 'heading'}>{dog.name.charAt(0).toUpperCase()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
