import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';

/** Figma 01 / Reset sent. Wording does not confirm that the address exists. */
export default function ResetSentScreen() {
  return (
    <Screen
      underHeader
      title="Vaata oma postkasti."
      subtitle="Kui selle aadressiga konto on olemas, saatsime sinna lingi. Link kehtib üks tund.">
      <Button label="Tagasi sisselogimisse" onPress={() => router.dismissTo('/sign-in')} />
    </Screen>
  );
}
