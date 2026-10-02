import { presenceSharingSchema, updateProfileInputSchema, type PresenceSharing, type Profile } from '@kapp/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { ChipRow, IconChip } from '@/components/icon-chip';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { PRESENCE_ICON } from '@/constants/icons';
import { apiGet, apiSend, errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';

/** Figma 07 / Profile / Edit — presented as a modal (iOS pattern for a focused edit task). */
export default function ProfileEditScreen() {
  const { t } = useTranslation();
  const [values, setValues] = useState({ name: '', area: '', bio: '', presenceSharing: 'friends' as PresenceSharing });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Profile>('/me')
      .then((p) => setValues({ name: p.name, area: p.area ?? '', bio: p.bio ?? '', presenceSharing: p.presenceSharing }))
      .catch((e: unknown) => setFormError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const set = (key: 'name' | 'area' | 'bio') => (text: string) => setValues((v) => ({ ...v, [key]: text }));

  async function save() {
    const { data, errors: invalid } = validateForm(updateProfileInputSchema, values);
    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    setSaving(true);
    try {
      await apiSend<Profile>('PATCH', '/me', data);
      router.back();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen underHeader title={t('profileEdit.title')} subtitle={t('profileEdit.subtitle')}>
      <FormError message={formError} />
      <TextField label={t('profileEdit.name')} value={values.name} onChangeText={set('name')} error={errors.name} autoComplete="name" editable={!loading} />
      <TextField label={t('profileEdit.area')} placeholder={t('profileEdit.areaPlaceholder')} value={values.area} onChangeText={set('area')} error={errors.area} editable={!loading} />
      <TextField
        label={t('profileEdit.bio')}
        placeholder={t('profileEdit.bioPlaceholder')}
        value={values.bio}
        onChangeText={set('bio')}
        error={errors.bio}
        multiline
        maxLength={300}
        editable={!loading}
      />

      <ThemedText type="label">{t('profileEdit.presenceTitle')}</ThemedText>
      <ChipRow radiogroup>
        {presenceSharingSchema.options.map((option) => (
          <IconChip
            key={option}
            role="radio"
            icon={PRESENCE_ICON[option]}
            label={t(`profileEdit.presence.${option}`)}
            selected={values.presenceSharing === option}
            onPress={() => setValues((v) => ({ ...v, presenceSharing: option }))}
          />
        ))}
      </ChipRow>

      <Button label={t('profileEdit.save')} loading={saving} disabled={loading} onPress={save} />
    </Screen>
  );
}
