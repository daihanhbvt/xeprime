import { yupResolver } from '@hookform/resolvers/yup';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
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
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { VehicleServiceSetting } from './api';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from './hooks/use-vehicle-settings';

/** Bốn điều kiện server dùng để tự nhận — chỉ là danh sách khoá nhãn, không đổi theo render. */
const RULES = ['schedule', 'window', 'quote', 'longTerm'] as const;

const HOUR = 60;

/*
 * Form chỉ còn hai ô riêng của CÓ TÀI XẾ. Công tắc tự nhận KHÔNG thuộc form (web 30/09/2026): nó
 * LƯU NGAY khi bấm, cùng `PATCH /vehicles/:id/service-settings/:service`, chỉ gửi đúng
 * `autoAcceptEnabled` — server gộp từng trường, nên hai ô bên dưới không bị ghi đè.
 */
const schema = yup.object({
  // Giá trị giữ dạng CHUỖI vì `options` của ô chọn (web + native) khoá `value: string`; số thô
  // không khớp option nào nên ô hiện ra số phút trần ("60") hoặc bỏ trống. Quy về số lúc gửi đi.
  minRentalMinutes: yup.string().nullable().defined(),
  preferredRouteTypes: yup.array().of(yup.string().defined()).defined(),
});
type FormValues = yup.InferType<typeof schema>;

/**
 * Thân của mục — nạp thiết lập rồi dựng form. Xuất ra ngoài vì cổng QUẢN LÝ dùng lại đúng nó
 * (`VehicleOptimizationScreen`) với một cái vỏ khác: cùng thiết lập, cùng endpoint, nên hai bề
 * mặt không thể trôi khỏi nhau. Vỏ ở đây (`VehicleManageShell`) là mục lục quản lý xe của khu
 * TÀI KHOẢN — lồng nó vào cổng quản lý sẽ ra hai thanh đầu màn chồng nhau.
 */
export function AutoAcceptBody({
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
  /*
   * `yupResolver` trần: bỏ ràng buộc "tối thiểu ≤ tối đa" cùng khoảng đặt trước (17/09/2026)
   * thì schema này không còn câu lỗi nào để dịch, và namespace kia không còn tồn tại.
   */
  const resolver = yupResolver(schema);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const capability = setting.withDriverAutoAccept;
  const capabilityBlocked = withDriver && capability ? !capability.available : false;

  const values = useMemo<FormValues>(
    () => ({
      minRentalMinutes: setting.minRentalMinutes == null ? null : String(setting.minRentalMinutes),
      preferredRouteTypes: setting.preferredRouteTypes,
    }),
    [setting],
  );
  /* `keepDirtyValues`: bật/tắt công tắc làm thiết lập tải lại; ô đang sửa dở không bị ghi đè. */
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver,
    values,
    resetOptions: { keepDirtyValues: true },
  });

  /*
   * Công tắc LƯU NGAY — đúng web `changeAutoAccept`. Giá trị lạc quan gắn với `updatedAt` của
   * bản đang hiển thị: bản mới (đã lưu) về thì nhường chỗ cho dữ liệu server; lỗi thì bỏ và trả
   * công tắc về như cũ.
   */
  const toggleAuto = usePatchVehicleServiceSetting(vehicleId, serviceType);
  const [optimistic, setOptimistic] = useState<{ value: boolean; basis: string | null } | null>(
    null,
  );
  const enabled =
    optimistic && optimistic.basis === (setting.updatedAt ?? null)
      ? optimistic.value
      : setting.autoAcceptEnabled;

  function changeAutoAccept(next: boolean) {
    setOptimistic({ value: next, basis: setting.updatedAt ?? null });
    toggleAuto.mutate(
      { autoAcceptEnabled: next },
      {
        onSuccess: () => toast.showSuccess(t('autoAccept.saved')),
        onError: (err) => {
          setOptimistic(null);
          toast.showError(errorMessage(err));
        },
      },
    );
  }

  const minRentalOptions = Array.from(
    { length: MIN_RENTAL_MINUTES_RANGE.max / HOUR },
    (_, i) => (i + 1) * HOUR,
  ).map((m) => ({ value: String(m), label: t('common.hours', { count: m / HOUR }) }));

  const submit = handleSubmit((next) => {
    // Chỉ có tài xế còn nút Lưu — tự lái không còn trường nào ngoài công tắc lưu ngay.
    patch.mutate(
      {
        minRentalMinutes: next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
        // Lọc qua `isRouteType` — form giữ string, dây chỉ nhận mã lộ trình thật.
        preferredRouteTypes: next.preferredRouteTypes.filter(isRouteType),
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
        <ToggleRow
          label={t(withDriver ? 'autoAccept.instantTitle' : 'autoAccept.toggleTitle')}
          hint={t(withDriver ? 'autoAccept.instantBody' : 'autoAccept.toggleBody')}
          checked={enabled}
          disabled={
            !canEdit || toggleAuto.isPending || (capabilityBlocked && !setting.autoAcceptEnabled)
          }
          onToggle={() => changeAutoAccept(!enabled)}
        />
      </Card>

      {withDriver ? (
        <Card>
          <YStack gap={space.md}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('autoAccept.withDriverTitle')}
            </Text>
            <SelectField
              control={control}
              name="minRentalMinutes"
              label={t('autoAccept.minRental')}
              options={minRentalOptions}
              // Bỏ trống = KHÔNG đặt sàn thời lượng, một câu trả lời khác hẳn "sàn 1 giờ".
              allowClear
              hint={t('autoAccept.minRentalHint')}
              disabled={!canEdit}
            />
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
          </YStack>
        </Card>
      ) : null}

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

      {/* Nút Lưu chỉ còn ở có tài xế — đúng web. */}
      {canEdit && withDriver ? (
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
