import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { SURCHARGE_CATEGORY, SURCHARGE_CATEGORY_VALUES } from '@xeprime/types';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { OvertimeSuggestion, SaveSurchargeInput } from '../api';

/**
 * Hình dạng form suy từ CHÍNH schema, không viết tay.
 *
 * `yup.oneOf([...])` thu hẹp `string` thành union, nên một interface viết tay với
 * `category: string` lệch ngay với resolver — và lệch theo kiểu chỉ hiện ra ở `Control<>`,
 * tức là ở mọi `<TextField control={...}>` chứ không phải ở chỗ khai báo.
 */
type SurchargeFormValues = yup.InferType<ReturnType<typeof buildSurchargeSchema>>;

function buildSurchargeSchema(labels: { category: string; amount: string; reason: string }) {
  return yup.object({
    category: yup.string().oneOf(SURCHARGE_CATEGORY_VALUES).required(labels.category),
    amount: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(labels.amount)
      .integer(labels.amount)
      .min(0, labels.amount)
      .required(labels.amount),
    reason: yup.string().trim().required(labels.reason).max(REASON_MAX, labels.reason),
  });
}

/**
 * Thêm / sửa một khoản phụ phí.
 *
 * `reason` là BẮT BUỘC vì đây là khoản TRỪ VÀO TIỀN CỦA KHÁCH, và khách đọc được nó ở màn chuyến
 * của mình. Một khoản trừ không lý do là thứ không được phép tồn tại.
 *
 * `SURCHARGE_CATEGORY` cố ý **không có** danh mục nhiên liệu: hao xăng đã có kênh riêng ở biên
 * bản bàn giao (mức xăng lúc giao và lúc nhận), và ghi nó thành một khoản tiền tự do ở đây là
 * mở đường cho hai con số nói khác nhau về cùng một chuyện.
 *
 * Tiền nhập là số nguyên VND, gửi lên dạng CHUỖI (ADR 0007).
 */
export function SurchargeSheet({
  open,
  onClose,
  overtime,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  /** Có = sửa khoản đang có; không = thêm mới. */
  overtime: OvertimeSuggestion;
  onConfirm: (body: SaveSurchargeInput) => void;
  loading: boolean;
}) {
  const t = useTranslations('Bookings.settlement.surcharges');
  const tOvertime = useTranslations('Bookings.settlement.overtime');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const schema = useMemo(
    () =>
      buildSurchargeSchema({
        category: t('categoryLabel'),
        amount: t('amountLabel'),
        reason: t('reasonHint'),
      }),
    [t],
  );

  const { control, handleSubmit, setValue } = useForm<SurchargeFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      category: SURCHARGE_CATEGORY_VALUES[0] as SurchargeFormValues['category'],
      amount: 0,
      reason: '',
    },
  });

  const submit = handleSubmit((values) =>
    onConfirm({
      category: values.category as SaveSurchargeInput['category'],
      amount: String(values.amount),
      reason: values.reason,
    }),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('add')}
      footer={<Button label={t('add')} loading={loading} onPress={() => void submit()} />}
    >
      <SelectField
        control={control}
        name="category"
        label={t('categoryLabel')}
        options={SURCHARGE_CATEGORY_VALUES.map((category) => ({
          value: category,
          label: domainLabel('surchargeCategory', category),
        }))}
        required
      />

      {/*
        Gợi ý phí quá giờ — hiện CẢ công thức để người dùng thấy vì sao ra con số đó.
        `available: false` thì KHÔNG bịa số: thiếu chính sách hoặc thiếu giờ trả thực tế nghĩa là
        không có cơ sở nào để đề xuất.
      */}
      {overtime.available && overtime.amount ? (
        <YStack bg={colors.infoSurface} p={space.md} br={space.xs} gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {tOvertime('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {overtime.formula ??
              tOvertime('charged', {
                hours: overtime.chargedHours,
                fee: fmt.money(overtime.feePerHour),
              })}
          </Text>
          <Button
            label={`${tOvertime('apply')} · ${fmt.money(overtime.amount)}`}
            variant="secondary"
            onPress={() => {
              setValue('amount', Number(overtime.amount), { shouldValidate: true });
              setValue('category', SURCHARGE_CATEGORY.OVERTIME, { shouldValidate: true });
            }}
          />
        </YStack>
      ) : null}

      <MoneyField control={control} name="amount" label={t('amountLabel')} required />

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHint')}
        multiline
        rows={3}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}
