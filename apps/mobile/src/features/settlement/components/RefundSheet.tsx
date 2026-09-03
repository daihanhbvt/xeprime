import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { REFUND_METHOD_VALUES } from '@xeprime/types';
import { dayjs, type Dayjs } from '@xeprime/domain';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { SelectField } from '@/components/ui/SelectField';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useCorrectRefund, useRecordRefund } from '../hooks/use-settlement';
import type { BookingSettlement, RecordRefundInput } from '../api';

const NOTE_MAX = 500;

/** Suy từ CHÍNH schema — `yup.oneOf` thu hẹp kiểu, một interface viết tay sẽ lệch với resolver. */
type RefundFormValues = yup.InferType<ReturnType<typeof buildRefundSchema>>;

function buildRefundSchema(labels: { amount: string; method: string; reason: string }) {
  return yup.object({
    refundAmount: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(labels.amount)
      .integer(labels.amount)
      .min(0, labels.amount)
      .required(labels.amount),
    refundMethod: yup.string().oneOf(REFUND_METHOD_VALUES).required(labels.method),
    reference: yup.string().trim().max(NOTE_MAX).default(''),
    note: yup.string().trim().max(NOTE_MAX).default(''),
    /** Lý do CHỈ bắt buộc khi đang ĐIỀU CHỈNH — ghi mới không có gì để giải thích. */
    correctionReason: yup
      .string()
      .trim()
      .max(REASON_MAX)
      .default('')
      .when('$correcting', { is: true, then: (schema) => schema.required(labels.reason) }),
  });
}

/**
 * Ghi nhận (hoặc điều chỉnh) việc hoàn cọc.
 *
 * **XePrime không chuyển tiền** (ADR 0013). Đây là ghi SỔ những gì chủ xe đã làm bên ngoài —
 * bấm nút này không làm đồng nào chạy đi đâu cả, và tấm này nói thẳng điều đó.
 *
 * Điều chỉnh khác hẳn ghi mới: nó cần `payments.void`, một **lý do bắt buộc** vào audit, và
 * `expectedRowVersion` chống sửa đè. Sửa một con số tiền đã ghi sổ mà không ai biết vì sao là
 * thứ không được phép tồn tại.
 *
 * Số tiền mặc định là `proposedRefund` do SERVER tính — không phải một phép trừ ở client.
 */
export function RefundSheet({
  open,
  onClose,
  bookingId,
  settlement,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  settlement: BookingSettlement;
  onDone: () => void;
}) {
  const t = useTranslations('Bookings.settlement.refund');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const existing = settlement.refund;
  const correcting = existing != null;

  const record = useRecordRefund(bookingId);
  const correct = useCorrectRefund(bookingId);

  /*
   * Thời điểm hoàn — trường web CÓ mà app đang thiếu hẳn.
   *
   * Thiếu nó thì server đóng dấu "lúc bấm nút", nên một khoản hoàn hôm qua khai bù hôm nay bị
   * ghi sai ngày trong sổ. Mặc định là hiện tại, chỉnh được về quá khứ; tương lai bị chặn ở
   * chính bộ chọn (server cũng từ chối).
   */
  const [refundedAt, setRefundedAt] = useState<Dayjs>(() =>
    existing?.refundedAt ? dayjs(existing.refundedAt) : dayjs(),
  );
  const [pickingMoment, setPickingMoment] = useState(false);

  const schema = useMemo(
    () =>
      buildRefundSchema({
        amount: t('amountLabel'),
        method: t('methodLabel'),
        reason: t('correctionReasonHint'),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<RefundFormValues>({
    resolver: yupResolver(schema),
    context: { correcting },
    defaultValues: {
      refundAmount: Number(existing?.refundAmount ?? settlement.proposedRefund) || 0,
      refundMethod: (existing?.refundMethod ??
        REFUND_METHOD_VALUES[0]) as RefundFormValues['refundMethod'],
      reference: existing?.reference ?? '',
      note: existing?.note ?? '',
      correctionReason: '',
    },
  });

  const submit = handleSubmit((values) => {
    const base: RecordRefundInput = {
      refundAmount: String(values.refundAmount),
      refundMethod: values.refundMethod as RecordRefundInput['refundMethod'],
      ...(values.reference ? { reference: values.reference } : {}),
      ...(values.note ? { note: values.note } : {}),
      refundedAt: refundedAt.toISOString(),
    };

    const done = {
      onSuccess: () => {
        toast.showSuccess(correcting ? t('correctSuccess') : t('recordSuccess'));
        onDone();
      },
      onError: (error: unknown) => toast.showError(errorMessage(error)),
    };

    if (correcting && existing) {
      correct.mutate(
        {
          ...base,
          correctionReason: values.correctionReason,
          expectedRowVersion: existing.rowVersion,
        },
        done,
      );
      return;
    }
    record.mutate(base, done);
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={correcting ? t('correct') : t('record')}
      footer={
        <Button
          label={correcting ? t('correct') : t('record')}
          loading={record.isPending || correct.isPending}
          onPress={() => void submit()}
        />
      }
    >
      {/* Hai con số dẫn dắt, đúng như web: hoàn bao nhiêu là suy từ chúng. */}
      <YStack gap={space.xs}>
        <DataRow label={t('depositReceived')} value={fmt.money(settlement.depositReceived)} />
        {Number(settlement.surchargeTotal) > 0 ? (
          <DataRow
            label={t('minusSurcharge')}
            value={`−${fmt.money(settlement.surchargeTotal)}`}
            tone="discount"
          />
        ) : null}
      </YStack>

      <MoneyField
        control={control}
        name="refundAmount"
        label={t('amountLabel')}
        hint={t('amountHint', { amount: fmt.money(settlement.proposedRefund) })}
        required
      />

      <SelectField
        control={control}
        name="refundMethod"
        label={t('methodLabel')}
        options={REFUND_METHOD_VALUES.map((method) => ({
          value: method,
          label: domainLabel('refundMethod', method),
        }))}
        required
      />

      <YStack gap={space.xs}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('refundedAtLabel')}
        </Text>
        <Card tone="muted" lift="flat" onPress={() => setPickingMoment(true)}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
            {fmt.rentalPoint(refundedAt)}
          </Text>
        </Card>
      </YStack>

      <TextField
        control={control}
        name="reference"
        label={t('referenceLabel')}
        placeholder={t('referencePlaceholder')}
      />

      <TextField
        control={control}
        name="note"
        label={t('noteLabel')}
        multiline
        rows={2}
        maxLength={NOTE_MAX}
      />

      {correcting ? (
        <TextField
          control={control}
          name="correctionReason"
          label={t('correctionReasonLabel')}
          placeholder={t('correctionReasonPlaceholder')}
          hint={t('correctionReasonHint')}
          multiline
          rows={2}
          maxLength={REASON_MAX}
          required
        />
      ) : null}

      <YStack bg={colors.infoSurface} p={space.md} br={space.xs}>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {t('disclaimer')}
        </Text>
      </YStack>

      {pickingMoment ? (
        <MomentPickerSheet
          open
          onClose={() => setPickingMoment(false)}
          value={refundedAt}
          onChange={setRefundedAt}
          notAfter={dayjs()}
          title={t('refundedAtLabel')}
        />
      ) : null}
    </BottomSheet>
  );
}
