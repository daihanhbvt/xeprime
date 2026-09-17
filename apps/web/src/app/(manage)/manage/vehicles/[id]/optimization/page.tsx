'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Skeleton, Tabs } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  API_ERROR_CODE,
  PERMISSION,
  VEHICLE_SERVICE_SETTING_SERVICES,
  type ServiceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { AutoAcceptSection } from '@/features/vehicle-manage/components/sections/AutoAcceptSection';
import { VehicleManageProvider } from '@/features/vehicle-manage/components/VehicleManageContext';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { getErrorCode } from '@/services/api-client';

/**
 * TỐI ƯU NHẬN CHUYẾN cho xe của GIAN HÀNG (17/09/2026).
 *
 * Vì sao trang này ra đời: thiết lập tự động nhận chuyến chỉ có ở bề mặt chủ xe tuyến hoa hồng
 * (`/account/vehicles/{id}/manage/.../optimization`). Gian hàng quản xe ở `/manage/vehicles` và
 * ở đó chỉ có `edit` + `pricing` — nghĩa là **không có đường nào bật "Đặt ngay" cho xe gian
 * hàng**, dù server vẫn đọc đúng cờ đó cho cả hai tuyến.
 *
 * Hậu quả trước khi có trang này: mọi chuyến của gian hàng đều dừng ở "chờ chủ xe duyệt" kể cả
 * khi họ muốn nhận tự động, và không ai tìm ra chỗ để đổi.
 *
 * Dùng lại `AutoAcceptSection` của bề mặt kia chứ không vẽ lại form: cùng một thiết lập, cùng
 * một endpoint (`/vehicles/{id}/service-settings` — tenant-scoped, gác bằng `vehicle.view` /
 * `vehicle.update`), nên hai bề mặt không thể trôi khỏi nhau. Nó chỉ cần `{ vehicle, canEdit }`
 * từ context, nên bọc `VehicleManageProvider` là đủ.
 *
 * MỘT trang, nhiều TAB theo dịch vụ — khác bề mặt chủ xe (mỗi dịch vụ một route). Xe gian hàng
 * thường phục vụ nhiều dịch vụ cùng lúc, và bắt người trực đi hai URL để bật cùng một công tắc
 * cho một chiếc xe là một bước thừa.
 */
export default function VehicleOptimizationPage() {
  const t = useTranslations('Vehicles.optimization');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const params = useParams<{ id: string }>();
  const vehicleId = params?.id;
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  const vehicle = useVehicle(canView ? vehicleId : undefined);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button type="primary">{t('backToList')}</Button>
          </Link>
        }
      />
    );
  }

  const header = (
    <ManagePageHeader
      title={t('title')}
      subtitle={
        vehicle.data
          ? [vehicle.data.name, vehicle.data.plateNumber].filter(Boolean).join(LIST_SEPARATOR)
          : t('subtitle')
      }
      extra={
        <Link href={vehicleId ? vehiclePath.detail(vehicleId) : ROUTES.MANAGE.VEHICLES}>
          <Button icon={<ArrowLeftOutlined aria-hidden />}>{t('backToVehicle')}</Button>
        </Link>
      }
    />
  );

  if (vehicle.isError) {
    const notFound = getErrorCode(vehicle.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <div>
        {header}
        <EmptyState
          variant="error"
          title={notFound ? t('notFound.title') : t('loadError.title')}
          description={notFound ? t('notFound.description') : tCommon('states.errorHint')}
          onRetry={notFound ? undefined : () => void vehicle.refetch()}
          action={
            <Link href={ROUTES.MANAGE.VEHICLES}>
              <Button>{t('backToList')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (!vehicle.data) {
    return (
      <div>
        {header}
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  /*
   * Chỉ những dịch vụ mà CHIẾC XE NÀY phục vụ VÀ có thiết lập riêng. Thuê dài hạn cố ý không có
   * (`VEHICLE_SERVICE_SETTING_SERVICES`): gian hàng luôn chốt lịch tay (ADR 0011), nên một tab
   * "dài hạn" ở đây chỉ là một công tắc không bao giờ có tác dụng.
   */
  const services = VEHICLE_SERVICE_SETTING_SERVICES.filter((service) =>
    vehicle.data.serviceTypes.includes(service),
  );

  if (services.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          variant="empty"
          title={t('noService.title')}
          description={t('noService.description')}
          action={
            <Link href={vehicleId ? vehiclePath.edit(vehicleId) : ROUTES.MANAGE.VEHICLES}>
              <Button type="primary">{t('noService.action')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <VehicleManageProvider value={{ vehicle: vehicle.data, canEdit }}>
        {/*
          Xe chỉ phục vụ MỘT dịch vụ thì không bày thanh tab: một tab đơn độc là một lựa chọn
          giả, và nó đẩy nội dung xuống một hàng mà không nói thêm điều gì.
        */}
        {services.length === 1 ? (
          <AutoAcceptSection serviceType={services[0] as ServiceType} />
        ) : (
          <Tabs
            items={services.map((service) => ({
              key: service,
              label: domainLabel('serviceType', service),
              children: <AutoAcceptSection serviceType={service} />,
            }))}
          />
        )}
      </VehicleManageProvider>
    </div>
  );
}
