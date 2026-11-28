import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, isZeroMoney } from '@xeprime/domain';
import { InfoHint } from '@/components/ui/InfoHint';
import { Callout } from '@/components/ui/Callout';
import { SectionHeader } from '@/components/ui/CardTitle';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useBookingSourceText } from '@/components/ui/BookingSourceChip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import type { AppColors } from '@/theme/tokens';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { FinanceSourceBreakdown } from '../api';
import {
  REVENUE_SOURCE_VIEW,
  itemMatchesView,
  revenueOf,
  sharePercent,
  sourceGroupOf,
  tripsOf,
  type RevenueSourceView,
  type SourceGroup,
} from '../vehicle-finance';

/**
 * Doanh thu theo NGUỒN ĐƠN (ADR 0110) — native port of web `features/finance/components/RevenueSource.tsx`
 * (+ `FinanceSourceDetail`): mảnh dùng chung cho màn Tổng quan doanh thu, Tài chính xe và khối thu
 * chi của Tổng quan. Số liệu luôn của `/finance/by-source` nên cùng kỳ, cùng phạm vi thì mọi màn ra
 * cùng một con số.
 */

const TRACK_HEIGHT = 8;

interface SourceStateProps {
  data: FinanceSourceBreakdown | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Màu từng nhóm nguồn - web `.bar_*`: sàn sắc thương hiệu, tự khai thác xanh, phiếu lẻ xám. */
export function sourceGroupColor(colors: AppColors, group: SourceGroup | 'all'): string {
  return group === 'marketplace'
    ? colors.primary
    : group === 'direct'
      ? colors.infoStrong
      : colors.textMuted;
}

/** Rãnh của thanh tỷ trọng - các khúc `RevenueSourceSegment` xếp liền nhau. */
export function RevenueSourceTrack({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack h={TRACK_HEIGHT} br={radius.pill} bg={colors.infoLow} ov="hidden">
      {children}
    </XStack>
  );
}

/** Một khúc của thanh tỷ trọng - bề rộng chỉ biết lúc chạy. */
export function RevenueSourceSegment({ share, group }: { share: number; group: SourceGroup }) {
  const colors = useColors();
  if (share <= 0) return null;
  return (
    <YStack
      h={TRACK_HEIGHT}
      w={`${Math.min(100, share)}%`}
      bg={sourceGroupColor(colors, group)}
    />
  );
}

/* ─── Ba thẻ chọn nguồn ────────────────────────────────────────────────────── */

/**
 * Ba thẻ "Tất cả nguồn · Qua sàn XePrime · Nguồn ngoài" - chạm một thẻ là chọn góc nhìn (web
 * `RevenueSourceCards`). Góc nhìn do màn gọi giữ; thẻ chỉ báo lên. Trên điện thoại ba thẻ xếp dọc.
 */
export function RevenueSourceCards({
  data,
  loading,
  error,
  onRetry,
  view,
  onChange,
}: SourceStateProps & {
  view: RevenueSourceView | null;
  onChange: (view: RevenueSourceView | null) => void;
}) {
  const t = useTranslations('Finance.bySource.cards');
  const tCommon = useTranslations('Common');
  const colors = useColors();
  const fmt = useAppFormat();

  if (error) {
    return (
      <Callout tone="warning" title={t('error')}>
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={space.sm}>
          <Text col={colors.brandLink} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
            {tCommon('actions.retry')}
          </Text>
        </Pressable>
      </Callout>
    );
  }

  const total = data?.total ?? '0';
  const marketplaceShare = data ? sharePercent(data.marketplaceAmount, total) : 0;
  const directShare = data ? sharePercent(data.directAmount, total) : 0;
  const unlinkedShare = data ? sharePercent(data.unlinkedAmount, total) : 0;
  const viewName = view === null ? t('all') : t(view);

  const cards: {
    key: RevenueSourceView | null;
    group: 'all' | SourceGroup;
    label: string;
    amount: string | null;
    trips: number | null;
    hint: string;
    share: number | null;
    bar: ReactNode;
  }[] = [
    {
      key: null,
      group: 'all',
      label: t('all'),
      amount: data?.total ?? null,
      trips: data ? tripsOf(data.items, null) : null,
      hint: t('split', { marketplace: marketplaceShare, direct: directShare }),
      share: null,
      bar: (
        <RevenueSourceTrack>
          <RevenueSourceSegment share={marketplaceShare} group="marketplace" />
          <RevenueSourceSegment share={directShare} group="direct" />
          <RevenueSourceSegment share={unlinkedShare} group="unlinked" />
        </RevenueSourceTrack>
      ),
    },
    {
      key: REVENUE_SOURCE_VIEW.MARKETPLACE,
      group: 'marketplace',
      label: t('xeprime'),
      amount: data?.marketplaceAmount ?? null,
      trips: data ? tripsOf(data.items, REVENUE_SOURCE_VIEW.MARKETPLACE) : null,
      hint: t('xeprimeHint'),
      share: marketplaceShare,
      bar: (
        <RevenueSourceTrack>
          <RevenueSourceSegment share={marketplaceShare} group="marketplace" />
        </RevenueSourceTrack>
      ),
    },
    {
      key: REVENUE_SOURCE_VIEW.DIRECT,
      group: 'direct',
      label: t('direct'),
      amount: data?.directAmount ?? null,
      trips: data ? tripsOf(data.items, REVENUE_SOURCE_VIEW.DIRECT) : null,
      hint: t('directHint'),
      share: directShare,
      bar: (
        <RevenueSourceTrack>
          <RevenueSourceSegment share={directShare} group="direct" />
        </RevenueSourceTrack>
      ),
    },
  ];

  return (
    <YStack gap={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
        <Text col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
          {t('label')}
        </Text>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} numberOfLines={1}>
          {t.rich('viewing', {
            name: viewName,
            b: (chunks) => (
              <Text col={colors.text} fow={fontWeight.semibold}>
                {chunks}
              </Text>
            ),
          })}
        </Text>
      </XStack>
      {cards.map((card) => {
        const active = card.key === view;
        const accent = sourceGroupColor(colors, card.group);
        return (
          <Pressable
            key={card.group}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${card.label}${card.amount !== null ? `: ${fmt.money(card.amount)}` : ''}`}
            onPress={() => onChange(card.key)}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <YStack
              gap={space.sm}
              p={space.md}
              br={radius.md}
              bw={active ? 1.5 : 1}
              bc={active ? (card.group === 'direct' ? colors.infoStrong : colors.primary) : colors.border}
              bg={active ? colors.surfaceMuted : colors.surface}
            >
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <XStack ai="center" gap={space.xs} f={1} minWidth={0}>
                  {card.group !== 'all' ? (
                    <YStack w={8} h={8} br={radius.pill} bg={accent} />
                  ) : null}
                  <Text
                    col={card.group === 'all' ? colors.text : accent}
                    fos={typeScale.body.fontSize}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {card.label}
                  </Text>
                </XStack>
                {card.trips !== null ? (
                  <Text col={colors.textMuted} fos={typeScale.label.fontSize} fow={fontWeight.medium}>
                    {t('trips', { count: card.trips })}
                  </Text>
                ) : null}
              </XStack>
              {loading ? (
                <SkeletonText lines={1} />
              ) : (
                <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
                  {card.amount !== null ? fmt.money(card.amount) : '-'}
                </Text>
              )}
              {card.bar}
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text f={1} minWidth={0} col={colors.textMuted} fos={typeScale.label.fontSize} numberOfLines={1}>
                  {card.hint}
                </Text>
                {card.share !== null ? (
                  <Text col={accent} fos={typeScale.label.fontSize} fow={fontWeight.semibold}>
                    {t('share', { percent: card.share })}
                  </Text>
                ) : null}
              </XStack>
            </YStack>
          </Pressable>
        );
      })}
    </YStack>
  );
}

/* ─── Chi tiết từng nguồn ──────────────────────────────────────────────────── */

/**
 * "Chi tiết doanh thu từng nguồn" — web `FinanceSourceRowsCard` + `RevenueSourceRows`: danh sách từng
 * nguồn (khách quen, vãng lai, mạng xã hội...) dưới góc nhìn đang chọn, kèm tổng của góc nhìn.
 */
export const RevenueSourceRowsBlock = memo(function RevenueSourceRowsBlock({
  data,
  loading,
  error,
  onRetry,
  view,
}: SourceStateProps & { view: RevenueSourceView | null }) {
  const t = useTranslations('Finance.bySource.rows');
  const tCommon = useTranslations('Common');
  const colors = useColors();
  const fmt = useAppFormat();
  const sourceText = useBookingSourceText();

  const items = data?.items.filter((item) => itemMatchesView(item, view)) ?? [];
  const nameOf = (item: FinanceSourceBreakdown['items'][number]) =>
    item.source ? sourceText(item.source, item.sourceLabel) : t('unlinkedName');

  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <XStack ai="center" gap={space.xs} f={1} minWidth={0}>
            <SectionHeader>{t('title')}</SectionHeader>
            <InfoHint label={t('bookedInfoLabel')} content={t('bookedInfo')} />
          </XStack>
          {data ? (
            <Text col={colors.brandMoney} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
              {t('total', { amount: fmt.money(revenueOf(data, view)) })}
            </Text>
          ) : null}
        </XStack>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
          {t('subtitle')}
        </Text>
      </YStack>

      {error ? (
        <Callout tone="warning" title={t('error')}>
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={space.sm}>
            <Text col={colors.brandLink} fos={typeScale.body.fontSize} fow={fontWeight.medium}>
              {tCommon('actions.retry')}
            </Text>
          </Pressable>
        </Callout>
      ) : loading ? (
        <SkeletonText lines={4} />
      ) : items.length === 0 ? (
        <ScreenMessage compact icon="pie-chart-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        items.map((item) => {
          const group = sourceGroupOf(item);
          return (
            <YStack key={`${item.source ?? ''}|${item.sourceLabel ?? ''}`} gap={space.xs}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <XStack ai="center" gap={space.xs} f={1} minWidth={0}>
                  <Text flexShrink={1} col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.medium} numberOfLines={1}>
                    {nameOf(item)}
                  </Text>
                  <YStack px={space.xs} br={radius.sm} bw={1} bc={sourceGroupColor(colors, group)}>
                    <Text col={sourceGroupColor(colors, group)} fos={typeScale.label.fontSize}>
                      {t(`tag.${group}`)}
                    </Text>
                  </YStack>
                </XStack>
                <Text col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
                  {fmt.money(item.amount)}
                </Text>
              </XStack>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text f={1} minWidth={0} col={colors.textMuted} fos={typeScale.label.fontSize}>
                  {/* Khoản không gắn đơn không có chuyến - nói nó LÀ gì thay cho "0 chuyến". */}
                  {group === 'unlinked' ? t('unlinkedHint') : t('trips', { count: item.trips })}
                  {!isZeroMoney(item.bookedAmount)
                    ? `${LIST_SEPARATOR}${t('booked', { amount: fmt.money(item.bookedAmount) })}`
                    : ''}
                </Text>
                <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
                  {t('share', { percent: item.sharePercent })}
                </Text>
              </XStack>
              <RevenueSourceTrack>
                <RevenueSourceSegment share={item.sharePercent} group={group} />
              </RevenueSourceTrack>
            </YStack>
          );
        })
      )}
    </YStack>
  );
});

const styles = StyleSheet.create({ pressed: { opacity: 0.8 } });
