'use client';

import { App, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import * as yup from 'yup';
import {
  DRIVER_SURCHARGE_KIND,
  DRIVER_SURCHARGE_KIND_SPEC,
  DRIVER_SURCHARGE_KIND_VALUES,
  DRIVER_SURCHARGE_THRESHOLD_KIND,
  DRIVER_SURCHARGE_THRESHOLD_MAX,
  handoverTimeToMinute,
  minuteToHandoverTime,
  type DriverSurchargeKind,
} from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { SwitchField } from '@/components/form/SwitchField';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { useDriverSurchargeRules, useSaveDriverSurchargeRules } from '../../hooks';
import type { DriverSurchargeRule } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './DriverSurchargesSection.module.css';

const ruleSchema = yup.object({
  enabled: yup.boolean().defined(),
  amount: yup
    .number()
    .nullable()
    .defined()
    .test('required-when-enabled', 'amountRequired', (value, ctx) =>
      ctx.parent.enabled ? value != null && value > 0 : true,
    ),
  thresholdValue: yup
    .number()
    .nullable()
    .defined()
    .min(0, 'thresholdRange')
    .max(DRIVER_SURCHARGE_THRESHOLD_MAX, 'thresholdRange'),
});

const schema = yup.object({
  [DRIVER_SURCHARGE_KIND.OVERTIME]: ruleSchema,
  [DRIVER_SURCHARGE_KIND.WAITING]: ruleSchema,
  [DRIVER_SURCHARGE_KIND.LONG_DISTANCE]: ruleSchema,
  [DRIVER_SURCHARGE_KIND.OVERNIGHT]: ruleSchema,
});
type FormValues = yup.InferType<typeof schema>;

/** Mốc giờ 30 phút cho "ngoài giờ từ" — cùng cách tạo với màn khung giờ giao nhận. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const value = minuteToHandoverTime(i * 30);
  return { value: String(i * 30), label: value };
});

/**
 * Mục "Phụ phí" có tài xế (mockup 13): bốn khoản MẶC ĐỊNH — bật/tắt, số tiền, ngưỡng, đơn vị cố
 * định theo loại. Đây là quy tắc công bố trước với khách và đóng băng vào đơn; khoản THẬT vẫn được
 * ghi ở bước quyết toán (`booking_surcharges`) với số tiền gợi ý từ chính quy tắc này.
 */
export function DriverSurchargesSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const rules = useDriverSurchargeRules(vehicle.id);

  if (rules.isLoading) return <LoadingState variant="page" />;
  if (rules.isError || !rules.data) {
    return (
      <EmptyState
        variant="error"
        title={t('common.loadError')}
        description={tCommon('states.errorHint')}
        onRetry={() => void rules.refetch()}
      />
    );
  }
  return <SurchargesForm rules={rules.data} vehicleId={vehicle.id} canEdit={canEdit} />;
}

function SurchargesForm({
  rules,
  vehicleId,
  canEdit,
}: {
  rules: DriverSurchargeRule[];
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveDriverSurchargeRules(vehicleId);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.surcharges.validation');

  const values = useMemo<FormValues>(() => {
    const of = (kind: DriverSurchargeKind) => {
      const rule = rules.find((r) => r.kind === kind);
      return {
        enabled: rule?.enabled ?? false,
        amount: rule && rule.amount !== '0' ? Number(rule.amount) : null,
        thresholdValue: rule?.thresholdValue ?? null,
      };
    };
    return {
      [DRIVER_SURCHARGE_KIND.OVERTIME]: of(DRIVER_SURCHARGE_KIND.OVERTIME),
      [DRIVER_SURCHARGE_KIND.WAITING]: of(DRIVER_SURCHARGE_KIND.WAITING),
      [DRIVER_SURCHARGE_KIND.LONG_DISTANCE]: of(DRIVER_SURCHARGE_KIND.LONG_DISTANCE),
      [DRIVER_SURCHARGE_KIND.OVERNIGHT]: of(DRIVER_SURCHARGE_KIND.OVERNIGHT),
    };
  }, [rules]);
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({ resolver, values });

  const submit = handleSubmit(async (next) => {
    try {
      await save.mutateAsync(
        DRIVER_SURCHARGE_KIND_VALUES.map((kind) => {
          const rule = next[kind];
          const spec = DRIVER_SURCHARGE_KIND_SPEC[kind];
          return {
            kind,
            enabled: rule.enabled,
            amount: String(Math.round(rule.amount ?? 0)),
            thresholdValue:
              spec.threshold === null ? null : rule.thresholdValue == null ? null : Number(rule.thresholdValue),
          };
        }),
      );
      message.success(t('surcharges.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  });

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form noValidate onSubmit={submit} className={styles.form}>
        <SectionCard headingLevel={1} title={t('surcharges.title')} subtitle={t('surcharges.subtitle')}>
          <div className={styles.grid}>
            {DRIVER_SURCHARGE_KIND_VALUES.map((kind) => (
              <RuleCard key={kind} kind={kind} control={control} canEdit={canEdit} />
            ))}
          </div>
          <p className={styles.note}>{t('surcharges.flowNote')}</p>
        </SectionCard>
        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          onCancel={formState.isDirty ? () => reset(values) : undefined}
          submitting={save.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>
    </Form>
  );
}

function RuleCard({
  kind,
  control,
  canEdit,
}: {
  kind: DriverSurchargeKind;
  control: Control<FormValues>;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.surcharges');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const spec = DRIVER_SURCHARGE_KIND_SPEC[kind];
  const enabled = useWatch({ control, name: `${kind}.enabled` });
  const threshold = useWatch({ control, name: `${kind}.thresholdValue` });

  const description =
    spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY
      ? t('threshold.overtime', {
          time: minuteToHandoverTime(threshold ?? handoverTimeToMinute('22:00') ?? 0),
        })
      : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.GRACE_MINUTES
        ? t('threshold.waiting', { minutes: threshold ?? 0 })
        : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.KM_PER_DAY
          ? t('threshold.long_distance', { km: fmt.kmNumber(threshold ?? 0) })
          : t('threshold.overnight');

  return (
    <div className={styles.rule} data-enabled={enabled ? 'true' : 'false'}>
      <div className={styles.ruleHead}>
        <div>
          <h2 className={styles.ruleTitle}>{domainLabel('driverSurchargeKind', kind)}</h2>
          <p className={styles.ruleDesc}>{description}</p>
        </div>
        <SwitchField
          control={control}
          name={`${kind}.enabled`}
          label={t('enableLabel', { kind: domainLabel('driverSurchargeKind', kind) })}
          disabled={!canEdit}
        />
      </div>
      <div className={styles.ruleBody}>
        <NumberField
          control={control}
          name={`${kind}.amount`}
          label={t('amount')}
          money
          addonAfter={domainLabel('driverSurchargeUnit', spec.unit)}
          min={0}
        />
        {spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY ? (
          <SelectField
            control={control}
            name={`${kind}.thresholdValue`}
            label={t('threshold.overtimeField')}
            options={TIME_OPTIONS}
            disabled={!canEdit}
          />
        ) : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.GRACE_MINUTES ? (
          <NumberField
            control={control}
            name={`${kind}.thresholdValue`}
            label={t('threshold.waitingField')}
            min={0}
            max={DRIVER_SURCHARGE_THRESHOLD_MAX}
          />
        ) : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.KM_PER_DAY ? (
          <NumberField
            control={control}
            name={`${kind}.thresholdValue`}
            label={t('threshold.longDistanceField')}
            min={0}
            max={DRIVER_SURCHARGE_THRESHOLD_MAX}
          />
        ) : null}
      </div>
    </div>
  );
}
