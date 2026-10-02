import type { PresenceSharing } from '@kapp/shared';

import type { IconName } from '@/components/icon-sources';

/** Icon chips for "Kes näeb, kui oled pargis?" (privacy settings and profile edit share the meaning). */
export const PRESENCE_ICON: Record<PresenceSharing, IconName> = {
  nobody: 'lock',
  friends: 'heart',
  everyone: 'users',
};
