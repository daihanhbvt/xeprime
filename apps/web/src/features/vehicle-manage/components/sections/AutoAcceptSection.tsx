'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { InfoCircleOutlined, ThunderboltFilled } from '@ant-design/icons';
import { Alert, App, Button, Form, Popover } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, type MouseEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
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

import { usePatchVehicleServiceSetting, useVehicleServiceSettings } from '../../hooks';
import type { VehicleServiceSetting } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './AutoAcceptSection.module.css';

const HOUR = 60;

const schema = yup.object({
  autoAcceptEnabled: yup.boolean().defined(),
  minRentalMinutes: yup.string().nullable().defined(),
  preferredRouteTypes: yup.array().of(yup.string().defined()).defined(),
});
type FormValues = yup.InferType<typeof schema>;

/**
 * Mục "Tối ưu nhận chuyến" (mockup 7 tự lái, 12 có tài xế) — MỘT component cho cả hai dịch vụ,
 * khác nhau ở các ô riêng của có tài xế (thời lượng tối thiểu, lộ trình ưu tiên, năng lực tài
 * xế). Toggle ở đây chỉ là GHI thiết lập; quyết định tự nhận nằm ở server
 * (`VehicleSettingsService.evaluateAutoAccept` + `BookingRequestsService.tryAutoAccept`).
 *
 * 17/09/2026 — bỏ "Khoảng thời gian cho phép tự động đồng ý". Trước đó công tắc này đi kèm hai
 * mốc đặt trước (mặc định 6 giờ – 1 tuần), nên chủ xe bật nó, đọc dòng "đang hoạt động", rồi vẫn
 * phải duyệt tay mọi chuyến đặt gấp hoặc đặt xa mà không có gì nói vì sao. Nay BẬT là nhận.
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

/**
 * Điều kiện để hệ thống tự nhận — nội dung của icon thông tin cạnh công tắc.
 *
 * Trước đây là một thẻ riêng chiếm nửa màn hình. Đây là thứ người ta đọc MỘT lần lúc quyết định
 * bật rồi không đọc lại, nên nó không xứng một chỗ thường trực; nhưng cũng không được biến mất —
 * bốn dòng này là toàn bộ lời hứa của công tắc.
 */
function AutoAcceptRules({ withDriver }: { withDriver: boolean }) {
  const t = useTranslations('VehicleManage.autoAccept');
  return (
    <div className={styles.rulesPopover}>
      <ul className={styles.rules}>
        <li>{t('rules.schedule')}</li>
        <li>{t('rules.window')}</li>
        <li>{t('rules.quote')}</li>
        <li>{t('rules.longTerm')}</li>
        {withDriver ? <li>{t('rules.driver')}</li> : null}
        {withDriver ? <li>{t('rules.hold')}</li> : null}
      </ul>
      <div className={styles.policy}>
        <strong>{t('policyTitle')}</strong>
        <p>{t('policyBody')}</p>
      </div>
    </div>
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
  /*
   * `yupResolver` trần chứ không phải `useValidationResolver`: schema này không còn câu lỗi nào
   * để dịch sau khi bỏ ràng buộc "tối thiểu ≤ tối đa" (17/09/2026). Bọc nó sẽ trỏ tới một
   * namespace không tồn tại.
   */
  const resolver = yupResolver(schema);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const capability = setting.withDriverAutoAccept;
  const capabilityBlocked = withDriver && capability ? !capability.available : false;

  const values = useMemo<FormValues>(
    () => ({
      autoAcceptEnabled: setting.autoAcceptEnabled,
      minRentalMinutes: setting.minRentalMinutes == null ? null : String(setting.minRentalMinutes),
      preferredRouteTypes: setting.preferredRouteTypes,
    }),
    [setting],
  );
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({ resolver, values });
  const enabled = useWatch({ control, name: 'autoAcceptEnabled' });

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
        ...(withDriver
          ? {
              minRentalMinutes:
                next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
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
              title={
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
            labelExtra={
              <Popover
                content={<AutoAcceptRules withDriver={withDriver} />}
                title={t('autoAccept.rulesTitle')}
                trigger={['hover', 'click']}
                placement="topLeft"
              >
                {/*
                  `preventDefault` vì cả hàng là một `<label>`: thiếu nó thì chạm vào icon để đọc
                  điều kiện cũng lật luôn công tắc — đúng thứ người dùng chưa quyết định.
                */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('autoAccept.rulesTitle')}
                  className={styles.infoTrigger}
                  onClick={(event: MouseEvent<HTMLSpanElement>) => event.preventDefault()}
                >
                  <InfoCircleOutlined aria-hidden="true" />
                </span>
              </Popover>
            }
            disabled={!canEdit || (capabilityBlocked && !setting.autoAcceptEnabled)}
          />
        </SectionCard>

        {/*
          Chỉ có tài xế mới còn thiết lập riêng. Tự lái nay đúng MỘT công tắc — dựng thêm một thẻ
          ở đây là bắt người dùng cuộn qua một khung không chứa gì.
        */}
        {withDriver ? (
          <SectionCard title={t('autoAccept.withDriverTitle')}>
            <SelectField
              control={control}
              name="minRentalMinutes"
              label={t('autoAccept.minRental')}
              options={minRentalOptions}
              allowClear
              help={t('autoAccept.minRentalHint')}
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
          </SectionCard>
        ) : null}

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
