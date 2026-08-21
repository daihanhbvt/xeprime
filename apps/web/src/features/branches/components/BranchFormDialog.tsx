'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button } from 'antd';
import { useForm } from 'react-hook-form';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';
import type { Branch } from '../types';
import styles from './BranchFormDialog.module.css';

/**
 * Thêm/sửa chi nhánh — dùng `ResponsiveDialog` chung (modal ở desktop, drawer đáy ở mobile), nên
 * không có một hộp thoại thứ hai trong repo làm cùng việc.
 *
 * Tỉnh/thành là trường BẮT BUỘC và lấy từ API danh mục, không hardcode: đây là thứ quyết định xe
 * của chi nhánh hiện ở đâu trên marketplace.
 */
export function BranchFormDialog({
  open,
  branch,
  onClose,
}: {
  open: boolean;
  /** Có = sửa, không = tạo mới. */
  branch: Branch | null;
  onClose: () => void;
}) {
  const provinces = useProvinceOptions();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const submitting = create.isPending || update.isPending;

  const { control, handleSubmit } = useForm<BranchFormValues>({
    resolver: yupResolver(branchFormSchema),
    defaultValues: {
      name: branch?.name ?? '',
      provinceCode: branch?.provinceCode ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      provinceCode: values.provinceCode,
      address: values.address || undefined,
      phone: values.phone || undefined,
    };
    // `mutateAsync` + try/catch: đóng hộp thoại CHỈ khi lưu thành công. Đóng trước rồi báo lỗi
    // sau là người dùng mất hết dữ liệu vừa nhập.
    try {
      if (branch) await update.mutateAsync({ id: branch.id, ...payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch {
      // Thông báo lỗi do hook mutation hiển thị; giữ nguyên form để sửa và gửi lại.
    }
  });

  return (
    <ResponsiveDialog
      title={branch ? `Sửa ${branch.name}` : 'Thêm chi nhánh'}
      open={open}
      onClose={onClose}
      okText={branch ? 'Lưu' : 'Tạo chi nhánh'}
      onOk={() => void onSubmit()}
      confirmLoading={submitting}
    >
      {branch?.needsLocationReview ? (
        <Alert
          type="warning"
          showIcon
          className={styles.notice}
          message="Chi nhánh này chưa có tỉnh/thành"
          description={
            branch.legacyProvinceValue
              ? `Dữ liệu cũ ghi "${branch.legacyProvinceValue}" — chọn tỉnh/thành tương ứng để xe của chi nhánh hiển thị lại trên marketplace.`
              : 'Chọn tỉnh/thành để xe của chi nhánh hiển thị trên marketplace.'
          }
        />
      ) : null}

      {provinces.isError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.notice}
          message="Không tải được danh sách tỉnh/thành"
          action={
            <Button size="small" onClick={provinces.refetch}>
              Thử lại
            </Button>
          }
        />
      ) : null}

      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="name"
          label="Tên chi nhánh"
          placeholder="VD: Chi nhánh Đà Nẵng"
          autoFocus
        />
        <SelectField
          control={control}
          name="provinceCode"
          label="Tỉnh/thành"
          required
          showSearch
          options={provinces.options}
          disabled={provinces.isLoading || provinces.isError}
          placeholder={provinces.isLoading ? 'Đang tải tỉnh/thành…' : 'Chọn tỉnh/thành'}
          help="Quyết định xe của chi nhánh hiển thị ở tỉnh/thành nào trên marketplace."
        />
        <TextField
          control={control}
          name="address"
          label="Địa chỉ"
          placeholder="Số nhà, đường, phường/xã"
        />
        <TextField control={control} name="phone" label="Số điện thoại" placeholder="0901234567" />
      </DialogForm>
    </ResponsiveDialog>
  );
}
