'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  CATALOG_KEY_PATTERN,
  CATALOG_TYPE,
  CATALOG_TYPES_WITH_ICON,
  VEHICLE_TYPE_VALUES,
  type CatalogItemType,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { presignCatalogImage } from '@/services/upload';
import { useCreateCatalogItem, useUpdateCatalogItem } from '../use-admin-catalog';
import type { CatalogItemAdmin } from '../types';
import styles from './CatalogItemFormModal.module.css';

/** Tỉ lệ khung xem trước ảnh trang chủ — thẻ "Loại xe" hiện xe tách nền trong khung ngang. */
const SHOWCASE_PREVIEW_RATIO = 16 / 9;

const schema = yup.object({
  key: yup.string().trim().required('keyRequired').matches(CATALOG_KEY_PATTERN, 'keyPattern'),
  label: yup.string().trim().required('labelRequired').max(120),
  description: yup.string().trim().max(255).default(''),
  iconUrl: yup.string().nullable().default(null),
  /** Rỗng = áp dụng cho MỌI loại xe — xem `catalog_items.vehicle_types` trong schema. */
  vehicleTypes: yup.array(yup.string().oneOf(VEHICLE_TYPE_VALUES).required()).default([]),
  active: yup.boolean().default(true),
  // Khối "Loại xe" trang chủ — chỉ kiểu dáng có. Bật hiện thì phải có ảnh (API chặn cùng luật).
  showOnHome: yup.boolean().default(false),
  showcaseImageUrl: yup
    .string()
    .nullable()
    .default(null)
    .when('showOnHome', {
      is: true,
      then: (s) => s.required('showcaseImageRequired'),
    }),
  showcaseExamples: yup.string().trim().max(255).default(''),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm/sửa một mục danh mục lọc.
 *
 * Ảnh (icon kiểu dáng, logo hãng, ảnh lớn trang chủ) TẢI LÊN R2 qua `ImageUploadField` — không còn
 * ô gõ đường dẫn tới file tĩnh trong repo: thêm một kiểu dáng mới không cần dev chép ảnh vào mã.
 * Mục cũ trỏ file tĩnh (`/body-types/*.png`) vẫn hiện và giữ nguyên tới khi admin thay ảnh.
 *
 * Riêng KIỂU DÁNG có phần "Trang chủ": công tắc hiện ở khối "Loại xe", ảnh lớn và dòng ví dụ. Tên
 * và thứ tự trên trang chủ là tên và thứ tự của chính danh mục — một nguồn cho mọi nơi.
 */
export function CatalogItemFormModal({
  open,
  type,
  item,
  onClose,
}: {
  open: boolean;
  type: CatalogItemType;
  /** null = thêm mới. */
  item: CatalogItemAdmin | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminCatalog.form');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const resolver = useValidationResolver<FormValues>(schema, 'AdminCatalog.form');
  const { message } = App.useApp();
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem();
  const isEdit = Boolean(item);
  const pending = create.isPending || update.isPending;
  const withIcon = CATALOG_TYPES_WITH_ICON.includes(type);
  const withShowcase = type === CATALOG_TYPE.BODY_TYPE;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver,
    defaultValues: item
      ? {
          key: item.key,
          label: item.label,
          description: item.description ?? '',
          iconUrl: item.iconUrl ?? null,
          vehicleTypes: item.vehicleTypes as FormValues['vehicleTypes'],
          active: item.active,
          showOnHome: item.showOnHome,
          showcaseImageUrl: item.showcaseImageUrl ?? null,
          showcaseExamples: item.showcaseExamples ?? '',
        }
      : {
          key: '',
          label: '',
          description: '',
          iconUrl: null,
          vehicleTypes: [],
          active: true,
          showOnHome: false,
          showcaseImageUrl: null,
          showcaseExamples: '',
        },
  });
  const showOnHome = useWatch({ control, name: 'showOnHome' });
  const vehicleTypeOptions = useMemo(
    () => VEHICLE_TYPE_VALUES.map((value) => ({ value, label: domainLabel('vehicleType', value) })),
    [domainLabel],
  );

  const onSubmit = handleSubmit((values) => {
    if (pending) return;
    const shared = {
      label: values.label.trim(),
      description: values.description?.trim() || null,
      iconUrl: withIcon ? values.iconUrl || null : null,
      vehicleTypes: values.vehicleTypes ?? [],
      active: values.active,
      // Mục không phải kiểu dáng không gửi trường trang chủ — API chỉ nhận chúng ở kiểu dáng.
      ...(withShowcase
        ? {
            showOnHome: values.showOnHome,
            showcaseImageUrl: values.showcaseImageUrl || null,
            showcaseExamples: values.showcaseExamples?.trim() || null,
          }
        : {}),
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('updated') : t('created'));
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (item) update.mutate({ id: item.id, ...shared }, done);
    else create.mutate({ type, key: values.key.trim(), ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={
        isEdit
          ? t('editTitle', { label: item?.label ?? '' })
          : t('createTitle', { type: domainLabel('catalogType', type) })
      }
      open={open}
      onClose={onClose}
      okText={isEdit ? t('save') : t('add')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="key"
          label={t('key')}
          placeholder={t('keyPlaceholder')}
          disabled={isEdit}
          help={isEdit ? t('keyLocked') : t('keyHelp')}
        />
        <TextField
          control={control}
          name="label"
          label={t('label')}
          placeholder={t('labelPlaceholder')}
        />
        <TextField
          control={control}
          name="description"
          label={t('description')}
          placeholder={t('descriptionPlaceholder')}
          help={t('descriptionHelp')}
        />
        {/*
          Chiều áp dụng: hãng chỉ bán xe máy, tiện nghi chỉ có ở ô tô… Bỏ trống = mọi loại xe,
          nên ô này KHÔNG bắt buộc — nhưng để trống một hãng xe máy là lý do form ô tô hiện ra
          những hãng không bán ô tô.
        */}
        <SelectField
          control={control}
          name="vehicleTypes"
          label={t('vehicleTypes')}
          options={vehicleTypeOptions}
          help={t('vehicleTypesHelp')}
          mode="multiple"
        />
        {withIcon ? (
          <ImageUploadField
            control={control}
            name="iconUrl"
            label={t('iconUrl')}
            presign={presignCatalogImage}
            help={t('iconUrlHelp')}
          />
        ) : null}
        <SwitchField
          control={control}
          name="active"
          label={t('active')}
          description={t('activeHelp')}
        />

        {withShowcase ? (
          <section className={styles.showcase} aria-labelledby="catalog-showcase-title">
            <h3 id="catalog-showcase-title" className={styles.showcaseTitle}>
              {t('homeSection')}
            </h3>
            <p className={styles.showcaseHelp}>{t('homeSectionHelp')}</p>
            <SwitchField
              control={control}
              name="showOnHome"
              label={t('showOnHome')}
              description={t('showOnHomeHelp')}
            />
            <ImageUploadField
              control={control}
              name="showcaseImageUrl"
              label={t('showcaseImage')}
              presign={presignCatalogImage}
              help={t('showcaseImageHelp')}
              variant="card"
              previewAspectRatio={SHOWCASE_PREVIEW_RATIO}
              required={Boolean(showOnHome)}
            />
            <TextField
              control={control}
              name="showcaseExamples"
              label={t('showcaseExamples')}
              placeholder={t('showcaseExamplesPlaceholder')}
              help={t('showcaseExamplesHelp')}
            />
          </section>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
