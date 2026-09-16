import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  AUTO_ACCEPT_MAX_LEAD_OPTIONS_MINUTES,
  AUTO_ACCEPT_MIN_LEAD_OPTIONS_MINUTES,
  MIN_BOOKING_LEAD_MINUTES_RANGE,
  MIN_RENTAL_MINUTES_RANGE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  isRouteType,
  type ServiceType,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CheckMark } from '@/components/ui/CheckMark';
import { InlineAction } from '@/components/ui/InlineAction';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { SelectField } from '@/components/ui/SelectField';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ROUTES } from '@/navigation/routes';
import {
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';
import type { VehicleServiceSetting } from './api';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from './hooks/use-vehicle-settings';

/** Bốn điều kiện server dùng để tự nhận — chỉ là danh sách khoá nhãn, không đổi theo render. */
const RULES = ['schedule', 'window', 'quote', 'longTerm'] as const;

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const schema = yup.object({
  autoAcceptEnabled: yup.boolean().defined(),
  // Giá trị giữ dạng CHUỖI vì `options` của ô chọn (web + native) khoá `value: string`; số thô
  // không khớp option nào nên ô hiện ra số phút trần ("60") hoặc bỏ trống. Quy về số lúc gửi đi.
  autoAcceptMinLeadMinutes: yup.string().defined().required(),
  autoAcceptMaxLeadMinutes: yup
    .string()
    .defined()
    .required()
    .test(
      'min-max',
      'minMax',
      (max, ctx) => Number(max) >= Number(ctx.parent.autoAcceptMinLeadMinutes),
    ),
  minRentalMinutes: yup.string().nullable().defined(),
  preferredRouteTypes: yup.array().of(yup.string().defined()).defined(),
});
type FormValues = yup.InferType<typeof schema>;

/**
 * Mục "Tối ưu nhận chuyến" — MỘT màn cho cả hai dịch vụ, bản native của `AutoAcceptSection`.
 *
 * Công tắc ở đây chỉ GHI thiết lập; quyết định tự nhận nằm ở server
 * (`VehicleSettingsService.evaluateAutoAccept` + `BookingRequestsService.tryAutoAccept`) — màn
 * hình không đoán lại luật, nó chỉ liệt kê chúng ở khối "Điều kiện để hệ thống tự nhận".
 */
export function VehicleAutoAcceptScreen({
  vehicleId,
  serviceType,
}: {
  vehicleId: string;
  serviceType: ServiceType;
}) {
  const t = useTranslations('VehicleManage');
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const section: VehicleManageSection = withDriver
    ? VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION
    : VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION;

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={section}
      title={t(withDriver ? 'nav.withDriverOptimization' : 'nav.selfDriveOptimization')}
    >
      {({ canEdit }) => (
        <AutoAcceptBody vehicleId={vehicleId} serviceType={serviceType} canEdit={canEdit} />
      )}
    </VehicleManageShell>
  );
}

function AutoAcceptBody({
  vehicleId,
  serviceType,
  canEdit,
}: {
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const settings = useVehicleServiceSettings(vehicleId);
  const setting = settings.data?.find((s) => s.serviceType === serviceType);

  if (settings.isLoading) return <MiniRowsSkeleton rows={6} />;
  if (settings.isError || !setting) {
    return (
      <ScreenError
        error={settings.error}
        title={t('common.loadError')}
        onRetry={() => void settings.refetch()}
      />
    );
  }

  return (
    <AutoAcceptForm
      // Bản mới về từ server ⇒ dựng lại form với giá trị mới, không giữ bản nháp đã cũ.
      key={setting.updatedAt ?? 'new'}
      setting={setting}
      serviceType={serviceType}
      vehicleId={vehicleId}
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
  const toast = useAppToast();
  const { switchTo } = useShellScope();
  const patch = usePatchVehicleServiceSetting(vehicleId, serviceType);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.autoAccept.validation');
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const capability = setting.withDriverAutoAccept;
  const capabilityBlocked = withDriver && capability ? !capability.available : false;

  const values = useMemo<FormValues>(
    () => ({
      autoAcceptEnabled: setting.autoAcceptEnabled,
      autoAcceptMinLeadMinutes: String(setting.autoAcceptMinLeadMinutes),
      autoAcceptMaxLeadMinutes: String(setting.autoAcceptMaxLeadMinutes),
      minRentalMinutes: setting.minRentalMinutes == null ? null : String(setting.minRentalMinutes),
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

  const minLeadOptions = (
    withDriver
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

  const submit = handleSubmit((next) => {
    patch.mutate(
      {
        autoAcceptEnabled: next.autoAcceptEnabled,
        autoAcceptMinLeadMinutes: Number(next.autoAcceptMinLeadMinutes),
        autoAcceptMaxLeadMinutes: Number(next.autoAcceptMaxLeadMinutes),
        ...(withDriver
          ? {
              minRentalMinutes:
                next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
              // Lọc qua `isRouteType` — form giữ string, dây chỉ nhận mã lộ trình thật.
              preferredRouteTypes: next.preferredRouteTypes.filter(isRouteType),
            }
          : {}),
      },
      {
        onSuccess: () => toast.showSuccess(t('autoAccept.saved')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <Card tone={enabled ? 'accent' : 'muted'} lift="flat">
        <XStack ai="flex-start" gap={space.sm}>
          <Ionicons
            name="flash"
            size={iconSize.md}
            color={enabled ? colors.primaryActive : colors.textMuted}
          />
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t(enabled ? 'autoAccept.activeTitle' : 'autoAccept.inactiveTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t(enabled ? 'autoAccept.activeBody' : 'autoAccept.inactiveBody')}
            </Text>
          </YStack>
        </XStack>
      </Card>

      {withDriver && capability ? (
        <Callout tone={capability.available ? 'success' : 'warning'}>
          {capability.available
            ? t('autoAccept.capabilityOk', { count: capability.activeDrivers })
            : capability.driversFeatureEnabled
              ? t('autoAccept.capabilityNoDriver')
              : t('autoAccept.capabilityNoFeature')}
        </Callout>
      ) : null}
      {withDriver && capability?.driversFeatureEnabled ? (
        <InlineAction
          label={t('autoAccept.openDrivers')}
          onPress={() => switchTo(APP_SCOPE.MANAGE, ROUTES.manage.drivers())}
        />
      ) : null}

      <Card>
        <Controller
          control={control}
          name="autoAcceptEnabled"
          render={({ field }) => (
            <ToggleRow
              label={t(withDriver ? 'autoAccept.instantTitle' : 'autoAccept.toggleTitle')}
              hint={t(withDriver ? 'autoAccept.instantBody' : 'autoAccept.toggleBody')}
              checked={field.value}
              disabled={!canEdit || (capabilityBlocked && !setting.autoAcceptEnabled)}
              onToggle={() => field.onChange(!field.value)}
            />
          )}
        />
      </Card>

      <Card>
        <YStack gap={space.md}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('autoAccept.windowTitle')}
          </Text>
          {withDriver ? (
            <>
              <SelectField
                control={control}
                name="minRentalMinutes"
                label={t('autoAccept.minRental')}
                options={minRentalOptions}
                hint={t('autoAccept.minRentalHint')}
                disabled={!canEdit}
              />
              <SelectField
                control={control}
                name="autoAcceptMinLeadMinutes"
                label={t('autoAccept.minLeadDriver')}
                options={minLeadOptions}
                hint={t('autoAccept.minLeadDriverHint')}
                disabled={!canEdit}
              />
            </>
          ) : (
            <SelectField
              control={control}
              name="autoAcceptMinLeadMinutes"
              label={t('autoAccept.minLead')}
              options={minLeadOptions}
              disabled={!canEdit}
            />
          )}
          <SelectField
            control={control}
            name="autoAcceptMaxLeadMinutes"
            label={t('autoAccept.maxLead')}
            options={maxLeadOptions}
            disabled={!canEdit}
          />

          {withDriver ? (
            <Controller
              control={control}
              name="preferredRouteTypes"
              render={({ field }) => (
                <YStack gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {t('autoAccept.routesTitle')}
                  </Text>
                  {ROUTE_TYPE_VALUES.map((value) => {
                    const checked = field.value.includes(value);
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked, disabled: !canEdit }}
                        accessibilityLabel={domainLabel('routeType', value)}
                        disabled={!canEdit}
                        onPress={() =>
                          field.onChange(
                            checked
                              ? field.value.filter((v: string) => v !== value)
                              : [...field.value, value],
                          )
                        }
                        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                      >
                        <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget}>
                          <CheckMark checked={checked} />
                          <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                            {domainLabel('routeType', value)}
                          </Text>
                        </XStack>
                      </Pressable>
                    );
                  })}
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('autoAccept.routesHint')}
                  </Text>
                </YStack>
              )}
            />
          ) : null}
        </YStack>
      </Card>

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('autoAccept.rulesTitle')}
          </Text>
          {RULES.map((rule) => (
            <Text key={rule} col={colors.textMuted} fos={fontSize.label}>
              {`• ${t(`autoAccept.rules.${rule}` as never)}`}
            </Text>
          ))}
          {withDriver ? (
            <>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {`• ${t('autoAccept.rules.driver')}`}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {`• ${t('autoAccept.rules.hold')}`}
              </Text>
            </>
          ) : null}
          <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold} mt={space.xs}>
            {t('autoAccept.policyTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('autoAccept.policyBody')}
          </Text>
        </YStack>
      </Card>

      {canEdit ? (
        <XStack gap={space.sm}>
          {formState.isDirty ? (
            <YStack flexShrink={0}>
              <Button
                label={tActions('cancel')}
                variant="ghost"
                disabled={patch.isPending}
                onPress={() => reset(values)}
              />
            </YStack>
          ) : null}
          <YStack f={1}>
            <Button
              label={tActions('saveChanges')}
              icon="checkmark-outline"
              loading={patch.isPending}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}
