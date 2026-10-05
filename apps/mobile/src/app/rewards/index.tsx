import { claimInviteInputSchema, type RewardsSummary } from '@kapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Entering } from '@/components/entering';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { InfoCard } from '@/components/info-card';
import { ListRow } from '@/components/list-row';
import { OfflineBanner } from '@/components/offline-banner';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { SkeletonList } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useClaimInvite, useInvite, useRewardHistory, useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { currentLocaleTag } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { formatNumber, formatNumericDate, pawsLabel } from '@/lib/format';
import { validateForm } from '@/lib/form';
import { haptic } from '@/lib/haptics';
import {
  BADGE_ICON,
  badgeBodyKey,
  badgeNameKey,
  badgeProgress,
  levelNameKey,
  levelNumber,
  pointsFor,
  REASON_ICON,
  reasonBodyKey,
  reasonTitleKey,
  streakDays,
  weekdayLetterIn,
} from '@/lib/rewards';

/** "+5" pill like the Figma Points Badge, with a server amount. Decorative: the row says it. */
function PlusPoints({ points }: { points: number }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.plus, { backgroundColor: c.soft }]}>
      <Icon name="paw-print" size={16} color={c.brand} />
      <ThemedText type="label" style={{ color: c.accent }}>
        {t('rewards.plus', { points: formatNumber(points) })}
      </ThemedText>
    </View>
  );
}

/** Figma "Card / Balance": brand fill, "Saldo", level pill, the big number, progress, paw watermark. */
function BalanceCard({ summary }: { summary: RewardsSummary }) {
  const c = useTheme();
  const { t } = useTranslation();
  const { level } = summary;
  const levelName = t(levelNameKey(level.id));
  const toNext = level.next
    ? t('rewards.toNext', { paws: pawsLabel(level.next.pointsToGo), level: t(levelNameKey(level.next.id)) })
    : t('rewards.topLevel');
  return (
    <View style={[styles.balance, { backgroundColor: c.brand }]}>
      <View style={styles.watermark} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="paw-print" size={176} color={c.onBrand} />
      </View>
      <View accessible accessibilityLabel={t('rewards.balanceA11y', { paws: pawsLabel(summary.balance), level: levelName, number: levelNumber(level.index), next: toNext })} style={styles.balanceInner}>
        <View style={styles.balanceTop}>
          <ThemedText type="label" style={{ color: c.onBrand }}>
            {t('rewards.balance')}
          </ThemedText>
          <View style={[styles.levelPill, { borderColor: c.onBrand }]}>
            <Icon name="trophy" size={14} color={c.onBrand} />
            <ThemedText type="caption" style={{ color: c.onBrand }}>
              {t('rewards.levelPill', { level: levelName, number: levelNumber(level.index) })}
            </ThemedText>
          </View>
        </View>
        <View style={styles.amount}>
          <ThemedText type="display" style={{ color: c.onBrand }}>
            {formatNumber(summary.balance)}
          </ThemedText>
          <ThemedText type="heading" style={{ color: c.onBrand }}>
            {t('rewards.pawsWord', { count: summary.balance })}
          </ThemedText>
        </View>
        <View style={styles.progressTrack}>
          <View style={[StyleSheet.absoluteFill, styles.trackFill, { backgroundColor: c.onBrand }]} />
          <ProgressBar value={level.progress} track="transparent" fill={c.onBrand} />
        </View>
        <ThemedText type="caption" style={{ color: c.onBrand }}>
          {toNext}
        </ThemedText>
      </View>
    </View>
  );
}

/** Figma "Card / Streak" + "Streak Tile": the last seven Tallinn days as paws, today last. */
function StreakCard({ summary }: { summary: RewardsSummary }) {
  const c = useTheme();
  const { t } = useTranslation();
  const days = streakDays(summary.streak.lastDays, weekdayLetterIn(currentLocaleTag()));
  const perDay = pointsFor(summary, 'streak');
  const active = days.filter((d) => d.active).length;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.streakHead}>
        <ThemedText type="heading" style={styles.flex}>
          {summary.streak.current > 0 ? t('rewards.streak', { count: summary.streak.current }) : t('rewards.streakNone')}
        </ThemedText>
        {perDay ? (
          <ThemedText type="caption" themeColor="muted">
            {t('rewards.perDay', { points: formatNumber(perDay) })}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.week} accessible accessibilityLabel={t('rewards.weekA11y', { count: active })}>
        {days.map((day) => (
          <View key={day.date} style={styles.day}>
            <View
              style={[
                styles.paw,
                day.active ? { backgroundColor: c.brand } : { backgroundColor: c.background, borderColor: c.border, borderWidth: 1 },
              ]}>
              <Icon name="paw-print" size={18} color={day.active ? c.onBrand : c.muted} />
            </View>
            <ThemedText type={day.isToday ? 'label' : 'caption'} themeColor={day.isToday ? 'text' : 'muted'} maxFontSizeMultiplier={1.2}>
              {day.letter}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function InviteCard() {
  const c = useTheme();
  const { t } = useTranslation();
  const invite = useInvite();
  const claim = useClaimInvite();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  if (!invite.data) return invite.error ? <FormError message={errorMessage(invite.error)} /> : null;
  const { code: myCode, points } = invite.data;

  async function submitClaim() {
    const { data, errors } = validateForm(claimInviteInputSchema, { code });
    if (!data) return setError(errors.code ?? Object.values(errors)[0] ?? null);
    setError(null);
    try {
      await claim.mutateAsync(data);
      haptic('success');
      setClaimed(true);
      AccessibilityInfo.announceForAccessibility(t('rewards.invite.claimed'));
    } catch (e) {
      haptic('error');
      setError(errorMessage(e));
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View accessible style={styles.gap}>
        <ThemedText type="heading">{t('rewards.invite.title')}</ThemedText>
        <ThemedText themeColor="muted">{t('rewards.invite.body', { paws: pawsLabel(points) })}</ThemedText>
      </View>
      <View style={[styles.code, { backgroundColor: c.soft }]} accessible accessibilityLabel={t('rewards.invite.codeA11y', { code: myCode.split('').join(' ') })}>
        <ThemedText type="title" selectable style={{ fontFamily: Fonts.mono, color: c.accent, letterSpacing: 4 }}>
          {myCode}
        </ThemedText>
      </View>
      <Button
        label={t('rewards.invite.share')}
        trailingIcon="share"
        onPress={() => void Share.share({ message: t('rewards.invite.shareMessage', { code: myCode }) }).catch(() => {})}
      />
      {claimed ? (
        <ThemedText themeColor="muted" accessibilityLiveRegion="polite">
          {t('rewards.invite.claimed')}
        </ThemedText>
      ) : (
        <>
          <TextField
            label={t('rewards.invite.claimLabel')}
            placeholder={t('rewards.invite.claimPlaceholder')}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            error={error ?? undefined}
          />
          <Button label={t('rewards.invite.claim')} variant="secondary" loading={claim.isPending} disabled={code.trim().length === 0} onPress={submitClaim} />
        </>
      )}
    </View>
  );
}

function RecentHistory() {
  const { t } = useTranslation();
  const history = useRewardHistory();
  const items = history.data?.pages[0]?.items.slice(0, 4) ?? [];
  if (history.isPending) return <SkeletonList rows={2} />;
  if (items.length === 0) return <ThemedText themeColor="muted">{t('rewards.historyEmpty')}</ThemedText>;
  return (
    <>
      {items.map((entry) => (
        <ListRow
          key={entry.id}
          icon={REASON_ICON[entry.reason]}
          title={t(reasonTitleKey(entry.reason))}
          subtitle={`${t('rewards.historyDelta', { delta: `${entry.delta > 0 ? '+' : '−'}${formatNumber(Math.abs(entry.delta))}` })} · ${formatNumericDate(entry.createdAt)}`}
        />
      ))}
      <Button label={t('rewards.historyAll')} variant="tertiary" onPress={() => router.push('/rewards/history')} />
    </>
  );
}

/**
 * Figma 09 / Rewards / Käpad (84:8169): balance and level, "Kasuta poes", the week's streak,
 * "Kuidas teenida" (amounts and limits from the server's rule table), badges, recent history,
 * the invite code and "Ausus ennekõike". Opening the screen also settles pending awards on the
 * server (GET /me/rewards), so a check-in that expired by itself is paid here.
 *
 * Deviations (docs/11): Figma's "Jalutuskäik +10" is not offered — walks are not paid (no
 * trustworthy distance source, docs/16); badges, history and the invite card are not in the Figma
 * frame but are part of the API.
 */
export default function RewardsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const rewards = useRewards();
  const history = useRewardHistory();
  const refresh = usePullToRefresh(rewards.refetch, history.refetch);
  const summary = rewards.data;

  return (
    <Screen underHeader title={t('rewards.title')} subtitle={t('rewards.subtitle')} refresh={refresh}>
      <OfflineBanner />
      {rewards.error && !summary ? <ErrorState message={errorMessage(rewards.error)} onRetry={() => void rewards.refetch()} retrying={rewards.isFetching} /> : null}
      {rewards.isPending ? <SkeletonList rows={3} rowHeight={120} /> : null}
      {summary ? (
        <>
          <Entering index={0}>
            <BalanceCard summary={summary} />
          </Entering>
          <Button label={t('rewards.useInShop')} variant="secondary" trailingIcon="arrow-right" onPress={() => router.push('/shop')} />
          <Entering index={1}>
            <StreakCard summary={summary} />
          </Entering>

          <ThemedText type="heading" accessibilityRole="header">
            {t('rewards.howToEarn')}
          </ThemedText>
          <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
            {summary.waysToEarn.map((way, i) => {
              const title = t(reasonTitleKey(way.reason));
              const body = way.dailyLimit ? t('rewards.withLimit', { body: t(reasonBodyKey(way.reason)), count: way.dailyLimit }) : t(reasonBodyKey(way.reason));
              return (
                <View key={way.reason}>
                  {i > 0 ? <View style={[styles.separator, { backgroundColor: c.border }]} /> : null}
                  <View style={styles.way} accessible accessibilityLabel={`${title}, ${body}, ${t('rewards.plusA11y', { paws: pawsLabel(way.points) })}`}>
                    <Icon name={REASON_ICON[way.reason]} size={24} color={c.text} />
                    <View style={styles.flex}>
                      <ThemedText type="label">{title}</ThemedText>
                      <ThemedText type="caption" themeColor="muted">
                        {body}
                      </ThemedText>
                    </View>
                    <PlusPoints points={way.points} />
                  </View>
                </View>
              );
            })}
          </View>

          <ThemedText type="heading" accessibilityRole="header">
            {t('rewards.badgesTitle')}
          </ThemedText>
          <View style={styles.badges}>
            {summary.badges.map((badge) => (
              <View
                key={badge.id}
                accessible
                accessibilityLabel={`${t(badgeNameKey(badge.id))}, ${t(badgeBodyKey(badge.id))}, ${
                  badge.unlocked ? t('rewards.badgeUnlocked') : t('rewards.badgeProgress', { progress: badge.progress, target: badge.target })
                }`}
                style={[styles.badge, { backgroundColor: badge.unlocked ? c.soft : c.surface, borderColor: badge.unlocked ? c.brand : c.border }]}>
                <View style={[styles.badgeIcon, { backgroundColor: badge.unlocked ? c.brand : c.background }]}>
                  <Icon name={badge.unlocked ? BADGE_ICON[badge.id] : 'lock'} size={22} color={badge.unlocked ? c.onBrand : c.muted} />
                </View>
                <ThemedText type="label">{t(badgeNameKey(badge.id))}</ThemedText>
                <ThemedText type="caption" themeColor="muted">
                  {t(badgeBodyKey(badge.id))}
                </ThemedText>
                <ProgressBar value={badgeProgress(badge)} track={c.border} fill={c.brand} height={6} />
                <ThemedText type="caption" themeColor={badge.unlocked ? 'accent' : 'muted'}>
                  {badge.unlocked ? t('rewards.badgeUnlocked') : t('rewards.badgeProgressShort', { progress: badge.progress, target: badge.target })}
                </ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="heading" accessibilityRole="header">
            {t('rewards.historyTitle')}
          </ThemedText>
          <RecentHistory />

          <InviteCard />
          <InfoCard title={t('rewards.honestyTitle')} body={t('rewards.honestyBody')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.one },
  balance: { borderRadius: Radius[24], overflow: 'hidden' },
  balanceInner: { padding: 20, gap: Spacing.three },
  watermark: { position: 'absolute', right: -32, top: -20, opacity: 0.12 },
  balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  amount: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexWrap: 'wrap' },
  progressTrack: { borderRadius: 5, overflow: 'hidden' },
  trackFill: { opacity: 0.25 },
  card: { padding: Spacing.three, borderRadius: Radius[24], borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three },
  streakHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6 },
  paw: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: Radius[24], borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth },
  way: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: Spacing.two, paddingRight: 12, paddingVertical: 6, borderRadius: Radius.full },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badge: { flexBasis: '47%', flexGrow: 1, padding: Spacing.three, borderRadius: Radius[16], borderWidth: 1, gap: Spacing.one },
  badgeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  code: { borderRadius: Radius[16], paddingVertical: Spacing.three, alignItems: 'center' },
});
