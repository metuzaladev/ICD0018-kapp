/**
 * OpenFreeMap vector styles: free, no API key, OSM data with attribution built into the style.
 * Kept as constants so switching to MapTiler (paid, SLA) is a one-line change (docs/01-uuring.md).
 *
 * Light uses "positron" (M9): the redesign's map is a quiet grey base so the coloured category pins
 * and dog pins carry the information; "liberty" (used before) has saturated land-use colours that
 * compete with them. Dark keeps "dark". The scheme follows Settings → Välimus.
 */
export const MAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
