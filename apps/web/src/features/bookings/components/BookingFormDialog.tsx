'use client';

import { Alert, App, Form, Select, Tag } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  DRIVER_ASSIGNMENT_STATUS_META,
  isDriverReassignable,
  PERMISSION,
  SERVICE_TYPE,
  VN_PHONE_PATTERN,
} from '@xeprime/types';
import { moneySchema } from '@xeprime/validators';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DriverLicenceStateTag } from '@/features/drivers/components/DriverLicenceStateTag';
import { useAssignableDrivers } from '@/features/drivers/hooks/use-drivers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePermissions } from '@/hooks/use-permissions';
import { useAssignBookingDriver, useUpdateBooking } from '../hooks/use-booking-mutations';
import type { BookingDetail, UpdateBookingInput } from '../types';
import styles from './BookingFormDialog.module.css';

const NOTE_MAX = 2000;
/** Giá trị Select cho "không gán" — `null` không phải một value hợp lệ của AntD Select. */
const NO_DRIVER = '';

function buildEditSchema(labels: { name: string; phone: string }) {
  return yup.object({
    customerName: yup.string().trim().required(labels.name).max(255),
    customerPhone: yup
      .string()
      .trim()
      .default('')
      .matches(VN_PHONE_PATTERN, { message: labels.phone, excludeEmptyString: true }),
    depositAmount: moneySchema
      .transform((v, orig) => (orig === '' || orig === null ? null : v))
      .nullable()
      .default(null),
    note: yup.string().trim().max(NOTE_MAX).default(''),
  });
}
type EditFormValues = yup.InferType<ReturnType<typeof buildEditSchema>>;

/**
 * SỬA đơn thuê — chỉ còn BỐN trường (quyết định sản phẩm 19/10/2026): tên khách, SĐT, tiền cọc,
 * ghi chú. Loại dịch vụ, thời gian, lộ trình và giá đóng băng lúc tạo (ADR 0024) — server từ chối
 * mọi trường khác (`forbidNonWhitelisted`). Chúng hiện ở đây chỉ-đọc để người sửa biết vì sao
 * không đổi được. Phí giao nhận có lối riêng (`UpdateDeliveryFeeModal`, kèm lý do vào audit).
 *
 * TẠO đơn không đi qua đây — mọi lối tạo thủ công dùng `StaffBookingDialog`.
 *
 * Đơn `with_driver` kèm ô "Tài xế" (ADR 0063): lưu = PATCH bốn trường, rồi NẾU lựa chọn tài xế
 * đổi thì gọi `PATCH /bookings/:id/driver`. Hai lệnh, hai lỗi riêng: thông tin đơn đã lưu thì
 * không bị "mất" vì lượt gán tài xế hỏng (người bận, không còn liên kết…) — hộp ở lại để chọn
 * người khác.
 */
export function BookingFormDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: BookingDetail;
  onClose: () => void;
}) {
  // Chỉ dựng khi mở → mỗi lần mở là state sạch, không cần reset trong effect.
  if (!open) return null;
  return <BookingEditForm key={editing.id} booking={editing} onDone={onClose} />;
}

function BookingEditForm({ booking, onDone }: { booking: BookingDetail; onDone: () => void }) {
  const t = useTranslations('Bookings.edit');
  const tCreate = useTranslations('Bookings.create');
  const tDriver = useTranslations('Drivers.booking');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { message } = App.useApp();
  const formId = useId();
  const update = useUpdateBooking(booking.id);
  const assign = useAssignBookingDriver(booking.id);

  const withDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  // Bộ chọn tài xế chỉ có khi đơn CHƯA giao xe — sau bàn giao tài xế đã chốt (ADR 0063).
  const driverEditable =
    withDriver && isDriverReassignable(booking.status) && has(PERMISSION.DRIVER_VIEW);
  const currentDriverId = booking.driver?.id ?? NO_DRIVER;
  const [driverId, setDriverId] = useState<string>(currentDriverId);
  /** Thông tin đơn đã lưu, chỉ còn tài xế hỏng — lần bấm sau chỉ thử lại phần tài xế. */
  const [detailsSaved, setDetailsSaved] = useState(false);

  const driversQ = useAssignableDrivers(
    { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id },
    driverEditable,
  );

  const schema = useMemo(
    () => buildEditSchema({ name: t('nameRequired'), phone: t('phoneInvalid') }),
    [t],
  );
  const { control, handleSubmit } = useForm<EditFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      customerName: booking.customerName,
      customerPhone: booking.customerPhone ?? '',
      depositAmount:
        booking.depositAmount === null || booking.depositAmount === undefined
          ? null
          : Number(booking.depositAmount),
      note: booking.note ?? '',
    },
  });

  const pending = update.isPending || assign.isPending;
  const driverChanged = driverEditable && driverId !== currentDriverId;

  async function saveDriver(): Promise<boolean> {
    if (!driverChanged) return true;
    try {
      await assign.mutateAsync(driverId === NO_DRIVER ? null : driverId);
      return true;
    } catch (err) {
      message.error(t('driverFailed', { error: errorMessage(err) }));
      return false;
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!detailsSaved) {
      const body: UpdateBookingInput = {
        customerName: values.customerName.trim(),
        ...(values.customerPhone ? { customerPhone: values.customerPhone } : {}),
        // Để trống = không đổi (PATCH chỉ đổi trường có mặt); "0" mới là bỏ cọc.
        ...(values.depositAmount === null ? {} : { depositAmount: String(values.depositAmount) }),
        note: values.note?.trim() ?? '',
      };
      try {
        await update.mutateAsync(body);
      } catch (err) {
        message.error(errorMessage(err));
        return;
      }
      setDetailsSaved(true);
    }
    if (!(await saveDriver())) return;
    message.success(t('success'));
    onDone();
  });

  const driver = booking.driver ?? null;

  return (
    <ResponsiveDialog
      title={`${t('title')} ${booking.code}`}
      size="lg"
      open
      onClose={onDone}
      okText={t('save')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm id={formId} onSubmit={onSubmit} labelWidth="md">
        <Alert type="info" showIcon className={styles.alert} title={t('frozenNote')} />

        {/* Phần đã chốt — đọc, không sửa. */}
        <Form.Item label={t('vehicleLabel')}>
          {booking.vehiclePlate
            ? `${booking.vehicleName} · ${booking.vehiclePlate}`
            : booking.vehicleName}
        </Form.Item>
        <Form.Item label={t('serviceTypeLabel')}>
          {dl('serviceType', booking.serviceType)}
          {withDriver && booking.routeType ? ` · ${dl('routeType', booking.routeType)}` : ''}
        </Form.Item>
        <Form.Item label={t('scheduleLabel')}>
          {fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
        </Form.Item>
        <Form.Item label={t('total')}>
          <strong>{fmt.money(booking.totalAmount)}</strong>
        </Form.Item>

        <TextField
          control={control}
          name="customerName"
          label={tCreate('customer.nameLabel')}
          placeholder={tCreate('customer.namePlaceholder')}
        />
        <TextField
          control={control}
          name="customerPhone"
          label={tCreate('customer.phoneLabel')}
          placeholder={tCreate('customer.phonePlaceholder')}
        />
        <NumberField
          control={control}
          name="depositAmount"
          label={tCreate('price.depositAmount')}
          money
          min={0}
        />

        {driverEditable ? (
          <Form.Item
            label={t('driverLabel')}
            help={driverChanged && driverId !== NO_DRIVER ? t('driverPendingNote') : undefined}
          >
            <div className={styles.driverRow}>
              <Select
                className={styles.driverSelect}
                value={driverId}
                onChange={setDriverId}
                loading={driversQ.isLoading}
                showSearch
                optionFilterProp="title"
                placeholder={t('driverPlaceholder')}
                aria-label={t('driverLabel')}
                disabled={pending}
                notFoundContent={
                  driversQ.isError ? errorMessage(driversQ.error) : tDriver('pickerEmpty')
                }
                options={[
                  { value: NO_DRIVER, title: t('driverNone'), label: t('driverNone') },
                  /*
                   * Người đang gán có thể không còn trong danh sách khả dụng (liên kết đã tạm
                   * ngưng) — vẫn giữ một option để ô hiện đúng tên, không hiện mã thô.
                   */
                  ...(driver && !(driversQ.data ?? []).some((d) => d.id === driver.id)
                    ? [{ value: driver.id, title: driver.name, label: driver.name }]
                    : []),
                  ...(driversQ.data ?? []).map((d) => ({
                    value: d.id,
                    title: `${d.name} ${d.phone}`,
                    disabled: d.busy,
                    label: (
                      <span className={styles.driverOption}>
                        <span>
                          {d.name} · {d.phone}
                        </span>
                        <span className={styles.driverTags}>
                          <DriverLicenceStateTag licence={{ state: d.licenceState }} compact />
                          {d.busy ? <Tag>{tDriver('busy')}</Tag> : null}
                        </span>
                      </span>
                    ),
                  })),
                ]}
              />
              {/* Trạng thái lượt gán HIỆN TẠI — gán mới vẫn chờ tài xế nhận. */}
              {driver && driverId === driver.id ? (
                <StatusTag
                  value={driver.assignmentStatus}
                  meta={DRIVER_ASSIGNMENT_STATUS_META}
                  group="driverAssignmentStatus"
                />
              ) : null}
            </div>
          </Form.Item>
        ) : null}

        <TextAreaField
          control={control}
          name="note"
          label={tCreate('customer.noteLabel')}
          rows={3}
          maxLength={NOTE_MAX}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
