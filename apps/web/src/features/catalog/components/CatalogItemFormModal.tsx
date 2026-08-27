'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  CATALOG_KEY_PATTERN,
  CATALOG_TYPES_WITH_ICON,
  CATALOG_TYPE_LABEL,
  type CatalogType,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { useCreateCatalogItem, useUpdateCatalogItem } from '../use-admin-catalog';
import type { CatalogItemAdmin } from '../types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './CatalogItemFormModal.module.css';

const schema = yup.object({
  key: yup
    .string()
    .trim()
    .required('Nhập mã')
    .matches(CATALOG_KEY_PATTERN, 'Chỉ chữ thường không dấu, số, gạch ngang hoặc gạch dưới'),
  label: yup.string().trim().required('Nhập tên hiển thị').max(120),
  description: yup.string().trim().max(255).default(''),
  iconUrl: yup.string().trim().max(2000).default(''),
  active: yup.boolean().default(true),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm/sửa một mục danh mục.
 *
 * `key` chỉ nhập được lúc TẠO: nó là giá trị đã lưu trên hàng nghìn xe và nằm trong URL bộ lọc,
 * đổi là mồ côi toàn bộ. Đổi cách gọi thì sửa `label` — không đụng dữ liệu xe nào.
 */
export function CatalogItemFormModal({
  open,
  type,
  item,
  onClose,
}: {
  open: boolean;
  type: CatalogType;
  /** null = thêm mới. */
  item: CatalogItemAdmin | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem();
  const isEdit = Boolean(item);
  const pending = create.isPending || update.isPending;
  const withIcon = CATALOG_TYPES_WITH_ICON.includes(type);

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: item
      ? {
          key: item.key,
          label: item.label,
          description: item.description ?? '',
          iconUrl: item.iconUrl ?? '',
          active: item.active,
        }
      : { key: '', label: '', description: '', iconUrl: '', active: true },
  });
  const iconUrl = useWatch({ control, name: 'iconUrl' });

  const onSubmit = handleSubmit((values) => {
    const shared = {
      label: values.label.trim(),
      description: values.description?.trim() || null,
      iconUrl: withIcon ? values.iconUrl?.trim() || null : null,
      active: values.active,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? 'Đã cập nhật mục' : 'Đã thêm mục');
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
    };
    if (item) update.mutate({ id: item.id, ...shared }, done);
    else create.mutate({ type, key: values.key.trim(), ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? `Sửa: ${item?.label}` : `Thêm vào ${CATALOG_TYPE_LABEL[type]}`}
      open={open}
      onClose={onClose}
      okText={isEdit ? 'Lưu' : 'Thêm'}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="key"
          label="Mã"
          placeholder="vd: coupe"
          disabled={isEdit}
          help={
            isEdit
              ? 'Không đổi được — xe đã lưu đang trỏ vào mã này.'
              : 'Chữ thường không dấu. Đây là giá trị lưu xuống xe và đi vào link bộ lọc.'
          }
        />
        <TextField control={control} name="label" label="Tên hiển thị" placeholder="vd: Coupe" />
        <TextField
          control={control}
          name="description"
          label="Dòng mô tả phụ"
          placeholder="vd: 2 chỗ · thể thao"
          help="Hiện nhỏ dưới tên ở thẻ chọn và bộ lọc. Bỏ trống cũng được."
        />
        {withIcon ? (
          <>
            <TextField
              control={control}
              name="iconUrl"
              label="Đường dẫn ảnh"
              placeholder="/body-types/coupe.png"
              help="Ảnh đặt trong thư mục public của web, hoặc URL đầy đủ."
            />
            {iconUrl ? (
              <div className={styles.preview}>
                <span className={styles.previewLabel}>Xem trước</span>
                <PreviewImage src={iconUrl} alt="" className={styles.previewImage} />
              </div>
            ) : null}
          </>
        ) : null}
        <SwitchField
          control={control}
          name="active"
          label="Đang bật"
          description="Tắt thì mục biến khỏi form tạo xe và bộ lọc; xe cũ vẫn hiển thị đúng tên."
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
