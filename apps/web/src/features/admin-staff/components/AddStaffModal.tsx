'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { PLATFORM_ROLE, PLATFORM_ROLE_VALUES } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { PLATFORM_ROLE_OPTIONS } from '../constants';
import { useAddStaff } from '../hooks/use-staff-mutations';

const schema = yup.object({
  email: yup.string().trim().required('Nhập email').email('Email không hợp lệ'),
  roleKey: yup.string().oneOf(PLATFORM_ROLE_VALUES).required('Chọn vai trò'),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm nhân sự theo email (user phải đã có tài khoản — mời-qua-email làm sau, cần SMTP).
 * Remount theo `open` để state form sạch mỗi lần mở.
 */
export function AddStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const add = useAddStaff();
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { email: '', roleKey: PLATFORM_ROLE.PLATFORM_STAFF },
  });

  const onSubmit = handleSubmit((values) => {
    add.mutate(
      { email: values.email.trim(), roleKey: values.roleKey },
      {
        onSuccess: () => {
          message.success('Đã thêm nhân sự');
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title="Thêm nhân sự nền tảng"
      open={open}
      onClose={onClose}
      okText="Thêm"
      onOk={() => void onSubmit()}
      confirmLoading={add.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="sm">
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          placeholder="nhanvien@xeprime.vn"
        />
        <SelectField control={control} name="roleKey" label="Vai trò" options={PLATFORM_ROLE_OPTIONS} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
