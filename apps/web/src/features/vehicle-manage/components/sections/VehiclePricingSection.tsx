'use client';

import { Alert, App, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';

import {
  POLICY_BLOCK,
  type PolicyBlock,
} from '@/features/rental-policies/components/PolicySections';
import { VehiclePricingWorkspace } from '@/features/rental-policies/components/VehiclePricingWorkspace';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';

/**
 * Khối chính sách của chủ xe ở khu tài khoản — đúng ba khối họ có từ develop (cọc · giao xe tận
 * nơi · giới hạn km). Phí quá giờ và ưu đãi dài hạn là của gian hàng; ẩn ở đây nhưng giá trị vẫn
 * được gửi nguyên khi lưu, nên không có gì bị xoá.
 */
const OWNER_POLICY_BLOCKS: readonly PolicyBlock[] = [
  POLICY_BLOCK.COLLATERAL,
  POLICY_BLOCK.DELIVERY,
  POLICY_BLOCK.MILEAGE,
];

/**
 * Mục "Giá & chính sách" của không gian quản lý xe ở khu tài khoản (30/09/2026).
 *
 * CÙNG `VehiclePricingWorkspace` với mục "Giá & chính sách" của cổng quản lý — một màn, một nút
 * Lưu: giá của mọi dịch vụ xe đang có + nguồn chính sách + các khối chính sách. Nó thay ba màn cũ
 * (Giá tự lái · Giá có tài xế · Giao xe tận nơi) — ba màn đó gọi CÙNG `PUT /vehicles/:id/pricing`
 * với toàn bộ chính sách, nên gộp lại không đổi payload, chỉ bớt hai lần bấm Lưu.
 *
 * Chủ xe KHÔNG có trang chính sách gian hàng (30/09/2026): `policySource="direct"` bỏ công tắc
 * "Dùng chính sách chung của gian hàng", thẻ tóm tắt chính sách đang kế thừa và link sang trang
 * đó. Các khối chính sách sửa trực tiếp; chỉ khi một ô chính sách đổi mới ghi bộ chính sách riêng.
 * Không có "giá đề xuất": repo không có recommendation API — con số duy nhất là giá thật của xe.
 * Link "Tuỳ chỉnh giá theo lịch" dẫn về giá riêng theo ngày trên lịch xe (`vehicle_daily_prices`).
 */
export function VehiclePricingSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const { paths } = useWorkspace();
  const t = useTranslations('VehicleManage.pricing');
  const tEdit = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  // Link "Tuỳ chỉnh giá theo lịch" giữ chi nhánh đang lọc (ADR 0052).
  const branchCrumb = useBranchCrumb();
  const { message } = App.useApp();
  const pricing = useVehiclePricing(vehicle.id);
  const save = useSaveVehiclePricing(vehicle.id);
  const withDriver = (vehicle.serviceTypes ?? []).includes(SERVICE_TYPE.WITH_DRIVER);

  return (
    <SectionCard headingLevel={1} title={t('title')} subtitle={t('subtitle')}>
      {pricing.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : pricing.isError || !pricing.data ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          description={
            <Button size="small" onClick={() => void pricing.refetch()}>
              {tActions('retry')}
            </Button>
          }
        />
      ) : (
        <>
          {withDriver ? (
            <Alert type="warning" showIcon title={t('withDriverEstimateHint')} />
          ) : null}
          <VehiclePricingWorkspace
            vehicleName={vehicle.name}
            vehiclePlate={vehicle.plateNumber ?? null}
            pricing={pricing.data}
            canEdit={canEdit}
            submitting={save.isPending}
            policyBlocks={OWNER_POLICY_BLOCKS}
            shopPolicyHref={null}
            policySource="direct"
            calendarHref={vehicleSchedulePath(vehicle, { basePath: paths.calendar, branchId: branchCrumb })}
            onSave={(body) =>
              save.mutate(body, {
                onSuccess: () => message.success(tEdit('saved')),
                onError: (error) => message.error(errorMessage(error)),
              })
            }
          />
        </>
      )}
    </SectionCard>
  );
}
