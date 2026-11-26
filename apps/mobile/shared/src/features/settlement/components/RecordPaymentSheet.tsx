import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { PAYMENT_KIND, PAYMENT_METHOD_VALUES } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { SideCard } from '@/features/bookings/components/BookingDetailSide';
import { BookingCustomerIdentity } from '@/features/bookings/components/BookingCustomerIdentity';
import { useBooking } from '@/features/bookings/hooks/use-bookings';
import { FONT_FAMILY } from '@/theme/fonts';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useRecordPayment } from '../hooks/use-settlement';
import type { RecordPaymentInput } from '../api';

const NOTE_MAX = 500;
/** Figma "Thu tiền đơn" `24512:134019`: khối cách 16, ô nhập cách 12, nút gợi ý cách 16 / bo 16. */
const BLOCK_GAP = 16;
const FIELD_GAP = 12;
const CHIP_GAP = 16;
const CHIP_RADIUS = 16;
const FOOTER_GAP = 12;
const HALF = 2;
/** Web `payments/schema.ts` + API `@MaxLength(255)` cho mã tra soát. */
const REFERENCE_MAX = 255;

/** Suy từ CHÍNH schema — `yup.oneOf` thu hẹp kiểu, interface viết tay sẽ lệch với resolver. */
type PaymentFormValues = yup.InferType<ReturnType<typeof buildPaymentSchema>>;

/** Trần một lần thu TIỀN THUÊ - `null` = không có trần (thu cọc). Web `RecordPaymentCap`. */
interface PaymentCap {
  amount: number;
  /** Số trần đã định dạng tiền, để câu lỗi nói đúng con số ở dòng dẫn. */
  label: string;
}

type PaymentTranslate = ReturnType<typeof useTranslations<'Bookings.payments'>>;

function buildPaymentSchema(t: PaymentTranslate, cap: PaymentCap | null) {
  /*
   * Tiền THUÊ có trần = số khách còn phải đưa (web `recordPaymentSchema`, 18/11/2026): server từ
   * chối phần vượt (`PAYMENT_EXCEEDS_DUE`), form chặn trước. Ô vẫn sửa được để thu TỪNG PHẦN.
   */
  let amount = yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
    .typeError(t('validation.amountRequired'))
    .nullable()
    .defined()
    .moreThan(0, t('validation.amountPositive'))
    .test('required', t('validation.amountRequired'), (v) => v != null);
  if (cap) amount = amount.max(cap.amount, t('validation.amountOverDue', { amount: cap.label }));
  return yup.object({
    /*
     * Cùng luật với `recordPaymentSchema` của web: bắt buộc và LỚN HƠN 0.
     *
     * Bản trước còn `.integer()` — một ràng buộc app tự thêm mà web không có. Cột tiền là
     * `Decimal(14,2)`, nên một khoản 50.000,50 hợp lệ ở server lại bị chặn ở app: hai client
     * nhận hai tập giá trị khác nhau cho cùng một ô.
     */
    amount,
    method: yup.string().oneOf(PAYMENT_METHOD_VALUES).required(t('validation.methodRequired')),
    referenceCode: yup.string().trim().max(REFERENCE_MAX).default(''),
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
  counterDue = false,
  code,
}: {
  /** Mã đơn nơi mở đã có - tiêu đề hiện ngay "Thu tiền đơn hàng #mã" trong lúc chờ API. */
  code?: string;
  open: boolean;
  onClose: () => void;
  bookingId: string;
  kind?: RecordPaymentInput['kind'];
  /** Số gợi ý sẵn, dạng CHUỖI như mọi số tiền đi trên dây (ADR 0007). */
  debtAmount?: string;
  /**
   * `debtAmount` là phần khách còn đưa TẬN TAY (`counterDueAmount`), không phải cả công nợ - chỉ đổi
   * nhãn dòng dẫn cho khớp "Còn phải thu của khách" của trang đơn (web `counterDue`).
   */
  counterDue?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.payments');
  /* Chữ của app theo Figma `24512:133829` (người dùng chốt 26/11/2026) - web giữ chữ của nó. */
  const tApp = useTranslations('Bookings.payments.partnerApp');
  /* Thẻ khách đọc chi tiết đơn (thường đã có trong cache của nơi mở tấm). */
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const record = useRecordPayment(bookingId);

  const isDeposit = kind === PAYMENT_KIND.DEPOSIT;
  const schema = useMemo(() => {
    const cap = Number(debtAmount);
    return buildPaymentSchema(
      t,
      isDeposit || debtAmount == null || !Number.isFinite(cap)
        ? null
        : { amount: cap, label: fmt.money(debtAmount) },
    );
  }, [debtAmount, fmt, isDeposit, t]);

  /*
   * Số gợi ý chỉ để ĐIỀN SẴN ô nhập (ô tiền làm việc trên `number`); giá trị gửi đi vẫn hoá chuỗi.
   * Không có gợi ý thì ô để TRỐNG — một số 0 điền sẵn đọc ra như "không còn nợ gì", và người dùng
   * bấm Ghi nhận là ghi một khoản 0đ. Web cũng mặc định `null`.
   */
  const suggested = Number(debtAmount ?? 0);

  const { control, handleSubmit, setValue } = useForm<PaymentFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      amount: Number.isFinite(suggested) && suggested > 0 ? suggested : null,
      method: PAYMENT_METHOD_VALUES[0] as PaymentFormValues['method'],
      referenceCode: '',
      description: '',
    },
  });

  /* Số đang gõ - cho nhãn nút "Ghi nhận thu x" và câu "Còn nợ sau khi thu". */
  const typed = useWatch({ control, name: 'amount' });
  const typedAmount = typeof typed === 'number' && Number.isFinite(typed) && typed > 0 ? typed : null;
  /* Gợi ý nhanh + số còn lại chỉ có nghĩa với TIỀN THUÊ có trần (cọc không trừ công nợ). */
  const due = !isDeposit && Number.isFinite(suggested) && suggested > 0 ? suggested : null;
  const half = due === null ? null : Math.floor(due / HALF);
  const remaining = due === null ? null : Math.max(0, due - (typedAmount ?? 0));
  const fill = (value: number) => setValue('amount', value, { shouldValidate: true, shouldDirty: true });

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

  const lead = isDeposit ? t('depositLead') : counterDue ? t('counterLead') : t('debtLead');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        isDeposit
          ? t('recordDepositTitle')
          : booking?.code ?? code
            ? tApp('title', { code: (booking?.code ?? code) as string })
            : t('recordTitle')
      }
      subtitle={fmt.date(new Date().toISOString())}
      chrome="v2"
      headerDivider
      footer={
        // Figma "Footer cố định": "Hủy" viền co vừa chữ · nút vàng mang số đang thu.
        <XStack gap={FOOTER_GAP}>
          <YStack flexShrink={0}>
            <Button label={tApp('cancel')} variant="neutral" block={false} onPress={onClose} />
          </YStack>
          <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
            <Button
              label={
                typedAmount === null
                  ? t('recordOk')
                  : tApp('submitAmount', { amount: fmt.money(String(typedAmount)) })
              }
              variant="gradient"
              loading={record.isPending}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      }
    >
      <FieldAppearanceProvider value="v2">
        <YStack gap={BLOCK_GAP}>
          {/* Figma "Customer Details" `24512:134146`: khách · xe · biển số · còn nợ. */}
          {booking || debtAmount ? (
            <SideCard>
              {booking ? <BookingCustomerIdentity booking={booking} /> : null}
              {booking ? (
                <Text fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  <Text
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fontFamily={FONT_FAMILY.medium}
                  >
                    {booking.vehicleName}
                  </Text>
                  {booking.vehiclePlate ? (
                    <Text
                      col={colors.textMuted}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fontFamily={FONT_FAMILY.body}
                    >
                      {`${LIST_SEPARATOR}${booking.vehiclePlate}`}
                    </Text>
                  ) : null}
                </Text>
              ) : null}
              {debtAmount ? (
                <Text
                  col={colors.text}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fontFamily={FONT_FAMILY.semibold}
                >
                  {tApp('debtLine', { label: lead, amount: fmt.money(debtAmount) })}
                </Text>
              ) : null}
            </SideCard>
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

          <YStack gap={FIELD_GAP}>
            <YStack gap={space.sm}>
              <MoneyField control={control} name="amount" label={t('amountLabel')} required />
              {due !== null && half !== null ? (
                // Gợi ý nhanh chỉ ĐIỀN ô; trần thu vẫn do schema chặn như cũ.
                <XStack gap={CHIP_GAP} flexWrap="wrap" rowGap={space.sm}>
                  <FillChip
                    label={tApp('fillFull', { amount: fmt.money(String(due)) })}
                    onPress={() => fill(due)}
                  />
                  {half > 0 ? (
                    <FillChip
                      label={tApp('fillHalf', { amount: fmt.money(String(half)) })}
                      onPress={() => fill(half)}
                    />
                  ) : null}
                </XStack>
              ) : null}
            </YStack>

            {/* Hình thức giữ ô chọn như web (người dùng chốt 26/11/2026) - đủ 5 giá trị. */}
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
              label={tApp('referenceLabel')}
              placeholder={tApp('referencePlaceholder')}
            />

            <TextField
              multiline
              scrollable
              rows={3}
              control={control}
              name="description"
              label={tApp('descriptionLabel')}
              placeholder={tApp('descriptionPlaceholder')}
            />

            {remaining !== null ? (
              <Text
                col={colors.textPlaceholder}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fontStyle="italic"
              >
                {tApp.rich('remainingAfter', {
                  amount: fmt.money(String(remaining)),
                  b: (chunks) => (
                    <Text
                      col={colors.textPlaceholder}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fontStyle="italic"
                      fontFamily={FONT_FAMILY.medium}
                    >
                      {chunks}
                    </Text>
                  ),
                })}
              </Text>
            ) : null}
          </YStack>
        </YStack>
      </FieldAppearanceProvider>
    </BottomSheet>
  );
}

/** Figma "_Badge" gợi ý: nền `bg/gray-100`, bo 16, đệm 8/2, chữ 14/20 đậm vừa `text/gray/medium`. */
function FillChip({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={space.xs}>
      {({ pressed }) => (
        <YStack px={space.sm} py={2} br={CHIP_RADIUS} bg={colors.surfaceMuted} opacity={pressed ? 0.6 : 1}>
          <Text
            col={colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fontFamily={FONT_FAMILY.medium}
          >
            {label}
          </Text>
        </YStack>
      )}
    </Pressable>
  );
}
