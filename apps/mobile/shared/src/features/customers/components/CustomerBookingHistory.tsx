import { memo, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS, BOOKING_STATUS_META, BOOKING_STATUS_SELECTABLE_VALUES } from '@xeprime/types';
import { isZeroMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { DateRangeValue } from '@/components/ui/DateRangeField';
import { activeFilterCount, ManageFilterSheet, type FilterGroup } from '@/features/shell/ManageFilterSheet';
import { ListSearchBar } from '@/features/shell/ListSearchBar';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { useCustomerBookingHistory } from '../hooks/use-customers';
import { formatDayTime } from '../day-time';
import type { CustomerBooking } from '../api';

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 3;
/** Figma: đệm/khe 12 (thang `space` không có 12), ô khối xám bo 10. */
const GAP = 12;
const BLOCK_RADIUS = 10;

/** Giá trị nội bộ của mục "Tất cả" trong ô trạng thái (không bao giờ gửi lên server). */
const STATUS_ALL = '__all';

/**
 * Lịch sử thuê của một khách - Figma Partner-XePrime "Users / Details - Lịch sử" `24494:25402`:
 * MỘT thẻ bộ lọc (ô tìm · ô chọn "Trạng thái" · ô chọn "Thời gian" mở tấm lịch khoảng ngày), rồi các
 * thẻ đơn (mã · nhãn chặng, xe, nhận → trả · tổng tiền, tình trạng thu tiền · "Chi tiết →"). Tải thêm
 * dồn trang (server vẫn phân trang `limit` 10 như web).
 *
 * Dòng tài xế, "Đã thu" và "Còn nợ" bằng số trên thẻ Figma không vẽ nên đã bỏ (người dùng chốt
 * 25/11/2026); tình trạng thu tiền thành MỘT câu ở chân thẻ, số tiền đầy đủ nằm ở chi tiết đơn.
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
  const tApp = useTranslations('Customers.app.detail.history');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [page, setPage] = useState(FIRST_PAGE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<DateRangeValue>({});
  const [filtering, setFiltering] = useState(false);
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const { data, isLoading, isFetching, isError, error, refetch } = useCustomerBookingHistory(customerId, {
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    page,
  });
  const items = useAccumulatedPages(data?.items, data?.meta?.page);
  const meta = data?.meta;
  const hasMore = meta ? meta.page * meta.limit < meta.total : false;
  const rangeActive = Boolean(range.from || range.to);
  const filtered = q.length > 0 || status !== '' || rangeActive;

  /*
   * Bộ lọc kiểu MỌI danh sách của app (người dùng 25/11/2026): ô tìm + nút "Lọc" (huy hiệu số bộ lọc
   * đang bật) mở tấm lọc chung - chọn ở bản nháp, "Áp dụng" mới lọc. Hai chiều: Trạng thái và
   * Thời gian (khoảng ngày NHẬN XE).
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'status',
        label: tApp('status'),
        value: status || STATUS_ALL,
        resetValue: STATUS_ALL,
        display: 'option' as const,
        labelAbove: true,
        options: [
          { value: STATUS_ALL, label: tLabels('all') },
          ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
            value: value as string,
            label: domainLabel('bookingStatus', value),
          })),
        ],
      },
      {
        kind: 'dateRange' as const,
        label: tApp('time'),
        fromKey: 'from',
        toKey: 'to',
        from: range.from ?? '',
        to: range.to ?? '',
        labelAbove: true,
        autoAdvance: true,
      },
    ],
    [tApp, tLabels, domainLabel, status, range.from, range.to],
  );

  const changeFilter = (key: string, value: string) => {
    if (key === 'status') setStatus(value === STATUS_ALL ? '' : value);
    else if (key === 'from') setRange((prev) => ({ ...prev, from: value || undefined }));
    else if (key === 'to') setRange((prev) => ({ ...prev, to: value || undefined }));
    setPage(FIRST_PAGE);
  };

  // Cùng `ListSearchBar` với màn danh sách (Figma "Tab List" 24175:57178): ô tìm · nút "Lọc".
  const filters = (
    <ListSearchBar
      value={search}
      onChange={(next) => {
        setSearch(next);
        setPage(FIRST_PAGE);
      }}
      label={tApp('searchPlaceholder')}
      placeholder={tApp('searchPlaceholder')}
      filterCount={activeFilterCount(groups)}
      onFilterPress={() => setFiltering(true)}
    />
  );

  const filterSheet = (
    <ManageFilterSheet
      open={filtering}
      groups={groups}
      onChange={changeFilter}
      onClose={() => setFiltering(false)}
    />
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
            onPress={() =>
              navigateOnce(
                ROUTES.manage.bookingDetail(booking.id, {
                  preview: { code: booking.code, status: booking.status },
                }),
              )
            }
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
    <YStack gap={space.lg}>
      {filters}
      {content}
      {filterSheet}
    </YStack>
  );
}

/** Thẻ đơn - Figma "Current Order Card" `24486:80904` (đơn đã xong: mã làm tiêu đề, chân thẻ là tình trạng thu tiền). */
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
  const tApp = useTranslations('Customers.app.detail');
  const tProfile = useTranslations('Customers.profile');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const label = {
    col: colors.placeholder,
    fos: typeScale.label.fontSize,
    lh: typeScale.label.lineHeight,
  } as const;
  const value = {
    col: colors.text,
    fos: typeScale.label.fontSize,
    lh: typeScale.label.lineHeight,
    fow: fontWeight.semibold,
  } as const;

  /*
   * Câu tình trạng thu tiền ở chân thẻ (chỉ khi được xem tiền, và không phải đơn đã huỷ - đơn huỷ
   * còn khoản chưa thu nhưng không còn là việc cần thu): chưa thu đồng nào · thu chưa đủ · đủ.
   */
  const debt = booking.debtAmount;
  const cancelled = booking.status === BOOKING_STATUS.CANCELLED;
  const owing = debt != null && !isZeroMoney(debt);
  const nothingPaid = booking.paidAmount == null || isZeroMoney(booking.paidAmount);
  const footer =
    canViewFinance && debt != null && !cancelled
      ? owing
        ? { text: nothingPaid ? tApp('history.unpaid') : tApp('history.partial'), color: colors.danger }
        : { text: tApp('history.paid'), color: colors.success }
      : null;

  return (
    <Card onPress={onPress} accessibilityLabel={booking.code}>
      <YStack gap={GAP}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text
            f={1}
            minWidth={0}
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {`#${booking.code}`}
          </Text>
          <Pill
            label={domainLabel('bookingStatus', booking.status)}
            tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, booking.status))}
            size="lg"
          />
        </XStack>

        <XStack ai="center" gap={GAP}>
          <VehicleThumb
            size="card"
            uri={booking.vehicleImageUrl ?? null}
            recyclingKey={booking.id}
            accessibilityLabel={booking.vehicleName}
          />
          <YStack f={1} minWidth={0} gap={3}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {booking.vehicleName}
            </Text>
            <Text {...label} numberOfLines={1}>
              {[booking.vehiclePlate, domainLabel('serviceType', booking.serviceType)]
                .filter(Boolean)
                .join(LIST_SEPARATOR)}
            </Text>
          </YStack>
        </XStack>

        <XStack
          ai="center"
          jc="space-between"
          gap={space.sm}
          px={GAP}
          py={BLOCK_RADIUS}
          br={BLOCK_RADIUS}
          bg={colors.background}
        >
          <YStack gap={2}>
            <Text {...label}>{tProfile('current.pickup')}</Text>
            <Text {...value}>{formatDayTime(booking.pickupAt)}</Text>
          </YStack>
          <Text
            col={colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            →
          </Text>
          <YStack gap={2}>
            <Text {...label}>{tProfile('current.return')}</Text>
            <Text {...value}>{formatDayTime(booking.returnAt)}</Text>
          </YStack>
          {canViewFinance ? (
            <YStack gap={2} ai="flex-end">
              <Text {...label}>{tApp('overview.total')}</Text>
              <Text {...value}>{fmt.money(booking.totalAmount)}</Text>
            </YStack>
          ) : null}
        </XStack>

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text
            f={1}
            minWidth={0}
            col={footer?.color ?? colors.placeholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            numberOfLines={1}
          >
            {footer?.text ?? ''}
          </Text>
          <XStack ai="center" gap={6}>
            <Text
              col={colors.brandLink}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
            >
              {tApp('overview.detail')}
            </Text>
            <LineIcon name="arrow-right" size={20} color={colors.brandShape} />
          </XStack>
        </XStack>
      </YStack>
    </Card>
  );
});
