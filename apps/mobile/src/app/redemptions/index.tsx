import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useRedemptions } from '@/hooks/use-shop';
import { errorMessage } from '@/lib/api';
import { formatNumericDate, redemptionTitle } from '@/lib/format';

/** "Minu koodid": every discount code, newest first, with its status. Not a Figma frame. */
export default function RedemptionsScreen() {
  const { t } = useTranslation();
  const list = useRedemptions();
  const refresh = usePullToRefresh(list.refetch);

  return (
    <Screen underHeader title={t('redemptions.title')} subtitle={t('redemptions.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {list.error && !list.data ? <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} /> : null}
      {list.isPending ? <SkeletonList /> : null}
      {list.data?.length === 0 ? <EmptyState title={t('redemptions.empty')} actionLabel={t('redemptions.toShop')} onAction={() => router.push('/shop')} /> : null}
      {list.data?.map((r, i) => (
        <Entering key={r.id} index={i}>
          <ListRow
            icon="ticket"
            title={redemptionTitle(r)}
            subtitle={[
              r.provider.name,
              r.status === 'active' ? t('redemptions.validUntil', { date: formatNumericDate(r.expiresAt) }) : t(`redemptions.status.${r.status}`),
            ].join(' · ')}
            onPress={() => router.push({ pathname: '/redemptions/[redemptionId]', params: { redemptionId: r.id } })}
          />
        </Entering>
      ))}
    </Screen>
  );
}
