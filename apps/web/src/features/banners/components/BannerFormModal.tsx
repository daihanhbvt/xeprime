'use client';

import { DesktopOutlined, MobileOutlined, TabletOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { appWallClockToIso, toAppTz, type Dayjs } from '@/lib/datetime';
import { useEffect, useId, useRef } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { presignBannerImage } from '@/services/upload';
import { bannerRatioValidator, BANNER_SLOTS } from '../banner-media';
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
  tabletImageUrl: yup.string().nullable().defined(),
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

function formValuesFromBanner(banner: AdminBanner | null): FormValues {
  if (!banner) {
    return {
      title: '',
      imageUrl: null,
      tabletImageUrl: null,
      mobileImageUrl: null,
      altText: '',
      linkUrl: '',
      active: true,
      startsAt: null,
      endsAt: null,
    };
  }

  return {
    title: banner.title,
    imageUrl: banner.imageUrl,
    tabletImageUrl: banner.tabletImageUrl,
    mobileImageUrl: banner.mobileImageUrl,
    altText: banner.altText,
    linkUrl: banner.linkUrl ?? '',
    active: banner.active,
    // Mốc UTC từ API → giờ VN cho ô chọn; chiều gửi đi dùng `appWallClockToIso`.
    startsAt: banner.startsAt ? toAppTz(banner.startsAt) : null,
    endsAt: banner.endsAt ? toAppTz(banner.endsAt) : null,
  };
}

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
  const formId = useId();
  const wasOpen = useRef(false);
  const previousBannerId = useRef<string | null>(null);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: formValuesFromBanner(banner),
  });

  useEffect(() => {
    const bannerId = banner?.id ?? null;
    const openedNow = open && !wasOpen.current;
    const changedBanner = open && previousBannerId.current !== bannerId;

    // React Hook Form chỉ đọc `defaultValues` lúc mount. Reset khi mở lại để phiên tạo mới
    // không giữ URL ảnh hoặc nội dung của phiên tạo/sửa trước đó.
    if (openedNow || changedBanner) reset(formValuesFromBanner(banner));

    wasOpen.current = open;
    previousBannerId.current = bannerId;
  }, [banner, open, reset]);

  const onSubmit = handleSubmit((values) => {
    const body = {
      title: values.title.trim(),
      // Schema đã chặn null (test 'required') — tới đây chắc chắn có URL.
      imageUrl: values.imageUrl as string,
      tabletImageUrl: values.tabletImageUrl || null,
      mobileImageUrl: values.mobileImageUrl || null,
      altText: values.altText.trim(),
      linkUrl: values.linkUrl?.trim() || null,
      active: values.active,
      startsAt: values.startsAt ? appWallClockToIso(values.startsAt) : null,
      endsAt: values.endsAt ? appWallClockToIso(values.endsAt) : null,
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
      title={isEdit ? 'Sửa banner trang chủ' : 'Tạo banner trang chủ'}
      open={open}
      onClose={onClose}
      size="xl"
      mobileMode="fullscreen"
      confirmLoading={pending}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button type="primary" htmlType="submit" form={formId} loading={pending}>
            {isEdit ? 'Lưu thay đổi' : 'Tạo banner'}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>{isEdit ? 'Đang chỉnh sửa' : 'Banner mới'}</span>
            <p className={styles.introText}>
              Tạo một bộ ảnh responsive cho hero trang chủ. Ảnh đúng tỉ lệ sẽ được hiển thị trọn
              vẹn, không bị cắt trên từng thiết bị.
            </p>
          </div>
          <span className={styles.responsiveBadge}>3 kích thước</span>
        </div>

        <section className={styles.section} aria-labelledby={`${formId}-basic`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-basic`} className={styles.sectionTitle}>
                Thông tin nội bộ
              </h3>
              <p className={styles.sectionDescription}>Giúp đội vận hành nhận diện chiến dịch.</p>
            </div>
          </div>
          <div className={styles.singleField}>
            <TextField
              control={control}
              name="title"
              label="Tên banner"
              placeholder="VD: Chiến dịch hè 2026"
              help="Chỉ admin nhìn thấy, không xuất hiện ngoài trang chủ."
              required
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-media`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-media`} className={styles.sectionTitle}>
                Ảnh responsive
              </h3>
              <p className={styles.sectionDescription}>
                Nên dùng file @2x để ảnh sắc nét. Tablet và mobile bỏ trống sẽ tự dùng ảnh lớn hơn.
              </p>
            </div>
          </div>

          {/* Mỗi slot MỘT tỉ lệ chuẩn, đo ảnh thật lúc chọn file — xem banner-media.ts. */}
          <div className={styles.mediaGrid}>
            <div className={`${styles.mediaCard} ${styles.desktopMediaCard}`}>
              <ImageUploadField
                control={control}
                name="imageUrl"
                label={
                  <span className={styles.mediaLabel}>
                    <DesktopOutlined aria-hidden="true" />
                    Máy tính
                    <span className={styles.requiredBadge}>Bắt buộc</span>
                  </span>
                }
                presign={presignBannerImage}
                validate={bannerRatioValidator('desktop')}
                help={`${BANNER_SLOTS.desktop.width}×${BANNER_SLOTS.desktop.height} · Khuyên dùng ${BANNER_SLOTS.desktop.width * 2}×${BANNER_SLOTS.desktop.height * 2}`}
                variant="card"
                previewAspectRatio={BANNER_SLOTS.desktop.width / BANNER_SLOTS.desktop.height}
                required
              />
            </div>
            <div className={styles.mediaCard}>
              <ImageUploadField
                control={control}
                name="tabletImageUrl"
                label={
                  <span className={styles.mediaLabel}>
                    <TabletOutlined aria-hidden="true" />
                    Tablet
                    <span className={styles.optionalBadge}>Tuỳ chọn</span>
                  </span>
                }
                presign={presignBannerImage}
                validate={bannerRatioValidator('tablet')}
                help={`${BANNER_SLOTS.tablet.width}×${BANNER_SLOTS.tablet.height} · Khuyên dùng ${BANNER_SLOTS.tablet.width * 2}×${BANNER_SLOTS.tablet.height * 2}`}
                variant="card"
                previewAspectRatio={BANNER_SLOTS.tablet.width / BANNER_SLOTS.tablet.height}
              />
            </div>
            <div className={styles.mediaCard}>
              <ImageUploadField
                control={control}
                name="mobileImageUrl"
                label={
                  <span className={styles.mediaLabel}>
                    <MobileOutlined aria-hidden="true" />
                    Mobile
                    <span className={styles.optionalBadge}>Tuỳ chọn</span>
                  </span>
                }
                presign={presignBannerImage}
                validate={bannerRatioValidator('mobile')}
                help={`${BANNER_SLOTS.mobile.width}×${BANNER_SLOTS.mobile.height} · Khuyên dùng ${BANNER_SLOTS.mobile.width * 2}×${BANNER_SLOTS.mobile.height * 2}`}
                variant="card"
                previewAspectRatio={BANNER_SLOTS.mobile.width / BANNER_SLOTS.mobile.height}
              />
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-content`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-content`} className={styles.sectionTitle}>
                Nội dung và điều hướng
              </h3>
              <p className={styles.sectionDescription}>
                Mô tả ảnh hỗ trợ khả năng truy cập; đường dẫn quyết định nơi mở khi bấm banner.
              </p>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <TextField
              control={control}
              name="altText"
              label="Mô tả ảnh (alt)"
              placeholder="VD: Đăng xe dễ dàng cùng XePrime"
              help="Screen reader sẽ đọc nội dung này."
              required
            />
            <TextField
              control={control}
              name="linkUrl"
              label="Đường dẫn khi bấm"
              placeholder="/search hoặc https://…"
              help="Không bắt buộc. Hỗ trợ đường dẫn nội bộ hoặc URL đầy đủ."
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-visibility`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-visibility`} className={styles.sectionTitle}>
                Lịch và trạng thái
              </h3>
              <p className={styles.sectionDescription}>
                Để trống lịch nếu banner cần hiển thị ngay và không giới hạn thời gian.
              </p>
            </div>
          </div>
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
          <div className={styles.statusCard}>
            <SwitchField
              control={control}
              name="active"
              label="Đang bật"
              description="Tắt để ẩn banner khỏi trang chủ mà không cần xoá."
            />
          </div>
        </section>
      </form>
    </ResponsiveDialog>
  );
}
