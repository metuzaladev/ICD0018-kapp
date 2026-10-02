import { Image } from 'expo-image';

import { ICON_SOURCES, type IconName } from '@/components/icon-sources';

export type { IconName };

type IconProps = {
  name: IconName;
  /** Figma uses 14 (tags), 18 (chips, badges), 20 (pins), 24 (buttons). */
  size?: number;
  color: string;
};

/**
 * A Lucide icon (Figma "Icon / *"). The SVG strokes are white and `tintColor` paints them, the
 * same technique as the paw background, so one asset serves every accent and both schemes.
 *
 * Always decorative: the control around it carries the label (VoiceOver would otherwise read the
 * file name). A meaningful standalone icon must be wrapped in an element with a label.
 */
export function Icon({ name, size = 18, color }: IconProps) {
  return (
    <Image
      source={ICON_SOURCES[name]}
      tintColor={color}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
