'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';

import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ROUTES, vehicleManageSectionOf } from '@/constants/routes';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useVehicleSummary } from '@/features/vehicles/hooks/use-vehicle-summary';
import type { VehicleDetail, VehicleStats } from '@/features/vehicles/types';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorCode } from '@/services/api-client';

import { useServiceToggle } from '../hooks/use-service-toggle';
import { sectionServiceType } from '../navigation';
import { VehicleManageProvider } from './VehicleManageContext';
import { VehicleManageHeader } from './VehicleManageHeader';
import { VehicleManageSidebar } from './VehicleManageSidebar';
import styles from './VehicleManageWorkspace.module.css';

interface Props {
  vehicleId: string;
  children: ReactNode;
}

/**
 * Vỏ của không gian "Quản lý xe" (`/account/vehicles/[id]/manage/*`, 08/09/2026).
 *
 * Tải hồ sơ xe MỘT lần cho mọi mục con, gác đủ trạng thái (quyền · tải · không tìm thấy · lỗi)
 * rồi mới render trang con qua context. Layout của Next giữ vỏ này qua các lần chuyển mục nên
 * không tải lại hồ sơ khi đổi menu; F5 ở bất kỳ mục nào cũng dựng lại đúng mục đó từ URL.
 *
 * Quyền: đây là lớp trải nghiệm — `OwnerGate` đứng ngoài, và mọi endpoint mà các mục gọi vẫn
 * qua `TenantScopeGuard` + permission ở backend (CLAUDE.md §3). Id xe của gian hàng khác trả 404.
 */
export function VehicleManageWorkspace({ vehicleId, children }: Props) {
  const t = useTranslations('VehicleManage');
  const tManage = useTranslations('ManageCommon.permission');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const pathname = usePathname();
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  const vehicleQ = useVehicle(canView ? vehicleId : undefined);
  const summary = useVehicleSummary(canView ? vehicleId : undefined);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbiddenTitle')}
        description={t('forbiddenBody')}
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.ACCOUNT.VEHICLES}>
            <Button type="primary">{tManage('backHome')}</Button>
          </Link>
        }
      />
    );
  }

  if (vehicleQ.isLoading) return <LoadingState variant="page" label={t('loading')} />;

  if (vehicleQ.isError || !vehicleQ.data) {
    const notFound = getErrorCode(vehicleQ.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant="error"
        title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
        description={notFound ? t('notFoundBody') : t('loadErrorBody')}
        onRetry={notFound ? undefined : () => void vehicleQ.refetch()}
        action={
          <Button onClick={() => router.push(ROUTES.ACCOUNT.VEHICLES)}>{t('backToList')}</Button>
        }
      />
    );
  }

  return (
    <WorkspaceBody
      vehicle={vehicleQ.data}
      canEdit={canEdit}
      stats={summary.data?.stats}
      pathname={pathname}
      serviceLabel={(service) => domainLabel('serviceType', service)}
    >
      {children}
    </WorkspaceBody>
  );
}

/** Tách để `useServiceToggle` chỉ chạy khi ĐÃ có xe — hook không nhận `undefined`. */
function WorkspaceBody({
  vehicle,
  canEdit,
  stats,
  pathname,
  serviceLabel,
  children,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  stats: VehicleStats | undefined;
  pathname: string;
  serviceLabel: (service: string) => string;
  children: ReactNode;
}) {
  const t = useTranslations('VehicleManage');
  const toggle = useServiceToggle(vehicle, canEdit);

  const section = vehicleManageSectionOf(pathname);
  const service = section ? sectionServiceType(section) : null;
  const serviceOff = service !== null && !(vehicle.serviceTypes ?? []).includes(service);

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <VehicleManageSidebar vehicle={vehicle} toggle={toggle} />
      </aside>
      <div className={styles.main}>
        <VehicleManageHeader vehicle={vehicle} stats={stats} />
        {!canEdit ? <Alert type="info" showIcon message={t('readOnlyNotice')} /> : null}
        <VehicleManageProvider value={{ vehicle, canEdit }}>
          {serviceOff && service ? (
            <EmptyState
              variant="empty"
              title={t('disabledSection.title', { service: serviceLabel(service) })}
              description={t('disabledSection.body', { service: serviceLabel(service) })}
              action={
                canEdit && !toggle.blockedReason(service, true) ? (
                  <Button
                    type="primary"
                    loading={toggle.pending}
                    onClick={() => toggle.toggle(service, true)}
                  >
                    {t('disabledSection.enable', { service: serviceLabel(service) })}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.content}>{children}</div>
          )}
        </VehicleManageProvider>
      </div>
      {toggle.dialog}
    </div>
  );
}
