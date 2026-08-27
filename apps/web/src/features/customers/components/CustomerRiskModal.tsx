'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { TENANT_CUSTOMER_RISK_LEVEL, type TenantCustomerRiskLevel } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { CUSTOMER_HINTS, RISK_LEVEL_OPTIONS } from '../constants';
import { useUpdateCustomerRisk } from '../hooks/use-customers';
import { customerRiskSchema, type CustomerRiskFormValues } from '../schema';
import type { TenantCustomerDetail } from '../types';
import styles from './CustomerRiskModal.module.css';

/**
 * Đổi mức rủi ro của khách.
 *
 * Hộp thoại nói rõ HỆ QUẢ trước khi bấm, vì hai mức có ý nghĩa vận hành khác hẳn nhau và người
 * dùng không có cách nào đoán ra từ tên: `watchlist` chỉ nhắc người trực, `blocked` chặn yêu cầu
 * và đơn MỚI. Lý do bắt buộc — sáu tháng sau, một hồ sơ bị chặn không kèm lý do là một quyết
 * định không ai dám gỡ và cũng không ai giải thích được.
 */
export function CustomerRiskModal({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: TenantCustomerDetail | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const mutation = useUpdateCustomerRisk();

  const { control, handleSubmit, reset } = useForm<CustomerRiskFormValues>({
    resolver: yupResolver(customerRiskSchema),
    defaultValues: { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL, reason: '' },
  });
  const riskLevel = useWatch({ control, name: 'riskLevel' });

  useEffect(() => {
    if (open && customer) {
      reset({
        riskLevel: customer.riskLevel as TenantCustomerRiskLevel,
        reason: customer.riskReason ?? '',
      });
    }
  }, [open, customer, reset]);

  const submit = handleSubmit((values) => {
    if (!customer) return;
    mutation.mutate(
      {
        id: customer.id,
        body: {
          riskLevel: values.riskLevel,
          reason: values.reason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          message.success('Đã cập nhật mức rủi ro của khách');
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title="Đánh dấu mức rủi ro"
      open={open}
      size="sm"
      okText="Lưu"
      cancelText="Đóng"
      destructive={riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED}
      confirmLoading={mutation.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="md">
        <SelectField
          control={control}
          name="riskLevel"
          label="Mức rủi ro"
          options={RISK_LEVEL_OPTIONS}
        />
        <p className={styles.hint}>{CUSTOMER_HINTS.riskLevel}</p>
        <TextAreaField
          control={control}
          name="reason"
          label={
            riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL ? 'Ghi chú (không bắt buộc)' : 'Lý do'
          }
          rows={3}
          placeholder="Ví dụ: trả xe muộn 2 lần, không liên lạc được ngày 12/08"
        />
        <p className={styles.hint}>
          Lý do chỉ hiển thị trong gian hàng của bạn. Khách không bao giờ nhìn thấy nội dung này, và
          yêu cầu bị từ chối chỉ nhận được thông báo trung tính.
        </p>
      </DialogForm>
    </ResponsiveDialog>
  );
}
