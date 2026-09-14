'use client';

import { App, Button, Space, Typography } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { API_ERROR_CODE } from '@xeprime/types';
import { guessAddressLine } from '@xeprime/domain';
import { AddressField } from '@/components/form/AddressField';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { duplicateCustomerId } from '../api';
import { useCreateCustomer, useUpdateCustomer } from '../hooks/use-customers';
import { customerFormSchema, type CustomerFormValues } from '../schema';
import type { TenantCustomerDetail } from '../types';
import styles from './CustomerFormModal.module.css';

const EMPTY: CustomerFormValues = {
  fullName: '',
  phone: '',
  email: '',
  provinceCode: '',
  wardCode: '',
  addressLine: '',
};

function toValues(customer: TenantCustomerDetail | null): CustomerFormValues {
  if (!customer) return EMPTY;
  return {
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email ?? '',
    provinceCode: customer.location?.provinceCode ?? '',
    wardCode: customer.location?.wardCode ?? '',
    /*
     * Hồ sơ CŨ chỉ có chuỗi địa chỉ tự do: đoán phần "số nhà, đường" bằng cách cắt các cụm trông
     * như đơn vị hành chính. GỢI Ý cho ô nhập, không phải dữ liệu tự lưu — nhân viên nhìn và sửa.
     */
    addressLine: customer.location?.addressLine ?? guessAddressLine(customer.address),
  };
}

/**
 * Tên ba trường địa chỉ trong `customerFormSchema`.
 *
 * KHÔNG truyền `pin`: địa chỉ khách ở sổ khách là để LIÊN HỆ, hệ thống không tính khoảng cách
 * hay điều xe tới nó. Bắt nhân viên xác nhận một cái ghim mà không ai dùng là thêm một bước vô
 * nghĩa, và mỗi lượt tra bản đồ là một request có tính tiền.
 */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;

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
  const t = useTranslations('Customers.form');

  return (
    <ResponsiveDialog
      title={customer ? t('editTitle') : t('addTitle')}
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
  const t = useTranslations('Customers.form');
  const tCustomers = useTranslations('Customers');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const saving = create.isPending || update.isPending;

  const [duplicate, setDuplicate] = useState<{ message: string; customerId: string | null } | null>(
    null,
  );

  const resolver = useValidationResolver<CustomerFormValues>(
    customerFormSchema,
    'Customers.validation',
  );
  const { control, handleSubmit } = useForm<CustomerFormValues>({
    resolver,
    defaultValues: toValues(customer),
  });

  const submit = handleSubmit((values) => {
    setDuplicate(null);
    const body = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      email: values.email.trim() || null,
      // Chuỗi hiển thị do SERVER ghép từ ba mảnh — client không gửi `address` lên nữa.
      provinceCode: values.provinceCode || undefined,
      wardCode: values.wardCode || undefined,
      addressLine: values.addressLine.trim() || undefined,
    };
    const done = {
      onSuccess: () => {
        message.success(customer ? t('updated') : t('created'));
        onDone();
      },
      onError: (err: unknown) => {
        if (getErrorCode(err) === API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE) {
          /*
           * NGOẠI LỆ có chủ đích với luật "dịch lỗi từ MÃ": câu của backend mang TÊN hồ sơ đang
           * giữ số đó ("…đã thuộc hồ sơ \"Nguyễn Văn An\"…"), và bảng dịch không thể có dữ liệu
           * đó. Dịch theo mã ở đây biến một câu chỉ đúng chỗ cần sửa thành một câu chung chung.
           * Cùng lập luận với `useErrorMessage` của app native. Phần giải thích quanh nó vẫn dịch.
           */
          setDuplicate({ message: getErrorMessage(err), customerId: duplicateCustomerId(err) });
          return;
        }
        message.error(errorMessage(err));
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
        label={t('fullName')}
        placeholder={t('fullNamePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="phone"
        label={t('phone')}
        type="tel"
        placeholder={t('phonePlaceholder')}
        autoComplete="tel"
        required
        help={t('phoneHelp')}
      />
      <TextField control={control} name="email" label={t('email')} type="email" />
      {/*
        Địa chỉ khách KHÔNG bắt buộc: sổ khách hay được điền nhanh lúc lập đơn và địa chỉ ở đó
        chủ yếu để liên hệ — bắt chọn hai cấp hành chính cho một ô phụ là cản trở việc chính.
      */}
      <AddressField control={control} names={ADDRESS_FIELD_NAMES} title={t('address')} />

      {customer ? (
        <div className={styles.readonlyRow}>
          <span className={styles.readonlyLabel}>{tCustomers('detail.source')}</span>
          <span className={styles.readonlyValue}>
            {domainLabel('tenantCustomerSource', customer.source)}
          </span>
        </div>
      ) : null}

      {duplicate ? (
        <div className={styles.duplicate} role="alert">
          <Typography.Text strong>{duplicate.message}</Typography.Text>
          <p className={styles.duplicateHint}>{t('duplicateHint')}</p>
          {duplicate.customerId && onOpenExisting ? (
            <Button
              type="primary"
              onClick={() => {
                onOpenExisting(duplicate.customerId as string);
                onDone();
              }}
            >
              {t('duplicateOpen')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Space>
          <Button onClick={onDone} disabled={saving}>
            {tCommon('actions.close')}
          </Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {customer ? t('submitEdit') : t('submitAdd')}
          </Button>
        </Space>
      </div>
    </DialogForm>
  );
}
