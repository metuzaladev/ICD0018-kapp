import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Tallinn city centre — used until (or unless) the user shares their location. */
export const TALLINN_CENTER = { lat: 59.437, lng: 24.7536 };

/**
 * Rounds to 3 decimals (~100 m). Enough to sort nearby parks, and the API never receives the
 * user's exact position. Also keeps the query cache key stable while the user stands still.
 */
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Foreground ("while using the app") location only. Background location is never requested:
 * the app does not need it and App Review asks for strong justification.
 */
export function useDeviceLocation() {
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!permission?.granted) return;
    let active = true;
    (async () => {
      // Last known position first: instant, then refine with a fresh fix.
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (active && last) setCoords({ lat: round(last.coords.latitude), lng: round(last.coords.longitude) });
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (active && fresh) setCoords({ lat: round(fresh.coords.latitude), lng: round(fresh.coords.longitude) });
    })();
    return () => {
      active = false;
    };
  }, [permission?.granted]);

  return {
    origin: coords ?? TALLINN_CENTER,
    usingFallback: coords === null,
    status: permission?.status ?? Location.PermissionStatus.UNDETERMINED,
    canAskAgain: permission?.canAskAgain ?? true,
    requestPermission,
  };
}
