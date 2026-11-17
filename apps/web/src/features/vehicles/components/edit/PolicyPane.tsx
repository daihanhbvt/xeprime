'use client';

import { App, Form, Switch } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE, type ServiceType } from '@xeprime/types';

import { ROUTES, VEHICLE_EDIT_TAB } from '@/constants/routes';
import {
  DeliveryPolicySection,
  POLICY_BLOCK,
  PolicyFlatLayout,
  PolicySections,
  type PolicyBlock,
} from '@/features/rental-policies/components/PolicySections';
import { InsuranceModeBlock } from '@/features/rental-policies/components/InsuranceModeBlock';
import type { VehiclePricingFormApi } from '@/features/rental-policies/hooks/use-vehicle-pricing-form';
import { useVehicleInsuranceStatus } from '@/features/vehicle-documents/hooks';
import {
  supportAllowsVehicleTab,
  useAvailableHref,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import { useWorkspace } from '@/hooks/use-workspace';

import type { VehicleDetail } from '../../types';
import { EditCard, EditToggleRow } from './EditCard';
import { PricingForm, type PricedFormProps } from './PricingForm';
import { TermsCards } from './TermsCards';
import { TurnaroundCard } from './TurnaroundCard';
import styles from './EditPanes.module.css';

/**
 * Cọc · hạn mức km · quá giờ — CẢ HAI tuyến (ADR 0085 điều 3). Trước đây chủ xe tuyến hoa hồng không
 * thấy khối quá giờ, trong khi quyết toán vẫn đọc nó từ chính sách hiệu lực của xe
 * (`SettlementService.overtimeSuggestion`): hộp trả xe gợi ý một khoản phí họ không thấy, không sửa
 * được. Server đọc gì thì màn hình phải cho thấy và sửa được cái đó; để trống = không gợi ý thu.
 */
const RULE_BLOCKS: readonly PolicyBlock[] = [
  POLICY_BLOCK.COLLATERAL,
  POLICY_BLOCK.MILEAGE,
  POLICY_BLOCK.OVERTIME,
];

/**
 * Ô của form giá-và-chính-sách mà mục NÀY vẽ. Lưu là MỘT lệnh trọn gói, nên một ô giá lỗi ở mục
 * "Dịch vụ & giá" (xe chưa có giá ngày thường…) cũng chặn lượt lưu ở đây — lúc đó nói rõ phải mở
 * mục nào, thay vì một nút Lưu im lặng.
 */
const POLICY_FIELDS = new Set([
  'collateralMode',
  'depositAmount',
  'collateralAssetTypes',
  'deliveryEnabled',
  'deliveryMaxRadiusKm',
  'deliveryTiers',
  'mileageLimitEnabled',
  'includedDistanceKmPerDay',
  'excessDistanceFeePerKm',
  'overtimeFeePerHour',
  'overtimeGraceMinutes',
  'overtimeRoundingMinutes',
  'insuranceMode',
]);

/**
 * Mục "Chính sách thuê" (03/11/2026, gộp "Điều kiện" + "Giao nhận" của design — sổ cái §3.6): mọi thứ
 * áp cho CẢ XE, không theo từng dịch vụ.
 *
 *  1. MỘT thẻ phẳng (cùng khuôn hàng-cách-vạch của design): "Áp dụng chính sách của gian hàng" — MỘT
 *     công tắc cho cả bộ chính sách (giao xe · cọc · km · quá giờ · ưu đãi dài hạn), vì dữ liệu chỉ
 *     có một nguồn chính sách cho mỗi xe — rồi ngay dưới nó: giao xe tận nơi (bảng phí trọn gói,
 *     phí theo km đã gỡ — ADR 0078) · cọc · hạn mức km · phí quá giờ. Đang theo gian hàng thì các ô
 *     khoá; công tắc đứng ngay trên nói lý do, nên không lặp dòng nhắc. Chủ xe tuyến hoa hồng không
 *     có trang chính sách gian hàng nên sửa thẳng, không có công tắc.
 *  4. Thời gian chuẩn bị xe giữa hai chuyến (khung giờ giao/nhận đã gỡ, ADR 0078).
 *  5. Giấy tờ & điều khoản của hai nhóm dịch vụ — không có bản của gian hàng, công tắc không áp.
 *
 * Bốn form, bốn endpoint, MỘT nút Lưu ở cột phải. Phiên hỗ trợ (ADR 0050 §13): chính sách có tiền và
 * điều khoản là khu TIỀN — chỉ còn thời gian chuẩn bị xe, theo capability vận hành của phiên.
 */
export function PolicyPane({
  vehicle,
  canUpdate,
  canEditOperations,
  scrollTo,
}: {
  vehicle: VehicleDetail;
  canUpdate: boolean;
  /** Thời gian chuẩn bị xe — `vehicles.update` ∧ capability vận hành của phiên hỗ trợ. */
  canEditOperations: boolean;
  /** Dịch vụ cần cuộn tới ở khối điều khoản (link cũ tới "Thủ tục cho thuê" của dịch vụ đó). */
  scrollTo: ServiceType | null;
}) {
  const t = useTranslations('Vehicles.editor.policy');
  const { message } = App.useApp();
  const support = useSupportSession();
  const pricingAllowed = supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.PRICING);
  const termsAllowed = supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.CONDITIONS);

  return (
    <div className={styles.stack}>
      {pricingAllowed ? (
        <PricingForm
          vehicle={vehicle}
          onInvalid={(fields) => {
            if (fields.some((field) => !POLICY_FIELDS.has(field))) {
              message.warning(t('pricesInvalid'));
            }
          }}
        >
          {(priced, pricingState) =>
            priced ? (
              <PolicyCards priced={priced} canUpdate={canUpdate} vehicle={vehicle} />
            ) : (
              pricingState
            )
          }
        </PricingForm>
      ) : null}
      <TurnaroundCard vehicleId={vehicle.id} canEdit={canEditOperations} />
      {termsAllowed ? (
        <TermsCards vehicle={vehicle} canEdit={canUpdate} scrollTo={scrollTo} />
      ) : null}
    </div>
  );
}

function PolicyCards({
  priced,
  canUpdate,
  vehicle,
}: {
  priced: PricedFormProps;
  canUpdate: boolean;
  vehicle: VehicleDetail;
}) {
  const t = useTranslations('Vehicles.editor.policy');
  const { isManage } = useWorkspace();
  const { api, policyEditable } = priced;
  const disabled = !canUpdate || !policyEditable;
  const control = api.form.control as unknown as Parameters<typeof PolicySections>[0]['control'];
  /*
   * Bảo hiểm vật chất xe Bắt buộc/Tuỳ chọn (ADR 0091 điều 1) — chỉ ô tô, chỉ khi nền tảng đang bán
   * theo bậc. Đang theo chính sách gian hàng thì khoá như mọi ô khác của bộ chính sách.
   */
  const isCar = vehicle.vehicleType === VEHICLE_TYPE.CAR;
  const insurance = useVehicleInsuranceStatus(vehicle.id, isCar);
  const insuranceApplies = isCar && insurance.data?.applies === true;

  return (
    <Form component={false} layout="vertical" colon={false} disabled={disabled}>
      <EditCard title={t('rulesTitle')}>
        <PolicyFlatLayout>
          <div className={styles.policyRows}>
            {isManage ? <PolicySourceRow api={api} canEdit={canUpdate} /> : null}
            <DeliveryPolicySection
              control={api.form.control}
              title={t('deliveryTitle')}
              disabled={disabled}
            />
            <PolicySections
              control={control}
              numbered={false}
              blocks={RULE_BLOCKS}
              disabled={disabled}
            />
            {insuranceApplies ? <InsuranceModeBlock control={control} disabled={disabled} /> : null}
          </div>
        </PolicyFlatLayout>
      </EditCard>
    </Form>
  );
}

/**
 * "Áp dụng chính sách của gian hàng" — bật lại khi đang dùng chính sách riêng thì hỏi trước: tuỳ
 * chỉnh của xe sẽ mất (`setUseShopPolicy`).
 */
function PolicySourceRow({ api, canEdit }: { api: VehiclePricingFormApi; canEdit: boolean }) {
  const t = useTranslations('Vehicles.editor.policy');
  const available = useAvailableHref();
  const shopPolicies = available(ROUTES.MANAGE.SHOP_POLICIES);
  return (
    <EditToggleRow
      title={t('useShop')}
      hint={t.rich('useShopHint', {
        policies: (chunks) => (shopPolicies ? <Link href={shopPolicies}>{chunks}</Link> : chunks),
      })}
      control={
        <Switch
          aria-label={t('useShop')}
          checked={!api.editMode}
          disabled={!canEdit || api.submitting}
          onChange={api.setUseShopPolicy}
        />
      }
    />
  );
}
