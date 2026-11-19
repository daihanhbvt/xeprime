import { useReportDirty } from '@/hooks/use-report-dirty';
import { yupResolver } from '@hookform/resolvers/yup';
import { Ionicons } from '@/components/icons/Ionicons';
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
import { SectionHeader } from '@/components/ui/CardTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CheckMark } from '@/components/ui/CheckMark';
import { InlineAction } from '@/components/ui/InlineAction';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { SelectField } from '@/components/ui/SelectField';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useAutoAcceptToggle } from './hooks/use-auto-accept-toggle';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import type { VehicleServiceSetting } from './api';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from './hooks/use-vehicle-settings';

/** Bốn điều kiện server dùng để tự nhận — chỉ là danh sách khoá nhãn, không đổi theo render. */
const RULES = ['schedule', 'window', 'quote', 'longTerm'] as const;
/** Danh sách luật của hàng "Nhận chuyến tự động" ở web `ServicesPane.AutoAcceptRow`. */
const PANE_RULES = ['schedule', 'quote', 'longTerm'] as const;

/**
 * `all` = màn riêng cũ (mục lục quản lý xe khu tài khoản). Màn "Dịch vụ & giá" dựng theo web
 * `ServicesPane`: `toggle` = hàng công tắc + năng lực tài xế + luật (ⓘ) trong MỘT thẻ, đặt ngay dưới
 * thẻ dịch vụ; `extras` = thẻ "Khác" của có tài xế (phân khúc ưu tiên rồi thời gian tối thiểu).
 */
export type AutoAcceptPart = 'all' | 'toggle' | 'extras';

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
  part = 'all',
  onDirtyChange,
}: {
  /** Báo "đang sửa dở" lên màn chứa (`useReportDirty`). */
  onDirtyChange?: (dirty: boolean) => void;
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
  part?: AutoAcceptPart;
}) {
  const t = useTranslations('VehicleManage');
  const settings = useVehicleServiceSettings(vehicleId);
  const setting = settings.data?.find((s) => s.serviceType === serviceType);

  if (part === 'extras' && serviceType !== SERVICE_TYPE.WITH_DRIVER) return null;
  if (settings.isLoading) return <MiniRowsSkeleton rows={part === 'all' ? 6 : 2} />;
  if (settings.isError || !setting) {
    // Thẻ "Khác" không lặp lỗi đã hiện ở thẻ công tắc ngay trên.
    if (part === 'extras') return null;
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
      part={part}
      onDirtyChange={onDirtyChange}
    />
  );
}

function AutoAcceptForm({
  setting,
  serviceType,
  vehicleId,
  canEdit,
  part,
  onDirtyChange,
}: {
  setting: VehicleServiceSetting;
  serviceType: ServiceType;
  vehicleId: string;
  canEdit: boolean;
  part: AutoAcceptPart;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage');
  const tEditor = useTranslations('Vehicles.editor.services');
  const [rulesOpen, setRulesOpen] = useState(false);
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const patch = usePatchVehicleServiceSetting(vehicleId, serviceType);
  /*
   * `yupResolver` trần: bỏ ràng buộc "tối thiểu ≤ tối đa" cùng khoảng đặt trước (17/09/2026)
   * thì schema này không còn câu lỗi nào để dịch, và namespace kia không còn tồn tại.
   */
  const resolver = yupResolver(schema);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;

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
  useReportDirty(formState.isDirty, onDirtyChange);

  /* Công tắc LƯU NGAY — cùng hook với thẻ "Tối ưu nhận chuyến" ở chi tiết xe (web `useAutoAcceptToggle`). */
  const toggleAuto = useAutoAcceptToggle({ vehicleId, setting, canEdit });
  const enabled = toggleAuto.enabled;

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

  /* Có tài xế không tự nhận (19/11/2026) - nói lý do thay cho khung năng lực tài xế (như web). */
  const capabilityCallout = withDriver ? (
    <Callout tone="info">{t('autoAccept.withDriverManualOnly')}</Callout>
  ) : null;

  if (part === 'toggle') {
    // Web `AutoAcceptRow`: MỘT hàng công tắc, cảnh báo năng lực tài xế kèm nút "Mở tài xế", danh sách
    // luật mở/đóng tại chỗ (nút ⓘ của web).
    return (
      <Card>
        <YStack gap={space.sm}>
          <ToggleRow
            label={t('autoAccept.toggleTitle')}
            hint={t('autoAccept.toggleBody')}
            checked={enabled}
            disabled={toggleAuto.disabled}
            onToggle={() => toggleAuto.change(!enabled)}
          />
          {capabilityCallout}
          <InlineAction
            label={t('autoAccept.rulesTitle')}
            onPress={() => setRulesOpen((open) => !open)}
          />
          {rulesOpen ? (
            <YStack gap={space.xs}>
              {PANE_RULES.map((rule) => (
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
                    {`• ${t('autoAccept.rules.appHold')}`}
                  </Text>
                </>
              ) : null}
              <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                {t('autoAccept.policyTitle')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('autoAccept.policyBody')}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </Card>
    );
  }

  const routesField = (
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
  );

  const minRentalField = (
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
  );

  const saveRow =
    canEdit && withDriver ? (
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
    ) : null;

  if (part === 'extras') {
    // Web `WithDriverExtras`: thẻ "Khác" - phân khúc chuyến ưu tiên TRƯỚC, thời gian tối thiểu SAU.
    return (
      <Card>
        <YStack gap={space.md}>
          <SectionHeader icon="options-outline">{tEditor('extras')}</SectionHeader>
          {routesField}
          {minRentalField}
          {saveRow}
        </YStack>
      </Card>
    );
  }

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

      {capabilityCallout}

      <Card>
        <ToggleRow
          label={t(withDriver ? 'autoAccept.instantTitle' : 'autoAccept.toggleTitle')}
          hint={t(withDriver ? 'autoAccept.instantBody' : 'autoAccept.toggleBody')}
          checked={enabled}
          disabled={toggleAuto.disabled}
          onToggle={() => toggleAuto.change(!enabled)}
        />
      </Card>

      {withDriver ? (
        <Card>
          <YStack gap={space.md}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('autoAccept.withDriverTitle')}
            </Text>
            {minRentalField}
            {routesField}
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
                {`• ${t('autoAccept.rules.appHold')}`}
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
      {saveRow}
    </YStack>
  );
}
