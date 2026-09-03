import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { PAYMENT_KIND, PAYMENT_METHOD_VALUES } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useRecordPayment } from '../hooks/use-settlement';
import type { RecordPaymentInput } from '../api';

const NOTE_MAX = 500;

/** Suy từ CHÍNH schema — `yup.oneOf` thu hẹp kiểu, interface viết tay sẽ lệch với resolver. */
type PaymentFormValues = yup.InferType<ReturnType<typeof buildPaymentSchema>>;

function buildPaymentSchema(amountLabel: string) {
  return yup.object({
    amount: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(amountLabel)
      .integer(amountLabel)
      .min(1, amountLabel)
      .required(amountLabel),
    method: yup.string().oneOf(PAYMENT_METHOD_VALUES).required(),
    referenceCode: yup.string().trim().max(NOTE_MAX).default(''),
    description: yup.string().trim().max(NOTE_MAX).default(''),
  });
}

/**
 * Ghi sổ MỘT khoản tiền của đơn (FIN-05) — bản native của `RecordPaymentModal`.
 *
 * KHÔNG có thanh toán trực tuyến (ADR 0013): tấm trượt này ghi lại việc đã xảy ra ở quầy, nó
 * không làm đồng nào chạy đi đâu cả.
 *
 * **`kind` là THAM SỐ, không phải một ô cho người dùng chọn.** Cọc và tiền thuê là hai loại tiền
 * khác nhau — cọc không cộng vào `paidAmount` và không làm giảm công nợ vì nó là tài sản giữ hộ.
 * Nơi gọi mới biết người dùng đang đứng ở khối nào; để họ tự chọn là mời ghi sai sổ.
 *
 * `debtAmount` điền sẵn vào ô tiền và hiện thành một dòng dẫn ở đầu: khoản phải thu gần như
 * luôn là khoản thu, nên bắt gõ lại nó là bắt làm một việc máy đã biết.
 *
 * Giá trị mặc định chỉ đọc lúc DỰNG, nên nơi gọi phải gắn/tháo theo cờ mở
 * (`{open ? <RecordPaymentSheet … /> : null}`) chứ không giữ nó mãi trong cây.
 */
export function RecordPaymentSheet({
  open,
  onClose,
  bookingId,
  kind = PAYMENT_KIND.RENTAL,
  debtAmount,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  kind?: RecordPaymentInput['kind'];
  /** Số gợi ý sẵn, dạng CHUỖI như mọi số tiền đi trên dây (ADR 0007). */
  debtAmount?: string;
}) {
  const t = useTranslations('Bookings.payments');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const record = useRecordPayment(bookingId);

  const isDeposit = kind === PAYMENT_KIND.DEPOSIT;
  const schema = useMemo(() => buildPaymentSchema(t('amountLabel')), [t]);

  const suggested = Number(debtAmount ?? 0);

  const { control, handleSubmit } = useForm<PaymentFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      amount: Number.isFinite(suggested) && suggested > 0 ? suggested : 0,
      method: PAYMENT_METHOD_VALUES[0] as PaymentFormValues['method'],
      referenceCode: '',
      description: '',
    },
  });

  const submit = handleSubmit((values) =>
    record.mutate(
      {
        amount: String(values.amount),
        method: values.method as RecordPaymentInput['method'],
        kind,
        ...(values.referenceCode ? { referenceCode: values.referenceCode } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(isDeposit ? t('recordDepositSuccess') : t('recordSuccess'));
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    ),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isDeposit ? t('recordDepositTitle') : t('recordTitle')}
      footer={
        <Button label={t('recordOk')} loading={record.isPending} onPress={() => void submit()} />
      }
    >
      {debtAmount ? (
        <XStack
          ai="center"
          jc="space-between"
          gap={space.sm}
          p={space.md}
          br={radius.md}
          bg={colors.primaryLight}
        >
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {isDeposit ? t('depositLead') : t('debtLead')}:
          </Text>
          <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
            {fmt.money(debtAmount)}
          </Text>
        </XStack>
      ) : null}

      {isDeposit ? (
        /*
          Nói TRƯỚC khi ghi, không phải sau: chủ xe nhìn công nợ không đổi sau khi thu 5 triệu
          sẽ tưởng hệ thống nuốt mất tiền.
        */
        <YStack bg={colors.infoSurface} p={space.md} br={radius.md} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('depositNoticeTitle')}
          </Text>
          <Text col={colors.text} fos={fontSize.label}>
            {t('depositNoticeBody')}
          </Text>
        </YStack>
      ) : null}

      <MoneyField control={control} name="amount" label={t('amountLabel')} required />

      <SelectField
        control={control}
        name="method"
        label={t('methodLabel')}
        options={PAYMENT_METHOD_VALUES.map((value) => ({
          value,
          label: domainLabel('paymentMethod', value),
        }))}
        required
      />

      <TextField
        control={control}
        name="referenceCode"
        label={t('referenceLabel')}
        placeholder={t('referencePlaceholder')}
      />

      <TextField control={control} name="description" label={t('descriptionLabel')} />
    </BottomSheet>
  );
}
