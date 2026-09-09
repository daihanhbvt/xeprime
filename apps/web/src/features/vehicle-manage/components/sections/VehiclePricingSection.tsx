'use client';

import { Alert, App, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';

import { VehiclePricingWorkspace } from '@/features/rental-policies/components/VehiclePricingWorkspace';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';

/**
 * Mục "Giá cho thuê" (mockup 6 tự lái, 11 có tài xế) — CÙNG `VehiclePricingWorkspace` với tab
 * Giá & chính sách ở `/manage`, chỉ giới hạn nhóm giá hiển thị và giấu khối chính sách (chính
 * sách có màn riêng: Giao xe tận nơi, Thủ tục cho thuê). Không có nguồn giá thứ hai, không có
 * "giá đề xuất" vì repo không có recommendation API — con số duy nhất là giá thật của xe.
 *
 * Link "Tuỳ chỉnh giá theo lịch" dẫn về giá riêng theo ngày trên lịch xe (`vehicle_daily_prices`)
 * — cũng là nơi chủ xe có tài xế đặt giá lễ/Tết/cuối tuần; không dựng máy giá mùa vụ thứ hai.
 */
export function VehiclePricingSection({ serviceType }: { serviceType: ServiceType }) {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage.pricing');
  const tEdit = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const pricing = useVehiclePricing(vehicle.id);
  const save = useSaveVehiclePricing(vehicle.id);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;

  return (
    <SectionCard
      headingLevel={1}
      title={withDriver ? t('withDriverTitle') : t('selfDriveTitle')}
      subtitle={withDriver ? t('withDriverSubtitle') : t('selfDriveSubtitle')}
    >
      {pricing.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : pricing.isError || !pricing.data ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError')}
          description={
            <Button size="small" onClick={() => void pricing.refetch()}>
              {tActions('retry')}
            </Button>
          }
        />
      ) : (
        <>
          {withDriver ? <Alert type="warning" showIcon message={t('withDriverEstimateHint')} /> : null}
          <VehiclePricingWorkspace
            vehicleName={vehicle.name}
            vehiclePlate={vehicle.plateNumber ?? null}
            pricing={pricing.data}
            canEdit={canEdit}
            submitting={save.isPending}
            visibleServices={[serviceType]}
            policyMode="hidden"
            calendarHref={vehicleSchedulePath(vehicle)}
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
