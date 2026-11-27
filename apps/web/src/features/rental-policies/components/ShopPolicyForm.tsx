'use client';

import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm, type Control } from 'react-hook-form';
import * as yup from 'yup';
import {
  INSURANCE_MODE,
  RENTAL_TERMS_GROUP,
  RENTAL_TERMS_GROUP_VALUES,
  TURNAROUND_BUFFER_MAX_MINUTES,
  VEHICLE_TYPE,
  type RentalTermsGroup,
  type VehicleType,
} from '@xeprime/types';

import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { formToSaveInput, policyToForm } from '../form';
import {
  useSaveShopOperationDefaults,
  useSaveShopPolicy,
  useSaveShopRentalTerms,
  useShopInsuranceImpact,
} from '../hooks/use-shop-policy';
import { policyFormSchema, type PolicyFormValues } from '../schema';
import type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  SaveTenantRentalTermsInput,
  ShopOperationDefaults,
  ShopRentalPolicy,
  TenantRentalTerms,
} from '../types';
import { InsuranceModeBlock } from './InsuranceModeBlock';
import { PolicyInfoTip } from './PolicyInfoTip';
import { RENTAL_TERMS_MAX_LENGTH, RentalConditionsCard } from './RentalConditionsCard';
import {
  CollateralBadge,
  CollateralBlock,
  DeliveryBlock,
  DiscountBlock,
  LimitBlocks,
  PolicySectionCard,
  TurnaroundBlock,
  type RentalTermsFormGroup,
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
    terms: yup.object(
      Object.fromEntries(
        RENTAL_TERMS_GROUP_VALUES.map((group) => [
          group,
          yup.object({
            termsText: yup.string().defined().max(RENTAL_TERMS_MAX_LENGTH, 'termsTooLong'),
            requireTermsAcceptance: yup.boolean().defined(),
          }),
        ]),
      ),
    ),
  }),
);

function termsToForm(terms: TenantRentalTerms): Record<RentalTermsGroup, RentalTermsFormGroup> {
  const of = (group: RentalTermsGroup): RentalTermsFormGroup => {
    const item = terms.items.find((entry) => entry.serviceType === group);
    return {
      termsText: item?.termsText ?? '',
      requireTermsAcceptance: item?.requireTermsAcceptance ?? false,
    };
  };
  return {
    [RENTAL_TERMS_GROUP.SELF_DRIVE]: of(RENTAL_TERMS_GROUP.SELF_DRIVE),
    [RENTAL_TERMS_GROUP.WITH_DRIVER]: of(RENTAL_TERMS_GROUP.WITH_DRIVER),
  };
}

function toTermsInput(
  terms: Record<RentalTermsGroup, RentalTermsFormGroup>,
): SaveTenantRentalTermsInput {
  return {
    items: RENTAL_TERMS_GROUP_VALUES.map((group) => {
      const text = terms[group].termsText.trim();
      return {
        serviceType: group,
        termsText: text ? text : null,
        requireTermsAcceptance: terms[group].requireTermsAcceptance,
      };
    }),
  };
}

function toFormValues(
  policy: RentalPolicyValues | null | undefined,
  defaults: ShopOperationDefaults,
  terms: TenantRentalTerms,
): ShopPolicyFormValues {
  return {
    ...policyToForm(policy),
    turnaroundBufferMinutes: defaults.turnaroundBufferMinutes ?? 0,
    terms: termsToForm(terms),
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
  /** Điều khoản thuê của gian hàng - chung mọi loại xe, lưu cùng nút Lưu của trang. */
  terms: TenantRentalTerms;
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
  terms,
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
  const saveTerms = useSaveShopRentalTerms();
  const submitting = savePolicy.isPending || saveDefaults.isPending || saveTerms.isPending;
  // Phiên hỗ trợ (ADR 0050 §12): chính sách chỉ đọc — không dựng hai nút lưu.
  const supportReadOnly = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS) && !canEdit;
  const disabled = !canEdit;

  const resolver = useValidationResolver<ShopPolicyFormValues>(
    schema,
    'Vehicles.pricing.validation',
  );
  const values = useMemo(
    () => toFormValues(initial.policy, defaults, terms),
    [initial.policy, defaults, terms],
  );
  const { control, handleSubmit, reset, setValue, formState } = useForm<ShopPolicyFormValues>({
    resolver,
    values,
    // Một nửa lưu được, nửa kia lỗi: cache đổi theo nửa đã lưu, ô người dùng đang sửa thì giữ nguyên.
    resetOptions: { keepDirtyValues: true },
  });
  const dirty = formState.isDirty && canEdit;
  /*
   * Bảo hiểm vật chất xe chỉ bán cho Ô TÔ và chỉ khi nền tảng đang bán theo bậc (ADR 0091 điều 1) —
   * `applies` của cảnh báo nói đúng điều đó, nên một câu hỏi phục vụ cả hai: ẩn khối hay hiện.
   */
  const insuranceImpact = useShopInsuranceImpact(vehicleType, vehicleType === VEHICLE_TYPE.CAR);
  const insuranceApplies = vehicleType === VEHICLE_TYPE.CAR && insuranceImpact.data?.applies === true;

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
    const termsBody = toTermsInput(next.terms);
    const termsChanged = JSON.stringify(termsBody) !== JSON.stringify(toTermsInput(values.terms));
    try {
      const policy = policyChanged ? await savePolicy.mutateAsync(policyBody) : initial;
      const savedDefaults = turnaroundChanged
        ? await saveDefaults.mutateAsync({ turnaroundBufferMinutes: next.turnaroundBufferMinutes })
        : defaults;
      const savedTerms = termsChanged ? await saveTerms.mutateAsync(termsBody) : terms;
      reset(toFormValues(policy.policy, savedDefaults, savedTerms));
      message.success(t('saved', { vehicle: vehicleLabel }));
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  const confirmThenSubmit = handleSubmit((next) => {
    if (submitting) return;
    // Chuyển sang Bắt buộc mà có xe kế thừa thiếu dữ liệu ⇒ nói rõ xe nào sẽ ngừng nhận tự lái.
    const becomingRequired =
      insuranceApplies &&
      next.insuranceMode === INSURANCE_MODE.REQUIRED &&
      values.insuranceMode !== INSURANCE_MODE.REQUIRED;
    const affected = becomingRequired ? (insuranceImpact.data?.total ?? 0) : 0;
    const scope =
      initial.inheritingVehicles > 0
        ? t('confirm.bodyInheriting', { count: initial.inheritingVehicles })
        : t('confirm.body');
    modal.confirm({
      title: t('confirm.title'),
      content:
        affected > 0 ? (
          <>
            <p>{scope}</p>
            <p>{t('confirm.insuranceRequired', { count: affected })}</p>
          </>
        ) : (
          scope
        ),
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

  const policyControl = control as unknown as Control<PolicyFormValues>;

  return (
    <PoliciesLayout aside={actions} hidden={insuranceApplies ? [] : [POLICY_NAV.INSURANCE]}>
      <form id={FORM_ID} className={styles.main} onSubmit={confirmThenSubmit} noValidate>
        {!canEdit && !supportReadOnly ? <Alert type="info" showIcon title={t('readOnly')} /> : null}
        {initial.policy === null ? (
          <Alert type="info" showIcon title={t('emptyTitle')} description={t('emptyBody')} />
        ) : null}

        {leading}

        {insuranceApplies ? (
          <PolicySectionCard
            id={POLICY_NAV.INSURANCE}
            title={tWorkspace('insurance.title')}
            titleExtra={
              <PolicyInfoTip label={tWorkspace('insurance.tipLabel')}>
                {tWorkspace('insurance.hint')}
              </PolicyInfoTip>
            }
          >
            <InsuranceModeBlock
              control={control}
              disabled={disabled}
              impact={insuranceImpact.data}
              bare
            />
          </PolicySectionCard>
        ) : null}

        <PolicySectionCard
          id={POLICY_NAV.COLLATERAL}
          title={tWorkspace('collateral.title')}
          subtitle={tWorkspace('collateral.subtitle')}
          badge={<CollateralBadge control={policyControl} />}
        >
          <CollateralBlock
            control={policyControl}
            disabled={disabled}
            usage={
              initial.inheritingVehicles > 0 || initial.overriddenVehicles > 0 ? (
                <>
                  {initial.inheritingVehicles > 0
                    ? t('depositHint', { count: initial.inheritingVehicles })
                    : null}
                  {initial.overriddenVehicles > 0 ? (
                    <PolicyInfoTip
                      label={tWorkspace('collateral.overriddenTipLabel')}
                      placement="bottomRight"
                    >
                      {t('overridden', { count: initial.overriddenVehicles })}
                    </PolicyInfoTip>
                  ) : null}
                </>
              ) : null
            }
          />
        </PolicySectionCard>

        <PolicySectionCard id={POLICY_NAV.LIMITS} title={tWorkspace('limits.title')}>
          <LimitBlocks control={policyControl} disabled={disabled} />
        </PolicySectionCard>

        <PolicySectionCard id={POLICY_NAV.DELIVERY} title={tWorkspace('delivery.title')}>
          <DeliveryBlock control={policyControl} disabled={disabled} />
          <hr className={styles.divider} />
          <TurnaroundBlock
            control={control}
            disabled={disabled}
            inheritingVehicles={defaults.inheritingVehicles}
          />
        </PolicySectionCard>

        <PolicySectionCard
          id={POLICY_NAV.LONG_TERM}
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
          />
        </PolicySectionCard>

        <RentalConditionsCard control={control} disabled={disabled} />
      </form>
    </PoliciesLayout>
  );
}

const FORM_ID = 'shop-rental-policy-form';
