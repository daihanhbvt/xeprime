import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CUSTOMER_TRIP_STAGE, type CustomerTripStage } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';

/**
 * Xác nhận huỷ chuyến.
 *
 * Hai câu dẫn khác nhau vì HỆ QUẢ khác nhau: chuyến chờ duyệt chỉ là rút lại một yêu cầu (nó
 * vốn chưa chiếm lịch), còn chuyến đã duyệt là huỷ một đơn thật và nhả lịch xe ra cho khách
 * khác; chuyến đã được nhận, chờ giữ chỗ thì chưa có đơn nhưng xe đang được giữ. Nói chung một câu là để khách bấm mà không biết mình đang mất gì.
 *
 * Khối tiền đã trả KHÔNG có nút hoàn: XePrime chỉ ghi nhận trạng thái, không chuyển tiền
 * (ADR 0013) — nói thẳng ra còn hơn để khách chờ một khoản tự về.
 */
export function CancelTripSheet({
  open,
  onClose,
  trip,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  trip: CustomerTripDetail;
  onConfirm: () => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.cancel');
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const awaitingHold = stage === CUSTOMER_TRIP_STAGE.AWAITING_HOLD;
  /*
   * Đã chuyển MỘT PHẦN tiền giữ chỗ rồi huỷ ⇒ server hoàn ĐỦ phần đã chuyển trong cùng transaction
   * huỷ. Khác tiền đưa thẳng cho chủ xe ở dưới: khoản này nằm ở XePrime, nên XePrime trả lại.
   */
  const holdPaid =
    awaitingHold && trip.hold && !isZeroMoney(trip.hold.paidAmount) ? trip.hold.paidAmount : null;
  const finance = trip.finance;
  const rentalPaid = finance && !isZeroMoney(finance.rentalPaid);
  const depositPaid = finance && !isZeroMoney(finance.depositReceived);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      footer={
        <XStack gap={space.sm}>
          {/*
            Hai hành động NGẮN nằm một hàng: lối thoát bên trái, hành động chính bên phải. Ở đây
            "Không huỷ" co vừa chữ, "Huỷ chuyến" lấy phần còn lại.
          */}
          <YStack flexShrink={0}>
            <Button label={t('keep')} variant="ghost" onPress={onClose} />
          </YStack>
          <YStack f={1}>
            <Button
              label={t('confirm')}
              icon="close-circle-outline"
              variant="danger"
              loading={loading}
              onPress={onConfirm}
            />
          </YStack>
        </XStack>
      }
    >
      <Text col={colors.text} fos={fontSize.body}>
        {stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL
          ? t('leadPending')
          : awaitingHold
            ? t('leadAwaitingHold')
            : t('leadReady')}
      </Text>

      {holdPaid ? (
        <YStack gap={space.xs} bg={colors.infoSurface} p={space.md} br={radius.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('holdPaidTitle', { amount: fmt.money(holdPaid) })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('holdPaidBody')}
          </Text>
        </YStack>
      ) : null}

      {rentalPaid || depositPaid ? (
        <YStack gap={space.xs} bg={colors.warningSurface} p={space.md} br={radius.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('paidTitle')}
          </Text>
          {rentalPaid ? (
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('rentalPaid', { amount: fmt.money(finance.rentalPaid) })}
            </Text>
          ) : null}
          {depositPaid ? (
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('depositPaid', { amount: fmt.money(finance.depositReceived) })}
            </Text>
          ) : null}
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('refundNote')}
          </Text>
        </YStack>
      ) : null}
    </BottomSheet>
  );
}
