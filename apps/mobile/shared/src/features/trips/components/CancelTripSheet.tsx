import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useState } from 'react';
import {
  CUSTOMER_CANCELLATION_REASON_VALUES,
  CUSTOMER_TRIP_STAGE,
  type CustomerCancellationReason,
  type CustomerTripStage,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
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
  onConfirm: (reasonCategory: CustomerCancellationReason) => void;
  loading: boolean;
}) {
  const t = useTranslations('Trips.cancel');
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const finance = trip.finance;
  const rentalPaid = finance && !isZeroMoney(finance.rentalPaid);
  const depositPaid = finance && !isZeroMoney(finance.depositReceived);
  /** Nhóm lý do bắt buộc (Figma 21621:31264) — chỉ mô tả VÌ SAO; ai chịu do server suy (ADR 0045). */
  const [reason, setReason] = useState<CustomerCancellationReason | null>(null);
  const [touched, setTouched] = useState(false);
  const close = () => {
    setReason(null);
    setTouched(false);
    onClose();
  };
  const confirm = () => {
    if (!reason) {
      setTouched(true);
      return;
    }
    onConfirm(reason);
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('title')}
      footer={
        <XStack gap={space.sm}>
          {/*
            Hai hành động NGẮN nằm một hàng: lối thoát bên trái, hành động chính bên phải. Ở đây
            "Không huỷ" co vừa chữ, "Huỷ chuyến" lấy phần còn lại.
          */}
          <YStack flexShrink={0}>
            <Button label={t('keep')} variant="ghost" onPress={close} />
          </YStack>
          <YStack f={1}>
            <Button
              label={t('confirm')}
              icon="close-circle-outline"
              variant="danger"
              loading={loading}
              onPress={confirm}
            />
          </YStack>
        </XStack>
      }
    >
      <Text col={colors.text} fos={fontSize.body}>
        {stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL ? t('leadPending') : t('leadReady')}
      </Text>

      <YStack gap={space.sm}>
        <FieldLabel label={t('reasonLabel')} required />
        <XStack gap={space.xs} flexWrap="wrap">
          {CUSTOMER_CANCELLATION_REASON_VALUES.map((value) => (
            <Chip
              key={value}
              label={t(`reasons.${value}`)}
              size="sm"
              selected={reason === value}
              onPress={() => setReason(value)}
            />
          ))}
        </XStack>
        {touched && !reason ? (
          <Text col={colors.danger} fos={fontSize.label}>
            {t('reasonRequired')}
          </Text>
        ) : null}
      </YStack>

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
