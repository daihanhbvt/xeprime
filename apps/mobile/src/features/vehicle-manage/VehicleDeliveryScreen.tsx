import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { POLICY_SOURCE } from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { DeliveryPolicySection } from '@/features/rental-policies/components/PolicySections';
import { formToSaveInput, policyToForm } from '@/features/rental-policies/form';
import { policyFormSchema, type PolicyFormValues } from '@/features/rental-policies/schema';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/vehicle-pricing/hooks/use-vehicle-pricing';
import type { VehiclePricing } from '@/features/vehicle-pricing/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';

/**
 * Mục "Giao xe tận nơi" — nguồn sự thật là CHÍNH SÁCH hiệu lực (`RentalPolicy`): bật/tắt, bán
 * kính tối đa, và các bậc phí CỐ ĐỊNH theo khoảng cách (không phải đ/km — máy giá tra bậc).
 * Bản native của `DeliverySection` bên web, dùng đúng `DeliveryPolicySection` của form chính
 * sách nên không có bảng bậc thứ hai.
 *
 * Lưu = `PUT /vehicles/:id/pricing` với `source: vehicle` và TOÀN BỘ chính sách (các khối khác
 * lấy nguyên từ bản đang hiệu lực) — không gửi partial làm mất cọc/quá giờ/ưu đãi. Server đồng bộ
 * luôn `vehicles.delivery_enabled` và snapshot listing (ADR 0008).
 */
export function VehicleDeliveryScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY}
      title={t('delivery.title')}
      subtitle={t('delivery.subtitle')}
    >
      {({ canEdit }) => <DeliveryBody vehicleId={vehicleId} canEdit={canEdit} />}
    </VehicleManageShell>
  );
}

function DeliveryBody({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const pricing = useVehiclePricing(vehicleId);

  if (pricing.isLoading) return <MiniRowsSkeleton rows={6} />;
  if (pricing.isError || !pricing.data) {
    return (
      <ScreenError
        error={pricing.error}
        title={t('pricing.loadError')}
        onRetry={() => void pricing.refetch()}
      />
    );
  }
  return <DeliveryForm pricing={pricing.data} vehicleId={vehicleId} canEdit={canEdit} />;
}

function DeliveryForm({
  pricing,
  vehicleId,
  canEdit,
}: {
  pricing: VehiclePricing;
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.delivery');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const save = useSaveVehiclePricing(vehicleId);
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  const base = pricing.policy ?? pricing.shopPolicy;

  const values = useMemo(() => policyToForm(base), [base]);
  const { control, handleSubmit, reset, formState } = useForm<PolicyFormValues>({
    resolver: yupResolver(policyFormSchema),
    context: { policyEditable: true },
    values,
  });
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const firstTier = tiers[0];
  const firstTierFree = firstTier?.toKm != null && !firstTier.fee;

  const submit = handleSubmit((next) => {
    save.mutate(
      { source: POLICY_SOURCE.VEHICLE, policy: formToSaveInput(next) },
      {
        onSuccess: () => toast.showSuccess(t('saved')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      {!pricing.shopPolicy && !pricing.policy ? (
        <Callout tone="info" title={t('noShopPolicyTitle')}>
          {t('noShopPolicyBody')}
        </Callout>
      ) : overriding ? (
        <Callout tone="info" title={t('overriddenTitle')}>
          {t('overriddenBody')}
        </Callout>
      ) : (
        <Callout tone="warning" title={t('inheritedTitle')}>
          {t('inheritedBody')}
        </Callout>
      )}

      <Card>
        <DeliveryPolicySection control={control} disabled={!canEdit} />
      </Card>

      {enabled ? (
        <YStack gap={space.xs}>
          {firstTierFree && firstTier?.toKm != null ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('freeWithin', { km: firstTier.toKm })}
            </Text>
          ) : null}
          {radius != null ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('manualBeyond', { km: radius })}
            </Text>
          ) : null}
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('estimateNote')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('tiersHint')}
          </Text>
        </YStack>
      ) : (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('offNote')}
        </Text>
      )}

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
