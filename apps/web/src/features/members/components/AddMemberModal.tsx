'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { TENANT_ROLE, TENANT_ROLE_VALUES } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { ASSIGNABLE_ROLE_OPTIONS } from '../constants';
import { useAddMember } from '../hooks/use-member-mutations';

const schema = yup.object({
  email: yup.string().trim().required('Nhập email').email('Email không hợp lệ'),
  roleKey: yup
    .string()
    .oneOf(TENANT_ROLE_VALUES.filter((r) => r !== TENANT_ROLE.SHOP_OWNER))
    .required('Chọn vai trò'),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm thành viên theo email (user phải đã có tài khoản — mời-qua-email làm sau, cần SMTP).
 * Remount theo `open` để state form sạch mỗi lần mở.
 */
export function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const add = useAddMember();
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { email: '', roleKey: TENANT_ROLE.SHOP_STAFF },
  });

  const onSubmit = handleSubmit((values) => {
    add.mutate(
      { email: values.email.trim(), roleKey: values.roleKey },
      {
        onSuccess: () => {
          message.success('Đã thêm thành viên');
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title="Thêm thành viên"
      open={open}
      onClose={onClose}
      size="sm"
      okText="Thêm"
      onOk={() => void onSubmit()}
      confirmLoading={add.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="sm">
        <TextField control={control} name="email" label="Email" type="email" placeholder="nhanvien@congty.vn" />
        <SelectField control={control} name="roleKey" label="Vai trò" options={ASSIGNABLE_ROLE_OPTIONS} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
