import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CUSTOMER_TRIP_STAGE, type CustomerTripStage } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';

/**
 * Xác nhận huỷ chuyến.
 *
 * Hai câu dẫn khác nhau vì HỆ QUẢ khác nhau: chuyến chờ duyệt chỉ là rút lại một yêu cầu (nó
 * vốn chưa chiếm lịch), còn chuyến đã duyệt là huỷ một đơn thật và nhả lịch xe ra cho khách
 * khác. Nói chung một câu là để khách bấm mà không biết mình đang mất gì.
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
  const t = useTranslations('Trips.cancel');
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const finance = trip.finance;
  const rentalPaid = finance && !isZeroMoney(finance.rentalPaid);
  const depositPaid = finance && !isZeroMoney(finance.depositReceived);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      footer={
        <>
          <Button label={t('confirm')} variant="danger" loading={loading} onPress={onConfirm} />
          <Button label={t('keep')} variant="ghost" onPress={onClose} />
        </>
      }
    >
      <Text col={colors.text} fos={fontSize.body}>
        {stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL ? t('leadPending') : t('leadReady')}
      </Text>

      {rentalPaid || depositPaid ? (
        <YStack gap={space.xs} bg={colors.warningSurface} p={space.md} br={space.xs}>
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
