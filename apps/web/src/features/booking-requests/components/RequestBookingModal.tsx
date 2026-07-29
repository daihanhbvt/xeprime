'use client';

import { App, Button, Modal } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { PhoneVerifyControl } from '@/features/phone-verification/components/PhoneVerifyControl';
import { getErrorMessage } from '@/services/api-client';
import { submitBookingRequest } from '../api';
import { requestFormSchema, type RequestFormValues } from '../schema';
import styles from './RequestBookingModal.module.css';

const DEFAULTS: RequestFormValues = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  pickupAt: null,
  returnAt: null,
  note: '',
};

/**
 * Modal khách gửi yêu cầu thuê một xe trên marketplace (công khai, không cần đăng nhập).
 * Gửi xong shop sẽ duyệt và tạo đơn — modal chỉ tạo YÊU CẦU, không giữ chỗ lịch.
 */
export function RequestBookingModal({
  vehicleId,
  vehicleName,
  open,
  onClose,
}: {
  vehicleId: string;
  vehicleName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [phoneVerified, setPhoneVerified] = useState(false);
  const { control, handleSubmit, reset } = useForm<RequestFormValues>({
    resolver: yupResolver(requestFormSchema),
    defaultValues: DEFAULTS,
  });

  const submit = useMutation({
    mutationFn: submitBookingRequest,
    onSuccess: () => {
      message.success('Đã gửi yêu cầu — gian hàng sẽ liên hệ xác nhận sớm.');
      reset(DEFAULTS);
      onClose();
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const onSubmit = handleSubmit((values) => {
    submit.mutate({
      vehicleId,
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone,
      customerEmail: values.customerEmail || undefined,
      pickupAt: values.pickupAt?.toISOString() ?? '',
      returnAt: values.returnAt?.toISOString() ?? '',
      note: values.note || undefined,
    });
  });

  return (
    <Modal
      title={`Yêu cầu thuê · ${vehicleName}`}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField control={control} name="customerName" label="Họ tên" placeholder="Nguyễn Văn A" />
        <PhoneVerifyControl
          control={control}
          name="customerPhone"
          purpose={PHONE_VERIFICATION_PURPOSE.BOOKING}
          onVerifiedChange={setPhoneVerified}
        />
        <TextField control={control} name="customerEmail" label="Email (tuỳ chọn)" placeholder="ban@email.com" />
        <div className={styles.row}>
          <DateTimeField control={control} name="pickupAt" label="Nhận xe" placeholder="Chọn giờ nhận" />
          <DateTimeField control={control} name="returnAt" label="Trả xe" placeholder="Chọn giờ trả" />
        </div>
        <TextAreaField control={control} name="note" label="Ghi chú" rows={2} maxLength={2000} />

        <div className={styles.actions}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={submit.isPending}
            disabled={!phoneVerified}
            title={phoneVerified ? undefined : 'Xác thực số điện thoại trước khi gửi'}
          >
            Gửi yêu cầu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
