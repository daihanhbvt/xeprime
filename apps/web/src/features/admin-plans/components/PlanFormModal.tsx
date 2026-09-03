'use client';

import { App, Alert, Divider } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  PLAN_FEATURE_VALUES,
  SUBSCRIPTION_TERM_MONTHS,
  isPlanFeature,
  minBasePriceMonthlyPreview,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { DialogForm } from '@/components/form/DialogForm';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorCode } from '@/services/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreatePlan, useUpdatePlan } from '../hooks/use-plan-mutations';
import type { CreatePlanInput, Plan } from '../types';

/** Khoá ổn định cho 4 ô giảm giá kỳ hạn — RHF cần tên field tĩnh, không index mảng. */
const TERM_FIELDS = [
  ['discountM1', 1],
  ['discountM3', 3],
  ['discountM6', 6],
  ['discountM12', 12],
] as const;

/**
 * Tạo/sửa bậc gói theo mô hình cước theo CHỖ (ADR 0015/0020): chế độ thu phí quyết định bộ núm
 * hiện ra — tuyến hoa hồng chỉ có %, tuyến gói có phí nền + đơn giá chỗ + kỳ hạn + giả định
 * kiểm điểm giao. Cảnh báo kiểm điểm giao hiện NGAY trong form (phép xem trước dùng chung
 * `minBasePriceMonthlyPreview`); nguồn sự thật vẫn là BillingService — lỗi trả về đọc từ MÃ.
 *
 * Sửa thì `code` bị khoá (định danh, ADR 0010); tiền nhập number ở form và hoá string khi gửi
 * API (ADR 0007). Remount theo `open` để form sạch mỗi lần mở.
 */
export function PlanFormModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa gói đó. */
  plan: Plan | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const isEdit = Boolean(plan);
  const pending = create.isPending || update.isPending;
  /** Lỗi kiểm điểm giao từ server — giữ hiện trong form thay vì chỉ một toast thoáng qua. */
  const [incentiveError, setIncentiveError] = useState<string | null>(null);

  const schema = useMemo(() => {
    const int = (v: yup.NumberSchema<number | null | undefined>) =>
      v.nullable().defined().integer(t('form.validation.integer')).min(0, t('form.validation.nonNegative'));
    return yup.object({
      code: yup
        .string()
        .trim()
        .required(t('form.validation.codeRequired'))
        .matches(/^[a-z0-9][a-z0-9_-]{1,49}$/, t('form.validation.codePattern')),
      name: yup.string().trim().required(t('form.validation.nameRequired')).max(255),
      description: yup.string().trim().max(2000).default(''),
      billingMode: yup.string().oneOf([BILLING_MODE.COMMISSION, BILLING_MODE.PACKAGE]).required(),
      commissionPercent: yup
        .number()
        .nullable()
        .defined()
        .min(1)
        .max(20)
        .when('billingMode', {
          is: BILLING_MODE.COMMISSION,
          then: (s) => s.test('required', t('form.validation.commissionRequired'), (v) => v != null),
        }),
      basePriceMonthly: yup
        .number()
        .nullable()
        .defined()
        .min(0, t('form.validation.nonNegative'))
        .when('billingMode', {
          is: BILLING_MODE.PACKAGE,
          then: (s) => s.test('required', t('form.validation.baseRequired'), (v) => v != null),
        }),
      perCarPrice: yup.number().nullable().defined().min(0, t('form.validation.nonNegative')),
      perMotorbikePrice: yup.number().nullable().defined().min(0, t('form.validation.nonNegative')),
      includedCars: int(yup.number()),
      includedMotorbikes: int(yup.number()),
      maxCars: int(yup.number()),
      maxMotorbikes: int(yup.number()),
      discountM1: yup.number().nullable().defined().min(0).max(100),
      discountM3: yup.number().nullable().defined().min(0).max(100),
      discountM6: yup.number().nullable().defined().min(0).max(100),
      discountM12: yup.number().nullable().defined().min(0).max(100),
      graceDays: int(yup.number()),
      gmvPerCar: yup
        .number()
        .nullable()
        .defined()
        .min(0, t('form.validation.nonNegative'))
        .when('billingMode', {
          is: BILLING_MODE.PACKAGE,
          then: (s) => s.test('required', t('form.validation.gmvRequired'), (v) => v != null),
        }),
      gmvCommission: yup
        .number()
        .nullable()
        .defined()
        .min(1)
        .max(20)
        .when('billingMode', {
          is: BILLING_MODE.PACKAGE,
          then: (s) =>
            s.test('required', t('form.validation.assumedCommissionRequired'), (v) => v != null),
        }),
      maxMembers: int(yup.number()),
      maxBranches: int(yup.number()),
      features: yup.array().of(yup.string().defined()).defined(),
      sortOrder: yup.number().nullable().defined().integer(t('form.validation.integer')),
    });
  }, [t]);

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: plan
      ? {
          code: plan.code,
          name: plan.name,
          description: plan.description ?? '',
          billingMode: plan.billingMode as FormValues['billingMode'],
          commissionPercent: plan.commissionPercent,
          basePriceMonthly: Number(plan.basePriceMonthly),
          perCarPrice: plan.limits.perVehiclePrice.car != null ? Number(plan.limits.perVehiclePrice.car) : null,
          perMotorbikePrice:
            plan.limits.perVehiclePrice.motorbike != null ? Number(plan.limits.perVehiclePrice.motorbike) : null,
          includedCars: plan.limits.includedCars,
          includedMotorbikes: plan.limits.includedMotorbikes,
          maxCars: plan.limits.maxCars,
          maxMotorbikes: plan.limits.maxMotorbikes,
          discountM1: termDiscountOf(plan, 1),
          discountM3: termDiscountOf(plan, 3),
          discountM6: termDiscountOf(plan, 6),
          discountM12: termDiscountOf(plan, 12),
          graceDays: plan.limits.graceDays,
          gmvPerCar: plan.assumedMonthlyGmv ? Number(plan.assumedMonthlyGmv.monthlyGmvPerCar) : null,
          gmvCommission: plan.assumedMonthlyGmv?.commissionPercent ?? null,
          maxMembers: plan.limits.maxMembers,
          maxBranches: plan.limits.maxBranches,
          features: [...plan.limits.features],
          sortOrder: plan.sortOrder,
        }
      : {
          code: '',
          name: '',
          description: '',
          billingMode: BILLING_MODE.COMMISSION,
          commissionPercent: null,
          basePriceMonthly: null,
          perCarPrice: null,
          perMotorbikePrice: null,
          includedCars: 0,
          includedMotorbikes: 0,
          maxCars: null,
          maxMotorbikes: null,
          discountM1: 0,
          discountM3: null,
          discountM6: null,
          discountM12: null,
          graceDays: 7,
          gmvPerCar: null,
          gmvCommission: null,
          maxMembers: null,
          maxBranches: null,
          features: [],
          sortOrder: 0,
        },
  });

  const isPackage = watch('billingMode') === BILLING_MODE.PACKAGE;

  // Cảnh báo kiểm điểm giao NGAY khi gõ (ADR 0020) — cùng công thức server, tính bản xem trước.
  const [wBase, wIncluded, wGmv, wGmvCommission] = [
    watch('basePriceMonthly'),
    watch('includedCars'),
    watch('gmvPerCar'),
    watch('gmvCommission'),
  ];
  const incentiveMin = useMemo(() => {
    if (!isPackage || wGmv == null || wGmvCommission == null || !wIncluded) return null;
    const min = minBasePriceMonthlyPreview(wIncluded, {
      monthlyGmvPerCar: String(wGmv),
      commissionPercent: wGmvCommission,
    });
    return wBase != null && wBase < min ? min : null;
  }, [isPackage, wBase, wIncluded, wGmv, wGmvCommission]);

  const onSubmit = handleSubmit((values) => {
    const isPkg = values.billingMode === BILLING_MODE.PACKAGE;
    const discounts: Record<number, number | null | undefined> = {
      1: values.discountM1,
      3: values.discountM3,
      6: values.discountM6,
      12: values.discountM12,
    };
    const shared = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      billingMode: values.billingMode,
      // Tuyến gói: service tự xoá % — không gửi. Tuyến hoa hồng: schema đã bắt buộc có.
      ...(isPkg ? {} : { commissionPercent: values.commissionPercent as number }),
      basePriceMonthly: String(values.basePriceMonthly ?? 0),
      ...(isPkg && values.gmvPerCar != null && values.gmvCommission != null
        ? {
            assumedMonthlyGmv: {
              monthlyGmvPerCar: String(values.gmvPerCar),
              commissionPercent: values.gmvCommission,
            },
          }
        : {}),
      limits: {
        perVehiclePrice: {
          car: isPkg && values.perCarPrice != null ? String(values.perCarPrice) : null,
          motorbike: isPkg && values.perMotorbikePrice != null ? String(values.perMotorbikePrice) : null,
        },
        includedCars: (isPkg ? values.includedCars : 0) ?? 0,
        includedMotorbikes: (isPkg ? values.includedMotorbikes : 0) ?? 0,
        maxCars: values.maxCars,
        maxMotorbikes: values.maxMotorbikes,
        maxMembers: values.maxMembers,
        maxBranches: values.maxBranches,
        terms: SUBSCRIPTION_TERM_MONTHS.map((months) => ({
          months,
          discountPercent: discounts[months] ?? 0,
        })),
        graceDays: values.graceDays ?? 0,
        // Narrow về union PlanFeature — yup chỉ biết string[], còn contract sinh enum literal.
        features: values.features.filter(isPlanFeature),
      } satisfies CreatePlanInput['limits'],
      sortOrder: values.sortOrder ?? 0,
    };
    const done = {
      onSuccess: () => {
        setIncentiveError(null);
        message.success(isEdit ? t('form.updatedSuccess') : t('form.createdSuccess'));
        onClose();
      },
      onError: (err: unknown) => {
        // Kiểm điểm giao đọc từ MÃ và ghim trong form — toast thoáng qua không đủ cho một
        // quyết định định giá; lỗi khác vẫn toast như mọi form.
        if (getErrorCode(err) === API_ERROR_CODE.PLAN_INCENTIVE_INVALID) {
          setIncentiveError(errorMessage(err));
        } else {
          message.error(errorMessage(err));
        }
      },
    };
    if (plan) update.mutate({ id: plan.id, ...shared }, done);
    else create.mutate({ code: values.code.trim(), ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('form.titleEdit', { name: plan?.name ?? '' }) : t('form.titleCreate')}
      open={open}
      onClose={onClose}
      okText={isEdit ? tCommon('actions.save') : t('form.okCreate')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        {!isEdit ? (
          <TextField control={control} name="code" label={t('form.code')} placeholder="basic" />
        ) : null}
        <TextField control={control} name="name" label={t('form.name')} />
        <TextAreaField control={control} name="description" label={t('form.description')} rows={2} />

        <RadioGroupField
          control={control}
          name="billingMode"
          label={t('form.billingMode')}
          options={[
            {
              value: BILLING_MODE.COMMISSION,
              label: domainLabel('billingMode', BILLING_MODE.COMMISSION),
              description: t('form.commissionHint'),
            },
            {
              value: BILLING_MODE.PACKAGE,
              label: domainLabel('billingMode', BILLING_MODE.PACKAGE),
              description: t('form.packageHint'),
            },
          ]}
        />

        {!isPackage ? (
          <NumberField
            control={control}
            name="commissionPercent"
            label={t('form.commissionPercent')}
            percent
            min={1}
            max={20}
            precision={2}
          />
        ) : (
          <>
            <NumberField control={control} name="basePriceMonthly" label={t('form.basePriceMonthly')} money min={0} />

            <Divider plain>{t('form.sectionSlots')}</Divider>
            <NumberField
              control={control}
              name="perCarPrice"
              label={t('form.perCarPrice')}
              money
              min={0}
              help={t('form.perPriceHelp')}
            />
            <NumberField
              control={control}
              name="perMotorbikePrice"
              label={t('form.perMotorbikePrice')}
              money
              min={0}
              help={t('form.perPriceHelp')}
            />
            <NumberField control={control} name="includedCars" label={t('form.includedCars')} min={0} />
            <NumberField control={control} name="includedMotorbikes" label={t('form.includedMotorbikes')} min={0} />
            <NumberField control={control} name="maxCars" label={t('form.maxCars')} min={0} help={t('form.maxHelp')} />
            <NumberField
              control={control}
              name="maxMotorbikes"
              label={t('form.maxMotorbikes')}
              min={0}
              help={t('form.maxHelp')}
            />

            <Divider plain>{t('form.sectionTerms')}</Divider>
            {TERM_FIELDS.map(([field, months]) => (
              <NumberField
                key={field}
                control={control}
                name={field}
                label={t('form.termDiscount', { months })}
                percent
                min={0}
                max={100}
              />
            ))}
            <NumberField
              control={control}
              name="graceDays"
              label={t('form.graceDays')}
              min={0}
              addonAfter={t('form.graceDaysUnit')}
            />

            <Divider plain>{t('form.sectionIncentive')}</Divider>
            <Alert type="info" showIcon message={t('form.incentiveIntro')} />
            <NumberField control={control} name="gmvPerCar" label={t('form.assumedGmv')} money min={0} />
            <NumberField
              control={control}
              name="gmvCommission"
              label={t('form.assumedCommission')}
              percent
              min={1}
              max={20}
              precision={2}
            />
            {incentiveMin != null ? (
              <Alert
                type="warning"
                showIcon
                message={t('form.incentiveWarning', { min: fmt.money(String(incentiveMin)) })}
              />
            ) : null}
          </>
        )}

        <Divider plain>{t('form.sectionOther')}</Divider>
        <NumberField control={control} name="maxMembers" label={t('form.maxMembers')} min={0} help={t('form.maxHelp')} />
        <NumberField control={control} name="maxBranches" label={t('form.maxBranches')} min={0} help={t('form.maxHelp')} />
        <CheckboxGroupField
          control={control}
          name="features"
          label={t('form.features')}
          options={PLAN_FEATURE_VALUES.map((feature) => ({
            value: feature,
            label: domainLabel('planFeature', feature),
          }))}
        />
        <NumberField control={control} name="sortOrder" label={t('form.sortOrder')} />

        {incentiveError ? <Alert type="error" showIcon message={incentiveError} /> : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}

/** % giảm của kỳ `months` trong gói đang sửa — kỳ chưa khai báo hiện null (ô trống). */
function termDiscountOf(plan: Plan, months: number): number | null {
  return plan.limits.terms.find((term) => term.months === months)?.discountPercent ?? null;
}
