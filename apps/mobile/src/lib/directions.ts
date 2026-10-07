import { Linking, Platform } from 'react-native';

/**
 * "Juhata kohale": opens Apple Maps on iOS and the default maps app on Android with walking
 * directions to a place. Shared by the park page and the "Lähim park" card (M11).
 */
export function openDirections(place: { name: string; lat: number; lng: number }) {
  const label = encodeURIComponent(place.name);
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${place.lat},${place.lng}&dirflg=w&q=${label}`
      : `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${label})`;
  void Linking.openURL(url);
}
