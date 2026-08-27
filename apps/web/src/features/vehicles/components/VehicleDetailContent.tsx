'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { vehicleSchedulePath } from '../calendar-link';
import { useVehicle } from '../hooks/use-vehicle';
import { useVehicleSummary } from '../hooks/use-vehicle-summary';
import { useDeleteVehicle } from '../hooks/use-vehicle-mutations';
import { Vehicle360Overview } from './Vehicle360Overview';

interface Props {
  vehicleId: string;
  /**
   * Hành động ở màn lỗi/không-tìm-thấy. Trang truyền "Về danh sách"; modal truyền "Đóng" —
   * đây là chỗ DUY NHẤT hai bề mặt cần khác nhau.
   */
  notFoundAction?: { label: string; onClick: () => void };
  /** Sau khi xoá xe thành công. Trang điều hướng về danh sách; modal tự đóng. */
  onDeleted?: () => void;
}

/**
 * Toàn bộ nội dung có thẩm quyền của MỘT hồ sơ xe: hai query (bản ghi + tổng hợp), các trạng
 * thái quyền/tải/lỗi, và hành động xoá.
 *
 * Tách khỏi route `/manage/vehicles/[id]` để modal hồ sơ xe dùng CHUNG — cùng bài học với
 * `BookingDetailContent` ở Wave 10: hai bản chi tiết là một bản sẽ bị bỏ quên. Trình bày vẫn
 * nằm trọn ở `Vehicle360Overview`; component này chỉ điều phối.
 */
export function VehicleDetailContent({ vehicleId, notFoundAction, onDeleted }: Props) {
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const t = useTranslations('Vehicles');

  const canView = has(PERMISSION.VEHICLE_VIEW);
  const { data: vehicle, isLoading, isError, error, refetch } = useVehicle(
    canView ? vehicleId : undefined,
  );
  // Tổng hợp (chỉ số + đơn thuê) tách query riêng: chậm hay hỏng cũng không kéo sập hồ sơ.
  const summary = useVehicleSummary(canView ? vehicleId : undefined);
  const deleteVehicle = useDeleteVehicle();

  function handleDelete() {
    deleteVehicle.mutate(vehicleId, {
      onSuccess: () => {
        message.success(t('detail.deleted'));
        onDeleted?.();
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  const fallbackAction: ReactNode = notFoundAction ? (
    <Button onClick={notFoundAction.onClick}>{notFoundAction.label}</Button>
  ) : null;

  // Cùng quy tắc với danh sách: không có quyền xem thì không dựng gì của bản ghi.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('detail.forbiddenTitle')}
        description={t('detail.forbiddenBody')}
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          fallbackAction ?? (
            <Link href={ROUTES.MANAGE.ROOT}>
              <Button type="primary">{t('detail.home')}</Button>
            </Link>
          )
        }
      />
    );
  }

  if (isLoading) return <LoadingState variant="page" label={t('detail.loading')} />;

  if (isError || !vehicle) {
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant="error"
        title={notFound ? t('detail.notFoundTitle') : t('detail.loadErrorTitle')}
        description={notFound ? t('detail.notFoundBody') : t('detail.loadErrorBody')}
        onRetry={notFound ? undefined : () => void refetch()}
        action={fallbackAction}
      />
    );
  }

  return (
    <Vehicle360Overview
      vehicle={vehicle}
      summary={summary.data}
      summaryLoading={summary.isLoading}
      summaryFailed={summary.isError}
      canEdit={has(PERMISSION.VEHICLE_UPDATE)}
      canDelete={has(PERMISSION.VEHICLE_DELETE)}
      deletePending={deleteVehicle.isPending}
      onEdit={() => router.push(vehiclePath.edit(vehicleId))}
      onSchedule={() => router.push(vehicleSchedulePath(vehicle))}
      onDelete={handleDelete}
    />
  );
}
