'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { licenceClassCoverage, LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_KIND_VALUES,
  type DriverLicenceKind,
} from '@xeprime/types';
import { CheckboxField } from '@/components/form/CheckboxField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { ApproveDriverLicenceInput, PlatformDriverLicence } from '../types';
import styles from './DriverLicenceReviewDrawer.module.css';

/** "A1, b2 ;C" → ["A1","B2","C"] — chuẩn hoá hạng thật sự do server làm, đây chỉ tách chuỗi. */
function splitClasses(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

type FormTranslator = ReturnType<typeof useTranslations<'AdminDriverLicences.form'>>;

function approveSchema(t: FormTranslator) {
  return yup.object({
    kind: yup.string().oneOf(DRIVER_LICENCE_KIND_VALUES).required(),
    fullName: yup.string().trim().min(2, t('errors.fullName')).required(t('errors.fullName')),
    licenceNumber: yup
      .string()
      .trim()
      .min(3, t('errors.licenceNumber'))
      .required(t('errors.licenceNumber')),
    dateOfBirth: yup.string().nullable().defined(),
    classesText: yup
      .string()
      .test('classes', t('errors.classes'), (value) => splitClasses(value ?? '').length > 0)
      .required(t('errors.classes')),
    issuedOn: yup.string().nullable().defined(),
    expiresOn: yup
      .string()
      .nullable()
      .defined()
      .test(
        'expiry',
        t('errors.expiresOn'),
        (value, ctx) => Boolean(ctx.parent.noExpiry) || Boolean(value),
      ),
    noExpiry: yup.boolean().required(),
    issuingCountry: yup
      .string()
      .trim()
      .test('country', t('errors.country'), (value) => !value || /^[A-Za-z]{2}$/.test(value))
      .defined(),
    coversCar: yup.boolean().required(),
    coversMotorbike: yup.boolean().required(),
  });
}

type FormValues = yup.InferType<ReturnType<typeof approveSchema>>;

/**
 * Thông tin người duyệt CHỐT cho một bằng — điền sẵn bằng những gì bộ đọc thấy, sửa được từng ô.
 *
 * "Lái được ô tô / xe máy" với GPLX Việt Nam và IDP KHÔNG phải ô nhập: nó suy từ hạng bằng đúng
 * hàm server dùng (`licenceClassCoverage`), và server bỏ qua cờ gửi lên. Chỉ bằng nước ngoài —
 * nơi không có bảng tra nào đúng cho mọi nước — mới để người duyệt tự tích.
 */
export function DriverLicenceApproveForm({
  formId,
  detail,
  disabled,
  onSubmit,
}: {
  formId: string;
  detail: PlatformDriverLicence;
  disabled: boolean;
  onSubmit: (body: ApproveDriverLicenceInput) => void;
}) {
  const t = useTranslations('AdminDriverLicences.form');
  const tf = useTranslations('DriverLicence.fields');
  const dl = useDomainLabel();

  const schema = useMemo(() => approveSchema(t), [t]);

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      kind: detail.kind ?? DRIVER_LICENCE_KIND.VN,
      fullName: detail.fullName ?? '',
      licenceNumber: detail.licenceNumber ?? '',
      dateOfBirth: detail.dateOfBirth,
      classesText: detail.classes.join(', '),
      issuedOn: detail.issuedOn,
      expiresOn: detail.expiresOn,
      noExpiry: detail.noExpiry,
      issuingCountry: detail.issuingCountry ?? '',
      coversCar: detail.coversCar,
      coversMotorbike: detail.coversMotorbike,
    },
  });

  const kind = useWatch({ control, name: 'kind' }) as DriverLicenceKind;
  const classesText = useWatch({ control, name: 'classesText' });
  const issuedOn = useWatch({ control, name: 'issuedOn' });
  const noExpiry = useWatch({ control, name: 'noExpiry' });
  const foreign = kind === DRIVER_LICENCE_KIND.FOREIGN;

  const derived = foreign
    ? null
    : licenceClassCoverage({ kind, classes: splitClasses(classesText ?? ''), issuedOn });
  const derivedLabel = derived
    ? [derived.car ? tf('car') : null, derived.motorbike ? tf('motorbike') : null]
        .filter(Boolean)
        .join(LIST_SEPARATOR) || t('drivesNone')
    : null;

  const submit = handleSubmit((values) => {
    if (disabled) return;
    onSubmit({
      kind: values.kind,
      fullName: values.fullName.trim(),
      licenceNumber: values.licenceNumber.trim(),
      dateOfBirth: values.dateOfBirth || null,
      classes: splitClasses(values.classesText),
      issuedOn: values.issuedOn || null,
      expiresOn: values.noExpiry ? null : values.expiresOn || null,
      noExpiry: values.noExpiry,
      issuingCountry: values.issuingCountry.trim()
        ? values.issuingCountry.trim().toUpperCase()
        : null,
      coversCar: values.coversCar,
      coversMotorbike: values.coversMotorbike,
    });
  });

  return (
    <Form component={false} layout="vertical">
      <form id={formId} className={styles.form} noValidate onSubmit={(e) => void submit(e)}>
        <p className={styles.formHint}>{t('hint')}</p>
        <SelectField
          control={control}
          name="kind"
          label={t('kind')}
          required
          disabled={disabled}
          options={DRIVER_LICENCE_KIND_VALUES.map((value) => ({
            value,
            label: dl('driverLicenceKind', value),
          }))}
        />
        <TextField
          control={control}
          name="fullName"
          label={t('fullName')}
          required
          disabled={disabled}
        />
        <TextField
          control={control}
          name="licenceNumber"
          label={t('licenceNumber')}
          required
          disabled={disabled}
        />
        <TextField
          control={control}
          name="classesText"
          label={t('classes')}
          help={t('classesHelp')}
          required
          disabled={disabled}
        />
        <div className={styles.formRow}>
          <DateTimeField
            control={control}
            name="dateOfBirth"
            label={t('dateOfBirth')}
            dateOnly
            disabled={disabled}
          />
          <DateTimeField
            control={control}
            name="issuedOn"
            label={t('issuedOn')}
            dateOnly
            disabled={disabled}
          />
        </div>
        <DateTimeField
          control={control}
          name="expiresOn"
          label={t('expiresOn')}
          dateOnly
          disabled={disabled || noExpiry}
        />
        <CheckboxField control={control} name="noExpiry" disabled={disabled}>
          {t('noExpiry')}
        </CheckboxField>
        {foreign ? (
          <>
            <TextField
              control={control}
              name="issuingCountry"
              label={t('issuingCountry')}
              disabled={disabled}
            />
            <div className={styles.drives}>
              <span className={styles.drivesLabel}>{t('drives')}</span>
              <CheckboxField control={control} name="coversCar" disabled={disabled}>
                {t('coversCar')}
              </CheckboxField>
              <CheckboxField control={control} name="coversMotorbike" disabled={disabled}>
                {t('coversMotorbike')}
              </CheckboxField>
            </div>
          </>
        ) : (
          <p className={styles.derived}>{t('drivesDerived', { value: derivedLabel ?? '' })}</p>
        )}
      </form>
    </Form>
  );
}
