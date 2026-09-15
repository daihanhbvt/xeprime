import { useMemo } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
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
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';
import type { DriverSurchargeRule } from './api';
import { useDriverSurchargeRules, useSaveDriverSurchargeRules } from './hooks/use-vehicle-settings';

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

/**
 * "Ngoài giờ" chọn MỐC GIỜ trong ngày bằng ô chọn, nên giá trị trong form phải là CHUỖI — đúng
 * kiểu `value` của option. Để số thô ở đây thì không option nào khớp: web hiện ra số phút
 * ("1320") còn native bỏ trống ô. Quy về số ở bước gửi đi.
 */
const overtimeRuleSchema = ruleSchema.shape({
  thresholdValue: yup.string().nullable().defined(),
});

const schema = yup.object({
  [DRIVER_SURCHARGE_KIND.OVERTIME]: overtimeRuleSchema,
  [DRIVER_SURCHARGE_KIND.WAITING]: ruleSchema,
  [DRIVER_SURCHARGE_KIND.LONG_DISTANCE]: ruleSchema,
  [DRIVER_SURCHARGE_KIND.OVERNIGHT]: ruleSchema,
});
type FormValues = yup.InferType<typeof schema>;

/** Mốc giờ 30 phút cho "ngoài giờ từ" — cùng cách tạo với màn khung giờ giao nhận. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => ({
  value: String(i * 30),
  label: minuteToHandoverTime(i * 30),
}));

/**
 * Mục "Phụ phí" có tài xế: bốn khoản MẶC ĐỊNH — bật/tắt, số tiền, ngưỡng, đơn vị cố định theo
 * loại. Bản native của `DriverSurchargesSection`.
 *
 * Đây là quy tắc CÔNG BỐ TRƯỚC với khách và đóng băng vào đơn; khoản THẬT vẫn được ghi ở bước
 * quyết toán (`booking_surcharges`) với số tiền gợi ý từ chính quy tắc này — màn hình nói rõ điều
 * đó, nếu không chủ xe tưởng tiền tự cộng vào giá ban đầu.
 */
export function VehicleSurchargesScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES}
      title={t('surcharges.title')}
      subtitle={t('surcharges.subtitle')}
    >
      {({ canEdit }) => <SurchargesBody vehicleId={vehicleId} canEdit={canEdit} />}
    </VehicleManageShell>
  );
}

function SurchargesBody({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const rules = useDriverSurchargeRules(vehicleId);

  if (rules.isLoading) return <MiniRowsSkeleton rows={6} />;
  if (rules.isError || !rules.data) {
    return (
      <ScreenError
        error={rules.error}
        title={t('common.loadError')}
        onRetry={() => void rules.refetch()}
      />
    );
  }
  return <SurchargesForm rules={rules.data} vehicleId={vehicleId} canEdit={canEdit} />;
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
  const toast = useAppToast();
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
    const overtime = of(DRIVER_SURCHARGE_KIND.OVERTIME);
    return {
      [DRIVER_SURCHARGE_KIND.OVERTIME]: {
        ...overtime,
        thresholdValue: overtime.thresholdValue == null ? null : String(overtime.thresholdValue),
      },
      [DRIVER_SURCHARGE_KIND.WAITING]: of(DRIVER_SURCHARGE_KIND.WAITING),
      [DRIVER_SURCHARGE_KIND.LONG_DISTANCE]: of(DRIVER_SURCHARGE_KIND.LONG_DISTANCE),
      [DRIVER_SURCHARGE_KIND.OVERNIGHT]: of(DRIVER_SURCHARGE_KIND.OVERNIGHT),
    };
  }, [rules]);
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({ resolver, values });

  const submit = handleSubmit((next) => {
    save.mutate(
      DRIVER_SURCHARGE_KIND_VALUES.map((kind) => {
        const rule = next[kind];
        const spec = DRIVER_SURCHARGE_KIND_SPEC[kind];
        return {
          kind,
          enabled: rule.enabled,
          amount: String(Math.round(rule.amount ?? 0)),
          thresholdValue:
            spec.threshold === null
              ? null
              : rule.thresholdValue == null
                ? null
                : Number(rule.thresholdValue),
        };
      }),
      {
        onSuccess: () => toast.showSuccess(t('surcharges.saved')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      {DRIVER_SURCHARGE_KIND_VALUES.map((kind) => (
        <RuleCard key={kind} kind={kind} control={control} canEdit={canEdit} />
      ))}

      <Text col={colors.placeholder} fos={fontSize.label}>
        {t('surcharges.flowNote')}
      </Text>

      {canEdit ? (
        <XStack gap={space.sm}>
          {formState.isDirty ? (
            <YStack flexShrink={0}>
              <Button
                label={tActions('cancel')}
                variant="ghost"
                disabled={save.isPending}
                onPress={() => reset(values)}
              />
            </YStack>
          ) : null}
          <YStack f={1}>
            <Button
              label={tActions('saveChanges')}
              icon="checkmark-outline"
              loading={save.isPending}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
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
  const threshold = useWatch({ control, name: `${kind}.thresholdValue` });
  const kindLabel = domainLabel('driverSurchargeKind', kind);

  // Ô "ngoài giờ" giữ chuỗi (xem `overtimeRuleSchema`), ba loại còn lại giữ số.
  const thresholdNumber = threshold == null || threshold === '' ? null : Number(threshold);

  const description =
    spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY
      ? t('threshold.overtime', {
          time: minuteToHandoverTime(thresholdNumber ?? handoverTimeToMinute('22:00') ?? 0),
        })
      : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.GRACE_MINUTES
        ? t('threshold.waiting', { minutes: thresholdNumber ?? 0 })
        : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.KM_PER_DAY
          ? t('threshold.long_distance', { km: fmt.kmNumber(thresholdNumber ?? 0) })
          : t('threshold.overnight');

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {kindLabel}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {description}
        </Text>

        <Controller
          control={control}
          name={`${kind}.enabled`}
          render={({ field }) => (
            <ToggleRow
              label={t('enableLabel', { kind: kindLabel })}
              checked={field.value}
              disabled={!canEdit}
              onToggle={() => field.onChange(!field.value)}
            />
          )}
        />

        {/*
          Ô nhập vẫn hiện khi khoản đang TẮT: chủ xe thường điền số trước rồi mới bật, và giấu ô
          đi làm cú bật đầu tiên lưu một khoản bằng 0 — thứ schema chặn nhưng người dùng không
          hiểu vì sao.
        */}
        <MoneyField
          control={control}
          name={`${kind}.amount`}
          label={t('amount')}
          // Đơn vị (đ/giờ, đ/km…) đi vào dòng gợi ý: `MoneyField` đã chiếm hậu tố cho "đ".
          hint={domainLabel('driverSurchargeUnit', spec.unit)}
          editable={canEdit}
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
            editable={canEdit}
          />
        ) : spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.KM_PER_DAY ? (
          <NumberField
            control={control}
            name={`${kind}.thresholdValue`}
            label={t('threshold.longDistanceField')}
            min={0}
            max={DRIVER_SURCHARGE_THRESHOLD_MAX}
            editable={canEdit}
          />
        ) : null}
      </YStack>
    </Card>
  );
}
