import { useRegisterSave, useReportDirty, type SubFormSave } from '@/hooks/use-report-dirty';
import { yupResolver } from '@hookform/resolvers/yup';
import { Ionicons } from '@/components/icons/Ionicons';
import { useMemo } from 'react';
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
import { SwitchRow } from '@/components/ui/SwitchRow';
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
import { RESET_DISCARD } from '@/hooks/use-form-refresh';

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
  registerSave,
}: {
  /** Báo "đang sửa dở" lên màn chứa (`useReportDirty`). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Màn chứa có MỘT nút Lưu chung (tab Dịch vụ xe): đăng ký hàm lưu lên đó và ẩn nút Lưu riêng của
   * thẻ - trước 27/11/2026 thẻ "Khác" có tài xế có nút Lưu thứ hai trùng với nút đáy màn.
   */
  registerSave?: (save: SubFormSave | null) => void;
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
      registerSave={registerSave}
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
  registerSave,
}: {
  setting: VehicleServiceSetting;
  serviceType: ServiceType;
  vehicleId: string;
  canEdit: boolean;
  part: AutoAcceptPart;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  registerSave?: ((save: SubFormSave | null) => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage');
  const tEditor = useTranslations('Vehicles.editor.services');
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

  const toBody = (next: FormValues) => ({
    minRentalMinutes: next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
    // Lọc qua `isRouteType` — form giữ string, dây chỉ nhận mã lộ trình thật.
    preferredRouteTypes: next.preferredRouteTypes.filter(isRouteType),
  });
  const submit = handleSubmit((next) => {
    // Chỉ có tài xế còn nút Lưu — tự lái không còn trường nào ngoài công tắc lưu ngay.
    patch.mutate(toBody(next), {
      onSuccess: () => toast.showSuccess(t('autoAccept.saved')),
      onError: (err) => toast.showError(errorMessage(err)),
    });
  });
  /* Lưu qua nút chung của màn chứa: im lặng (màn chứa toast một lần), reset theo số vừa gửi. */
  useRegisterSave(async () => {
    if (!formState.isDirty) return true;
    let ok = false;
    await handleSubmit(async (next) => {
      try {
        await patch.mutateAsync(toBody(next));
        reset(next, RESET_DISCARD);
        ok = true;
      } catch (err) {
        toast.showError(errorMessage(err));
      }
    })();
    return ok;
  }, part === 'extras' ? registerSave : undefined);

  /* Có tài xế không tự nhận (19/11/2026) - nói lý do thay cho khung năng lực tài xế (như web). */
  const capabilityCallout = withDriver ? (
    <Callout tone="info">{t('autoAccept.withDriverManualOnly')}</Callout>
  ) : null;

  if (part === 'toggle') {
    /*
     * Web `AutoAcceptRow`, dựng theo Figma Partner `24237:56664`: MỘT hàng công tắc nằm TRONG thẻ dịch
     * vụ (nơi gọi bọc thẻ). Luật tự nhận (nút "Luật" mở/đóng của bản trước) vào dấu ⓘ cạnh tiêu đề -
     * người dùng chốt 27/11/2026; cảnh báo năng lực tài xế giữ ngay dưới hàng.
     */
    return (
      <YStack gap={space.sm}>
        <SwitchRow
          title={t('autoAccept.toggleTitle')}
          titleHint={{
            label: t('autoAccept.rulesTitle'),
            content: (
              <YStack gap={space.xs}>
                {PANE_RULES.map((rule) => (
                  <Text key={rule} col={colors.textMuted} fos={fontSize.bodySm}>
                    {`• ${t(`autoAccept.rules.${rule}` as never)}`}
                  </Text>
                ))}
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('autoAccept.policyTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('autoAccept.policyBody')}
                </Text>
              </YStack>
            ),
          }}
          description={t('autoAccept.toggleBodyApp')}
          value={enabled}
          disabled={toggleAuto.disabled}
          onChange={(next) => toggleAuto.change(next)}
        />
        {capabilityCallout}
      </YStack>
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
    canEdit && withDriver && !registerSave ? (
      <XStack gap={space.sm}>
        {formState.isDirty ? (
          <YStack flexShrink={0}>
            <Button
              label={tActions('cancel')}
              variant="ghost"
              disabled={patch.isPending}
              onPress={() => reset(values, RESET_DISCARD)}
            />
          </YStack>
        ) : null}
        <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
          <Button
            label={tActions('saveChanges')}
            lineIcon="tick"
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

      {/* Có tài xế luôn duyệt tay (web PR #338) - không có công tắc, chỉ lời giải thích ở trên. */}
      {withDriver ? null : (
        <Card>
          <ToggleRow
            label={t('autoAccept.toggleTitle')}
            hint={t('autoAccept.toggleBodyApp')}
            checked={enabled}
            disabled={toggleAuto.disabled}
            onToggle={() => toggleAuto.change(!enabled)}
          />
        </Card>
      )}

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
