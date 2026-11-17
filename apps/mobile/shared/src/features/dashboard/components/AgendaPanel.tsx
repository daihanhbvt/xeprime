import type { Href } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DASHBOARD_AGENDA_DAYS, DASHBOARD_AGENDA_KIND } from '@xeprime/types';
import { LIST_SEPARATOR, dayjs, toAppTz, type Dayjs } from '@xeprime/domain';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { UnderlineTabs, type UnderlineTabItem } from '@/components/ui/UnderlineTabs';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';
import type { PartnerAgendaItem, PartnerOverviewAgenda } from '../api';
import { groupAgenda } from '../dashboard-model';
import { DashboardPanel } from './DashboardPanel';

type AgendaTab = 'all' | 'overdue' | 'today' | 'upcoming';

interface AgendaRowModel {
  item: PartnerAgendaItem;
  overdue: boolean;
}

/**
 * Lịch giao & nhận xe `DASHBOARD_AGENDA_DAYS` ngày tới — bản native của web `AgendaPanel`, vẽ theo
 * Figma "Nhóm thông tin" `24175:52404`: hàng tab gạch chân Tất cả / Quá giờ / Hôm nay / N ngày tới
 * (kèm số đếm), rồi các dòng cách nhau bằng kẻ 1.
 *
 * Tab chỉ LỌC ở client trên đúng danh sách đã tải (cùng phép chia nhóm `groupAgenda` với web:
 * quá giờ = trước `generatedAt`, hôm nay / sau hôm nay theo ngày lịch Việt Nam) - không gọi
 * thêm API, không đổi thứ tự server trả.
 */
export function AgendaPanel({
  agenda,
  generatedAt,
  isError,
  onRetry,
  bookingHref,
  moreHref,
}: {
  agenda: PartnerOverviewAgenda | undefined;
  generatedAt: string | undefined;
  isError: boolean;
  onRetry: () => void;
  bookingHref: (id: string) => Href;
  moreHref: Href;
}) {
  const t = useTranslations('Dashboard.agenda');
  const colors = useColors();
  const navigateOnce = useNavigateOnce();
  const [tab, setTab] = useState<AgendaTab>('all');

  /* Mỗi dòng mang cờ quá giờ của NHÓM nó thuộc về - một phép chia, bốn tab đọc chung. */
  const buckets = useMemo(() => {
    const now = generatedAt ? dayjs(generatedAt) : dayjs();
    const result: Record<AgendaTab, AgendaRowModel[]> = { all: [], overdue: [], today: [], upcoming: [] };
    if (!agenda) return result;
    for (const group of groupAgenda(agenda.items, now)) {
      const overdue = group.kind === 'overdue';
      for (const item of group.items) {
        const row = { item, overdue };
        result.all.push(row);
        if (overdue) result.overdue.push(row);
        else if (group.kind === 'today') result.today.push(row);
        else result.upcoming.push(row);
      }
    }
    return result;
  }, [agenda, generatedAt]);

  const tabs = useMemo<UnderlineTabItem<AgendaTab>[]>(
    () => [
      { key: 'all', label: t('tabs.all'), count: buckets.all.length },
      { key: 'overdue', label: t('tabs.overdue'), count: buckets.overdue.length, urgent: buckets.overdue.length > 0 },
      { key: 'today', label: t('tabs.today'), count: buckets.today.length },
      {
        key: 'upcoming',
        label: t('tabs.upcoming', { days: DASHBOARD_AGENDA_DAYS }),
        count: buckets.upcoming.length,
      },
    ],
    [buckets, t],
  );

  const onOpen = useCallback((id: string) => navigateOnce(bookingHref(id)), [navigateOnce, bookingHref]);
  const onMore = useCallback(() => navigateOnce(moreHref), [navigateOnce, moreHref]);

  const hasItems = buckets.all.length > 0;
  const rows = buckets[tab];

  return (
    <DashboardPanel
      title={t('title')}
      loading={!agenda && !isError}
      error={!agenda && isError}
      onRetry={onRetry}
      errorTitle={t('loadError')}
      {...(hasItems ? { subheader: <UnderlineTabs items={tabs} value={tab} onChange={setTab} /> } : {})}
      {...(hasItems ? { footer: { label: t('moreAll'), onPress: onMore } } : {})}
    >
      {agenda ? (
        !hasItems ? (
          <EmptyState
            variant="empty"
            title={t('empty', { days: DASHBOARD_AGENDA_DAYS })}
            description={t('emptyHint')}
          />
        ) : rows.length === 0 ? (
          <YStack minHeight={EMPTY_MIN_HEIGHT} ai="center" jc="center">
            <Text
              col={colors.placeholder}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              ta="center"
            >
              {tab === 'all' ? t('empty', { days: DASHBOARD_AGENDA_DAYS }) : t(`tabEmpty.${tab}`)}
            </Text>
          </YStack>
        ) : (
          <YStack>
            {rows.map((row, index) => (
              <AgendaRow
                key={`${row.item.kind}-${row.item.bookingId}`}
                item={row.item}
                overdue={row.overdue}
                first={index === 0}
                last={index === rows.length - 1}
                now={generatedAt}
                onOpen={onOpen}
              />
            ))}
          </YStack>
        )
      ) : null}
    </DashboardPanel>
  );
}

const EMPTY_MIN_HEIGHT = 96;

/**
 * Một dòng lịch - Figma "Metric Details": cột trái rộng 64 (viên loại "Giao xe" xanh dương /
 * "Nhận xe" xanh lá · giờ 14/20 vàng · thứ + ngày 10/14), giữa (xe · biển 14/20 cắt "…", khách ·
 * loại thuê 12/18 mờ, mã đơn 14/20), phải là viên đỏ "Trễ …" khi đã quá giờ. Kẻ 1 giữa các dòng.
 */
const AgendaRow = memo(function AgendaRow({
  item,
  overdue,
  first,
  last,
  now,
  onOpen,
}: {
  item: PartnerAgendaItem;
  overdue: boolean;
  first: boolean;
  last: boolean;
  now: string | undefined;
  onOpen: (id: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pickup = item.kind === DASHBOARD_AGENDA_KIND.PICKUP;
  const kindLabel = t(pickup ? 'kind.pickup' : 'kind.return');
  const at = toAppTz(item.at);
  const time = fmt.time(item.at);
  const day = t('dayLabel', { weekday: fmt.weekdayShort(at), date: fmt.dayMonth(item.at) });
  const vehicle = item.plateNumber
    ? `${item.vehicleName}${LIST_SEPARATOR}${item.plateNumber}`
    : item.vehicleName;
  const service = domainLabel('serviceType', item.serviceType, item.serviceType);
  const late = overdue ? lateLabel(t, at, now ? dayjs(now) : dayjs()) : null;
  const { bookingId } = item;
  const onPress = useCallback(() => onOpen(bookingId), [onOpen, bookingId]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('itemAria', {
        kind: kindLabel,
        vehicle,
        customer: item.customerName,
        time: fmt.shortDateTime(item.at),
      })}
    >
      {({ pressed }) => (
        <XStack
          ai="flex-start"
          gap={ROW_GAP}
          py={ROW_PAD_Y}
          borderTopWidth={first ? 0 : 1}
          borderBottomWidth={last ? 1 : 0}
          borderColor={colors.border}
          opacity={pressed ? 0.7 : 1}
        >
          {/* `minWidth` chứ không `w`: chữ thật của viên "Nhận xe" rộng hơn 64 của Figma - cột ôm viên, không cắt thành "Nhận ...". */}
          <YStack minWidth={LEFT_COL} gap={LEFT_GAP} ai="flex-start">
            <Pill label={kindLabel} tone={pickup ? 'info' : 'success'} />
            <YStack>
              <Text
                col={colors.brandShape}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
              >
                {time}
              </Text>
              <Text
                col={colors.textMuted}
                fos={typeScale.caption.fontSize}
                lh={typeScale.caption.lineHeight}
                numberOfLines={1}
              >
                {day}
              </Text>
            </YStack>
          </YStack>
          <YStack f={1} minWidth={0} gap={MID_GAP}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {vehicle}
            </Text>
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              numberOfLines={1}
            >
              {`${item.customerName}${LIST_SEPARATOR}${service}`}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              numberOfLines={1}
            >
              {item.code}
            </Text>
          </YStack>
          {late ? <Pill label={late} tone="danger" size="sm" /> : null}
        </XStack>
      )}
    </Pressable>
  );
});

/** Figma: dòng `py 8 · gap 8`, cột trái `w 64 · gap 6`, cột giữa `gap 4`. */
const ROW_GAP = 8;
const ROW_PAD_Y = 8;
const LEFT_COL = 64;
const LEFT_GAP = 6;
const MID_GAP = 4;

/** "Trễ 3 ngày" / "Trễ 2 giờ" / "Trễ 15 phút" - đơn vị lớn nhất đã tròn, tính từ mốc server. */
function lateLabel(
  t: ReturnType<typeof useTranslations<'Dashboard.agenda'>>,
  at: Dayjs,
  now: Dayjs,
): string {
  const minutes = Math.max(1, now.diff(at, 'minute'));
  if (minutes >= MINUTES_PER_DAY) return t('lateDays', { count: Math.floor(minutes / MINUTES_PER_DAY) });
  if (minutes >= MINUTES_PER_HOUR) return t('lateHours', { count: Math.floor(minutes / MINUTES_PER_HOUR) });
  return t('lateMinutes', { count: minutes });
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
