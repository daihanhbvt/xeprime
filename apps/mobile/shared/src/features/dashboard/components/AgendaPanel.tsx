import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DASHBOARD_AGENDA_DAYS, DASHBOARD_AGENDA_KIND } from '@xeprime/types';
import { dayjs } from '@xeprime/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PartnerAgendaItem, PartnerOverviewAgenda } from '../api';
import { groupAgenda, type AgendaGroup } from '../dashboard-model';
import { DashboardPanel } from './DashboardPanel';

/**
 * Lịch giao & nhận xe `DASHBOARD_AGENDA_DAYS` ngày tới — bản native của `AgendaPanel` bên web.
 * Nhóm QUÁ GIỜ đứng đầu (tông đỏ), rồi Hôm nay / Ngày mai / từng ngày. Mỗi dòng mở chi tiết đơn.
 * "Xem tất cả đơn" luôn hiện khi có mốc — server cắt ở `DASHBOARD_AGENDA_LIMIT` (`hasMore`).
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
  const navigateOnce = useNavigateOnce();
  const now = generatedAt ? dayjs(generatedAt) : dayjs();

  return (
    <DashboardPanel
      title={t('title')}
      icon="calendar"
      tone="info"
      extra={t('window', { days: DASHBOARD_AGENDA_DAYS })}
      loading={!agenda && !isError}
      error={!agenda && isError}
      onRetry={onRetry}
      action={{ label: t('more'), onPress: () => navigateOnce(moreHref) }}
    >
      {agenda ? (
        agenda.items.length === 0 ? (
          <YStack px={space.md} py={space.md} gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('empty', { days: DASHBOARD_AGENDA_DAYS })}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('emptyHint')}
            </Text>
          </YStack>
        ) : (
          <YStack px={space.md} py={space.sm} gap={space.md}>
            {groupAgenda(agenda.items, now).map((group) => (
              <AgendaGroupBlock
                key={group.key}
                group={group}
                onOpen={(id) => navigateOnce(bookingHref(id))}
              />
            ))}
          </YStack>
        )
      ) : null}
    </DashboardPanel>
  );
}

function AgendaGroupBlock({ group, onOpen }: { group: AgendaGroup; onOpen: (id: string) => void }) {
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const overdue = group.kind === 'overdue';

  let heading: string;
  if (group.kind === 'overdue') heading = t('overdue');
  else if (group.kind === 'today') heading = t('today');
  else if (group.kind === 'tomorrow') heading = t('tomorrow');
  else if (group.day) heading = `${fmt.weekdayLong(group.day)} · ${fmt.dateKey(group.key)}`;
  else heading = group.key;

  return (
    <YStack gap={space.xs} accessibilityLabel={heading}>
      <XStack ai="center" gap={space.xs}>
        <Text col={overdue ? colors.danger : colors.text} fos={fontSize.label} fow={fontWeight.bold}>
          {heading}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          ({group.items.length})
        </Text>
      </XStack>
      {group.items.map((item) => (
        <AgendaRow
          key={`${item.kind}-${item.bookingId}`}
          item={item}
          overdue={overdue}
          onPress={() => onOpen(item.bookingId)}
        />
      ))}
    </YStack>
  );
}

function AgendaRow({
  item,
  overdue,
  onPress,
}: {
  item: PartnerAgendaItem;
  overdue: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('Dashboard.agenda');
  const fmt = useAppFormat();
  const pickup = item.kind === DASHBOARD_AGENDA_KIND.PICKUP;
  const kindLabel = t(pickup ? 'kind.pickup' : 'kind.return');
  const when = overdue ? fmt.shortDateTime(item.at) : fmt.time(item.at);
  const vehicle = item.plateNumber ? `${item.vehicleName} · ${item.plateNumber}` : item.vehicleName;
  const kindTone = pickup ? colors.info : colors.success;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('itemAria', { kind: kindLabel, vehicle, customer: item.customerName, time: when })}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        py={space.xs}
        px={space.sm}
        br={radius.sm}
        bg={overdue ? colors.dangerSurface : colors.surfaceMuted}
      >
        <YStack w={64} gap={2}>
          <Text col={overdue ? colors.danger : colors.text} fos={fontSize.label} fow={fontWeight.bold}>
            {when}
          </Text>
          <Text col={kindTone} fos={fontSize.meta} fow={fontWeight.semibold}>
            {kindLabel}
          </Text>
        </YStack>
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
            {vehicle}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
            {item.customerName} · {item.code}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}
