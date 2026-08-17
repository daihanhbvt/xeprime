'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { DRIVER_TYPE, DRIVER_TYPE_LABEL, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { useCreateDriver, useUpdateDriver } from '../hooks/use-drivers';
import { driverFormSchema, type DriverFormValues } from '../schema';
import type { Driver } from '../types';

const DRIVER_TYPE_OPTIONS = DRIVER_TYPE_VALUES.map((value) => ({
  value,
  label: DRIVER_TYPE_LABEL[value],
}));

const EMPTY: DriverFormValues = {
  name: '',
  phone: '',
  driverType: DRIVER_TYPE.STAFF,
  licenseNo: '',
  idNo: '',
  note: '',
};

function toValues(driver: Driver): DriverFormValues {
  return {
    name: driver.name,
    phone: driver.phone,
    driverType: (driver.driverType as DriverFormValues['driverType']) ?? DRIVER_TYPE.STAFF,
    licenseNo: driver.licenseNo ?? '',
    idNo: driver.idNo ?? '',
    note: driver.note ?? '',
  };
}

/**
 * Hồ sơ tài xế — MỘT dialog cho cả thêm lẫn sửa (17/08, mức tối thiểu: hồ sơ + gán vào đơn).
 * Đổi trạng thái hoạt động/xoá nằm ở hàng bảng, không nhét vào form.
 */
export function DriverFormModal({
  open,
  driver,
  onClose,
}: {
  open: boolean;
  /** null = thêm mới; có giá trị = sửa hồ sơ đó. */
  driver: Driver | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const saving = create.isPending || update.isPending;

  const { control, handleSubmit, reset } = useForm<DriverFormValues>({
    resolver: yupResolver(driverFormSchema),
    defaultValues: EMPTY,
  });

  // Mỗi lần mở nạp lại đúng hồ sơ đang sửa (hoặc form trống) — bỏ dở lần trước không để lại rác.
  useEffect(() => {
    if (open) reset(driver ? toValues(driver) : EMPTY);
  }, [open, driver, reset]);

  const submit = handleSubmit((values) => {
    const body = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      driverType: values.driverType,
      licenseNo: values.licenseNo.trim() || null,
      idNo: values.idNo.trim() || null,
      note: values.note.trim() || null,
    };
    const done = {
      onSuccess: () => {
        message.success(driver ? 'Đã cập nhật tài xế' : 'Đã thêm tài xế');
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={driver ? 'Sửa hồ sơ tài xế' : 'Thêm tài xế'}
      open={open}
      size="sm"
      okText={driver ? 'Lưu' : 'Thêm'}
      cancelText="Đóng"
      confirmLoading={saving}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <TextField control={control} name="name" label="Họ và tên" placeholder="Trần Văn B" />
      <TextField
        control={control}
        name="phone"
        label="Số điện thoại"
        placeholder="0901234567"
        autoComplete="tel"
      />
      <SelectField
        control={control}
        name="driverType"
        label="Loại tài xế"
        options={DRIVER_TYPE_OPTIONS}
      />
      <TextField control={control} name="licenseNo" label="Số GPLX (không bắt buộc)" />
      <TextField control={control} name="idNo" label="Số CCCD (không bắt buộc)" />
      <TextAreaField control={control} name="note" label="Ghi chú" rows={3} />
    </ResponsiveDialog>
  );
}
