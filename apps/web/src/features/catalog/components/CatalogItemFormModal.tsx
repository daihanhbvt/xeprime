'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  CATALOG_KEY_PATTERN,
  CATALOG_TYPES_WITH_ICON,
  VEHICLE_TYPE_VALUES,
  type CatalogItemType,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { useCreateCatalogItem, useUpdateCatalogItem } from '../use-admin-catalog';
import type { CatalogItemAdmin } from '../types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './CatalogItemFormModal.module.css';

const schema = yup.object({
  key: yup.string().trim().required('keyRequired').matches(CATALOG_KEY_PATTERN, 'keyPattern'),
  label: yup.string().trim().required('labelRequired').max(120),
  description: yup.string().trim().max(255).default(''),
  iconUrl: yup.string().trim().max(2000).default(''),
  /** Rỗng = áp dụng cho MỌI loại xe — xem `catalog_items.vehicle_types` trong schema. */
  vehicleTypes: yup.array(yup.string().oneOf(VEHICLE_TYPE_VALUES).required()).default([]),
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
  type: CatalogItemType;
  /** null = thêm mới. */
  item: CatalogItemAdmin | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminCatalog.form');
  const domainLabel = useDomainLabel();
  const resolver = useValidationResolver<FormValues>(schema, 'AdminCatalog.form');
  const { message } = App.useApp();
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem();
  const isEdit = Boolean(item);
  const pending = create.isPending || update.isPending;
  const withIcon = CATALOG_TYPES_WITH_ICON.includes(type);

  const { control, handleSubmit } = useForm<FormValues>({
    resolver,
    defaultValues: item
      ? {
          key: item.key,
          label: item.label,
          description: item.description ?? '',
          iconUrl: item.iconUrl ?? '',
          vehicleTypes: item.vehicleTypes as FormValues['vehicleTypes'],
          active: item.active,
        }
      : {
          key: '',
          label: '',
          description: '',
          iconUrl: '',
          vehicleTypes: [],
          active: true,
        },
  });
  const vehicleTypeOptions = useMemo(
    () =>
      VEHICLE_TYPE_VALUES.map((value) => ({ value, label: domainLabel('vehicleType', value) })),
    [domainLabel],
  );
  const iconUrl = useWatch({ control, name: 'iconUrl' });

  const onSubmit = handleSubmit((values) => {
    const shared = {
      label: values.label.trim(),
      description: values.description?.trim() || null,
      iconUrl: withIcon ? values.iconUrl?.trim() || null : null,
      vehicleTypes: values.vehicleTypes ?? [],
      active: values.active,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('updated') : t('created'));
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
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
          <>
            <TextField
              control={control}
              name="iconUrl"
              label={t('iconUrl')}
              placeholder={t('iconUrlPlaceholder')}
              help={t('iconUrlHelp')}
            />
            {iconUrl ? (
              <div className={styles.preview}>
                <span className={styles.previewLabel}>{t('preview')}</span>
                <PreviewImage src={iconUrl} alt="" className={styles.previewImage} />
              </div>
            ) : null}
          </>
        ) : null}
        <SwitchField
          control={control}
          name="active"
          label={t('active')}
          description={t('activeHelp')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
