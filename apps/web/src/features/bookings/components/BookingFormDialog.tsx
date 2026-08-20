'use client';

import { Alert, App, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useController, useForm, useWatch, type Control } from 'react-hook-form';
import { API_ERROR_CODE, ROUTE_TYPE, ROUTE_TYPE_VALUES, SERVICE_TYPE } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { dayjs } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { SERVICE_TYPE_OPTIONS } from '../constants';
import { checkConflict } from '../api';
import { useCreateBooking, useUpdateBooking } from '../hooks/use-booking-mutations';
import { bookingFormSchema, type BookingFormValues } from '../schema';
import type { BookingDetail, CreateBookingInput, UpdateBookingInput } from '../types';
import styles from './BookingFormDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

function numOrNull(value: string | null | undefined): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function toDefaults(editing: BookingDetail | null): BookingFormValues {
  if (!editing) {
    return {
      vehicleId: '',
      customerName: '',
      customerPhone: '',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '',
      destination: '',
      pickupAt: null,
      returnAt: null,
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
    routeType: (editing.routeType ?? ROUTE_TYPE.IN_CITY) as BookingFormValues['routeType'],
    pickupAddress: editing.pickupAddress ?? '',
    destination: editing.destination ?? '',
    pickupAt: dayjs(editing.pickupAt),
    returnAt: dayjs(editing.returnAt),
    baseAmount: numOrNull(editing.baseAmount),
    // Phí giao nhận KHÔNG sửa ở form này — xem docblock component. Giữ nguyên giá trị đang lưu.
    deliveryFee: numOrNull(editing.deliveryFee),
    discountAmount: numOrNull(editing.discountAmount),
    depositAmount: numOrNull(editing.depositAmount),
    note: editing.note ?? '',
  };
}

/**
 * SỬA đơn thuê.
 *
 * TẠO đơn KHÔNG đi qua đây: mọi lối tạo thủ công (lịch · danh sách đơn · hồ sơ khách) dùng
 * `StaffBookingDialog` — cùng giao diện với luồng thuê xe của khách, kèm báo giá từ server. Form
 * này ở lại cho việc SỬA một đơn đã có, nơi xe và khách đã cố định.
 *
 * **Khổ `lg` một cột, dựng trên `DialogForm` (20/08).** Bản trước là modal `xl` hai cột tự dựng
 * lấy: nó vừa lạc lõng (10 hộp CRUD khác trong kho đều dùng `DialogForm`), vừa HỎNG — thân của
 * `xl` là `overflow: hidden` vì khổ đó sinh ra cho bố cục hai cột tự cuộn riêng, nên ở màn thấp
 * phần dưới của form (ghi chú, tổng tiền, cả hàng nút Lưu) bị cắt cụt và không cuộn tới được.
 *
 * **Phí giao nhận cố ý KHÔNG có ở đây.** Nó là con số hai bên thoả thuận ngoài ứng dụng rồi ghi
 * lại, và việc ghi lại đi kèm ghi chú nội bộ vào audit (`UpdateDeliveryFeeModal`). Để nó thành
 * một ô lẫn giữa các ô khác là mở đường ghi thứ hai cho cùng một cột, và đường đó mất lý do sửa.
 * Chỗ sửa đứng ngay cạnh con số ở khối "Tổng hợp chi phí".
 *
 * Khoảng thuê là MỘT giá trị đi qua `RentalDateTimeRangeField` — cùng control với luồng đặt xe
 * của khách, nên chủ xe và khách chọn thời gian bằng cùng một cách. Form remount theo `key` để
 * mỗi lần mở là state sạch. Trùng lịch do exclusion constraint quyết (ADR 0006) — preview ở đây
 * chỉ là cảnh báo sớm.
 */
export function BookingFormDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: BookingDetail | null;
  onClose: () => void;
}) {
  // Chỉ dựng khi mở → mỗi lần mở là state sạch, không cần reset trong effect.
  if (!open) return null;
  return <BookingForm key={editing?.id ?? 'new'} editing={editing} onDone={onClose} />;
}

/** Cầu RHF ↔ RentalDateTimeRangeField: hai field pickupAt/returnAt là MỘT khoảng trên UI. */
function RentalRangeFormField({ control }: { control: Control<BookingFormValues> }) {
  const pickup = useController({ control, name: 'pickupAt' });
  const ret = useController({ control, name: 'returnAt' });
  const [mode, setMode] = useState<RentalMode>('daily');

  const error = pickup.fieldState.error?.message ?? ret.fieldState.error?.message;

  return (
    <Form.Item label="Thời gian thuê" required validateStatus={error ? 'error' : ''} help={error}>
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

function BookingForm({ editing, onDone }: { editing: BookingDetail | null; onDone: () => void }) {
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const { message } = App.useApp();
  const formId = useId();
  const [conflict, setConflict] = useState(false);
  const { data: vehiclesData } = useVehicles({ limit: 100 });
  const create = useCreateBooking();
  const update = useUpdateBooking(editing?.id ?? '');

  const { control, handleSubmit } = useForm<BookingFormValues>({
    resolver: yupResolver(bookingFormSchema),
    defaultValues: toDefaults(editing),
  });

  const [base, delivery, discount] = useWatch({
    control,
    name: ['baseAmount', 'deliveryFee', 'discountAmount'],
  });
  const total = (base ?? 0) + (delivery ?? 0) - (discount ?? 0);
  const [watchedServiceType, watchedRouteType] = useWatch({
    control,
    name: ['serviceType', 'routeType'],
  });

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
    const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
    const shared = {
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone || undefined,
      serviceType: values.serviceType,
      pickupAt: values.pickupAt!.toISOString(),
      returnAt: values.returnAt!.toISOString(),
      baseAmount: values.baseAmount === null ? undefined : String(values.baseAmount),
      deliveryFee: values.deliveryFee === null ? undefined : String(values.deliveryFee),
      discountAmount: values.discountAmount === null ? undefined : String(values.discountAmount),
      depositAmount: values.depositAmount === null ? undefined : String(values.depositAmount),
      note: values.note?.trim() || undefined,
      ...(withDriver
        ? {
            routeType: values.routeType,
            pickupAddress: values.pickupAddress?.trim() || undefined,
            ...(values.routeType !== ROUTE_TYPE.IN_CITY && values.destination?.trim()
              ? { destination: values.destination.trim() }
              : {}),
          }
        : {}),
    };

    const onError = (err: unknown) => {
      if (getErrorCode(err) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
        setConflict(true);
        return;
      }
      message.error(getErrorMessage(err));
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
    <ResponsiveDialog
      title={editing ? `Sửa đơn ${editing.code}` : 'Tạo đơn thuê'}
      size="lg"
      open
      onClose={onDone}
      okText={editing ? 'Lưu thay đổi' : 'Tạo đơn'}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm id={formId} onSubmit={onSubmit} labelWidth="md">
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

        {/* Hành trình chuyến CÓ TÀI XẾ — server validate lại cùng bộ luật (route-context). */}
        {watchedServiceType === SERVICE_TYPE.WITH_DRIVER ? (
          <>
            <SelectField
              control={control}
              name="routeType"
              label="Lộ trình"
              options={ROUTE_TYPE_VALUES.map((value) => ({
                value,
                label: dl('routeType', value),
              }))}
            />
            <TextField
              control={control}
              name="pickupAddress"
              label="Địa chỉ đón khách"
              placeholder="123 Lê Lợi, Q.1, TP.HCM"
            />
            {watchedRouteType !== ROUTE_TYPE.IN_CITY ? (
              <TextField
                control={control}
                name="destination"
                label="Điểm đến"
                placeholder="TP. Đà Lạt, Lâm Đồng"
              />
            ) : null}
          </>
        ) : null}

        <RentalRangeFormField control={control} />

        <NumberField control={control} name="baseAmount" label="Tiền thuê" money min={0} />
        <NumberField control={control} name="discountAmount" label="Giảm giá" money min={0} />
        <NumberField control={control} name="depositAmount" label="Tiền cọc" money min={0} />

        {/*
          Tổng là số SUY RA, không phải một ô nhập — nên nó là một hàng tổng kết, không đứng
          trong hàng nhãn/ô của form. Server vẫn tính lại khi lưu (ADR 0007).
        */}
        <div className={styles.total}>
          <span>Tổng tiền</span>
          <strong>{fmt.money(String(Math.max(0, total)))}</strong>
        </div>

        <TextAreaField control={control} name="note" label="Ghi chú" rows={3} maxLength={2000} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
