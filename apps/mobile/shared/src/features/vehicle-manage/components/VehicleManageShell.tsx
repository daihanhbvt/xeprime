import type { ReactNode, RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Callout } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import {
  sectionLabelKeyOf,
  sectionServiceType,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';
import { space } from '@/theme/tokens';
import { isServiceOff, VehicleSectionDisabled } from './VehicleSectionDisabled';

interface Props {
  vehicleId: string;
  section: VehicleManageSection;
  /**
   * Tiêu đề của mục. Bỏ trống = nhãn MENU của mục (`VehicleManage.menu.items.*`) — đúng chữ ở
   * breadcrumb bên web, để một mục mang một tên ở mục lục và ở đầu màn.
   */
  title?: string;
  subtitle?: string;
  children: (ctx: { vehicle: VehicleDetail; canEdit: boolean }) => ReactNode;
  /** Ref tới ScrollView của màn — cho mục cần cuộn tới một khối của chính nó (neo thủ tục). */
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * Khu đang đứng. `account` (mặc định) = không gian "Quản lý xe" của khu tài khoản; `manage` =
   * mục của màn SỬA XE ở app Partner — Lui về hub sửa xe, danh sách là đội xe của gian hàng, và
   * lời mời bật dịch vụ theo đúng nhánh của `VehicleEditWorkspace` web.
   */
  workspace?: VehicleSectionWorkspace;
}

export type VehicleSectionWorkspace = 'account' | 'manage';

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
export function VehicleManageShell({
  vehicleId,
  section,
  title: titleOverride,
  subtitle,
  children,
  scrollRef,
  workspace = 'account',
}: Props) {
  const t = useTranslations('VehicleManage');
  const tMenu = useTranslations('VehicleManage.menu');
  const labelKey = sectionLabelKeyOf(section);
  const title = titleOverride ?? (labelKey ? tMenu(labelKey) : t('title'));
  const router = useRouter();
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const query = useVehicle(vehicleId, canView);

  const isManage = workspace === 'manage';
  const back = () =>
    goBackOr(
      router,
      isManage ? ROUTES.manage.vehicleEdit(vehicleId) : ROUTES.account.vehicleManage(vehicleId),
    );
  const listHref = isManage ? ROUTES.manage.vehicles() : ROUTES.account.vehicles();
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
            onAction={() => router.replace(listHref)}
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
            onAction={notFound ? () => router.replace(listHref) : undefined}
          />
        </Screen>
      </>
    );
  }

  const vehicle = query.data;

  /*
   * Mục thuộc một DỊCH VỤ ĐANG TẮT: mời bật, không bày form.
   *
   * Không còn phải tách một `ShellBody` riêng để gọi `useServiceToggle` sau khi đã có xe — hook
   * đó nay sống trong `VehicleSectionDisabled`, tức trong đúng nhánh cần nó. Nhánh thường không
   * gọi hook nào, nên nó dựng được thẳng ở đây.
   */
  const service = sectionServiceType(section);
  if (service !== null && isServiceOff(vehicle, service)) {
    return (
      <VehicleSectionDisabled
        vehicle={vehicle}
        canEdit={canEdit}
        service={service}
        header={header}
        workspace={workspace}
      />
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']} {...(scrollRef ? { scrollRef } : {})}>
        <YStack gap={space.md}>
          {!canEdit ? <Callout tone="info">{t('readOnlyNotice')}</Callout> : null}
          {children({ vehicle, canEdit })}
        </YStack>
      </Screen>
    </>
  );
}
