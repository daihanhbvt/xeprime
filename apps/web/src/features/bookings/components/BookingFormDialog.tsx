'use client';

import { Alert, App, Button, Form, Space } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useController, useForm, useWatch, type Control } from 'react-hook-form';
import { API_ERROR_CODE, SERVICE_TYPE } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { dayjs } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { Dayjs } from 'dayjs';
import { SERVICE_TYPE_OPTIONS } from '../constants';
import { checkConflict } from '../api';
import { useCreateBooking, useUpdateBooking } from '../hooks/use-booking-mutations';
import { bookingFormSchema, type BookingFormValues } from '../schema';
import type { BookingDetail, CreateBookingInput, UpdateBookingInput } from '../types';
import styles from './BookingFormDialog.module.css';

/** Giá trị điền sẵn khi tạo đơn từ lịch: click ô trống biết trước xe + khung giờ. */
export interface BookingPrefill {
  vehicleId: string;
  pickupAt: Dayjs;
  returnAt: Dayjs;
}

function numOrNull(value: string | null | undefined): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function toDefaults(
  editing: BookingDetail | null,
  prefill: BookingPrefill | null,
): BookingFormValues {
  if (!editing) {
    return {
      vehicleId: prefill?.vehicleId ?? '',
      customerName: '',
      customerPhone: '',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      pickupAt: prefill?.pickupAt ?? null,
      returnAt: prefill?.returnAt ?? null,
      baseAmount: null,
      deliveryFee: null,
      discountAmount: null,
      depositAmount: null,
      note: '',
    };
  }
  return {
    vehicleId: editing.vehicleId,
    customerName: editing.customerName,
    customerPhone: editing.customerPhone ?? '',
    serviceType: editing.serviceType as BookingFormValues['serviceType'],
    pickupAt: dayjs(editing.pickupAt),
    returnAt: dayjs(editing.returnAt),
    baseAmount: numOrNull(editing.baseAmount),
    deliveryFee: numOrNull(editing.deliveryFee),
    discountAmount: numOrNull(editing.discountAmount),
    depositAmount: numOrNull(editing.depositAmount),
    note: editing.note ?? '',
  };
}

/**
 * Tạo/sửa đơn thuê — modal lớn responsive (desktop rộng, mobile toàn màn).
 *
 * Thay drawer + hai DateTimePicker rời (bản cũ): khoảng thuê giờ là MỘT giá trị đi qua
 * `RentalDateTimeRangeField` — cùng control với modal yêu cầu đặt xe của khách, nên chủ xe và
 * khách chọn thời gian bằng cùng một cách. Form remount theo `key` để mỗi lần mở là state sạch.
 *
 * Đây là đơn CHỦ ĐỘNG của shop (staff nhập tay khách): tạo thẳng đơn `reserved`, KHÔNG đi qua
 * vòng yêu-cầu-rồi-tự-duyệt. Trùng lịch do exclusion constraint quyết (ADR 0006) — preview chỉ
 * là cảnh báo sớm.
 */
export function BookingFormDialog({
  open,
  editing,
  prefill = null,
  onClose,
}: {
  open: boolean;
  editing: BookingDetail | null;
  /** Điền sẵn khi tạo từ lịch (chỉ dùng khi `editing` null). */
  prefill?: BookingPrefill | null;
  onClose: () => void;
}) {
  // key gồm prefill để click ô lịch khác nhau thì form re-init đúng xe/giờ.
  const formKey =
    editing?.id ?? (prefill ? `new-${prefill.vehicleId}-${prefill.pickupAt.valueOf()}` : 'new');
  return (
    <ResponsiveDialog
      title={editing ? `Sửa đơn ${editing.code}` : 'Tạo đơn thuê'}
      size="xl"
      mobileMode="fullscreen"
      open={open}
      onClose={onClose}
      footer={null}
    >
      {open ? (
        <BookingForm key={formKey} editing={editing} prefill={prefill} onDone={onClose} />
      ) : null}
    </ResponsiveDialog>
  );
}

/** Cầu RHF ↔ RentalDateTimeRangeField: hai field pickupAt/returnAt là MỘT khoảng trên UI. */
function RentalRangeFormField({ control }: { control: Control<BookingFormValues> }) {
  const pickup = useController({ control, name: 'pickupAt' });
  const ret = useController({ control, name: 'returnAt' });
  const [mode, setMode] = useState<RentalMode>('daily');

  const error = pickup.fieldState.error?.message ?? ret.fieldState.error?.message;

  return (
    <Form.Item
      label="Thời gian thuê"
      required
      validateStatus={error ? 'error' : ''}
      help={error}
      style={{ marginBottom: 14 }}
    >
      <RentalDateTimeRangeField
        value={{ pickupAt: pickup.field.value, returnAt: ret.field.value }}
        onChange={(next) => {
          pickup.field.onChange(next.pickupAt);
          ret.field.onChange(next.returnAt);
        }}
        mode={mode}
        onModeChange={setMode}
        variant="labelled"
      />
    </Form.Item>
  );
}

function BookingForm({
  editing,
  prefill,
  onDone,
}: {
  editing: BookingDetail | null;
  prefill: BookingPrefill | null;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const formId = useId();
  const [conflict, setConflict] = useState(false);
  const { data: vehiclesData } = useVehicles({ limit: 100 });
  const create = useCreateBooking();
  const update = useUpdateBooking(editing?.id ?? '');

  const { control, handleSubmit } = useForm<BookingFormValues>({
    resolver: yupResolver(bookingFormSchema),
    defaultValues: toDefaults(editing, prefill),
  });

  const [base, delivery, discount] = useWatch({
    control,
    name: ['baseAmount', 'deliveryFee', 'discountAmount'],
  });
  const total = (base ?? 0) + (delivery ?? 0) - (discount ?? 0);

  // Preview trùng lịch (ADR 0006: chỉ cảnh báo sớm cho UX, KHÔNG chặn submit — chốt thật là
  // exclusion constraint ở DB). useQuery tự dedupe/cache theo khoá; khi sửa thì bỏ qua chính đơn.
  const [vehicleId, pickupAt, returnAt] = useWatch({
    control,
    name: ['vehicleId', 'pickupAt', 'returnAt'],
  });
  const canCheck = Boolean(vehicleId && pickupAt && returnAt && returnAt.isAfter(pickupAt));
  const conflictPreview = useQuery({
    queryKey: [
      'check-conflict',
      vehicleId,
      pickupAt?.toISOString(),
      returnAt?.toISOString(),
      editing?.id ?? null,
    ],
    queryFn: () =>
      checkConflict({
        vehicleId,
        startAt: pickupAt!.toISOString(),
        endAt: returnAt!.toISOString(),
        ...(editing?.id ? { excludeSourceId: editing.id } : {}),
      }),
    enabled: canCheck,
    staleTime: 10_000,
  });
  const previewConflict = canCheck && conflictPreview.data?.hasConflict === true;

  const vehicleOptions = (vehiclesData?.items ?? []).map((v) => ({
    value: v.id,
    label: v.plateNumber ? `${v.name} · ${v.plateNumber}` : v.name,
  }));

  const pending = create.isPending || update.isPending;

  const onSubmit = handleSubmit((values) => {
    setConflict(false);
    const shared = {
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone || undefined,
      serviceType: values.serviceType,
      pickupAt: values.pickupAt?.toISOString(),
      returnAt: values.returnAt?.toISOString(),
      baseAmount: String(values.baseAmount ?? 0),
      deliveryFee: String(values.deliveryFee ?? 0),
      discountAmount: String(values.discountAmount ?? 0),
      depositAmount: String(values.depositAmount ?? 0),
      note: values.note || undefined,
    };

    const onError = (error: unknown) => {
      if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
        setConflict(true);
      } else {
        message.error(getErrorMessage(error));
      }
    };

    if (editing) {
      update.mutate(shared as UpdateBookingInput, {
        onSuccess: () => {
          message.success('Đã cập nhật đơn');
          onDone();
        },
        onError,
      });
    } else {
      create.mutate({ vehicleId: values.vehicleId, ...shared } as CreateBookingInput, {
        onSuccess: () => {
          message.success('Đã tạo đơn thuê');
          onDone();
        },
        onError,
      });
    }
  });

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className={styles.form}>
      {conflict ? (
        <Alert
          type="error"
          showIcon
          className={styles.alert}
          message="Xe đã bận trong khung giờ này"
          description="Chọn xe khác hoặc đổi thời gian nhận/trả."
        />
      ) : previewConflict ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          message="Xe có thể đã bận khung giờ này"
          description="Cảnh báo sớm — hệ thống vẫn kiểm tra lại khi lưu."
        />
      ) : null}

      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={styles.sectionTitle}>Khách hàng &amp; chuyến đi</h3>
          <SelectField
            control={control}
            name="vehicleId"
            label="Xe"
            options={vehicleOptions}
            placeholder="Chọn xe"
            disabled={Boolean(editing)}
            showSearch
          />
          <TextField
            control={control}
            name="customerName"
            label="Tên khách"
            placeholder="Nguyễn Văn A"
          />
          <TextField
            control={control}
            name="customerPhone"
            label="Số điện thoại"
            placeholder="0901234567"
          />
          <SelectField
            control={control}
            name="serviceType"
            label="Loại dịch vụ"
            options={SERVICE_TYPE_OPTIONS}
          />
          <RentalRangeFormField control={control} />
          <TextAreaField control={control} name="note" label="Ghi chú" rows={3} maxLength={2000} />
        </div>

        <div className={styles.column}>
          <h3 className={styles.sectionTitle}>Chi phí &amp; đặt cọc</h3>
          <div className={styles.row}>
            <NumberField control={control} name="baseAmount" label="Tiền thuê" money min={0} />
            <NumberField control={control} name="deliveryFee" label="Phí giao xe" money min={0} />
          </div>
          <div className={styles.row}>
            <NumberField control={control} name="discountAmount" label="Giảm giá" money min={0} />
            <NumberField control={control} name="depositAmount" label="Tiền cọc" money min={0} />
          </div>
          <div className={styles.total}>
            <span>Tổng tiền</span>
            <strong>{formatMoneyVnd(String(Math.max(0, total)))}</strong>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Space>
          <Button onClick={onDone} disabled={pending}>
            Huỷ
          </Button>
          <Button type="primary" htmlType="submit" loading={pending}>
            {editing ? 'Lưu thay đổi' : 'Tạo đơn'}
          </Button>
        </Space>
      </div>
    </form>
  );
}
