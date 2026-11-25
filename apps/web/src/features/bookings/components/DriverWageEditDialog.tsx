'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Skeleton } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DRIVER_WAGE_REASON_MAX_LENGTH, DRIVER_WAGE_STAGE, MONEY_STEP_VND } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDriverWageQuote } from '../hooks/use-booking';
import { useUpdateDriverWage } from '../hooks/use-booking-mutations';
import type { BookingDriverHistoryItem, DriverWageQuote } from '../types';
import {
  DriverDailyWageFields,
  WAGE_SCOPE,
  dailyFromTotal,
  useDailyWageSchema,
  type DailyWageValues,
} from './DriverDailyWageFields';
import styles from './DriverWageDialogs.module.css';

/**
 * Sửa tiền công của MỘT lượt gán (ADR 0075) — Figma `24145:61977`: tiêu đề + viên trạng thái lượt
 * gán, "Tên - SĐT", ô số mới, "Hiện tại", lý do, khung "Tổng thu nhập" kèm chênh lệch. Không cần tài
 * xế đồng ý — mỗi lần đổi ghi một dòng lịch sử và báo tài xế.
 *
 *  - Chuyến đang mời / đang chạy / đã xong: nhập MỨC/NGÀY × số ngày HIỆN TẠI của đơn (giữ đơn vị
 *    ngày theo ADR, chốt 25/11/2026 dù design ghi "Tiền công mới" là tổng). Sửa trên một đơn chỉ áp
 *    cho CHÍNH chuyến đó — đổi mức chung là việc của hộp gán và trang Tài xế.
 *  - Chuyến đã nhận mà không chạy: một con số hai bên thoả thuận (0 nếu không có).
 *
 * Số ngày và khoảng hợp lệ đọc từ cùng `driver-wage-quote` với hộp gán; server kiểm lại khi ghi.
 */
export function DriverWageEditDialog({
  bookingId,
  item,
  status,
  onClose,
}: {
  bookingId: string;
  item: BookingDriverHistoryItem;
  /** Viên trạng thái cạnh tiêu đề (vd "Chờ tài xế nhận chuyến") — vắng khi lượt đã khép. */
  status?: ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.booking.wageDialog');
  const tAssign = useTranslations('Drivers.wage.assign');
  const quote = useDriverWageQuote(bookingId, true);
  const agreed = item.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN;

  return (
    <ResponsiveDialog
      title={
        <span>
          <span className={styles.titleRow}>
            {agreed ? t('titleAgreed') : t('title')}
            {status}
          </span>
          <span className={styles.subtitle}>
            {t('driverLine', { name: item.driverName, phone: item.driverPhone })}
          </span>
        </span>
      }
      open
      onClose={onClose}
      size="sm"
      // Nút nằm trong form (Enter gửi được); hộp không dựng hàng nút mặc định.
      footer={null}
    >
      {quote.isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : quote.isError || !quote.data ? (
        <Alert
          type="error"
          showIcon
          title={tAssign('loadError')}
          action={
            <Button size="small" onClick={() => void quote.refetch()}>
              {tAssign('retry')}
            </Button>
          }
        />
      ) : agreed ? (
        <AgreedWageForm bookingId={bookingId} item={item} quote={quote.data} onClose={onClose} />
      ) : (
        <DailyWageEditForm bookingId={bookingId} item={item} quote={quote.data} onClose={onClose} />
      )}
    </ResponsiveDialog>
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
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const tForm = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;

  const base = useDailyWageSchema(quote);
  // "Không đổi gì" = cùng tổng và cùng số ngày.
  const schema = useMemo(
    () =>
      base.test('changed', function (values) {
        const unchanged =
          values.daily * quote.days === Number(wage.amount ?? -1) && quote.days === wage.days;
        return unchanged ? this.createError({ path: 'daily', message: tForm('errors.unchanged') }) : true;
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
  const busy = update.isPending;

  async function submit(values: DailyWageValues) {
    if (busy) return;
    const amount = values.daily * quote.days;
    const reason = values.reason.trim();
    try {
      // Server bỏ qua khi tổng không đổi (chỉ đồng bộ số ngày) — vẫn gọi để mẫu số khớp đơn.
      await update.mutateAsync({
        assignmentId: item.id,
        body: { amount: String(amount), ...(reason ? { reason } : {}) },
      });
      message.success(t('saved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  return (
    <DialogForm
      className={styles.form}
      labelPosition="top"
      onSubmit={(e) => void handleSubmit(submit)(e)}
    >
      {wage.days != null && wage.days !== quote.days ? (
        <Alert type="warning" showIcon title={t('daysChanged', { from: wage.days, to: quote.days })} />
      ) : null}
      <DriverDailyWageFields
        control={control}
        quote={quote}
        canSetDefault={false}
        label={tDialog('newDaily')}
        showQuick={false}
        currentTotal={wage.amount === null ? null : Number(wage.amount)}
        afterField={
          <p className={styles.current}>
            {tDialog('current')} 
            <b>{fmt.money(wage.amount ?? '0')}</b>
          </p>
        }
        beforeTotal={
          <TextAreaField
            control={control}
            name="reason"
            label={t('reason')}
            placeholder={t('reasonPlaceholder')}
            rows={2}
            maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
          />
        }
      />
      <p className={styles.note}>{t('notice')}</p>
      <EditFooter editableUntil={wage.editableUntil} busy={busy} onClose={onClose} />
    </DialogForm>
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
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const tForm = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriverWage(bookingId);
  const wage = item.wage;
  // Chuyến không chạy: [0; mức trần/ngày × số ngày] — cùng `driverWageRange` của server.
  const max = Number(quote.wageDaily.max) * quote.days;
  const current = wage.amount === null ? null : Number(wage.amount);

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

  function submit(values: Values) {
    if (update.isPending) return;
    const reason = values.reason.trim();
    update.mutate(
      { assignmentId: item.id, body: { amount: String(values.amount), ...(reason ? { reason } : {}) } },
      {
        onSuccess: () => {
          message.success(t('saved'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <DialogForm
      className={styles.form}
      labelPosition="top"
      onSubmit={(e) => void handleSubmit(submit)(e)}
    >
      <NumberField
        control={control}
        name="amount"
        label={t('fieldAgreed')}
        money
        min={0}
        required
        help={tForm('rangeAgreed', { max: fmt.money(String(max)) })}
      />
      <p className={styles.current}>
        {tDialog('current')} 
        <b>{fmt.money(wage.amount ?? '0')}</b>
      </p>
      <TextAreaField
        control={control}
        name="reason"
        label={t('reason')}
        placeholder={t('reasonPlaceholder')}
        rows={2}
        maxLength={DRIVER_WAGE_REASON_MAX_LENGTH}
      />
      <p className={styles.note}>{t('noticeAgreed')}</p>
      <EditFooter editableUntil={wage.editableUntil} busy={update.isPending} onClose={onClose} />
    </DialogForm>
  );
}

function EditFooter({
  editableUntil,
  busy,
  onClose,
}: {
  editableUntil?: string | null;
  busy: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.edit');
  const tDialog = useTranslations('Drivers.booking.wageDialog');
  const fmt = useAppFormat();
  return (
    <>
      {editableUntil ? (
        <p className={styles.note}>{t('editableUntil', { time: fmt.dateTime(editableUntil) })}</p>
      ) : null}
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={busy}>
          {tDialog('back')}
        </Button>
        <Button type="primary" htmlType="submit" loading={busy}>
          {tDialog('save')}
        </Button>
      </div>
    </>
  );
}
