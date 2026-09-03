import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { colors, fontSize, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

const NOTE_MAX = 500;

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
  const t = useTranslations('Bookings.deliveryFee');

  const schema = useMemo(
    () =>
      yup.object({
        deliveryFee: yup
          .number()
          .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
          .typeError(t('label'))
          .integer(t('label'))
          .min(0, t('label'))
          .required(t('label')),
        note: yup.string().trim().max(NOTE_MAX).default(''),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<{ deliveryFee: number; note: string }>({
    resolver: yupResolver(schema),
    defaultValues: { deliveryFee: Number(booking.deliveryFee) || 0, note: '' },
  });

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
      <MoneyField control={control} name="deliveryFee" label={t('label')} required />
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
        multiline
        rows={3}
        maxLength={NOTE_MAX}
      />
    </BottomSheet>
  );
}
