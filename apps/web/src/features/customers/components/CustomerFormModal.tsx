'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App, Button, Space, Typography } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  API_ERROR_CODE,
  TENANT_CUSTOMER_SOURCE_LABEL,
  type TenantCustomerSource,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ApiClientError, getErrorCode, getErrorMessage } from '@/services/api-client';
import { useCreateCustomer, useUpdateCustomer } from '../hooks/use-customers';
import { customerFormSchema, type CustomerFormValues } from '../schema';
import type { DuplicatePhoneDetails, TenantCustomerDetail } from '../types';
import styles from './CustomerFormModal.module.css';

const EMPTY: CustomerFormValues = { fullName: '', phone: '', email: '', address: '' };

function toValues(customer: TenantCustomerDetail | null): CustomerFormValues {
  if (!customer) return EMPTY;
  return {
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email ?? '',
    address: customer.address ?? '',
  };
}

/** Id hồ sơ đang giữ SĐT trùng, nếu backend gửi kèm — để mở thẳng hồ sơ đó. */
function duplicateCustomerId(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const details = error.details as DuplicatePhoneDetails | undefined;
  return details?.customerId ?? null;
}

/**
 * Hồ sơ khách — MỘT dialog cho cả thêm lẫn sửa.
 *
 * Thân form chỉ render khi `open` và remount theo `key`: mỗi lần mở là state sạch (giá trị nhập
 * dở và lỗi trùng SĐT của lần trước không sống sót) mà KHÔNG cần effect nào đồng bộ lại — cùng
 * hình thái với `BookingFormDialog`.
 */
export function CustomerFormModal({
  open,
  customer,
  onClose,
  onOpenExisting,
}: {
  open: boolean;
  /** null = thêm mới; có giá trị = sửa hồ sơ đó. */
  customer: TenantCustomerDetail | null;
  onClose: () => void;
  onOpenExisting?: (customerId: string) => void;
}) {
  return (
    <ResponsiveDialog
      title={customer ? 'Sửa hồ sơ khách' : 'Thêm khách hàng'}
      open={open}
      size="md"
      onClose={onClose}
      footer={null}
    >
      {open ? (
        <CustomerForm
          key={customer?.id ?? 'new'}
          customer={customer}
          onDone={onClose}
          onOpenExisting={onOpenExisting}
        />
      ) : null}
    </ResponsiveDialog>
  );
}

/**
 * Trùng SĐT KHÔNG phải một lỗi validate thường: backend trả `CUSTOMER_PHONE_DUPLICATE` kèm id hồ
 * sơ đang giữ số đó, và ở đây nó thành một lối đi tiếp ("Mở hồ sơ đang có") thay vì một dòng đỏ
 * dẫn tới ngõ cụt. Hệ thống KHÔNG tự gộp hai hồ sơ — gộp khách là quyết định của người dùng, có
 * chủ đích, không phải hệ quả phụ của một lần gõ nhầm số.
 */
function CustomerForm({
  customer,
  onDone,
  onOpenExisting,
}: {
  customer: TenantCustomerDetail | null;
  onDone: () => void;
  onOpenExisting?: (customerId: string) => void;
}) {
  const { message } = App.useApp();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const saving = create.isPending || update.isPending;

  const [duplicate, setDuplicate] = useState<{ message: string; customerId: string | null } | null>(
    null,
  );

  const { control, handleSubmit } = useForm<CustomerFormValues>({
    resolver: yupResolver(customerFormSchema),
    defaultValues: toValues(customer),
  });

  const submit = handleSubmit((values) => {
    setDuplicate(null);
    const body = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      email: values.email.trim() || null,
      address: values.address.trim() || null,
    };
    const done = {
      onSuccess: () => {
        message.success(customer ? 'Đã cập nhật hồ sơ khách' : 'Đã thêm khách vào sổ');
        onDone();
      },
      onError: (err: unknown) => {
        if (getErrorCode(err) === API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE) {
          setDuplicate({ message: getErrorMessage(err), customerId: duplicateCustomerId(err) });
          return;
        }
        message.error(getErrorMessage(err));
      },
    };
    if (customer) update.mutate({ id: customer.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <DialogForm onSubmit={submit} labelWidth="lg">
      <TextField
        control={control}
        name="fullName"
        label="Họ và tên"
        placeholder="Nguyễn Văn An"
        required
      />
      <TextField
        control={control}
        name="phone"
        label="Số điện thoại"
        type="tel"
        placeholder="0901234567"
        autoComplete="tel"
        required
        help="Đây là cách hệ thống nhận ra khách quen — cùng một số chỉ có một hồ sơ trong gian hàng."
      />
      <TextField control={control} name="email" label="Email (không bắt buộc)" type="email" />
      <TextAreaField control={control} name="address" label="Địa chỉ (không bắt buộc)" rows={2} />

      {customer ? (
        <div className={styles.readonlyRow}>
          <span className={styles.readonlyLabel}>Nguồn hồ sơ</span>
          <span className={styles.readonlyValue}>
            {TENANT_CUSTOMER_SOURCE_LABEL[customer.source as TenantCustomerSource] ??
              customer.source}
          </span>
        </div>
      ) : null}

      {duplicate ? (
        <div className={styles.duplicate} role="alert">
          <Typography.Text strong>{duplicate.message}</Typography.Text>
          <p className={styles.duplicateHint}>
            Hai hồ sơ không được tự gộp lại. Hãy mở hồ sơ đang có để cập nhật, hoặc kiểm tra lại số
            điện thoại vừa nhập.
          </p>
          {duplicate.customerId && onOpenExisting ? (
            <Button
              type="primary"
              onClick={() => {
                onOpenExisting(duplicate.customerId as string);
                onDone();
              }}
            >
              Mở hồ sơ đang có
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Space>
          <Button onClick={onDone} disabled={saving}>
            Đóng
          </Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {customer ? 'Lưu' : 'Thêm khách'}
          </Button>
        </Space>
      </div>
    </DialogForm>
  );
}
