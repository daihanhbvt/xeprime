import type { Href } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import CheckCircleOutlined from '@ant-design/icons-svg/es/asn/CheckCircleOutlined';
import ThunderboltOutlined from '@ant-design/icons-svg/es/asn/ThunderboltOutlined';
import { AntIcon } from '@/components/icons/AntIcon';
import type { LineIconName } from '@/components/icons/LineIcon';
import { MetricTile, type MetricTileLine, type MetricTileTone } from '@/components/ui/MetricTile';
import { TwoColumnGrid } from '@/components/ui/TwoColumnGrid';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { PartnerOverview } from '../api';
import type { DashboardLinks } from '../hooks/use-dashboard';

/**
 * Câu trả lời đầu trang ("Hôm nay: giao 3 xe · 1 yêu cầu chờ bạn trả lời.") — bản native của dòng
 * `answer` trong `DashboardHeader` bên web, vẽ theo ngôn ngữ design v2: hộp bo 12, viền 1, chữ
 * 14/20 đậm vừa. Bận = nền/viền vàng nhạt + tia sét; yên = nền/viền xanh + dấu tích.
 */
export const AnswerBanner = memo(function AnswerBanner({
  answer,
}: {
  answer: { text: string; busy: boolean } | null;
}) {
  const colors = useColors();
  if (!answer) return null;
  return (
    <XStack
      ai="flex-start"
      gap={ANSWER_GAP}
      px={ANSWER_PAD_X}
      py={ANSWER_PAD_Y}
      br={radius.control}
      bw={1}
      bc={answer.busy ? colors.brandBorder : colors.successBorder}
      bg={answer.busy ? colors.brandLow : colors.successSurface}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <YStack pt={ANSWER_ICON_NUDGE}>
        <AntIcon
          icon={answer.busy ? ThunderboltOutlined : CheckCircleOutlined}
          size={ANSWER_ICON}
          color={answer.busy ? colors.brandHigh : colors.success}
        />
      </YStack>
      <Text
        f={1}
        col={colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
      >
        {answer.text}
      </Text>
    </XStack>
  );
});

/** Hộp `px 12 · py 8`, icon 16 lùi 2 cho thẳng dòng 20. */
const ANSWER_PAD_X = 12;
const ANSWER_PAD_Y = 8;
const ANSWER_GAP = 8;
const ANSWER_ICON = 16;
const ANSWER_ICON_NUDGE = 2;

interface TileModel {
  key: string;
  icon: LineIconName;
  tone: MetricTileTone;
  label: string;
  count: number | null | undefined;
  href: Href;
  /** Việc GẤP (quá giờ / sắp hết hạn) - viên đỏ cạnh con số. */
  badge?: string;
  /** Dòng phụ khi có số > 0. */
  lines: MetricTileLine[];
  emptyText: string;
}

/**
 * Bốn ô VIỆC CẦN LÀM — bản native của `TodayFocus` bên web, vẽ theo Figma "Overview Metrics"
 * (`24175:52353`): yêu cầu chờ duyệt (đỏ) · chờ khách thanh toán (cam) · chờ giao xe (xanh dương)
 * · đang cho thuê (xanh lá). Mỗi ô dẫn tới đúng danh sách tạo nên con số của nó.
 *
 * Ba trạng thái của một con số: `undefined` = đang tải (`…`), `null` = lỗi (nói ra thành chữ),
 * số = dữ liệu thật. Lỗi KHÔNG bao giờ hoá thành 0. Khối thiếu quyền (server trả `null`) bị ẩn.
 */
export function TodayFocus({
  overview,
  isError,
  links,
}: {
  overview: PartnerOverview | undefined;
  isError: boolean;
  links: DashboardLinks;
}) {
  const t = useTranslations('Dashboard.focus');
  const tApp = useTranslations('Dashboard.partnerApp');
  const fmt = useAppFormat();

  const tiles = useMemo<TileModel[]>(() => {
    const failed = isError && !overview;
    const countOf = (value: number | undefined): number | null | undefined =>
      failed ? null : overview ? (value ?? 0) : undefined;

    const showRequests = !overview || overview.requests !== null;
    const showBookings = !overview || overview.today !== null;
    const requests = overview?.requests ?? null;
    const today = overview?.today ?? null;
    // Mốc trong HÔM NAY chỉ hiện giờ; khác ngày giữ cả ngày để không đọc nhầm thành giờ hôm nay.
    const when = (iso: string) =>
      toAppTz(iso).isSame(nowInAppTz(), 'day') ? fmt.time(iso) : fmt.shortDateTime(iso);
    const list: TileModel[] = [];

    if (showRequests) {
      list.push(
        {
          key: 'requests',
          icon: 'doc-align-right',
          tone: 'danger',
          label: t('requests.label'),
          count: countOf(requests?.pending),
          href: links.requests,
          ...(requests && requests.pendingUrgent > 0
            ? { badge: t('requests.urgentShort', { count: requests.pendingUrgent }) }
            : {}),
          lines: requests?.nextRespondBy
            ? [
                {
                  key: 'next',
                  // Figma "Hạn trả lời gần nhất 11:37": hạn trong HÔM NAY chỉ hiện giờ; khác ngày giữ
                  // cả ngày để không đọc nhầm thành giờ của hôm nay.
                  text: t('requests.next', { time: when(requests.nextRespondBy) }),
                },
              ]
            : [],
          emptyText: t('requests.none'),
        },
        {
          key: 'awaitingPayment',
          icon: 'wallet-2',
          tone: 'warning',
          label: t('awaitingPayment.label'),
          count: countOf(requests?.awaitingPayment),
          href: links.awaitingPayment,
          lines: [{ key: 'hint', text: t('awaitingPayment.hint') }],
          // Nguyên văn Figma "Không có chuyến chờ" - khoá riêng app (người dùng chốt 20/11/2026).
          emptyText: tApp('awaitingPaymentNone'),
        },
      );
    }
    if (showBookings) {
      list.push(
        {
          key: 'pickups',
          icon: 'spinner',
          tone: 'info',
          label: t('pickups.label'),
          count: countOf(today?.awaitingPickup),
          href: links.awaitingPickup,
          ...(today && today.pickupsOverdue > 0
            ? { badge: t('pickups.overdueShort', { count: today.pickupsOverdue }) }
            : {}),
          // Figma "Giao gần nhất 17:30": mốc giao SẮP TỚI gần nhất (lượt quá giờ ở viên đỏ).
          lines: today?.nextPickupAt
            ? [{ key: 'next', text: tApp('nextPickup', { time: when(today.nextPickupAt) }) }]
            : today && today.pickupsToday > 0
              ? [{ key: 'today', text: t('pickups.today', { count: today.pickupsToday }) }]
              : [],
          emptyText: t('pickups.none'),
        },
        {
          key: 'active',
          icon: 'car-side',
          tone: 'success',
          label: t('active.label'),
          count: countOf(today?.active),
          href: links.active,
          ...(today && today.returnsOverdue > 0
            ? { badge: t('active.overdueShort', { count: today.returnsOverdue }) }
            : {}),
          // Figma "Nhận lại sớm nhất 18:00": mốc trả SẮP TỚI gần nhất.
          lines: today?.nextReturnAt
            ? [{ key: 'next', text: tApp('nextReturn', { time: when(today.nextReturnAt) }) }]
            : today && today.returnsToday > 0
              ? [{ key: 'today', text: t('active.returnsToday', { count: today.returnsToday }) }]
              : [],
          emptyText: t('active.none'),
        },
      );
    }
    return list;
  }, [overview, isError, links, t, tApp, fmt]);

  const keyOf = useCallback((tile: TileModel) => tile.key, []);
  const renderTile = useCallback((tile: TileModel) => <FocusTile tile={tile} />, []);

  if (tiles.length === 0) return null;

  /* Figma: lưới 2 cột, khoảng 12, hai ô một hàng CAO BẰNG NHAU; tên khối chỉ là `aria-label`. */
  return (
    <YStack accessibilityLabel={t('title')}>
      <TwoColumnGrid items={tiles} gap={TILE_GAP} keyOf={keyOf} renderItem={renderTile} />
    </YStack>
  );
}

/** Figma "Overview Metrics": `gap 12`. */
const TILE_GAP = 12;

const FocusTile = memo(function FocusTile({ tile }: { tile: TileModel }) {
  const t = useTranslations('Dashboard.focus');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { href } = tile;
  const onPress = useCallback(() => navigateOnce(href), [navigateOnce, href]);

  const loading = tile.count === undefined;
  const failed = tile.count === null;
  const calm = tile.count === 0;

  let value: string;
  let lines: readonly MetricTileLine[];
  let badge: string | undefined;
  if (loading) {
    value = '…';
    lines = [];
  } else if (failed) {
    value = '-';
    lines = [{ key: 'error', text: t('loadError') }];
  } else {
    value = fmt.count(tile.count ?? 0);
    lines = calm ? [{ key: 'none', text: tile.emptyText }] : tile.lines;
    badge = calm ? undefined : tile.badge;
  }

  const a11y = [`${tile.label}: ${value}`, badge, ...lines.map((line) => line.text)]
    .filter(Boolean)
    .join('. ');

  return (
    <MetricTile
      icon={tile.icon}
      tone={tile.tone}
      value={value}
      label={tile.label}
      {...(badge ? { badge } : {})}
      lines={lines}
      onPress={onPress}
      accessibilityLabel={a11y}
    />
  );
});
