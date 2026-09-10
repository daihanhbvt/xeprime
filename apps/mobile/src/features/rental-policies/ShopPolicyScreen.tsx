import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { PolicySections } from './components/PolicySections';
import { formToSaveInput, policyToForm } from './form';
import { policyFormSchema, type PolicyFormValues } from './schema';
import { useSaveShopPolicy, useShopPolicy } from './hooks/use-shop-policy';
import type { ShopRentalPolicy } from './api';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (SHP-04) — bản native của `/manage/shop/policies`.
 *
 * Mỗi LOẠI XE một bộ chính sách riêng, đúng như web: dải chip trên đầu đổi loại xe, và mỗi loại
 * có query, mutation và form RIÊNG (`key={vehicleType}` ép remount cả workspace) — dùng chung một
 * form là giá trị của ô tô lọt sang xe máy ở nhịp render đầu tiên.
 *
 * Chính sách ở đây áp cho mọi xe cùng loại CHƯA ghi đè riêng, tính từ các lượt đặt MỚI: đơn đã
 * chốt giữ nguyên bản chụp của nó ở backend. Đó là lý do có bước xác nhận nêu rõ phạm vi.
 *
 * Quyền: xem cần `tenant.view`, lưu cần `tenant.update` — cùng cặp mà
 * `ShopPoliciesController` gác. Thiếu quyền sửa thì form vẫn hiện nhưng KHÔNG nhập được, vì đọc
 * được chính sách của gian hàng mình là quyền cơ bản.
 */
export function ShopPolicyScreen() {
  const t = useTranslations('Shop.policies');
  const permissions = usePermissions();

  const canView = permissions.has(PERMISSION.TENANT_VIEW);
  const canEdit = permissions.has(PERMISSION.TENANT_UPDATE);

  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  return (
    <PolicyWorkspace
      /* `key` ép remount: đổi loại xe là dựng lại form với đúng bộ giá trị của loại đó. */
      key={vehicleType}
      vehicleType={vehicleType}
      onSelectVehicleType={setVehicleType}
      canView={canView}
      canEdit={canEdit}
    />
  );
}

/**
 * Thân màn: dải chip loại xe, phạm vi áp dụng, form — và thanh hành động DÍNH ĐÁY.
 *
 * Form nằm cùng component với `<Screen>` (không tách ra làm con) vì thanh hành động là `footer`
 * của chính `Screen`: nó phải đọc được `formState.isDirty` và `handleSubmit` của form. Tách ra
 * thì hai thứ đó nằm dưới một tầng và nút Lưu lại phải trôi theo nội dung — đúng thứ khiến người
 * dùng cuộn hết một màn dài mới bấm được nó.
 */
function PolicyWorkspace({
  vehicleType,
  onSelectVehicleType,
  canView,
  canEdit,
}: {
  vehicleType: VehicleType;
  onSelectVehicleType: (next: VehicleType) => void;
  canView: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('Shop.policies');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const query = useShopPolicy(vehicleType, canView);
  const save = useSaveShopPolicy(vehicleType);
  const [confirming, setConfirming] = useState<PolicyFormValues | null>(null);

  const resolver = useValidationResolver<PolicyFormValues>(
    policyFormSchema,
    'Vehicles.pricing.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<PolicyFormValues>({
    resolver,
    values: policyToForm(query.data?.policy),
  });

  /*
   * Xác nhận TRƯỚC khi gửi, sau khi đã validate: giá trị mới áp ngay cho mọi lượt đặt mới của
   * các xe đang kế thừa. Hỏi "chắc chưa?" rồi mới báo "thiếu 2 mục" là bắt người dùng đi qua
   * một hộp thoại vô ích.
   */
  const askConfirm = handleSubmit((values) => setConfirming(values));

  const submit = useCallback(() => {
    const values = confirming;
    if (!values) return;
    save.mutate(formToSaveInput(values), {
      onSuccess: () => {
        setConfirming(null);
        toast.showSuccess(t('saved', { vehicle: domainLabel('vehicleType', vehicleType) }));
      },
      onError: (err) => {
        setConfirming(null);
        toast.showError(errorMessage(err));
      },
    });
  }, [confirming, domainLabel, errorMessage, save, t, toast, vehicleType]);

  const data = query.data;

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        footer={
          canEdit && data ? (
            /*
              Hai nút DÍNH ĐÁY — bản native của `StickyFormActions` bên web.

              Thứ tự đúng như web: hoàn tác đứng trước, Lưu là nút chính đứng sau. Hoàn tác chỉ
              hiện khi có gì để hoàn — một nút mờ suốt đời chỉ chiếm chỗ, và chỗ đó là thứ hiếm
              nhất trên một thanh đáy.

              Nhãn NGẮN + biểu tượng: `Shop.policies.reset` ("Hoàn tác thay đổi") là câu viết cho
              thanh rộng của web; ở đây hai nhãn dài xếp cạnh nhau trên 360dp là cả hai cùng
              xuống dòng hoặc cùng bị cắt.
            */
            <XStack gap={space.sm}>
              {formState.isDirty ? (
                <YStack f={1}>
                  <Button
                    label={tActions('undo')}
                    icon="arrow-undo-outline"
                    variant="secondary"
                    disabled={save.isPending}
                    onPress={() => reset()}
                  />
                </YStack>
              ) : null}
              <YStack f={formState.isDirty ? 1.6 : 1}>
                <Button
                  label={t('submit')}
                  icon="save-outline"
                  loading={save.isPending}
                  disabled={!formState.isDirty}
                  onPress={() => void askConfirm()}
                />
              </YStack>
            </XStack>
          ) : undefined
        }
      >
        <ManagePageTitle title={t('title')} subtitle={t('subtitle')} />

        <YStack px={layout.screenX} gap={layout.section} pb={layout.section}>
          <YStack gap={layout.inline}>
            {/*
              Hai loại xe = hai bộ chính sách. Dải chip thay cho `Tabs` của web: ở 360dp hai tab
              có biểu tượng vẫn vừa, nhưng chip là hình đã dùng cho mọi lựa chọn ngắn trong app.
            */}
            <XStack gap={space.xs}>
              {VEHICLE_TYPE_VALUES.map((value) => (
                <Chip
                  key={value}
                  label={domainLabel('vehicleType', value)}
                  selected={value === vehicleType}
                  icon={value === VEHICLE_TYPE.CAR ? 'car-outline' : 'bicycle-outline'}
                  onPress={() => onSelectVehicleType(value)}
                />
              ))}
            </XStack>

            {data ? <AppliedSummary data={data} vehicleType={vehicleType} /> : null}
          </YStack>

          {query.isError && !data ? (
            <ScreenError
              error={query.error}
              title={t('loadError')}
              onRetry={() => void query.refetch()}
            />
          ) : null}

          {query.isPending ? <SkeletonText lines={12} /> : null}

          {data ? (
            <YStack gap={layout.section}>
              {data.policy === null ? (
                <Callout tone="info" title={t('emptyTitle')}>
                  {t('emptyBody')}
                </Callout>
              ) : null}

              {!canEdit ? <Callout tone="info">{t('readOnly')}</Callout> : null}

              {formState.isDirty && canEdit ? <Callout tone="warning" title={t('dirty')} /> : null}

              <PolicySections
                control={control}
                disabled={!canEdit || save.isPending}
                {...(data.inheritingVehicles > 0
                  ? { depositHint: t('depositHint', { count: data.inheritingVehicles }) }
                  : {})}
                {...(data.policy?.legacyDiscountTiers?.length
                  ? { legacyDiscountTiers: data.policy.legacyDiscountTiers }
                  : {})}
              />
            </YStack>
          ) : null}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirming !== null}
        title={t('confirm.title')}
        message={
          data && data.inheritingVehicles > 0
            ? t('confirm.bodyInheriting', { count: data.inheritingVehicles })
            : t('confirm.body')
        }
        confirmLabel={t('confirm.ok')}
        cancelLabel={tActions('cancel')}
        loading={save.isPending}
        onConfirm={submit}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

/**
 * "Đã áp dụng cho N ô tô" + chú thích về xe đang ghi đè riêng.
 *
 * Con số đến từ SERVER (`inheritingVehicles`/`overriddenVehicles`) — không đếm ở client, vì
 * client chỉ nhìn thấy trang xe đang mở.
 */
function AppliedSummary({
  data,
  vehicleType,
}: {
  data: ShopRentalPolicy;
  vehicleType: VehicleType;
}) {
  const t = useTranslations('Shop.policies');
  const domainLabel = useDomainLabel();
  const label = domainLabel('vehicleType', vehicleType).toLocaleLowerCase();

  return (
    <Callout tone="info" title={t('applied', { count: data.inheritingVehicles, vehicle: label })}>
      {data.overriddenVehicles > 0 ? t('overridden', { count: data.overriddenVehicles }) : undefined}
    </Callout>
  );
}
