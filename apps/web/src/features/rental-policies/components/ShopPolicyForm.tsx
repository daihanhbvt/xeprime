'use client';

import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { TURNAROUND_BUFFER_MAX_MINUTES, type VehicleType } from '@xeprime/types';

import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { formToSaveInput, policyToForm } from '../form';
import { useSaveShopOperationDefaults, useSaveShopPolicy } from '../hooks/use-shop-policy';
import { policyFormSchema } from '../schema';
import type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  ShopOperationDefaults,
  ShopRentalPolicy,
} from '../types';
import { PolicyCard } from './PolicyCard';
import { PolicyInfoTip } from './PolicyInfoTip';
import {
  CollateralBlock,
  DeliveryBlock,
  DiscountBlock,
  LimitBlocks,
  TurnaroundBlock,
  type ShopPolicyFormValues,
} from './ShopPolicyBlocks';
import { PoliciesLayout, POLICY_NAV } from './PoliciesLayout';
import styles from './ShopPolicies.module.css';

const schema = policyFormSchema.concat(
  yup.object({
    turnaroundBufferMinutes: yup
      .number()
      .integer('minutesInteger')
      .min(0, 'minutesNegative')
      .max(TURNAROUND_BUFFER_MAX_MINUTES, 'minutesMax')
      .required('minutesInteger'),
  }),
);

function toFormValues(
  policy: RentalPolicyValues | null | undefined,
  defaults: ShopOperationDefaults,
): ShopPolicyFormValues {
  const base = policyToForm(policy);
  return {
    ...base,
    // Công tắc quá giờ chỉ có ở trang này: bật khi đã có phí hoặc thời gian miễn phí.
    overtimeEnabled: base.overtimeFeePerHour != null || base.overtimeGraceMinutes != null,
    turnaroundBufferMinutes: defaults.turnaroundBufferMinutes ?? 0,
  };
}

/** Không còn công tắc ưu đãi trên màn này — có mốc là đang bật. */
function toPolicyInput(values: ShopPolicyFormValues): SaveRentalPolicyInput {
  return { ...formToSaveInput(values), discountEnabled: (values.discountTiers ?? []).length > 0 };
}

interface ShopPolicyFormProps {
  vehicleType: VehicleType;
  vehicleLabel: string;
  initial: ShopRentalPolicy;
  defaults: ShopOperationDefaults;
  canEdit: boolean;
  /** Thẻ "Thanh toán & hóa đơn" — lưu ngay, không thuộc form này nhưng đứng đầu cột chính. */
  leading: ReactNode;
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * Form chính sách thuê mặc định của MỘT loại xe + thời gian chết mặc định (design `23874:63907`).
 *
 * Hai API, một nút "Lưu thay đổi" ở cột phải: chính sách (`PUT /shop/rental-policies`) chỉ gửi khi
 * một ô của nó đổi, thời gian chết (`PUT /shop/operation-defaults`) cũng vậy. Thay đổi NHẠY CẢM — áp
 * cho mọi lượt đặt mới của các xe đang kế thừa — nên luôn có bước xác nhận nêu phạm vi và cam kết
 * "đơn cũ giữ nguyên" (snapshot bất biến ở backend).
 */
export function ShopPolicyForm({
  vehicleType,
  vehicleLabel,
  initial,
  defaults,
  canEdit,
  leading,
  onDirtyChange,
}: ShopPolicyFormProps) {
  const t = useTranslations('Shop.policies');
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const tActions = useTranslations('Common.actions');
  const tDiscount = useTranslations('Vehicles.pricing.longTermDiscount');
  const { modal, message } = App.useApp();
  const errorMessage = useErrorMessage();
  const savePolicy = useSaveShopPolicy(vehicleType);
  const saveDefaults = useSaveShopOperationDefaults(vehicleType);
  const submitting = savePolicy.isPending || saveDefaults.isPending;
  // Phiên hỗ trợ (ADR 0050 §12): chính sách chỉ đọc — không dựng hai nút lưu.
  const supportReadOnly = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS) && !canEdit;
  const disabled = !canEdit;

  const resolver = useValidationResolver<ShopPolicyFormValues>(
    schema,
    'Vehicles.pricing.validation',
  );
  const values = useMemo(() => toFormValues(initial.policy, defaults), [initial.policy, defaults]);
  const { control, handleSubmit, reset, setValue, formState } = useForm<ShopPolicyFormValues>({
    resolver,
    values,
    // Một nửa lưu được, nửa kia lỗi: cache đổi theo nửa đã lưu, ô người dùng đang sửa thì giữ nguyên.
    resetOptions: { keepDirtyValues: true },
  });
  const dirty = formState.isDirty && canEdit;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function persist(next: ShopPolicyFormValues) {
    /*
     * Mỗi API chỉ gửi khi PAYLOAD của nó đổi so với bản đã lưu — so trên payload chứ không trên
     * `dirtyFields` (mảng bậc xoá hết, cờ đặt bằng `setValue` không phải lúc nào cũng được đánh dấu),
     * và bật-rồi-tắt về đúng chỗ cũ thì không ghi một lượt audit vô nghĩa.
     */
    const policyBody = toPolicyInput(next);
    const policyChanged = JSON.stringify(policyBody) !== JSON.stringify(toPolicyInput(values));
    const turnaroundChanged = next.turnaroundBufferMinutes !== values.turnaroundBufferMinutes;
    try {
      const policy = policyChanged ? await savePolicy.mutateAsync(policyBody) : initial;
      const savedDefaults = turnaroundChanged
        ? await saveDefaults.mutateAsync({ turnaroundBufferMinutes: next.turnaroundBufferMinutes })
        : defaults;
      reset(toFormValues(policy.policy, savedDefaults));
      message.success(t('saved', { vehicle: vehicleLabel }));
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  const confirmThenSubmit = handleSubmit((next) => {
    if (submitting) return;
    modal.confirm({
      title: t('confirm.title'),
      content:
        initial.inheritingVehicles > 0
          ? t('confirm.bodyInheriting', { count: initial.inheritingVehicles })
          : t('confirm.body'),
      okText: t('confirm.ok'),
      cancelText: tActions('cancel'),
      onOk: () => persist(next),
    });
  });

  const actions =
    canEdit || !supportReadOnly ? (
      <div className={styles.actions} role="group" aria-label={tWorkspace('actionsLabel')}>
        <Button size="large" onClick={() => reset()} disabled={!dirty || submitting}>
          {tActions('cancel')}
        </Button>
        <Button
          type="primary"
          size="large"
          htmlType="submit"
          form={FORM_ID}
          loading={submitting}
          disabled={!dirty}
        >
          {tActions('saveChanges')}
        </Button>
      </div>
    ) : null;

  return (
    <PoliciesLayout aside={actions}>
      <form id={FORM_ID} className={styles.main} onSubmit={confirmThenSubmit} noValidate>
        {!canEdit && !supportReadOnly ? <Alert type="info" showIcon title={t('readOnly')} /> : null}
        {initial.policy === null ? (
          <Alert type="info" showIcon title={t('emptyTitle')} description={t('emptyBody')} />
        ) : null}

        <div id={POLICY_NAV.RULES} className={styles.navTarget}>
          {leading}
          <PolicyCard title={tWorkspace('procedures.title')}>
            <CollateralBlock
              control={control}
              disabled={disabled}
              inheritingVehicles={initial.inheritingVehicles}
              overriddenVehicles={initial.overriddenVehicles}
            />
            <LimitBlocks control={control} disabled={disabled} />
          </PolicyCard>
        </div>

        <div id={POLICY_NAV.DELIVERY} className={styles.navTarget}>
          <PolicyCard title={tWorkspace('delivery.title')}>
            <DeliveryBlock control={control} disabled={disabled} />
            <hr className={styles.divider} />
            <TurnaroundBlock
              control={control}
              disabled={disabled}
              inheritingVehicles={defaults.inheritingVehicles}
            />
          </PolicyCard>
        </div>

        <div id={POLICY_NAV.LONG_TERM} className={styles.navTarget}>
          <PolicyCard
            title={tWorkspace('longTerm.title')}
            titleExtra={
              <PolicyInfoTip label={tDiscount('tipLabel')}>
                {tDiscount('hint')} <strong>{tDiscount('formulaTitle')}</strong>{' '}
                {tDiscount('formula')}
              </PolicyInfoTip>
            }
          >
            <DiscountBlock
              control={control}
              setValue={setValue}
              disabled={disabled}
              legacyTiers={initial.policy?.legacyDiscountTiers}
              vehicleType={vehicleType}
            />
          </PolicyCard>
        </div>
      </form>
    </PoliciesLayout>
  );
}

const FORM_ID = 'shop-rental-policy-form';
