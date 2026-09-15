import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, PERMISSION, type ServiceType } from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Callout } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { sectionServiceType, type VehicleManageSection } from '@/navigation/vehicle-manage-section';
import { space } from '@/theme/tokens';
import { useServiceToggle } from '../hooks/use-service-toggle';

interface Props {
  vehicleId: string;
  section: VehicleManageSection;
  /** Tiêu đề của mục — thanh trên mang nó, tên xe xuống dòng phụ. */
  title: string;
  subtitle?: string;
  children: (ctx: { vehicle: VehicleDetail; canEdit: boolean }) => ReactNode;
}

/**
 * Vỏ chung của MỘT mục trong không gian "Quản lý xe" — bản native của `VehicleManageWorkspace`.
 *
 * Web tải hồ sơ xe một lần cho cả 13 mục vì layout của Next giữ vỏ qua các lần đổi mục. Ở đây mỗi
 * mục là một màn riêng trong ngăn xếp, nên vỏ này chạy lại — nhưng `useVehicle` đọc từ CÙNG một
 * khoá cache (`queryKeys.vehicles.detail`), nên mở mục thứ hai không tốn thêm request nào.
 *
 * Gác đủ bốn trạng thái trước khi render nội dung (quyền · tải · không tìm thấy · lỗi), cộng một
 * trạng thái web cũng có: mục thuộc một DỊCH VỤ ĐANG TẮT thì không bày form, mà mời bật dịch vụ.
 *
 * Đây là lớp trải nghiệm; chặn thật vẫn là `TenantScopeGuard` + permission ở backend, và id xe
 * của gian hàng khác trả 404 (CLAUDE.md §3).
 */
export function VehicleManageShell({ vehicleId, section, title, subtitle, children }: Props) {
  const t = useTranslations('VehicleManage');
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const query = useVehicle(vehicleId, canView);

  const back = () => goBackOr(router, ROUTES.account.vehicleManage(vehicleId));
  const header = <AppHeader onBack={back} title={title} {...(subtitle ? { subtitle } : {})} />;

  if (!canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbiddenTitle')}
            description={t('forbiddenBody')}
            actionLabel={t('backToList')}
            onAction={() => router.replace(ROUTES.account.vehicles())}
          />
        </Screen>
      </>
    );
  }

  if (query.isLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={6} />
        </Screen>
      </>
    );
  }

  if (query.isError || !query.data) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="alert-circle-outline"
            title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
            description={notFound ? t('notFoundBody') : t('loadErrorBody')}
            actionLabel={notFound ? t('backToList') : undefined}
            onAction={notFound ? () => router.replace(ROUTES.account.vehicles()) : undefined}
          />
        </Screen>
      </>
    );
  }

  return (
    <ShellBody
      vehicle={query.data}
      canEdit={canEdit}
      section={section}
      header={header}
      serviceLabel={(service) => domainLabel('serviceType', service)}
    >
      {children}
    </ShellBody>
  );
}

/** Tách để `useServiceToggle` chỉ chạy khi ĐÃ có xe — hook không nhận `undefined`. */
function ShellBody({
  vehicle,
  canEdit,
  section,
  header,
  serviceLabel,
  children,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  section: VehicleManageSection;
  header: ReactNode;
  serviceLabel: (service: ServiceType) => string;
  children: (ctx: { vehicle: VehicleDetail; canEdit: boolean }) => ReactNode;
}) {
  const t = useTranslations('VehicleManage');
  const toggle = useServiceToggle(vehicle, canEdit);

  const service = sectionServiceType(section);
  const serviceOff = service !== null && !(vehicle.serviceTypes ?? []).includes(service);

  if (serviceOff && service) {
    const blocked = toggle.blockedReason(service, true);
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="power-outline"
            title={t('disabledSection.title', { service: serviceLabel(service) })}
            description={blocked ?? t('disabledSection.body', { service: serviceLabel(service) })}
            actionLabel={
              blocked ? undefined : t('disabledSection.enable', { service: serviceLabel(service) })
            }
            onAction={blocked ? undefined : () => toggle.toggle(service, true)}
          />
        </Screen>
        {toggle.dialog}
      </>
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          {!canEdit ? <Callout tone="info">{t('readOnlyNotice')}</Callout> : null}
          {children({ vehicle, canEdit })}
        </YStack>
      </Screen>
      {toggle.dialog}
    </>
  );
}
