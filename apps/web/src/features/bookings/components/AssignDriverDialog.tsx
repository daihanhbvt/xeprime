'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Skeleton } from 'antd';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useUpdateDriverWageSettings } from '@/features/drivers/hooks/use-drivers';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDriverWageQuote } from '../hooks/use-booking';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { DriverWageQuote } from '../types';
import {
  DriverDailyWageFields,
  WAGE_SCOPE,
  useDailyWageSchema,
  type DailyWageValues,
} from './DriverDailyWageFields';
import styles from './DriverWageDialogs.module.css';

/**
 * Gán một tài xế vào đơn KÈM tiền công (ADR 0075). Người dùng nhập MỨC/NGÀY — tự điền mức chung của
 * gian hàng — và thấy tổng `× N ngày` (số ngày, khoảng hợp lệ từ `GET /bookings/:id/driver-wage-quote`;
 * server kiểm lại khi ghi). Số khác mức chung thì chọn: chỉ chuyến này, hay chuyến này và các lượt
 * gán sau. Tài xế thấy tổng trước khi bấm Nhận; chủ xe trả trực tiếp cho tài xế.
 */
export function AssignDriverDialog({
  bookingId,
  driver,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  driver: { id: string; name: string };
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations('Drivers.wage.assign');
  const quote = useDriverWageQuote(bookingId, true);

  return (
    <ResponsiveDialog
      title={t('title', { name: driver.name })}
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
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void quote.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : (
        <AssignDriverForm
          bookingId={bookingId}
          driverId={driver.id}
          quote={quote.data}
          onClose={onClose}
          onAssigned={onAssigned}
        />
      )}
    </ResponsiveDialog>
  );
}

function AssignDriverForm({
  bookingId,
  driverId,
  quote,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  driverId: string;
  quote: DriverWageQuote;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations('Drivers.wage.assign');
  const tForm = useTranslations('Drivers.wage.form');
  const tAssign = useTranslations('Drivers.booking');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const assign = useAssignBookingDriver(bookingId);
  const saveDefault = useUpdateDriverWageSettings();
  const canSetDefault = has(PERMISSION.DRIVER_MANAGE);

  const schema = useDailyWageSchema(quote);
  const { control, handleSubmit } = useForm<DailyWageValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      // Chỉ mức chung của gian hàng được tự điền — mức gợi ý của nền tảng chỉ là lời nhắc.
      daily: quote.dailyWage === null ? undefined : Number(quote.dailyWage),
      scope: WAGE_SCOPE.TRIP,
      reason: '',
    },
  });
  const busy = assign.isPending || saveDefault.isPending;

  async function submit(values: DailyWageValues) {
    if (busy) return;
    const daily = values.daily;
    const asDefault =
      canSetDefault && values.scope === WAGE_SCOPE.DEFAULT && String(daily) !== quote.dailyWage;
    try {
      // Mức chung TRƯỚC: lượt gán vẫn gửi đúng tổng đã thấy, không phụ thuộc mức chung.
      if (asDefault) await saveDefault.mutateAsync({ dailyWage: String(daily) });
      await assign.mutateAsync({ driverId, wageAmount: String(daily * quote.days) });
      message.success(asDefault ? tForm('savedWithDefault') : tAssign('assigned'));
      onAssigned();
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  return (
    <DialogForm className={styles.form} onSubmit={(e) => void handleSubmit(submit)(e)}>
      <DriverDailyWageFields control={control} quote={quote} canSetDefault={canSetDefault} />
      <p className={styles.note}>{t('paidDirect')}</p>
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={busy}>
          {tAssign('close')}
        </Button>
        <Button type="primary" htmlType="submit" loading={busy}>
          {t('submit')}
        </Button>
      </div>
    </DialogForm>
  );
}
