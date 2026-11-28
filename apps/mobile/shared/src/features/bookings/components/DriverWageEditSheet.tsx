import { useMemo, type ReactNode } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  DRIVER_ASSIGNMENT_STATUS_META,
  DRIVER_WAGE_REASON_MAX_LENGTH,
  DRIVER_WAGE_STAGE,
  MONEY_STEP_VND,
  type DriverAssignmentStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoHint } from '@/components/ui/InfoHint';
import { MoneyField } from '@/components/ui/MoneyField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
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
 * Sửa tiền công của MỘT lượt gán (ADR 0075) - bản native của web `DriverWageEditDialog` (Figma
 * `24145:61977`): tiêu đề + dòng "Tên - SĐT", ô số mới, "Hiện tại: …", lý do, khung "Tổng thu nhập"
 * kèm chênh lệch; ghi chú ("tài xế được báo…", hạn sửa) vào dấu ⓘ cạnh tiêu đề; "Quay lại · Lưu tiền
 * công" một hàng ghim đáy tấm. Không cần tài xế đồng ý - mỗi lần đổi ghi một dòng lịch sử và báo tài xế.
 *
 *  - Chuyến đang mời / đang chạy / đã xong: MỨC/NGÀY × số ngày HIỆN TẠI của đơn; chỉ áp cho chuyến này.
 *  - Chuyến đã nhận mà không chạy: một con số hai bên thoả thuận (0 nếu không có).
 *
 * Nơi gọi mount CÓ ĐIỀU KIỆN: mỗi lần mở là một form mới.
 */
export function DriverWageEditSheet({
  bookingId,
  item,
  status = null,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  /** Trạng thái lượt gán đang mở (`DriverAssignmentStatus`) - vắng khi lượt đã khép. */
  status?: string | null;
  onClose: () => void;
}) {
  const tAssign = useTranslations('Drivers.wage.assign');
  const quote = useDriverWageQuote(bookingId, true);
  const agreed = item.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN;

  if (quote.isLoading || quote.isError || !quote.data) {
    return (
      <WageSheet item={item} agreed={agreed} status={status} onClose={onClose}>
        {quote.isLoading ? (
          <SkeletonText lines={3} />
        ) : (
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
        )}
      </WageSheet>
    );
  }
  return agreed ? (
    <AgreedWageForm bookingId={bookingId} item={item} quote={quote.data} status={status} onClose={onClose} />
  ) : (
    <DailyWageEditForm bookingId={bookingId} item={item} quote={quote.data} status={status} onClose={onClose} />
  );
}

/** Khung tấm chung: tiêu đề + ⓘ ghi chú, dòng "Tên - SĐT", thân, chân hai nút. */
function WageSheet({
  item,
  agreed,
  status = null,
  note,
  footer,
  onClose,
  children,
}: {
  item: BookingDriverHistoryItem;
  agreed: boolean;
  status?: string | null;
  note?: string;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const domainLabel = useDomainLabel();
  const title = agreed ? tDialog('titleAgreed') : tDialog('title');
  const meta = status ? DRIVER_ASSIGNMENT_STATUS_META[status as DriverAssignmentStatus] : null;
  const adornment =
    meta || note ? (
      <XStack ai="center" gap={space.xs}>
        {meta && status ? (
          <StatusBadge
            label={domainLabel('driverAssignmentStatus', status, meta.label)}
            color={meta.color}
            size="sm"
          />
        ) : null}
        {note ? <InfoHint content={note} label={title} /> : null}
      </XStack>
    ) : undefined;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      titleAdornment={adornment}
      subtitle={tDialog('driverLine', { name: item.driverName, phone: item.driverPhone ?? '' })}
      chrome="v2"
      headerDivider
      {...(footer ? { footer } : {})}
    >
      {children}
    </BottomSheet>
  );
}

/** Ghi chú của tấm (câu thông báo + hạn sửa) - nội dung của dấu ⓘ. */
function useWageNote(notice: string, editableUntil: string | null | undefined): string {
  const t = useTranslations('Drivers.wage.edit');
  const fmt = useAppFormat();
  return editableUntil
    ? `${notice}\n${t('editableUntil', { time: fmt.dateTime(editableUntil) })}`
    : notice;
}

/** "Hiện tại: 600.000 đ" - nhãn và số CÙNG cỡ 14 (người dùng 28/11/2026). */
function CurrentAmount({ amount }: { amount: string | null | undefined }) {
  const colors = useColors();
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const fmt = useAppFormat();
  return (
    <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
      {`${tDialog('current')} `}
      <Text col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
        {fmt.money(amount ?? '0')}
      </Text>
    </Text>
  );
}

/** Chân tấm: "Đóng · Lưu tiền công" chia đều MỘT hàng (web `.actions`). */
function WageFooter({
  busy,
  onSave,
  onClose,
}: {
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const tCommon = useTranslations('Common.actions');
  return (
    <XStack gap={space.md}>
      <YStack f={1}>
        <Button label={tCommon('close')} variant="outline" disabled={busy} onPress={onClose} />
      </YStack>
      <YStack f={1}>
        <Button label={tDialog('save')} variant="gradient" loading={busy} onPress={onSave} />
      </YStack>
    </XStack>
  );
}

function DailyWageEditForm({
  bookingId,
  item,
  quote,
  status,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  quote: DriverWageQuote;
  status: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tForm = useTranslations('Drivers.wage.form');
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;
  const note = useWageNote(t('notice'), wage.editableUntil);

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
    <WageSheet
      item={item}
      agreed={false}
      status={status}
      note={note}
      onClose={onClose}
      footer={<WageFooter busy={update.isPending} onSave={() => void submit()} onClose={onClose} />}
    >
      <YStack gap={space.md}>
        {wage.days != null && wage.days !== quote.days ? (
          <Callout tone="warning" title={t('daysChanged', { from: wage.days, to: quote.days })} />
        ) : null}
        <DriverDailyWageFields
          control={control}
          quote={quote}
          canSetDefault={false}
          label={tDialog('newDaily')}
          showQuick={false}
          currentTotal={wage.amount === null ? null : Number(wage.amount)}
          afterField={<CurrentAmount amount={wage.amount} />}
          beforeTotal={
            <TextField
              control={control}
              name="reason"
              label={t('reason')}
              placeholder={t('reasonPlaceholder')}
              multiline
              rows={2}
              maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
            />
          }
        />
      </YStack>
    </WageSheet>
  );
}

function AgreedWageForm({
  bookingId,
  item,
  quote,
  status,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  quote: DriverWageQuote;
  status: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tForm = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;
  const note = useWageNote(t('noticeAgreed'), wage.editableUntil);
  // Chuyến không chạy: [0; mức trần/ngày × số ngày] - cùng `driverWageRange` của server.
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
    <WageSheet
      item={item}
      agreed
      status={status}
      note={note}
      onClose={onClose}
      footer={<WageFooter busy={update.isPending} onSave={() => void submit()} onClose={onClose} />}
    >
      <YStack gap={space.md}>
        <MoneyField
          control={control}
          name="amount"
          label={t('fieldAgreed')}
          required
          hint={tForm('rangeAgreed', { max: fmt.money(String(max)) })}
        />
        <CurrentAmount amount={wage.amount} />
        <TextField
          control={control}
          name="reason"
          label={t('reason')}
          placeholder={t('reasonPlaceholder')}
          multiline
          rows={2}
          maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
        />
      </YStack>
    </WageSheet>
  );
}
