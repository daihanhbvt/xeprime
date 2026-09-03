import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { BOOKING_STATUS } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/** Trần lý do — khớp DTO backend. */
const REASON_MAX = 500;

export type Decision = typeof BOOKING_STATUS.CANCELLED | typeof BOOKING_STATUS.NO_SHOW;

/**
 * Hai quyết định bấm tay DUY NHẤT của gian hàng trên một đơn: **huỷ đơn** và **ghi nhận khách
 * không đến**.
 *
 * `active` và `completed` KHÔNG bao giờ đặt được bằng một cú bấm — chúng là hệ quả của một lần
 * xác nhận bàn giao thật (có giờ giao/nhận + số KM). Và không có nút "Xác nhận đơn": sự xác
 * nhận của gian hàng đã xảy ra ở `Duyệt & giữ xe` trên yêu cầu thuê, đó là thứ sinh ra chính
 * đơn này.
 *
 * Lý do là BẮT BUỘC ở cả hai, và nó vào `audit_logs` — KHÔNG vào `note` của đơn. Khác với lý do
 * TỪ CHỐI yêu cầu (khách đọc được), lý do ở đây là ghi chép nội bộ để đối chiếu về sau.
 */
export function BookingStatusSheet({
  open,
  onClose,
  booking,
  decision,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  decision: Decision;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const t = useTranslations('Bookings.statusActions.dialog');
  const fmt = useAppFormat();

  const schema = useMemo(
    () =>
      yup.object({
        reason: yup
          .string()
          .trim()
          .required(t('reasonRequired'))
          .max(REASON_MAX, t('reasonTooLong')),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<{ reason: string }>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  const cancelling = decision === BOOKING_STATUS.CANCELLED;
  const submit = handleSubmit((values) => onConfirm(values.reason));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        cancelling
          ? t('cancelTitle', { code: booking.code })
          : t('noShowTitle', { code: booking.code })
      }
      footer={
        <>
          <Button
            label={cancelling ? t('cancelOk') : t('noShowOk')}
            variant="danger"
            loading={loading}
            onPress={() => void submit()}
          />
          <Button label={t('keep')} variant="ghost" onPress={onClose} />
        </>
      }
    >
      <Text col={colors.text} fos={fontSize.bodySm}>
        {cancelling ? t('cancelLead') : t('noShowLead')}
      </Text>

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <Line label={t('customer')} value={booking.customerName} />
          <Line label={t('vehicle')} value={booking.vehicleName} />
          <Line
            label={t('period')}
            value={fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
          />
        </YStack>
      </Card>

      {/*
        Đơn đã ghi nhận tiền thu: XePrime KHÔNG tự hoàn tiền và cũng không xoá khoản đã ghi.
        Nói thẳng ra trước khi bấm, vì sau khi đơn khép lại thì không sửa được nữa (ADR 0013).
      */}
      {isZeroMoney(booking.collectedAmount) ? null : (
        <YStack bg={colors.warningSurface} p={space.md} br={radius.md} gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('paidTitle', { amount: fmt.money(booking.collectedAmount) })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('paidDescription')}
          </Text>
        </YStack>
      )}

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHelp')}
        multiline
        rows={3}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm}>
        {value}
      </Text>
    </YStack>
  );
}
