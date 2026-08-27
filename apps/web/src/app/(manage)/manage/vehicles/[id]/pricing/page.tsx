'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehiclePricingWorkspace } from '@/features/rental-policies/components/VehiclePricingWorkspace';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { getErrorCode, getErrorMessage } from '@/services/api-client';

/**
 * Giá & chính sách theo XE (Wave 2 — Figma `236:3495`, mobile `247:1645/1706`): kế thừa chính
 * sách gian hàng hoặc ghi đè riêng; đặt lại = xoá bản ghi đè. Link vào từ Hồ sơ 360
 * ("Chỉnh sửa giá") và là tab Giá của workspace sửa xe sau này (Wave 3).
 */
export default function VehiclePricingPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params?.id;
  const { message } = App.useApp();
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  const vehicle = useVehicle(canView ? vehicleId : undefined);
  const pricing = useVehiclePricing(canView ? vehicleId : undefined);
  const save = useSaveVehiclePricing(vehicleId ?? '');

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền truy cập"
        description="Bạn cần quyền dưới đây để xem giá & chính sách của xe."
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button type="primary">Về danh sách xe</Button>
          </Link>
        }
      />
    );
  }

  if (vehicle.isError || pricing.isError) {
    const notFound =
      getErrorCode(vehicle.error) === API_ERROR_CODE.NOT_FOUND ||
      getErrorCode(pricing.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant="error"
        title={notFound ? 'Không tìm thấy xe' : 'Không tải được giá & chính sách của xe'}
        description={
          notFound
            ? 'Xe có thể đã bị xoá hoặc không thuộc gian hàng này.'
            : 'Có lỗi khi lấy dữ liệu. Vui lòng thử lại.'
        }
        onRetry={
          notFound
            ? undefined
            : () => {
                void vehicle.refetch();
                void pricing.refetch();
              }
        }
        action={
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button>Về danh sách xe</Button>
          </Link>
        }
      />
    );
  }

  const header = (
    <ManagePageHeader
      title="Giá & chính sách"
      subtitle={
        vehicle.data
          ? [vehicle.data.name, vehicle.data.plateNumber].filter(Boolean).join(' · ')
          : 'Cấu hình giá thuê và chính sách áp dụng riêng cho xe'
      }
      extra={
        <Link href={vehicleId ? vehiclePath.detail(vehicleId) : ROUTES.MANAGE.VEHICLES}>
          <Button icon={<ArrowLeftOutlined aria-hidden />}>Về hồ sơ xe</Button>
        </Link>
      }
    />
  );

  if (!vehicle.data || !pricing.data) {
    return (
      <div>
        {header}
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <VehiclePricingWorkspace
        vehicleName={vehicle.data.name}
        vehiclePlate={vehicle.data.plateNumber ?? null}
        pricing={pricing.data}
        canEdit={canEdit}
        submitting={save.isPending}
        onSave={(body) =>
          save.mutate(body, {
            onSuccess: () =>
              message.success(
                body.source === 'shop'
                  ? 'Đã đặt lại theo chính sách gian hàng'
                  : 'Đã lưu giá & chính sách riêng cho xe',
              ),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}
