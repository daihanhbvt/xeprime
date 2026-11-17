import { memo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, BOOKING_STATUS_SELECTABLE_VALUES, SERVICE_TYPE } from '@xeprime/types';
import { isZeroMoney, toAppTz } from '@xeprime/domain';
import { Ionicons } from '@/components/icons/Ionicons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { DateRangeField, type DateRangeValue } from '@/components/ui/DateRangeField';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ListSearchBar } from '@/features/shell/ListSearchBar';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { useCustomerBookingHistory } from '../hooks/use-customers';
import type { CustomerBooking } from '../api';

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 3;
/** Sentinel "Tất cả" của dải tab trạng thái - không gửi lên server. */
const ALL = 'all';
/** Ảnh xe 80 × 52 - cùng thẻ Lịch sử đơn thuê. */
const THUMB_W = 80;
const THUMB_H = 52;
const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

/**
 * Lịch sử thuê của một khách - khuôn danh sách màn Đơn thuê (người dùng 16/11/2026): ô tìm + nút
 * "Lọc" (`ListSearchBar`, tấm Lọc giữ khoảng ngày nhận xe), trạng thái thành dải tab, thẻ đơn như
 * thẻ Lịch sử đơn thuê, tải thêm dồn trang (server vẫn phân trang `limit` 10 như web).
 *
 * Chỉ render khi có `bookings.view` - endpoint trả 403 khi thiếu, nơi gọi gác trước.
 */
export function CustomerBookingHistory({
  customerId,
  canViewFinance,
}: {
  customerId: string;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.history');
  const tFilter = useTranslations('Customers.profile.history');
  const tRange = useTranslations('Common.components.dateRange');
  const tActions = useTranslations('Common.actions');
  const tFilters = useTranslations('Common.filters');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [page, setPage] = useState(FIRST_PAGE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [range, setRange] = useState<DateRangeValue>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const { data, isLoading, isFetching, isError, error, refetch } = useCustomerBookingHistory(customerId, {
    ...(q ? { q } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    page,
  });
  const items = useAccumulatedPages(data?.items, data?.meta?.page);
  const meta = data?.meta;
  const hasMore = meta ? meta.page * meta.limit < meta.total : false;
  const rangeActive = Boolean(range.from || range.to);
  const filtered = q.length > 0 || status !== ALL || rangeActive;

  const header = (
    <YStack gap={space.sm}>
      <ListSearchBar
        value={search}
        onChange={(next) => {
          setSearch(next);
          setPage(FIRST_PAGE);
        }}
        label={tFilter('searchPlaceholder')}
        placeholder={tFilter('searchPlaceholder')}
        filterCount={rangeActive ? 1 : 0}
        onFilterPress={() => setFilterOpen(true)}
      />
      <ChipTabs
        label={tFilter('status')}
        items={[
          { value: ALL, label: tFilter('statusAll') },
          ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
            value: value as string,
            label: domainLabel('bookingStatus', value),
          })),
        ]}
        value={status}
        onSelect={(next) => {
          setStatus(next);
          setPage(FIRST_PAGE);
        }}
        gutter={0}
      />
    </YStack>
  );

  const filterSheet = (
    <BottomSheet
      open={filterOpen}
      onClose={() => setFilterOpen(false)}
      title={tFilters('title')}
      footer={<Button label={tActions('apply')} variant="gradient" onPress={() => setFilterOpen(false)} />}
    >
      <DateRangeField
        value={range}
        onChange={(next) => {
          setRange(next);
          setPage(FIRST_PAGE);
        }}
        labels={{ field: tFilter('time'), from: tRange('fromDate'), to: tRange('toDate'), clear: tActions('clear') }}
      />
    </BottomSheet>
  );

  let content;
  if (isLoading && items.length === 0) {
    content = Array.from({ length: SKELETON_ROWS }, (_, i) => <RecordCardSkeleton key={i} />);
  } else if (isError && !data) {
    content = <ScreenError error={error} title={t('errorTitle')} onRetry={() => void refetch()} />;
  } else if (items.length === 0) {
    content = filtered ? (
      <ScreenMessage icon="search-outline" title={tFilter('emptyTitle')} description={tFilter('emptyBody')} />
    ) : (
      <ScreenMessage icon="document-text-outline" title={t('emptyTitle')} description={t('emptyBody')} />
    );
  } else {
    content = (
      <>
        {items.map((booking) => (
          <HistoryCard
            key={booking.id}
            booking={booking}
            canViewFinance={canViewFinance}
            onPress={() => navigateOnce(ROUTES.manage.bookingDetail(booking.id))}
          />
        ))}
        {hasMore ? (
          <Button
            label={tActions('viewMore')}
            variant="outline"
            size="compact"
            loading={isFetching}
            onPress={() => setPage((p) => p + 1)}
          />
        ) : null}
      </>
    );
  }

  return (
    <YStack gap={space.md}>
      {header}
      {content}
      {filterSheet}
    </YStack>
  );
}

const HistoryCard = memo(function HistoryCard({
  booking,
  canViewFinance,
  onPress,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers.history');
  const tFilter = useTranslations('Customers.profile.history');
  const tActions = useTranslations('Common.actions');
  const tDriverTitle = useTranslations('Bookings.driver');
  const tDriver = useTranslations('Drivers.booking');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pickup = toAppTz(booking.pickupAt);
  const dropoff = toAppTz(booking.returnAt);
  const showDriver = Boolean(booking.driver) || booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const owing = booking.debtAmount != null && !isZeroMoney(booking.debtAmount);

  return (
    <Card onPress={onPress} accessibilityLabel={booking.code}>
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} {...body} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
            {`#${booking.code}`}
          </Text>
          <Pill
            label={domainLabel('bookingStatus', booking.status)}
            tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, booking.status))}
          />
        </XStack>
        <XStack gap={12} ai="center">
          <YStack w={THUMB_W} h={THUMB_H} br={radius.sm} ov="hidden" bg={colors.surfaceMuted} flexShrink={0}>
            <RemoteImage
              uri={booking.vehicleImageUrl}
              recyclingKey={booking.id}
              radius={radius.sm}
              fallback={<Ionicons name="car-outline" size={iconSize.md} color={colors.placeholder} />}
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
              {booking.vehicleName}
            </Text>
            {booking.vehiclePlate ? (
              <Text col={colors.textMuted} {...body} numberOfLines={1}>
                {booking.vehiclePlate}
              </Text>
            ) : null}
          </YStack>
        </XStack>
        <FactRow label={tFilter('colService')}>{domainLabel('serviceType', booking.serviceType)}</FactRow>
        {showDriver ? (
          <FactRow label={tDriverTitle('title')}>{booking.driver?.name ?? tDriver('unassigned')}</FactRow>
        ) : null}
        <FactRow label={tFilter('colTime')} sub={fmt.rentalDuration(pickup, dropoff)}>
          {`${fmt.rentalPoint(pickup)} → ${fmt.rentalPoint(dropoff)}`}
        </FactRow>
        {canViewFinance ? (
          <>
            <FactRow label={t('total')}>{fmt.money(booking.totalAmount)}</FactRow>
            <FactRow label={tFilter('paid')}>{fmt.money(booking.paidAmount)}</FactRow>
            {owing ? (
              <FactRow label={t('debt')} tone={colors.danger}>
                {fmt.money(booking.debtAmount)}
              </FactRow>
            ) : null}
          </>
        ) : null}
        <YStack pt={space.xs}>
          <Button label={tActions('viewDetail')} variant="gradient" size="compact" onPress={onPress} />
        </YStack>
      </YStack>
    </Card>
  );
});
