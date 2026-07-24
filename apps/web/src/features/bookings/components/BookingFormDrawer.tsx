'use client';

import { Alert, App, Button, Drawer } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { API_ERROR_CODE, SERVICE_TYPE } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { dayjs } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { Dayjs } from 'dayjs';
import { SERVICE_TYPE_OPTIONS } from '../constants';
import { useCreateBooking, useUpdateBooking } from '../hooks/use-booking-mutations';
import { bookingFormSchema, type BookingFormValues } from '../schema';
import type { BookingDetail, CreateBookingInput, UpdateBookingInput } from '../types';
import styles from './BookingFormDrawer.module.css';

/** Giá trị điền sẵn khi tạo đơn từ lịch: click ô trống biết trước xe + khung giờ. */
export interface BookingPrefill {
  vehicleId: string;
  pickupAt: Dayjs;
  returnAt: Dayjs;
}

function numOrNull(value: string | null | undefined): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function toDefaults(editing: BookingDetail | null, prefill: BookingPrefill | null): BookingFormValues {
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

/** Drawer bọc form — remount form theo `key` để mỗi lần mở là state sạch (không cần reset effect). */
export function BookingFormDrawer({
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
  const formKey = editing?.id ?? (prefill ? `new-${prefill.vehicleId}-${prefill.pickupAt.valueOf()}` : 'new');
  return (
    <Drawer
      title={editing ? `Sửa đơn ${editing.code}` : 'Tạo đơn thuê'}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {open ? <BookingForm key={formKey} editing={editing} prefill={prefill} onDone={onClose} /> : null}
    </Drawer>
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
    <form onSubmit={onSubmit} noValidate>
      {conflict ? (
        <Alert
          type="error"
          showIcon
          className={styles.alert}
          message="Xe đã bận trong khung giờ này"
          description="Chọn xe khác hoặc đổi thời gian nhận/trả."
        />
      ) : null}

      <SelectField
        control={control}
        name="vehicleId"
        label="Xe"
        options={vehicleOptions}
        placeholder="Chọn xe"
        disabled={Boolean(editing)}
      />
      <TextField control={control} name="customerName" label="Tên khách" placeholder="Nguyễn Văn A" />
      <TextField control={control} name="customerPhone" label="Số điện thoại" placeholder="0901234567" />
      <SelectField
        control={control}
        name="serviceType"
        label="Loại dịch vụ"
        options={SERVICE_TYPE_OPTIONS}
      />

      <div className={styles.row}>
        <DateTimeField control={control} name="pickupAt" label="Nhận xe" placeholder="Chọn giờ nhận" />
        <DateTimeField control={control} name="returnAt" label="Trả xe" placeholder="Chọn giờ trả" />
      </div>

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

      <TextAreaField control={control} name="note" label="Ghi chú" rows={3} maxLength={2000} />

      <div className={styles.actions}>
        <Button onClick={onDone}>Huỷ</Button>
        <Button type="primary" htmlType="submit" loading={pending}>
          {editing ? 'Lưu thay đổi' : 'Tạo đơn'}
        </Button>
      </div>
    </form>
  );
}
