import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import type { IconName } from '@/components/ui/Chip';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PartnerOverview } from '../api';
import type { DashboardLinks } from '../hooks/use-dashboard';

/**
 * Câu trả lời đầu trang ("Hôm nay: giao 3 xe · 1 yêu cầu chờ bạn trả lời.") — bản native của dòng
 * `answer` trong `DashboardHeader` bên web. Tông vàng khi có việc, xanh khi yên ả.
 */
export function AnswerBanner({ answer }: { answer: { text: string; busy: boolean } | null }) {
  const colors = useColors();
  if (!answer) return null;
  const fg = answer.busy ? colors.warning : colors.success;
  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.md}
      bg={answer.busy ? colors.warningSurface : colors.successSurface}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={answer.busy ? 'flash' : 'checkmark-circle'} size={iconSize.md} color={fg} />
      <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {answer.text}
      </Text>
    </XStack>
  );
}

interface TileMeta {
  key: string;
  text: string;
  urgent?: boolean;
}

/**
 * Bốn ô VIỆC CẦN LÀM — bản native của `TodayFocus` bên web: yêu cầu chờ duyệt · chờ khách thanh
 * toán · chờ giao xe · đang cho thuê. Mỗi ô dẫn tới đúng danh sách tạo nên con số của nó.
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
  const colors = useColors();
  const t = useTranslations('Dashboard.focus');
  const fmt = useAppFormat();

  const failed = isError && !overview;
  const countOf = (value: number | undefined): number | null | undefined =>
    failed ? null : overview ? (value ?? 0) : undefined;

  const showRequests = !overview || overview.requests !== null;
  const showBookings = !overview || overview.today !== null;
  if (!showRequests && !showBookings) return null;

  const requests = overview?.requests ?? null;
  const today = overview?.today ?? null;

  const requestMeta: TileMeta[] = [];
  if (requests && requests.pendingUrgent > 0) {
    requestMeta.push({
      key: 'urgent',
      text: t('requests.urgent', { count: requests.pendingUrgent }),
      urgent: true,
    });
  }
  if (requests?.nextRespondBy) {
    requestMeta.push({
      key: 'next',
      text: t('requests.next', { time: fmt.shortDateTime(requests.nextRespondBy) }),
    });
  }

  const pickupMeta: TileMeta[] = [];
  if (today && today.pickupsOverdue > 0) {
    pickupMeta.push({
      key: 'overdue',
      text: t('pickups.overdue', { count: today.pickupsOverdue }),
      urgent: true,
    });
  }
  if (today && today.pickupsToday > 0) {
    pickupMeta.push({ key: 'today', text: t('pickups.today', { count: today.pickupsToday }) });
  }

  const activeMeta: TileMeta[] = [];
  if (today && today.returnsOverdue > 0) {
    activeMeta.push({
      key: 'overdue',
      text: t('active.overdue', { count: today.returnsOverdue }),
      urgent: true,
    });
  }
  if (today && today.returnsToday > 0) {
    activeMeta.push({
      key: 'today',
      text: t('active.returnsToday', { count: today.returnsToday }),
    });
  }

  return (
    <YStack gap={space.sm}>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {t('title')}
      </Text>
      <XStack flexWrap="wrap" gap={space.sm}>
        {showRequests ? (
          <>
            <ActionTile
              icon="file-tray-full-outline"
              label={t('requests.label')}
              count={countOf(requests?.pending)}
              href={links.requests}
              urgent={Boolean(requests && requests.pendingUrgent > 0)}
              meta={requestMeta}
              emptyText={t('requests.none')}
              errorText={t('loadError')}
            />
            <ActionTile
              icon="wallet-outline"
              label={t('awaitingPayment.label')}
              count={countOf(requests?.awaitingPayment)}
              href={links.awaitingPayment}
              meta={[{ key: 'hint', text: t('awaitingPayment.hint') }]}
              emptyText={t('awaitingPayment.none')}
              errorText={t('loadError')}
            />
          </>
        ) : null}
        {showBookings ? (
          <>
            <ActionTile
              icon="car-outline"
              label={t('pickups.label')}
              count={countOf(today?.awaitingPickup)}
              href={links.awaitingPickup}
              urgent={Boolean(today && today.pickupsOverdue > 0)}
              meta={pickupMeta}
              emptyText={t('pickups.none')}
              errorText={t('loadError')}
            />
            <ActionTile
              icon="key-outline"
              label={t('active.label')}
              count={countOf(today?.active)}
              href={links.active}
              urgent={Boolean(today && today.returnsOverdue > 0)}
              meta={activeMeta}
              emptyText={t('active.none')}
              errorText={t('loadError')}
            />
          </>
        ) : null}
      </XStack>
    </YStack>
  );
}

/** Một ô việc: nửa bề ngang màn (2×2 trên máy hẹp), bấm để mở danh sách nguồn. */
function ActionTile({
  icon,
  label,
  count,
  href,
  urgent = false,
  meta,
  emptyText,
  errorText,
}: {
  icon: IconName;
  label: string;
  count: number | null | undefined;
  href: Href;
  urgent?: boolean;
  meta: readonly TileMeta[];
  emptyText: string;
  errorText: string;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const tone = urgent ? colors.danger : colors.primaryActive;

  let value: string;
  let lines: readonly TileMeta[];
  if (count === undefined) {
    value = '…';
    lines = [];
  } else if (count === null) {
    value = '—';
    lines = [{ key: 'error', text: errorText, urgent: true }];
  } else {
    value = fmt.count(count);
    lines = count === 0 ? [{ key: 'none', text: emptyText }] : meta;
  }

  return (
    <YStack w="48%" flexGrow={1}>
      <Card
        onPress={() => navigateOnce(href)}
        accessibilityLabel={`${label}: ${value}${lines.length ? `. ${lines.map((l) => l.text).join('. ')}` : ''}`}
      >
        <YStack gap={space.xs}>
          <XStack ai="center" gap={space.sm}>
            <IconDisc icon={icon} tone={tone} size={28} />
            <Text f={1} col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
              {label}
            </Text>
          </XStack>
          <Text col={count ? tone : colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {value}
          </Text>
          {lines.map((line) => (
            <Text
              key={line.key}
              col={line.urgent ? colors.danger : colors.textMuted}
              fos={fontSize.label}
              fow={line.urgent ? fontWeight.semibold : fontWeight.regular}
            >
              {line.text}
            </Text>
          ))}
        </YStack>
      </Card>
    </YStack>
  );
}
