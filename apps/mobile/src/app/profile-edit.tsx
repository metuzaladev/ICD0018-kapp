import { presenceSharingSchema, updateProfileInputSchema, type PresenceSharing, type Profile } from '@kapp/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormError } from '@/components/form-error';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiGet, apiSend, errorMessage } from '@/lib/api';
import { validateForm } from '@/lib/form';

const PRESENCE_LABEL: Record<PresenceSharing, string> = {
  nobody: 'Mitte keegi',
  friends: 'Sõbrad',
  everyone: 'Kõik',
};

/** Figma 07 / Profile / Edit — presented as a modal (iOS pattern for a focused edit task). */
export default function ProfileEditScreen() {
  const c = useTheme();
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
    <Screen underHeader>
      <FormError message={formError} />
      <TextField label="Nimi" value={values.name} onChangeText={set('name')} error={errors.name} autoComplete="name" editable={!loading} />
      <TextField label="Piirkond" placeholder="Näiteks Kadriorg" value={values.area} onChangeText={set('area')} error={errors.area} editable={!loading} />
      <TextField
        label="Tutvustus"
        placeholder="Paar sõna sinust ja su koerast"
        value={values.bio}
        onChangeText={set('bio')}
        error={errors.bio}
        multiline
        maxLength={300}
        editable={!loading}
      />

      <ThemedText type="label">Kes näeb, kui oled pargis?</ThemedText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {presenceSharingSchema.options.map((option) => {
          const selected = values.presenceSharing === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setValues((v) => ({ ...v, presenceSharing: option }))}
              style={[styles.chip, { backgroundColor: selected ? c.brand : c.surface, borderColor: c.border }]}>
              <ThemedText type="caption" style={{ color: selected ? c.onBrand : c.text }}>
                {PRESENCE_LABEL[option]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Button label="Salvesta muudatused" loading={saving} disabled={loading} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
