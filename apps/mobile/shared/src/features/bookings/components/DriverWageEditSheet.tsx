import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { DRIVER_WAGE_REASON_MAX_LENGTH, DRIVER_WAGE_STAGE, MONEY_STEP_VND } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MoneyField } from '@/components/ui/MoneyField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useDriverWageQuote, useUpdateDriverWage } from '../hooks/use-bookings';
import type { BookingDriverHistoryItem, DriverWageQuote } from '../api';
import {
  DriverDailyWageFields,
  WAGE_SCOPE,
  dailyFromTotal,
  useDailyWageSchema,
  type DailyWageValues,
} from './DriverDailyWageFields';

/**
 * Sửa tiền công của MỘT lượt gán (ADR 0075) — bản native của web `DriverWageEditDialog`. Không cần
 * tài xế đồng ý; mỗi lần đổi ghi một dòng lịch sử và báo tài xế.
 *
 *  - Chuyến đang mời / đang chạy / đã xong: MỨC/NGÀY × số ngày HIỆN TẠI của đơn; chỉ áp cho chuyến
 *    này (đổi mức chung là việc của tấm gán và màn Tài xế).
 *  - Chuyến đã nhận mà không chạy: một con số hai bên thoả thuận (0 nếu không có).
 *
 * Nơi gọi mount CÓ ĐIỀU KIỆN: mỗi lần mở là một form mới.
 */
export function DriverWageEditSheet({
  bookingId,
  item,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tAssign = useTranslations('Drivers.wage.assign');
  const quote = useDriverWageQuote(bookingId, true);
  const agreed = item.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        agreed ? t('titleAgreed', { name: item.driverName }) : t('title', { name: item.driverName })
      }
    >
      {quote.isLoading ? (
        <SkeletonText lines={3} />
      ) : quote.isError || !quote.data ? (
        <YStack gap={space.sm}>
          <Callout tone="danger" title={tAssign('loadError')} />
          <Button
            label={tAssign('retry')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => void quote.refetch()}
          />
        </YStack>
      ) : agreed ? (
        <AgreedWageForm bookingId={bookingId} item={item} quote={quote.data} onClose={onClose} />
      ) : (
        <DailyWageEditForm bookingId={bookingId} item={item} quote={quote.data} onClose={onClose} />
      )}
    </BottomSheet>
  );
}

function CurrentAmount({ amount }: { amount: string | null | undefined }) {
  const colors = useColors();
  const t = useTranslations('Drivers.wage.edit');
  const fmt = useAppFormat();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('current')}
      </Text>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {fmt.money(amount ?? '0')}
      </Text>
    </XStack>
  );
}

function DailyWageEditForm({
  bookingId,
  item,
  quote,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  quote: DriverWageQuote;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tForm = useTranslations('Drivers.wage.form');
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;

  const base = useDailyWageSchema(quote);
  // "Không đổi gì" = cùng tổng và cùng số ngày (như web).
  const schema = useMemo(
    () =>
      base.test('changed', function (values) {
        const unchanged =
          values.daily * quote.days === Number(wage.amount ?? -1) && quote.days === wage.days;
        return unchanged
          ? this.createError({ path: 'daily', message: tForm('errors.unchanged') })
          : true;
      }),
    [base, quote.days, wage.amount, wage.days, tForm],
  );
  const { control, handleSubmit } = useForm<DailyWageValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      daily: dailyFromTotal(wage.amount ?? null, wage.days ?? null),
      scope: WAGE_SCOPE.TRIP,
      reason: '',
    },
  });

  const submit = handleSubmit((values) => {
    if (update.isPending) return;
    const reason = values.reason.trim();
    update.mutate(
      {
        assignmentId: item.id,
        body: { amount: String(values.daily * quote.days), ...(reason ? { reason } : {}) },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <CurrentAmount amount={wage.amount} />
      {wage.days != null && wage.days !== quote.days ? (
        <Callout tone="warning" title={t('daysChanged', { from: wage.days, to: quote.days })} />
      ) : null}
      {/* Hộp sửa (web 25/11): nhãn "Tiền công mới/ngày", không chọn nhanh, tổng kèm chênh lệch. */}
      <DriverDailyWageFields
        control={control}
        quote={quote}
        canSetDefault={false}
        label={tDialog('newDaily')}
        showQuick={false}
        currentTotal={wage.amount === null ? null : Number(wage.amount)}
      />
      <TextField
        control={control}
        name="reason"
        label={t('reason')}
        placeholder={t('reasonPlaceholder')}
        multiline
        rows={2}
        maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
      />
      <Callout tone="info" title={t('notice')} />
      <EditFooter
        editableUntil={wage.editableUntil}
        busy={update.isPending}
        onSave={() => void submit()}
        onClose={onClose}
      />
    </YStack>
  );
}

function AgreedWageForm({
  bookingId,
  item,
  quote,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  quote: DriverWageQuote;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tForm = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;
  // Chuyến không chạy: [0; mức trần/ngày × số ngày] — cùng `driverWageRange` của server.
  const max = Number(quote.wageDaily.max) * quote.days;
  const current = wage.amount == null ? null : Number(wage.amount);

  const schema = useMemo(() => {
    const range = { min: fmt.money('0'), max: fmt.money(String(max)) };
    return yup.object({
      amount: yup
        .number()
        .typeError(tForm('errors.required'))
        .required(tForm('errors.required'))
        .min(0, tForm('errors.range', range))
        .max(max, tForm('errors.range', range))
        .test('step', tForm('errors.step'), (v) => v == null || v % MONEY_STEP_VND === 0)
        .test('changed', tForm('errors.unchanged'), (v) => v == null || v !== current),
      reason: yup.string().trim().max(DRIVER_WAGE_REASON_MAX_LENGTH).default(''),
    });
  }, [tForm, fmt, max, current]);
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { amount: current ?? undefined, reason: '' },
  });

  const submit = handleSubmit((values) => {
    if (update.isPending) return;
    const reason = values.reason.trim();
    update.mutate(
      {
        assignmentId: item.id,
        body: { amount: String(values.amount), ...(reason ? { reason } : {}) },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <CurrentAmount amount={wage.amount} />
      <MoneyField
        control={control}
        name="amount"
        label={t('fieldAgreed')}
        required
        hint={tForm('rangeAgreed', { max: fmt.money(String(max)) })}
      />
      <TextField
        control={control}
        name="reason"
        label={t('reason')}
        placeholder={t('reasonPlaceholder')}
        multiline
        rows={2}
        maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
      />
      <Callout tone="info" title={t('noticeAgreed')} />
      <EditFooter
        editableUntil={wage.editableUntil}
        busy={update.isPending}
        onSave={() => void submit()}
        onClose={onClose}
      />
    </YStack>
  );
}

function EditFooter({
  editableUntil,
  busy,
  onSave,
  onClose,
}: {
  editableUntil?: string | null;
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.wage.edit');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  return (
    <YStack gap={space.sm}>
      {editableUntil ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('editableUntil', { time: fmt.dateTime(editableUntil) })}
        </Text>
      ) : null}
      <Button label={tCommon('save')} loading={busy} onPress={onSave} />
      <Button label={tCommon('cancel')} variant="secondary" disabled={busy} onPress={onClose} />
    </YStack>
  );
}
