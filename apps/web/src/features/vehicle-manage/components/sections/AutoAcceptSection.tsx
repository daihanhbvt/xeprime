'use client';

import { ThunderboltFilled } from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  AUTO_ACCEPT_MAX_LEAD_OPTIONS_MINUTES,
  AUTO_ACCEPT_MIN_LEAD_OPTIONS_MINUTES,
  MIN_BOOKING_LEAD_MINUTES_RANGE,
  MIN_RENTAL_MINUTES_RANGE,
  ROUTE_TYPE_VALUES,
  isRouteType,
  SERVICE_TYPE,
  type ServiceType,
} from '@xeprime/types';

import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { SelectField } from '@/components/form/SelectField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { SwitchField } from '@/components/form/SwitchField';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { usePatchVehicleServiceSetting, useVehicleServiceSettings } from '../../hooks';
import type { VehicleServiceSetting } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './AutoAcceptSection.module.css';

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const schema = yup.object({
  autoAcceptEnabled: yup.boolean().defined(),
  autoAcceptMinLeadMinutes: yup.number().integer().min(0).defined(),
  autoAcceptMaxLeadMinutes: yup
    .number()
    .integer()
    .defined()
    .test('min-max', 'minMax', (max, ctx) => max >= Number(ctx.parent.autoAcceptMinLeadMinutes)),
  minRentalMinutes: yup.number().integer().nullable().defined(),
  preferredRouteTypes: yup.array().of(yup.string().defined()).defined(),
});
type FormValues = yup.InferType<typeof schema>;

/**
 * Mục "Tối ưu nhận chuyến" (mockup 7 tự lái, 12 có tài xế) — MỘT component cho cả hai dịch vụ,
 * khác nhau ở các ô riêng của có tài xế (thời lượng tối thiểu, lộ trình ưu tiên, năng lực tài
 * xế). Toggle ở đây chỉ là GHI thiết lập; quyết định tự nhận nằm ở server
 * (`VehicleSettingsService.evaluateAutoAccept` + `BookingRequestsService.tryAutoAccept`).
 */
export function AutoAcceptSection({ serviceType }: { serviceType: ServiceType }) {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleServiceSettings(vehicle.id);
  const setting = settings.data?.find((s) => s.serviceType === serviceType);

  if (settings.isLoading) return <LoadingState variant="page" />;
  if (settings.isError || !setting) {
    return (
      <EmptyState
        variant="error"
        title={t('common.loadError')}
        description={tCommon('states.errorHint')}
        onRetry={() => void settings.refetch()}
      />
    );
  }
  return (
    <AutoAcceptForm
      key={setting.updatedAt ?? 'new'}
      setting={setting}
      serviceType={serviceType}
      vehicleId={vehicle.id}
      canEdit={canEdit}
    />
  );
}

function AutoAcceptForm({
  setting,
  serviceType,
  vehicleId,
  canEdit,
}: {
  setting: VehicleServiceSetting;
  serviceType: ServiceType;
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const patch = usePatchVehicleServiceSetting(vehicleId, serviceType);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.autoAccept.validation');
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const capability = setting.withDriverAutoAccept;
  const capabilityBlocked = withDriver && capability ? !capability.available : false;

  const values = useMemo<FormValues>(
    () => ({
      autoAcceptEnabled: setting.autoAcceptEnabled,
      autoAcceptMinLeadMinutes: setting.autoAcceptMinLeadMinutes,
      autoAcceptMaxLeadMinutes: setting.autoAcceptMaxLeadMinutes,
      minRentalMinutes: setting.minRentalMinutes ?? null,
      preferredRouteTypes: setting.preferredRouteTypes,
    }),
    [setting],
  );
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({ resolver, values });
  const enabled = useWatch({ control, name: 'autoAcceptEnabled' });

  /** Nhãn "6 giờ tới" / "1 tuần tới" — dựng từ phút, không có bảng nhãn thứ hai. */
  const leadLabel = (minutes: number) => {
    const text =
      minutes % WEEK === 0
        ? t('common.weeks', { count: minutes / WEEK })
        : minutes % DAY === 0
          ? t('common.days', { count: minutes / DAY })
          : minutes % HOUR === 0
            ? t('common.hours', { count: minutes / HOUR })
            : t('common.minutes', { count: minutes });
    return t('autoAccept.leadValue', { value: text });
  };
  const minLeadOptions = (withDriver
    ? AUTO_ACCEPT_MIN_LEAD_OPTIONS_MINUTES.filter(
        (m) => m >= MIN_BOOKING_LEAD_MINUTES_RANGE.min && m <= MIN_BOOKING_LEAD_MINUTES_RANGE.max,
      )
    : AUTO_ACCEPT_MIN_LEAD_OPTIONS_MINUTES
  ).map((m) => ({ value: String(m), label: leadLabel(m) }));
  const maxLeadOptions = AUTO_ACCEPT_MAX_LEAD_OPTIONS_MINUTES.map((m) => ({
    value: String(m),
    label: leadLabel(m),
  }));
  const minRentalOptions = Array.from(
    { length: MIN_RENTAL_MINUTES_RANGE.max / HOUR },
    (_, i) => (i + 1) * HOUR,
  ).map((m) => ({ value: String(m), label: t('common.hours', { count: m / HOUR }) }));
  const routeOptions = ROUTE_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('routeType', value),
  }));

  const submit = handleSubmit(async (next) => {
    try {
      await patch.mutateAsync({
        autoAcceptEnabled: next.autoAcceptEnabled,
        autoAcceptMinLeadMinutes: Number(next.autoAcceptMinLeadMinutes),
        autoAcceptMaxLeadMinutes: Number(next.autoAcceptMaxLeadMinutes),
        ...(withDriver
          ? {
              minRentalMinutes: next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
              // Lọc qua `isRouteType` — form giữ string, dây chỉ nhận mã lộ trình thật.
              preferredRouteTypes: next.preferredRouteTypes.filter(isRouteType),
            }
          : {}),
      });
      message.success(t('autoAccept.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  });

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form noValidate onSubmit={submit} className={styles.form}>
        <SectionCard headingLevel={1}>
          <div className={styles.status} data-active={enabled ? 'true' : 'false'}>
            <ThunderboltFilled className={styles.statusIcon} aria-hidden="true" />
            <div>
              <h1 className={styles.statusTitle}>
                {t(enabled ? 'autoAccept.activeTitle' : 'autoAccept.inactiveTitle')}
              </h1>
              <p className={styles.statusBody}>
                {t(enabled ? 'autoAccept.activeBody' : 'autoAccept.inactiveBody')}
              </p>
            </div>
          </div>

          {withDriver && capability ? (
            <Alert
              type={capability.available ? 'success' : 'warning'}
              showIcon
              message={
                capability.available
                  ? t('autoAccept.capabilityOk', { count: capability.activeDrivers })
                  : capability.driversFeatureEnabled
                    ? t('autoAccept.capabilityNoDriver')
                    : t('autoAccept.capabilityNoFeature')
              }
              action={
                capability.driversFeatureEnabled ? (
                  <Link href={ROUTES.MANAGE.DRIVERS}>
                    <Button size="small">{t('autoAccept.openDrivers')}</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : null}

          <SwitchField
            control={control}
            name="autoAcceptEnabled"
            label={t(withDriver ? 'autoAccept.instantTitle' : 'autoAccept.toggleTitle')}
            description={t(withDriver ? 'autoAccept.instantBody' : 'autoAccept.toggleBody')}
            disabled={!canEdit || (capabilityBlocked && !setting.autoAcceptEnabled)}
          />
        </SectionCard>

        <SectionCard title={t('autoAccept.windowTitle')}>
          <div className={styles.pair}>
            {withDriver ? (
              <>
                <SelectField
                  control={control}
                  name="minRentalMinutes"
                  label={t('autoAccept.minRental')}
                  options={minRentalOptions}
                  allowClear
                  help={t('autoAccept.minRentalHint')}
                  disabled={!canEdit}
                />
                <SelectField
                  control={control}
                  name="autoAcceptMinLeadMinutes"
                  label={t('autoAccept.minLeadDriver')}
                  options={minLeadOptions}
                  help={t('autoAccept.minLeadDriverHint')}
                  disabled={!canEdit}
                />
              </>
            ) : (
              <>
                <SelectField
                  control={control}
                  name="autoAcceptMinLeadMinutes"
                  label={t('autoAccept.minLead')}
                  options={minLeadOptions}
                  disabled={!canEdit}
                />
                <SelectField
                  control={control}
                  name="autoAcceptMaxLeadMinutes"
                  label={t('autoAccept.maxLead')}
                  options={maxLeadOptions}
                  disabled={!canEdit}
                />
              </>
            )}
          </div>
          {withDriver ? (
            <>
              <SelectField
                control={control}
                name="autoAcceptMaxLeadMinutes"
                label={t('autoAccept.maxLead')}
                options={maxLeadOptions}
                disabled={!canEdit}
              />
              <CheckboxGroupField
                control={control}
                name="preferredRouteTypes"
                label={t('autoAccept.routesTitle')}
                options={routeOptions}
                help={t('autoAccept.routesHint')}
                disabled={!canEdit}
              />
            </>
          ) : null}
        </SectionCard>

        <SectionCard title={t('autoAccept.rulesTitle')}>
          <ul className={styles.rules}>
            <li>{t('autoAccept.rules.schedule')}</li>
            <li>{t('autoAccept.rules.window')}</li>
            <li>{t('autoAccept.rules.quote')}</li>
            <li>{t('autoAccept.rules.longTerm')}</li>
            {withDriver ? <li>{t('autoAccept.rules.driver')}</li> : null}
            {withDriver ? <li>{t('autoAccept.rules.hold')}</li> : null}
          </ul>
          <div className={styles.policy}>
            <strong>{t('autoAccept.policyTitle')}</strong>
            <p>{t('autoAccept.policyBody')}</p>
          </div>
        </SectionCard>

        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          onCancel={formState.isDirty ? () => reset(values) : undefined}
          submitting={patch.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>
    </Form>
  );
}
