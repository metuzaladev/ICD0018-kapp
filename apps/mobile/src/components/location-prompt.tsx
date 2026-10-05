import { PermissionStatus } from 'expo-location';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FeatureRow } from '@/components/feature-row';
import { MapPreview } from '@/components/map-preview';
import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';

type LocationPromptProps = {
  status: PermissionStatus;
  canAskAgain: boolean;
  onRequest: () => void;
  onDismiss: () => void;
};

/**
 * Figma "Permissions / Location" (6:252), full screen on the Kaart tab before the map: map preview,
 * three benefit rows (incl. the privacy promise), "Luba asukoht" and "Mitte praegu". Explaining
 * *before* the system dialog is an HIG recommendation and raises acceptance; iOS shows that dialog
 * only once. "Valin piirkonna ise" from Figma is "Mitte praegu" until area selection exists (docs/11).
 * The caller renders it only while the permission is not granted and the user has not dismissed it.
 */
export function LocationPrompt({ status, canAskAgain, onRequest, onDismiss }: LocationPromptProps) {
  const { t } = useTranslation();
  const denied = status === PermissionStatus.DENIED;
  return (
    <Screen title={denied ? t('location.deniedTitle') : t('location.title')} subtitle={denied ? t('location.deniedBody') : t('location.body')}>
      <MapPreview />
      {denied ? null : (
        <View style={styles.rows}>
          <FeatureRow icon="map-pin" title={t('location.benefitParksTitle')} body={t('location.benefitParksBody')} />
          <FeatureRow icon="users" title={t('location.benefitFriendsTitle')} body={t('location.benefitFriendsBody')} />
          <FeatureRow icon="shield" title={t('location.benefitPrivacyTitle')} body={t('location.benefitPrivacyBody')} />
        </View>
      )}
      <View style={styles.actions}>
        {denied && !canAskAgain ? (
          <Button label={t('common.openSettings')} onPress={() => Linking.openSettings()} />
        ) : (
          <Button label={t('location.allow')} onPress={onRequest} />
        )}
        <Button label={t('location.notNow')} variant="tertiary" onPress={onDismiss} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: Spacing.three },
  actions: { gap: Spacing.one },
});
