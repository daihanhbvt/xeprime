import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_DECISION_SOURCE,
  CUSTOMER_TRIP_STAGE_META,
  PERMISSION,
  VEHICLE_TRIP_HISTORY_FILTER,
  type VehicleTripHistoryFilter,
  VEHICLE_TRIP_HISTORY_FILTER_VALUES,
  VEHICLE_TRIP_HISTORY_KIND,
  type CustomerTripStage,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DataRow } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';
import type { VehicleTripHistoryItem } from './api';
import { useVehicleTripHistory } from './hooks/use-vehicle-settings';

/**
 * Lịch sử chuyến của MỘT xe: đơn thật + yêu cầu chưa/không thành đơn, trộn và cắt trang ở SERVER
 * (`GET /vehicles/:id/trip-history`). Bản native của `TripHistorySection`.
 *
 * Cần CẢ hai quyền xem đơn và xem yêu cầu — thiếu một là không gọi API (backend cũng đòi cả hai).
 *
 * Tab sống ở STATE màn hình, không ở URL như web: app không có thanh địa chỉ để chia sẻ, và bộ
 * lọc chết theo màn (ADR 0004).
 */
export function VehicleTripHistoryScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={VEHICLE_MANAGE_SECTION.TRIP_HISTORY}
      title={t('tripHistory.title')}
    >
      {() => <TripHistoryBody vehicleId={vehicleId} />}
    </VehicleManageShell>
  );
}

function TripHistoryBody({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage.tripHistory');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const canView = has(PERMISSION.BOOKING_VIEW) && has(PERMISSION.BOOKING_REQUEST_VIEW);
  const [filter, setFilter] = useState<VehicleTripHistoryFilter>(VEHICLE_TRIP_HISTORY_FILTER.ALL);
  const query = useVehicleTripHistory(vehicleId, filter, canView);

  if (!canView) {
    return (
      <ScreenMessage icon="lock-closed-outline" title={t('title')} description={t('forbidden')} />
    );
  }

  const isAll = filter === VEHICLE_TRIP_HISTORY_FILTER.ALL;

  return (
    <YStack gap={space.md}>
      <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={t('tabsLabel')}>
        {VEHICLE_TRIP_HISTORY_FILTER_VALUES.map((value) => (
          <Chip
            key={value}
            label={domainLabel('vehicleTripHistoryFilter', value)}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </XStack>

      {query.isInitialLoading ? (
        <MiniRowsSkeleton rows={4} />
      ) : query.initialError ? (
        <ScreenError error={query.initialError} title={t('loadError')} onRetry={query.retry} />
      ) : query.items.length === 0 ? (
        <ScreenMessage
          icon={isAll ? 'time-outline' : 'search-outline'}
          title={isAll ? t('empty') : t('emptyFiltered')}
          actionLabel={isAll ? undefined : tActions('clear')}
          onAction={isAll ? undefined : () => setFilter(VEHICLE_TRIP_HISTORY_FILTER.ALL)}
        />
      ) : (
        <YStack gap={space.sm}>
          {query.items.map((item) => (
            <TripHistoryCard key={item.key} item={item} />
          ))}
          {/*
            Nút "tải thêm" chứ không phải cuộn-chạm-đáy: danh sách này nằm TRONG `Screen` cuộn
            chung với các khối khác, nên không có `onEndReached` để bám vào.
          */}
          {query.isFetchingNextPage ? (
            <MiniRowsSkeleton rows={2} />
          ) : (
            <Button
              label={tActions('viewMore')}
              icon="chevron-down-outline"
              variant="ghost"
              size="sm"
              onPress={query.fetchNextPage}
            />
          )}
        </YStack>
      )}
    </YStack>
  );
}

/**
 * Một dòng lịch sử. Tiền chỉ hiện khi có SỐ CHỐT — yêu cầu chưa thành đơn nói "chưa có số chốt",
 * không bao giờ là `0đ`. Mở chi tiết qua `/trips/[id]`: route đó nhận cả id đơn lẫn id yêu cầu.
 */
function TripHistoryCard({ item }: { item: VehicleTripHistoryItem }) {
  const t = useTranslations('VehicleManage.tripHistory');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const isBooking = item.kind === VEHICLE_TRIP_HISTORY_KIND.BOOKING;
  const targetId = item.bookingId ?? item.requestId ?? '';

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <Avatar name={item.customerName} url={item.customerAvatarUrl ?? null} size={36} />
          <Text
            f={1}
            col={colors.text}
            fos={fontSize.bodySm}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {item.customerName || t('renterUnknown')}
          </Text>
          <StatusBadge
            label={domainLabel('customerTripStage', item.stage)}
            color={CUSTOMER_TRIP_STAGE_META[item.stage as CustomerTripStage].color}
            size="sm"
          />
        </XStack>

        <YStack>
          <DataRow
            label={t('start')}
            value={
              item.pickupAt
                ? fmt.dateTime(item.pickupAt)
                : (fmt.packageLabel(item.longTermPackageMonths) ?? fmt.dateTime(null))
            }
          />
          <DataRow label={t('end')} value={item.returnAt ? fmt.dateTime(item.returnAt) : '—'} />
          <DataRow
            label={t('total')}
            value={item.totalAmount ? fmt.money(item.totalAmount) : t('awaitingQuote')}
          />
        </YStack>

        {/*
          KHÔNG `flexWrap` ở hàng này. Yoga tính `f={1}` trong một hàng biết xuống dòng với cơ sở
          0, nên dòng "Đơn thuê · 14/09 17:00" co về sát 0 và hiện ra đúng một dấu "…" trong khi
          hàng vẫn còn trống quá nửa. Hàng này cố ý MỘT dòng: hai đầu là chi tiết cố định, phần
          giữa co giãn và cắt bằng `numberOfLines`.
        */}
        <XStack ai="center" gap={space.xs}>
          {item.decisionSource === BOOKING_REQUEST_DECISION_SOURCE.SYSTEM ? (
            <XStack ai="center" gap={2}>
              <Ionicons name="flash" size={iconSize.sm} color={colors.primaryActive} />
              <Text col={colors.primaryActive} fos={fontSize.label}>
                {t('autoAccepted')}
              </Text>
            </XStack>
          ) : null}
          <Text f={1} col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
            {`${domainLabel('vehicleTripHistoryKind', item.kind)}${LIST_SEPARATOR}${fmt.dateTime(item.happenedAt)}`}
          </Text>
          {targetId ? (
            <InlineAction
              label={isBooking ? t('openBooking') : t('openRequest')}
              onPress={() => navigateOnce(ROUTES.booking.detail(targetId))}
            />
          ) : null}
        </XStack>
      </YStack>
    </Card>
  );
}
