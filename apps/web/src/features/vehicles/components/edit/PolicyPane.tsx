'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { POLICY_SECTION, VEHICLE_TYPE } from '@xeprime/types';

import { VEHICLE_EDIT_TAB } from '@/constants/routes';
import { InsuranceModeBlock } from '@/features/rental-policies/components/InsuranceModeBlock';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import {
  CollateralBadge,
  CollateralBlock,
  DeliveryBlock,
} from '@/features/rental-policies/components/ShopPolicyBlocks';
import { useVehicleInsuranceStatus } from '@/features/vehicle-documents/hooks';
import { supportAllowsVehicleTab, useSupportSession } from '@/features/tenant-support/support-session';

import type { VehicleDetail } from '../../types';
import { PricingForm, type PricedFormProps } from './PricingForm';
import { TurnaroundCard } from './TurnaroundCard';
import { VehiclePolicySection } from './VehiclePolicySection';
import styles from './EditPanes.module.css';

/**
 * Ô của form giá-và-chính-sách mà mục NÀY vẽ. Lưu là MỘT lệnh trọn gói, nên một ô lỗi ở mục "Dịch vụ
 * xe" (giá, hạn mức km, ưu đãi dài hạn) cũng chặn lượt lưu ở đây — lúc đó nói rõ phải mở mục nào.
 */
const POLICY_FIELDS = new Set([
  'collateralMode',
  'collateralCashEnabled',
  'collateralAssetEnabled',
  'collateralCombination',
  'depositAmount',
  'collateralAssetTypes',
  'deliveryEnabled',
  'deliveryMaxRadiusKm',
  'deliveryTiers',
  'insuranceMode',
]);

/** Ô ở mục "Dịch vụ xe" nhưng không phải ô giá - gọi bằng tên thẻ chứa nó. */
const SERVICE_POLICY_FIELDS: Readonly<Record<string, 'limits' | 'longTerm'>> = {
  mileageLimitEnabled: 'limits',
  includedDistanceKmPerDay: 'limits',
  excessDistanceFeePerKm: 'limits',
  overtimeEnabled: 'limits',
  overtimeFeePerHour: 'limits',
  overtimeGraceMinutes: 'limits',
  overtimeRoundingMinutes: 'limits',
  discountEnabled: 'longTerm',
  discountTiers: 'longTerm',
  legacyDiscountTiers: 'longTerm',
};

/** Neo của thẻ cọc - dải "Hình thức cọc xe hiện tại" ở mục Dịch vụ xe trỏ tới đây. */
export const COLLATERAL_CARD_ID = 'vehicle-policy-collateral';

/**
 * Mục "Bảo hiểm & Giao nhận xe" (ADR 0112 · design `24705:27808`, thay "Chính sách thuê"): ba thẻ,
 * mỗi thẻ một công tắc "Áp dụng chính sách của gian hàng" của RIÊNG mục đó — Bảo hiểm vật chất xe
 * (chỉ ô tô, chỉ khi nền tảng đang bán theo bậc), Hình thức cọc xe, Giao nhận xe (kèm thời gian chuẩn
 * bị giữa hai chuyến - cơ chế mặc định gian hàng riêng). Giấy tờ & điều khoản thuê nay là của GIAN
 * HÀNG (trang Chính sách thuê) - màn sửa xe không còn khối đó.
 *
 * Phiên hỗ trợ (ADR 0050 §13): chính sách có tiền là khu TIỀN — chỉ còn thời gian chuẩn bị xe.
 */
export function PolicyPane({
  vehicle,
  canUpdate,
  canEditOperations,
}: {
  vehicle: VehicleDetail;
  canUpdate: boolean;
  /** Thời gian chuẩn bị xe — `vehicles.update` ∧ capability vận hành của phiên hỗ trợ. */
  canEditOperations: boolean;
}) {
  const t = useTranslations('Vehicles.editor.policy');
  const tField = useTranslations('Vehicles.publish.sensitive.fields');
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const { message } = App.useApp();
  const support = useSupportSession();
  const pricingAllowed = supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.PRICING);

  /** Tên các ô lỗi nằm ở mục khác — nói đúng ô nào, không đoán ví dụ. */
  function otherInvalidLabels(fields: string[]): string {
    const labels = fields
      .filter((field) => !POLICY_FIELDS.has(field))
      .map((field) => {
        const card = SERVICE_POLICY_FIELDS[field];
        if (card) return tWorkspace(`${card}.title`);
        return tField.has(field as never) ? tField(field as never) : null;
      })
      .filter((label): label is string => label != null);
    return [...new Set(labels)].join(', ');
  }

  if (!pricingAllowed) {
    return (
      <div className={styles.stack}>
        <TurnaroundCard vehicleId={vehicle.id} canEdit={canEditOperations} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <PricingForm
        vehicle={vehicle}
        onInvalid={(fields) => {
          if (fields.some((field) => !POLICY_FIELDS.has(field))) {
            const labels = otherInvalidLabels(fields);
            message.warning(
              labels ? t('pricesInvalidFields', { fields: labels }) : t('pricesInvalid'),
            );
          }
        }}
      >
        {(priced, pricingState) =>
          priced ? (
            <PolicyCards
              priced={priced}
              canUpdate={canUpdate}
              canEditOperations={canEditOperations}
              vehicle={vehicle}
            />
          ) : (
            <>
              {pricingState}
              <TurnaroundCard vehicleId={vehicle.id} canEdit={canEditOperations} />
            </>
          )
        }
      </PricingForm>
    </div>
  );
}

function PolicyCards({
  priced,
  canUpdate,
  canEditOperations,
  vehicle,
}: {
  priced: PricedFormProps;
  canUpdate: boolean;
  canEditOperations: boolean;
  vehicle: VehicleDetail;
}) {
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const { api } = priced;
  /*
   * Bảo hiểm vật chất xe Bắt buộc/Tuỳ chọn (ADR 0091 điều 1) — chỉ ô tô, chỉ khi nền tảng đang bán
   * theo bậc.
   */
  const isCar = vehicle.vehicleType === VEHICLE_TYPE.CAR;
  const insurance = useVehicleInsuranceStatus(vehicle.id, isCar);
  const insuranceApplies = isCar && insurance.data?.applies === true;

  return (
    <>
      {insuranceApplies ? (
        <VehiclePolicySection
          api={api}
          section={POLICY_SECTION.INSURANCE}
          canUpdate={canUpdate}
          title={tWorkspace('insurance.title')}
          titleExtra={
            <PolicyInfoTip label={tWorkspace('insurance.tipLabel')}>
              {tWorkspace('insurance.hint')}
            </PolicyInfoTip>
          }
        >
          {({ control, disabled }) => (
            <InsuranceModeBlock
              control={control}
              disabled={disabled}
              vehicle={{ vehicleId: vehicle.id, gaps: insurance.data?.gaps ?? [] }}
              bare
            />
          )}
        </VehiclePolicySection>
      ) : null}

      <VehiclePolicySection
        api={api}
        section={POLICY_SECTION.COLLATERAL}
        canUpdate={canUpdate}
        id={COLLATERAL_CARD_ID}
        title={tWorkspace('collateral.title')}
        subtitle={tWorkspace('collateral.subtitle')}
        badge={({ control }) => <CollateralBadge control={control} />}
      >
        {({ control, disabled }) => <CollateralBlock control={control} disabled={disabled} />}
      </VehiclePolicySection>

      <VehiclePolicySection
        api={api}
        section={POLICY_SECTION.DELIVERY}
        canUpdate={canUpdate}
        title={tWorkspace('delivery.title')}
      >
        {({ control, disabled }) => <DeliveryBlock control={control} disabled={disabled} />}
      </VehiclePolicySection>

      {/*
        Thời gian chuẩn bị giữa hai chuyến: thẻ riêng (form + mặc định gian hàng riêng - ADR 0112
        điều 1 giữ cơ chế `tenant_operation_defaults`), đứng ngay dưới Giao nhận.
      */}
      <TurnaroundCard vehicleId={vehicle.id} canEdit={canEditOperations} />
    </>
  );
}
