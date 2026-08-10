'use client';

import { App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { presignBannerImage } from '@/services/upload';
import { useCreateBanner, useUpdateBanner } from '../use-admin-banners';
import type { AdminBanner } from '../types';
import styles from './BannerFormModal.module.css';

const schema = yup.object({
  title: yup.string().trim().required('Nhập tên banner').max(150),
  imageUrl: yup
    .string()
    .nullable()
    .defined()
    .test('required', 'Tải lên ảnh desktop', (v) => Boolean(v)),
  mobileImageUrl: yup.string().nullable().defined(),
  altText: yup.string().trim().required('Nhập mô tả ảnh (alt)').max(255),
  linkUrl: yup
    .string()
    .trim()
    .defined()
    .test('safe-url', 'Chỉ nhận http(s) hoặc đường dẫn nội bộ bắt đầu bằng /', (v) =>
      !v ? true : /^(https?:\/\/|\/)\S+$/.test(v),
    ),
  active: yup.boolean().default(true),
  startsAt: yup.mixed<Dayjs>().nullable().defined(),
  endsAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('after-start', 'Thời điểm ngừng phải sau thời điểm bắt đầu', (value, ctx) => {
      const start = ctx.parent.startsAt as Dayjs | null;
      return !value || !start || value.isAfter(start);
    }),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Tạo/sửa banner trang chủ. Ảnh upload theo pattern R2 chung (presign → PUT thẳng); alt bắt
 * buộc vì banner là nội dung marketing hiện với mọi khách. Lịch để trống = hiển thị vô hạn.
 */
export function BannerFormModal({
  open,
  banner,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới. */
  banner: AdminBanner | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const create = useCreateBanner();
  const update = useUpdateBanner();
  const isEdit = Boolean(banner);
  const pending = create.isPending || update.isPending;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: banner
      ? {
          title: banner.title,
          imageUrl: banner.imageUrl,
          mobileImageUrl: banner.mobileImageUrl,
          altText: banner.altText,
          linkUrl: banner.linkUrl ?? '',
          active: banner.active,
          startsAt: banner.startsAt ? dayjs(banner.startsAt) : null,
          endsAt: banner.endsAt ? dayjs(banner.endsAt) : null,
        }
      : {
          title: '',
          imageUrl: null,
          mobileImageUrl: null,
          altText: '',
          linkUrl: '',
          active: true,
          startsAt: null,
          endsAt: null,
        },
  });

  const onSubmit = handleSubmit((values) => {
    const body = {
      title: values.title.trim(),
      // Schema đã chặn null (test 'required') — tới đây chắc chắn có URL.
      imageUrl: values.imageUrl as string,
      mobileImageUrl: values.mobileImageUrl || null,
      altText: values.altText.trim(),
      linkUrl: values.linkUrl?.trim() || null,
      active: values.active,
      startsAt: values.startsAt?.toISOString() ?? null,
      endsAt: values.endsAt?.toISOString() ?? null,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? 'Đã cập nhật banner' : 'Đã tạo banner');
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
    };
    if (banner) update.mutate({ id: banner.id, ...body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? `Sửa banner: ${banner?.title}` : 'Tạo banner trang chủ'}
      open={open}
      onClose={onClose}
      footer={null}
    >
      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="title"
          label="Tên nội bộ"
          placeholder="VD: Chiến dịch hè 2026"
          help="Chỉ admin nhìn thấy — dùng để nhận diện trong danh sách."
        />
        <ImageUploadField
          control={control}
          name="imageUrl"
          label="Ảnh desktop"
          presign={presignBannerImage}
        />
        <ImageUploadField
          control={control}
          name="mobileImageUrl"
          label="Ảnh mobile (tuỳ chọn)"
          presign={presignBannerImage}
        />
        <TextField
          control={control}
          name="altText"
          label="Mô tả ảnh (alt)"
          placeholder="VD: Thuê xe dễ dàng cùng XePrime"
          help="Screen reader đọc dòng này — bắt buộc."
        />
        <TextField
          control={control}
          name="linkUrl"
          label="Đường dẫn khi bấm (tuỳ chọn)"
          placeholder="/search hoặc https://…"
        />
        <div className={styles.scheduleRow}>
          <DateTimeField
            control={control}
            name="startsAt"
            label="Bắt đầu hiển thị"
            placeholder="Ngay lập tức"
          />
          <DateTimeField
            control={control}
            name="endsAt"
            label="Ngừng hiển thị"
            placeholder="Vô hạn"
          />
        </div>
        <SwitchField
          control={control}
          name="active"
          label="Đang bật"
          description="Tắt thì banner biến khỏi trang chủ ngay, không cần xoá."
        />
        <div className={styles.actions}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" htmlType="submit" loading={pending}>
            {isEdit ? 'Lưu' : 'Tạo banner'}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
