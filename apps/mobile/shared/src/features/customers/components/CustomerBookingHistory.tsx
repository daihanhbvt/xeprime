import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { Pagination } from '@/components/ui/Pagination';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useCustomerBookings } from '../hooks/use-customers';

const SKELETON_ROWS = 3;

/**
 * Lịch sử thuê của một khách — phân trang SERVER (`limit` 10, đúng con số web dùng), không tải
 * hết rồi cắt ở client: một khách quen của shop lớn có hàng trăm chuyến.
 *
 * Khối này chỉ được render khi người dùng có `bookings.view`; endpoint đòi CẢ HAI quyền và trả
 * 403 khi thiếu, nên nơi gọi phải gác trước — xem `CustomerDetailScreen`.
 */
export function CustomerBookingHistory({
  customerId,
  canViewFinance,
}: {
  customerId: string;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.history');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [page, setPage] = useState(FIRST_PAGE);
  const { data, isLoading, isError, error, refetch } = useCustomerBookings(customerId, page);

  const items = data?.items ?? [];
  const meta = data?.meta;

  if (isLoading && !data) {
    return (
      <YStack gap={space.md}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <RecordCardSkeleton key={i} />
        ))}
      </YStack>
    );
  }

  if (isError && !data) {
    return <ScreenError error={error} title={t('errorTitle')} onRetry={() => void refetch()} />;
  }

  if (items.length === 0) {
    return (
      <ScreenMessage
        icon="document-text-outline"
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
    <YStack gap={space.md}>
      {items.map((booking) => (
        <Card
          key={booking.id}
          onPress={() => navigateOnce(ROUTES.manage.bookingDetail(booking.id))}
          accessibilityLabel={booking.code}
        >
          <YStack gap={space.xs}>
            {/*
              Mã đơn ↔ nhãn trạng thái nằm ở HAI MÉP, không có gì chen giữa — đúng `.cardHead`
              (`justify-content: space-between`) của thẻ mobile bên web.

              Mũi tên "mở được" từng đứng ở đây, sau nhãn trạng thái, và đẩy nhãn thụt vào ~20dp
              nên hàng đọc ra thành ba cụm chứ không thành hai mép. Nó xuống hàng cuối — đúng chỗ
              `DetailArrow` tự ghi là nó phải ở: "góc trên là chỗ của nhãn trạng thái".
            */}
            <XStack ai="center" gap={space.sm}>
              <Text
                f={1}
                minWidth={0}
                col={colors.primaryActive}
                fos={fontSize.bodySm}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {booking.code}
              </Text>
              <StatusBadge
                label={domainLabel('bookingStatus', booking.status)}
                color={BOOKING_STATUS_META[booking.status as BookingStatus].color}
                size="sm"
              />
            </XStack>

            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={2}>
              {booking.vehicleName}
              {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
            </Text>

            {/*
              Hàng CUỐI mang mũi tên, mà hàng nào là "cuối" thì tuỳ quyền: có `finance.view` thì
              là hàng tiền, không có thì là hàng thời gian. Neo mũi tên cứng vào hàng tiền sẽ làm
              nó biến mất với người không được xem tiền — và thẻ mất luôn dấu hiệu mở được.
            */}
            {canViewFinance ? (
              <>
                <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
                  {fmt.dateTimeRange(booking.pickupAt, booking.returnAt)}
                </Text>

                {/*
                  Tiền: MỖI khoản một hàng, nhãn trái — số căn phải.

                  Xếp cả hai vào một hàng hai mép (đúng `.cardMoney` của web) thì ở màn hẹp gặp
                  hai số bảy chữ số là hàng gãy làm đôi, và lúc đó "Còn nợ" rơi xuống nằm ngay
                  dưới "Tổng tiền" — thành hai hàng nhưng lệch mép, xấu hơn hẳn hai hàng thẳng
                  thớm. Hai hàng cố định thì cột số luôn thẳng, kể cả giữa các thẻ khác nhau.

                  Hai con số CHỈ tồn tại khi có `finance.view` — server trả `null` khi thiếu,
                  không trả 0 giả.
                */}
                <XStack ai="center" gap={space.sm}>
                  <YStack f={1} minWidth={0} gap={space.xs}>
                    <DataRow label={t('total')} value={fmt.money(booking.totalAmount)} />
                    {/*
                      "Còn nợ" chỉ hiện khi THẬT SỰ còn nợ — đúng luật thẻ mobile của web. Một
                      dòng "Còn nợ 0 ₫" trên mọi đơn đã tất toán là nhiễu, và làm khoản nợ thật
                      chìm đi giữa những số 0.
                    */}
                    {booking.debtAmount != null && !isZeroMoney(booking.debtAmount) ? (
                      <DataRow
                        label={t('debt')}
                        value={fmt.money(booking.debtAmount)}
                        tone="danger"
                      />
                    ) : null}
                  </YStack>
                  <DetailChevron />
                </XStack>
              </>
            ) : (
              <XStack ai="center" gap={space.sm}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.textMuted}
                  fos={fontSize.label}
                  numberOfLines={2}
                >
                  {fmt.dateTimeRange(booking.pickupAt, booking.returnAt)}
                </Text>
                <DetailChevron />
              </XStack>
            )}
          </YStack>
        </Card>
      ))}

      {meta && meta.total > meta.limit ? (
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onChange={setPage} />
      ) : null}
    </YStack>
  );
}
