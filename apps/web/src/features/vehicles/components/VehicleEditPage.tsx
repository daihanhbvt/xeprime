'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import { useVehicle } from '../hooks/use-vehicle';
import { useUpdateVehicle } from '../hooks/use-vehicle-mutations';
import type { UpdateVehicleInput } from '../types';
import { VehicleEditWorkspace } from './VehicleEditWorkspace';

/**
 * Trang sửa xe nhiều tab — thân của `/manage/vehicles/[id]/edit`, dùng chung với phiên hỗ trợ
 * gian hàng của nhân sự nền tảng (ADR 0050).
 *
 * Mọi đường dẫn đi qua `useWorkspace()` nên trang không biết mình đang đứng ở đâu; mọi khác biệt
 * của phiên hỗ trợ (tab bị ẩn, ô bị khoá, quyền chỉ-xem) nằm ở `VehicleEditWorkspace` và các hook
 * quyền — không ở một nhánh `isAdmin` nào trong trang.
 */
export function VehicleEditPage({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { message } = App.useApp();
  const { paths, vehicles: vehiclePaths } = useWorkspace();
  const { has } = usePermissions();

  /*
   * Phiên hỗ trợ (ADR 0050) không có Hồ sơ 360 — trang này CHÍNH là hồ sơ xe của phiên, nên quay
   * lại là về danh sách, và phiên chế độ xem đọc được nó ở dạng chỉ-xem.
   */
  const support = useSupportSession();
  const canOpen = has(PERMISSION.VEHICLE_UPDATE) || (support !== null && has(PERMISSION.VEHICLE_VIEW));
  // Không gọi API khi không mở được trang: tránh một request chắc chắn bị guard backend từ chối.
  const vehicle = useVehicle(canOpen ? vehicleId : undefined);
  const update = useUpdateVehicle(vehicleId);
  const backHref = support ? paths.vehicles : vehiclePaths.detail(vehicleId);
  const goBack = () => router.push(backHref);

  async function handleSubmit(body: UpdateVehicleInput) {
    try {
      const updated = await update.mutateAsync(body);
      message.success(t('edit.page.saved'));
      return updated;
    } catch (err) {
      message.error(errorMessage(err));
      throw err;
    }
  }

  /*
   * Figma `62:893` edit-vehicle-permission-denied — thay toàn bộ trang, không dựng form chỉ-xem.
   * Ngoại lệ duy nhất là phiên hỗ trợ chế độ XEM: ở đó trang này là hồ sơ xe duy nhất của phiên,
   * nên người chỉ xem được vẫn đọc nó — form tự khoá theo quyền.
   */
  if (!canOpen) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('edit.page.forbiddenTitle')}
        description={t('edit.page.forbiddenBody')}
        missingPermissions={[PERMISSION.VEHICLE_UPDATE]}
        action={
          <Link href={backHref}>
            <Button type="primary">{t('edit.page.viewDetail')}</Button>
          </Link>
        }
      />
    );
  }

  if (vehicle.isLoading) {
    return (
      <PageContainer>
        <ManagePageHeader title={t('edit.page.title')} onBack={goBack} />
        <LoadingState variant="page" label={t('detail.loading')} />
      </PageContainer>
    );
  }

  if (vehicle.isError || !vehicle.data) {
    const notFound = getErrorCode(vehicle.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant="error"
        title={notFound ? t('detail.notFoundTitle') : t('detail.loadErrorTitle')}
        description={notFound ? t('detail.notFoundBody') : t('detail.loadErrorBody')}
        // Không retry cho 404 (EmptyState R10) — thử lại một bản ghi không tồn tại là ngõ cụt.
        onRetry={notFound ? undefined : () => void vehicle.refetch()}
        action={
          <Button onClick={() => router.push(paths.vehicles)}>{t('detail.backToList')}</Button>
        }
      />
    );
  }

  return (
    <PageContainer>
      <ManagePageHeader title={t('edit.page.title')} onBack={goBack} />
      <VehicleEditWorkspace
        vehicle={vehicle.data}
        submitting={update.isPending}
        errorMessage={update.isError ? errorMessage(update.error) : null}
        onSave={handleSubmit}
        onCancel={goBack}
      />
    </PageContainer>
  );
}
