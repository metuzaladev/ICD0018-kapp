import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useRewardHistory } from '@/hooks/use-rewards';
import { errorMessage } from '@/lib/api';
import { formatNumber, formatNumericDate } from '@/lib/format';
import { REASON_ICON, reasonTitleKey } from '@/lib/rewards';

/** Käpad history: every ledger entry, newest first (earned +, spent −, refunds). Not a Figma frame. */
export default function RewardHistoryScreen() {
  const { t } = useTranslation();
  const history = useRewardHistory();
  const refresh = usePullToRefresh(history.refetch);
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen underHeader title={t('rewards.historyTitle')} subtitle={t('rewards.historySubtitle')} refresh={refresh}>
      <OfflineBanner />
      {history.error && !history.data ? <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} retrying={history.isFetching} /> : null}
      {history.isPending ? <SkeletonList /> : null}
      {history.data && items.length === 0 ? <EmptyState title={t('rewards.historyEmpty')} /> : null}
      {items.map((entry, i) => (
        <Entering key={entry.id} index={i}>
          <ListRow
            icon={REASON_ICON[entry.reason]}
            title={t(reasonTitleKey(entry.reason))}
            subtitle={`${t('rewards.historyDelta', { delta: `${entry.delta > 0 ? '+' : '−'}${formatNumber(Math.abs(entry.delta))}` })} · ${formatNumericDate(entry.createdAt)}`}
          />
        </Entering>
      ))}
      {history.hasNextPage ? (
        <Button label={t('notifications.more')} variant="secondary" loading={history.isFetchingNextPage} onPress={() => history.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}
