'use client';

import {
  CATALOG_MARKET_STATUS,
  CATALOG_MARKET_STATUS_VALUES,
  FUEL_TYPE_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_TYPE,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesFor,
} from '@xeprime/types';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';

import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorMessage } from '@/services/api-client';

import {
  useCreateCatalogModel,
  useUpdateCatalogModel,
  type CatalogModelAdmin,
} from '../use-admin-catalog-models';

const schema = yup.object({
  label: yup.string().trim().required('labelRequired').max(120),
  marketStatus: yup.string().oneOf(CATALOG_MARKET_STATUS_VALUES).default('current'),
  motorbikeCategory: yup.string().oneOf(MOTORBIKE_CATEGORY_VALUES).nullable().default(null),
  fuelTypes: yup.array(yup.string().oneOf(FUEL_TYPE_VALUES).required()).default([]),
  transmissions: yup.array(yup.string().oneOf(TRANSMISSION_TYPE_EXT_VALUES).required()).default([]),
  engineDisplacementCc: yup.number().nullable().min(1).default(null),
  seatCount: yup.number().nullable().min(2).max(64).default(null),
  yearFrom: yup.number().nullable().min(1950).max(2100).default(null),
  yearTo: yup.number().nullable().min(1950).max(2100).default(null),
  sourceUrl: yup.string().trim().max(2000).default(''),
  active: yup.boolean().default(true),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm/sửa một MẪU XE của danh mục.
 *
 * Hai trường KHÔNG có trong form: hãng và loại phương tiện. Chúng là định danh nhóm của mẫu —
 * đổi hãng của một mẫu là biến chiếc xe của người khác thành xe hãng khác, nên cách đúng là tắt
 * mẫu cũ và tạo mẫu mới. Lúc TẠO, hai giá trị đó đến từ bộ lọc đang mở trên màn hình.
 *
 * Các ô hỏi đúng thứ có nghĩa với loại xe đang chọn: phân khúc chỉ hiện với xe máy, số chỗ chỉ
 * hiện với ô tô — cùng luật mà DB giữ bằng CHECK và backend kiểm bằng `assertShape`.
 */
export function CatalogModelFormModal({
  open,
  vehicleType,
  brandKey,
  brandLabel,
  model,
  onClose,
}: {
  open: boolean;
  vehicleType: string;
  /** Hãng của mẫu sắp tạo — bắt buộc khi thêm mới (màn hình chặn nút nếu chưa chọn hãng). */
  brandKey: string;
  brandLabel: string;
  /** null = thêm mới. */
  model: CatalogModelAdmin | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminCatalog.models');
  const tForm = useTranslations('AdminCatalog.form');
  const resolver = useValidationResolver<FormValues>(schema, 'AdminCatalog.models');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();

  const create = useCreateCatalogModel();
  const update = useUpdateCatalogModel();
  const isEdit = Boolean(model);
  const pending = create.isPending || update.isPending;
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver,
    defaultValues: model
      ? {
          label: model.label,
          marketStatus: model.marketStatus as FormValues['marketStatus'],
          motorbikeCategory: model.motorbikeCategory as FormValues['motorbikeCategory'],
          fuelTypes: model.fuelTypes as FormValues['fuelTypes'],
          transmissions: model.transmissions as FormValues['transmissions'],
          engineDisplacementCc: model.engineDisplacementCc,
          seatCount: model.seatCount,
          yearFrom: model.yearFrom,
          yearTo: model.yearTo,
          sourceUrl: model.sourceUrl ?? '',
          active: model.active,
        }
      : {
          label: '',
          marketStatus: CATALOG_MARKET_STATUS.CURRENT,
          motorbikeCategory: null,
          fuelTypes: [],
          transmissions: [],
          engineDisplacementCc: null,
          seatCount: null,
          yearFrom: null,
          yearTo: null,
          sourceUrl: '',
          active: true,
        },
  });

  const marketStatusOptions = useMemo(
    () =>
      CATALOG_MARKET_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('catalogMarketStatus', value),
      })),
    [domainLabel],
  );
  const categoryOptions = useMemo(
    () =>
      MOTORBIKE_CATEGORY_VALUES.map((value) => ({
        value,
        label: domainLabel('motorbikeCategory', value),
      })),
    [domainLabel],
  );
  // Nguồn năng lượng và truyền động lọc theo LOẠI XE — cùng hàm mà form đăng xe dùng, nên admin
  // không tạo được một mẫu mang tổ hợp mà chính form đăng xe sẽ không bao giờ đưa ra.
  const fuelOptions = useMemo(
    () =>
      vehicleFuelTypesFor(vehicleType).map((value) => ({
        value,
        label: domainLabel('fuelType', value),
      })),
    [domainLabel, vehicleType],
  );
  const transmissionOptions = useMemo(
    () =>
      vehicleTransmissionTypesFor(vehicleType, null).map((value) => ({
        value,
        label: domainLabel('transmissionType', value),
      })),
    [domainLabel, vehicleType],
  );

  const onSubmit = handleSubmit((values) => {
    const shared = {
      label: values.label.trim(),
      marketStatus: values.marketStatus,
      motorbikeCategory: isMotorbike ? (values.motorbikeCategory ?? null) : null,
      fuelTypes: values.fuelTypes ?? [],
      transmissions: values.transmissions ?? [],
      engineDisplacementCc: values.engineDisplacementCc,
      seatCount: isMotorbike ? null : values.seatCount,
      yearFrom: values.yearFrom,
      yearTo: values.yearTo,
      sourceUrl: values.sourceUrl?.trim() || null,
      active: values.active,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('updated') : t('created'));
        onClose();
      },
      onError: (err: unknown) => message.error(getErrorMessage(err)),
    };
    if (model) update.mutate({ id: model.id, ...shared }, done);
    else create.mutate({ brandKey, vehicleType, ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('editTitle', { label: model?.label ?? '' }) : t('createTitle')}
      open={open}
      onClose={onClose}
      okText={isEdit ? tForm('save') : tForm('add')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="label"
          label={t('label')}
          placeholder={t('labelPlaceholder')}
          help={isEdit ? t('brandHelp') : `${brandLabel} · ${t('labelHelp')}`}
        />
        <SelectField
          control={control}
          name="marketStatus"
          label={t('marketStatus')}
          options={marketStatusOptions}
          help={t('marketStatusHelp')}
        />
        {isMotorbike ? (
          <SelectField
            control={control}
            name="motorbikeCategory"
            label={t('motorbikeCategory')}
            options={categoryOptions}
            help={t('motorbikeCategoryHelp')}
            allowClear
          />
        ) : (
          <NumberField
            control={control}
            name="seatCount"
            label={t('seatCount')}
            help={t('seatCountHelp')}
            min={2}
            max={64}
          />
        )}
        <SelectField
          control={control}
          name="fuelTypes"
          label={t('fuelTypes')}
          options={fuelOptions}
          help={t('fuelTypesHelp')}
          mode="multiple"
        />
        <SelectField
          control={control}
          name="transmissions"
          label={t('transmissions')}
          options={transmissionOptions}
          mode="multiple"
        />
        <NumberField
          control={control}
          name="engineDisplacementCc"
          label={t('engineDisplacementCc')}
          help={t('engineDisplacementHelp')}
          min={1}
        />
        <NumberField control={control} name="yearFrom" label={t('yearFrom')} min={1950} max={2100} />
        <NumberField control={control} name="yearTo" label={t('yearTo')} min={1950} max={2100} />
        <TextField
          control={control}
          name="sourceUrl"
          label={t('sourceUrl')}
          placeholder={t('sourceUrlPlaceholder')}
          help={t('sourceUrlHelp')}
        />
        <SwitchField
          control={control}
          name="active"
          label={tForm('active')}
          description={tForm('activeHelp')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
