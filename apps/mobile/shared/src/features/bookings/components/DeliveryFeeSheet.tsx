import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useAppFormat } from '@/i18n/use-app-format';
import type { BookingDetail } from '../api';

const NOTE_MAX = 500;
/** Web `max(999_999_999_999)`. */
const MAX_FEE = 999_999_999_999;

/**
 * Chốt phí giao nhận (BKG-13).
 *
 * Số bản đồ chỉ là **ước lượng** — chủ xe mới là người chốt phí sau khi thoả thuận với khách
 * (ADR 0014 · ADR 0018). Vì thế tấm này không hiện một con số gợi ý nào: gợi ý một mức giá mà
 * hai bên chưa nói tới là để nó thành mặc định.
 *
 * `note` là ghi chú NỘI BỘ — chỉ vào audit, khách không nhìn thấy. Server tính lại tổng tiền và
 * ghi ai đổi, từ bao nhiêu sang bao nhiêu; khách KHÔNG phải xác nhận lại.
 *
 * Nhập số nguyên VND, gửi lên dạng CHUỖI (ADR 0007) — tiền không bao giờ là `number` trên dây.
 */
export function DeliveryFeeSheet({
  open,
  onClose,
  booking,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  onConfirm: (input: { deliveryFee: string; note?: string }) => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.deliveryFee');
  const tModal = useTranslations('Bookings.deliveryFeeModal');
  const fmt = useAppFormat();

  const schema = useMemo(
    () =>
      yup.object({
        deliveryFee: yup
          .number()
          .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
          // Web `UpdateDeliveryFeeModal`: mỗi lỗi một câu riêng.
          .typeError(tModal('invalid'))
          .integer(tModal('invalid'))
          .min(0, tModal('negative'))
          .max(MAX_FEE, tModal('tooLarge'))
          .required(tModal('required')),
        note: yup.string().trim().max(NOTE_MAX, tModal('noteMax')).default(''),
      }),
    [tModal],
  );

  const { control, handleSubmit } = useForm<{ deliveryFee: number; note: string }>({
    resolver: yupResolver(schema),
    defaultValues: { deliveryFee: Number(booking.deliveryFee) || 0, note: '' },
  });

  const nextFee = useWatch({ control, name: 'deliveryFee' });
  const currentFee = Number(booking.deliveryFee) || 0;
  const feeText = (value: number) => (value > 0 ? fmt.money(String(value)) : tModal('free'));

  const submit = handleSubmit((values) =>
    onConfirm({
      deliveryFee: String(values.deliveryFee),
      ...(values.note ? { note: values.note } : {}),
    }),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('edit')}
      footer={<Button label={t('edit')} loading={loading} onPress={() => void submit()} />}
    >
      {/* Web: dòng "Phí đang áp dụng" (0 = Miễn phí) trên ô nhập. */}
      <XStack jc="space-between" gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {tModal('current')}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
          {feeText(currentFee)}
        </Text>
      </XStack>
      <MoneyField
        control={control}
        name="deliveryFee"
        label={t('label')}
        required
        hint={tModal('zeroHint')}
      />
      <YStack p={space.sm} br={radius.md} bg={colors.infoSurface}>
        <Text col={colors.text} fos={fontSize.label}>
          {t('hint')}
        </Text>
      </YStack>

      <TextField
        control={control}
        name="note"
        label={t('noteLabel')}
        placeholder={t('notePlaceholder')}
        hint={t('noteHint')}
        multiline scrollable
        rows={3}
        maxLength={NOTE_MAX}
      />
      <YStack p={space.sm} br={radius.md} bg={colors.infoSurface}>
        <Text col={colors.text} fos={fontSize.label}>
          {tModal('info')}
        </Text>
      </YStack>
      {/* Web: xem trước "cũ → mới" khi số đã đổi. */}
      {typeof nextFee === 'number' && !Number.isNaN(nextFee) && nextFee !== currentFee ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {`${feeText(currentFee)} → `}
          <Text col={colors.text} fow={fontWeight.bold}>
            {feeText(nextFee)}
          </Text>
        </Text>
      ) : null}
    </BottomSheet>
  );
}
