'use client';

import { App, Button, Modal } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { useCreatePlan, useUpdatePlan } from '../hooks/use-plan-mutations';
import type { Plan } from '../types';
import styles from './PlanFormModal.module.css';

/** Số ở form là `number | null` (khớp NumberField) — pattern như `recordPaymentSchema`. */
const schema = yup.object({
  code: yup
    .string()
    .trim()
    .required('Nhập mã gói')
    .matches(/^[a-z0-9][a-z0-9_-]{1,49}$/, 'Chỉ chữ thường/số/gạch, 2-50 ký tự'),
  name: yup.string().trim().required('Nhập tên gói').max(255),
  description: yup.string().trim().max(2000).default(''),
  price: yup
    .number()
    .typeError('Nhập giá')
    .nullable()
    .defined()
    .min(0, 'Giá không âm')
    .max(999_999_999_999, 'Giá quá lớn')
    .test('required', 'Nhập giá', (v) => v != null),
  durationDays: yup
    .number()
    .typeError('Nhập số ngày')
    .nullable()
    .defined()
    .integer('Số nguyên')
    .min(1, 'Ít nhất 1 ngày')
    .max(3660, 'Tối đa 3660 ngày')
    .test('required', 'Nhập số ngày', (v) => v != null),
  maxVehicles: yup.number().nullable().defined().integer('Số nguyên').min(1, 'Ít nhất 1 xe'),
  sortOrder: yup.number().nullable().defined().integer('Số nguyên'),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Tạo/sửa gói. Sửa thì `code` bị khoá (định danh, ADR 0010); tiền nhập number ở form và hoá
 * string khi gửi API (ADR 0007). Remount theo `open` để form sạch mỗi lần mở.
 */
export function PlanFormModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa gói đó. */
  plan: Plan | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const isEdit = Boolean(plan);
  const pending = create.isPending || update.isPending;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: plan
      ? {
          code: plan.code,
          name: plan.name,
          description: plan.description ?? '',
          price: Number(plan.price),
          durationDays: plan.durationDays,
          maxVehicles: plan.maxVehicles,
          sortOrder: plan.sortOrder,
        }
      : {
          code: '',
          name: '',
          description: '',
          price: null,
          durationDays: 30,
          maxVehicles: null,
          sortOrder: 0,
        },
  });

  const onSubmit = handleSubmit((values) => {
    const shared = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      // Schema đã bắt buộc price/durationDays != null (test 'required').
      price: String(values.price),
      durationDays: values.durationDays as number,
      maxVehicles: values.maxVehicles ?? null,
      sortOrder: values.sortOrder ?? 0,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? 'Đã cập nhật gói' : 'Đã tạo gói');
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
    };
    if (plan) update.mutate({ id: plan.id, ...shared }, done);
    else create.mutate({ code: values.code.trim(), ...shared }, done);
  });

  return (
    <Modal
      title={isEdit ? `Sửa gói: ${plan?.name}` : 'Tạo gói dịch vụ'}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <form onSubmit={onSubmit} noValidate>
        {!isEdit ? (
          <TextField control={control} name="code" label="Mã gói" placeholder="basic" />
        ) : null}
        <TextField control={control} name="name" label="Tên gói" placeholder="Gói Cơ bản" />
        <TextAreaField control={control} name="description" label="Mô tả" rows={2} />
        <NumberField control={control} name="price" label="Giá / chu kỳ" money min={0} />
        <NumberField control={control} name="durationDays" label="Số ngày / chu kỳ" min={1} max={3660} addonAfter="ngày" />
        <NumberField
          control={control}
          name="maxVehicles"
          label="Giới hạn số xe (bỏ trống = không giới hạn)"
          min={1}
          addonAfter="xe"
        />
        <NumberField control={control} name="sortOrder" label="Thứ tự hiển thị" />
        <div className={styles.actions}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" htmlType="submit" loading={pending}>
            {isEdit ? 'Lưu' : 'Tạo gói'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
