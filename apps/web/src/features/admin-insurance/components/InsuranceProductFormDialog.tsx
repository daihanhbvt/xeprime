'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App, Divider } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useLocalizedText } from '@/i18n/localized';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  INSURANCE_DISPLAY_ORDER_MAX,
  INSURANCE_DISPLAY_ORDER_MIN,
  buildInsuranceProductSchema,
  insuranceProductFormDefaults,
  toUpdateInsuranceProductBody,
  type InsuranceProductFormValues,
} from '../form';
import { useUpdateInsuranceProduct } from '../hooks';
import type { InsuranceProduct } from '../types';
import styles from './InsuranceProductFormDialog.module.css';

/**
 * Sửa MỘT sản phẩm bảo hiểm (ADR 0064) — tên, quyền lợi, khấu trừ, bồi thường tối đa, mẫu URL GCN,
 * bật/tắt. Không có biểu phí ngày: nó có phiên bản ở Chính sách phí. Schema, mặc định và payload
 * nằm ở `../form.ts` (biên trường dùng chung với DTO server).
 *
 * Người gọi gắn `key={product.id}`: `defaultValues` của RHF chỉ đọc một lần, nên tái dùng một
 * instance sẽ mở form của sản phẩm B với số của sản phẩm A.
 */
export function InsuranceProductFormDialog({
  product,
  onClose,
}: {
  /** `null` = đóng. */
  product: InsuranceProduct | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminInsurance.form');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const localized = useLocalizedText();
  const update = useUpdateInsuranceProduct();

  const schema = useMemo(
    () =>
      buildInsuranceProductSchema({
        required: t('validation.required'),
        tooShort: (min) => t('validation.tooShort', { min }),
        tooLong: (max) => t('validation.tooLong', { max }),
        amountMin: t('validation.amountMin'),
        amountMax: t('validation.amountMax'),
        amountStep: t('validation.amountStep'),
        urlTemplate: t('validation.urlTemplate'),
        displayOrder: (min, max) => t('validation.displayOrder', { min, max }),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<InsuranceProductFormValues>({
    resolver: yupResolver(schema),
    defaultValues: product ? insuranceProductFormDefaults(product) : undefined,
  });

  const onSubmit = handleSubmit((form) => {
    // Enter gửi form ngay cả khi nút OK đang quay — chặn lượt thứ hai ở đây.
    if (!product || update.isPending) return;
    update.mutate(
      { id: product.id, body: toUpdateInsuranceProductBody(form) },
      {
        onSuccess: (saved) => {
          message.success(t('saved', { name: localized(saved.nameVi, saved.nameEn) }));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const title = product ? t('title', { name: localized(product.nameVi, product.nameEn) }) : '';
  const amountHelp = t('help.amountEmpty');

  return (
    <ResponsiveDialog
      title={title}
      open={product !== null}
      onClose={onClose}
      size="lg"
      okText={t('submit')}
      onOk={() => void onSubmit()}
      confirmLoading={update.isPending}
    >
      <p className={styles.intro}>{t('intro')}</p>
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <Divider plain>{t('sections.naming')}</Divider>
        <TextField control={control} name="nameVi" label={t('fields.nameVi')} required />
        <TextField control={control} name="nameEn" label={t('fields.nameEn')} required />

        <Divider plain>{t('sections.coverage')}</Divider>
        <TextAreaField
          control={control}
          name="coverageVi"
          label={t('fields.coverageVi')}
          rows={3}
          required
        />
        <TextAreaField
          control={control}
          name="coverageEn"
          label={t('fields.coverageEn')}
          rows={3}
          required
        />

        <Divider plain>{t('sections.amounts')}</Divider>
        <NumberField
          control={control}
          name="deductibleCar"
          label={t('fields.deductibleCar')}
          money
          min={0}
          help={amountHelp}
        />
        <NumberField
          control={control}
          name="deductibleMotorbike"
          label={t('fields.deductibleMotorbike')}
          money
          min={0}
          help={amountHelp}
        />
        <NumberField
          control={control}
          name="maxPayoutCar"
          label={t('fields.maxPayoutCar')}
          money
          min={0}
          help={amountHelp}
        />
        <NumberField
          control={control}
          name="maxPayoutMotorbike"
          label={t('fields.maxPayoutMotorbike')}
          money
          min={0}
          help={amountHelp}
        />
        <TextField
          control={control}
          name="maxPayoutNoteVi"
          label={t('fields.maxPayoutNoteVi')}
          help={t('help.maxPayoutNote')}
        />
        <TextField control={control} name="maxPayoutNoteEn" label={t('fields.maxPayoutNoteEn')} />

        <Divider plain>{t('sections.operation')}</Divider>
        <TextField
          control={control}
          name="partnerProductCode"
          label={t('fields.partnerProductCode')}
          required
        />
        <TextField
          control={control}
          name="certificateUrlTemplate"
          label={t('fields.certificateUrlTemplate')}
          help={t('help.certificateUrlTemplate')}
          required
        />
        <NumberField
          control={control}
          name="displayOrder"
          label={t('fields.displayOrder')}
          min={INSURANCE_DISPLAY_ORDER_MIN}
          max={INSURANCE_DISPLAY_ORDER_MAX}
          required
        />
        <SwitchField
          control={control}
          name="isActive"
          label={t('fields.isActive')}
          description={t('fields.isActiveDescription')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
