import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataRow } from '@/components/ui/DataRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors, fontSize, iconSize, radius, space } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';

/**
 * Kết quả sau khi DUYỆT — bản native của `ApproveSuccessDialog`.
 *
 * Là bàn giao việc, không phải lời chúc mừng. Nhưng "việc tiếp theo" KHÔNG giống nhau ở hai kết
 * cục, và đó là toàn bộ lý do tấm này tồn tại thay vì một dòng toast (ADR 0044 điều 2):
 *
 *  - **Có thu tiền giữ chỗ** (`bookingId` rỗng) — lịch đã giữ, mã thanh toán đã gửi cho khách,
 *    và đơn thuê mở TỰ ĐỘNG khi tiền về. Chưa có đơn nào để mở, nên cũng không có nút dẫn tới
 *    đơn; tấm nói thẳng điều đó thay vì để một nút biến mất không lời giải thích.
 *  - **Không thu** (chính sách tắt, hoặc báo giá còn tạm tính) — đơn thuê đã có ngay, và việc
 *    tiếp theo nằm trên chính nó.
 *
 * ⚠️ Nhánh thứ nhất là nhánh MẶC ĐỊNH của luồng hiện hành. Dùng chung một câu "đã tạo đơn thuê"
 * cho cả hai là nói với gian hàng rằng chuyến đã chắc chắn, trong khi khách còn chưa chuyển đồng
 * nào — đúng điều ADR 0044 sinh ra để chấm dứt.
 */
export function ApproveSuccessSheet({
  request,
  onClose,
}: {
  request: BookingRequestDecisionTarget;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const longTerm = Boolean(request.longTermPackageMonths);
  const bookingId = request.bookingId;
  /*
   * Chưa có đơn ⇒ chuyến này thu tiền giữ chỗ và đang chờ khách chuyển khoản. Hỏi `bookingId`
   * chứ không hỏi trạng thái: nó là thứ quyết định có nút "Xem chi tiết đơn" hay không, nên hai
   * câu hỏi đó phải có cùng một câu trả lời.
   */
  const awaitingPayment = !bookingId;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={awaitingPayment ? t('approved.holdTitle') : t('approved.title')}
      footer={
        awaitingPayment ? (
          /*
            Không có đơn để mở, nên việc duy nhất còn lại là quay về hộp thư và ĐỢI. Nút đó vì thế
            là hành động CHÍNH, full-width — không phải một lối thoát nép bên trái.
          */
          <Button label={t('approved.holdClose')} size="lg" onPress={onClose} />
        ) : (
          <XStack gap={space.sm}>
            {/*
              "Đóng" co vừa chữ, "Xem chi tiết đơn" lấy phần còn lại — nhãn sau dài gấp bốn nhãn
              trước, chia đôi là bỏ trống nửa trái và cắt đuôi nửa phải.
            */}
            <YStack flexShrink={0}>
              <Button label={t('approved.close')} variant="ghost" onPress={onClose} />
            </YStack>
            <YStack f={1}>
              <Button
                label={t('approved.viewBooking')}
                size="lg"
                onPress={() => {
                  onClose();
                  navigateOnce(ROUTES.manage.bookingDetail(bookingId));
                }}
              />
            </YStack>
          </XStack>
        )
      }
    >
      <XStack ai="center" gap={space.sm} p={space.md} br={radius.md} bg={colors.successSurface}>
        <YStack
          w={iconSize.lg + space.sm}
          h={iconSize.lg + space.sm}
          br={radius.pill}
          bg={colors.successSurface}
          ai="center"
          jc="center"
        >
          <Ionicons name="checkmark" size={iconSize.md} color={colors.success} />
        </YStack>
        <Text f={1} col={colors.text} fos={fontSize.bodySm}>
          {awaitingPayment
            ? t('approved.holdLead')
            : longTerm
              ? t('approved.leadLongTerm')
              : t('approved.lead')}
        </Text>
      </XStack>

      <YStack gap={space.xs} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
        <DataRow
          label={t('approve.vehicle')}
          value={request.vehicleName}
          {...(request.vehiclePlate ? { valueHint: request.vehiclePlate } : {})}
        />
        {/*
          SĐT chỉ hiện khi ĐƯỢC lộ: chuyến tuyến hoa hồng còn chờ duyệt không trả số (ADR 0028
          điều 9), và một dòng phụ trống đọc ra như dữ liệu bị mất.
        */}
        <DataRow
          label={t('approve.customer')}
          value={request.customerName}
          {...(request.customerPhone ? { valueHint: request.customerPhone } : {})}
        />
        {pickup && dropoff ? (
          <DataRow
            label={t('approve.schedule')}
            value={`${fmt.rentalPoint(pickup)} → ${fmt.rentalPoint(dropoff)}`}
            valueHint={fmt.rentalDuration(pickup, dropoff)}
          />
        ) : null}
      </YStack>

      <Text col={colors.textMuted} fos={fontSize.label}>
        {awaitingPayment ? t('approved.holdNext') : t('approved.next')}
      </Text>
    </BottomSheet>
  );
}
