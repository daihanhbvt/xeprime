'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  PERMISSION,
  SUPPORT_CAPABILITY,
  isVehicleServiceTypeAllowed,
  missingVehicleImageTypes,
} from '@xeprime/types';

import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { VEHICLE_EDIT_TAB, VEHICLE_EDIT_TAB_VALUES, type VehicleEditTab } from '@/constants/routes';
import {
  supportAllowsVehicleTab,
  useSupportCan,
  useSupportPinnedField,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import { STANDARD_VEHICLE_DOCUMENT_TYPES } from '@/features/vehicle-documents/constants';
import { VehicleDocumentsWorkspace } from '@/features/vehicle-documents/components/VehicleDocumentsWorkspace';
import { useVehicleDocuments } from '@/features/vehicle-documents/hooks';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace';
import { VehicleManageProvider } from '@/features/vehicle-manage/components/VehicleManageContext';
import { ImagesSection as VehicleImagesSection } from '@/features/vehicle-manage/components/sections/ImagesSection';
import { TripHistorySection } from '@/features/vehicle-manage/components/sections/TripHistorySection';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { decorativeIcon } from '@/lib/decorative-icon';

import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import type { UpdateVehicleInput, VehicleDetail } from '../types';
import { EditActionsProvider, useEditActions } from './edit/edit-actions';
import { InformationPane } from './edit/InformationPane';
import { PolicyPane } from './edit/PolicyPane';
import { ServicesPane } from './edit/ServicesPane';
import { VehicleEditMenu, type EditMenuBadge } from './edit/VehicleEditMenu';
import { VehicleEditSummary } from './edit/VehicleEditSummary';
import shell from './edit/VehicleEditShell.module.css';
import {
  EDIT_MENU,
  menuKeyOfTab,
  resolveEditTab,
  serviceOfTab,
  tabOfMenu,
  type EditMenuKey,
} from './vehicle-edit-nav';
import { VehicleSourceWorkspace } from './VehicleSourceWorkspace';

interface VehicleEditWorkspaceProps {
  vehicle: VehicleDetail;
  submitting: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateVehicleInput) => Promise<VehicleDetail>;
  onCancel: () => void;
}

/** Giá trị `?tab=` lạ rơi về "Thông tin chung". */
function parseTab(value: string | null): VehicleEditTab {
  return (VEHICLE_EDIT_TAB_VALUES as string[]).includes(value ?? '')
    ? (value as VehicleEditTab)
    : VEHICLE_EDIT_TAB.INFORMATION;
}

/**
 * Màn sửa xe (design `23731:37932`, 03/11/2026) — menu trái ba nhóm · nội dung mục · cột phải
 * (thẻ tóm tắt + "Hoàn tác · Lưu thay đổi" của mục đang mở). Nhóm "Hình thức cho thuê" có HAI mục
 * thay cho ba của design: "Dịch vụ & giá" (theo từng dịch vụ) và "Chính sách thuê" (áp cho cả xe).
 *
 * MỘT màn cho cả hai tuyến (sổ cái §3.6 E24): chủ xe tuyến hoa hồng có thêm "Lịch sử chuyến",
 * không có nhóm "Vận hành nâng cao" (năng lực của gói), sửa chính sách thẳng thay vì qua công tắc
 * chính sách gian hàng. Mỗi mục vẫn lưu bằng đúng mutation của nó như trước; mục tự lưu (ảnh, giấy
 * tờ, bảo dưỡng) không có hai nút ở cột phải.
 */
export function VehicleEditWorkspace(props: VehicleEditWorkspaceProps) {
  return (
    <EditActionsProvider>
      <Workspace {...props} />
    </EditActionsProvider>
  );
}

function Workspace({ vehicle, errorMessage, onSave }: VehicleEditWorkspaceProps) {
  const t = useTranslations('Vehicles.editor');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { vehicles: vehiclePaths, isManage } = useWorkspace();
  const support = useSupportSession();
  const supportPinned = useSupportPinnedField();
  const canOperate = useSupportCan(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
  const can = useVehicleCapabilities();
  const permissions = usePermissions();
  const canUpdate = permissions.has(PERMISSION.VEHICLE_UPDATE);
  const actions = useEditActions();
  const services = vehicle.serviceTypes ?? [];

  /**
   * Mục có mặt với NGƯỜI NÀY — quyền ∧ cờ gói (cùng bảng luật với Hồ sơ xe) ∧ tuyến ∧ phiên hỗ trợ.
   * Một link cũ tới mục người này không có rơi về "Thông tin chung" thay vì mở một thân rỗng.
   */
  const menuEnabled = (key: EditMenuKey): boolean => {
    switch (key) {
      case EDIT_MENU.DOCUMENTS:
        return can.documents && supportAllowsVehicleTab(support, key);
      case EDIT_MENU.MAINTENANCE:
        return can.maintenance && supportAllowsVehicleTab(support, key);
      case EDIT_MENU.SOURCE:
        return can.source && supportAllowsVehicleTab(support, key);
      // Gian hàng đã có màn Đơn thuê lọc theo xe; lịch sử chuyến là mục của chủ xe tuyến hoa hồng.
      case EDIT_MENU.TRIP_HISTORY:
        return !isManage && supportAllowsVehicleTab(support, key);
      case EDIT_MENU.SERVICES:
        return (
          support === null ||
          [VEHICLE_EDIT_TAB.SELF_DRIVE, VEHICLE_EDIT_TAB.WITH_DRIVER].some((tab) =>
            supportAllowsVehicleTab(support, tab),
          )
        );
      default:
        return supportAllowsVehicleTab(support, key);
    }
  };
  const tabEnabled = (tab: VehicleEditTab): boolean => {
    const service = serviceOfTab(tab);
    if (service && !isVehicleServiceTypeAllowed(vehicle.vehicleType, service)) return false;
    if (service && support && !supportAllowsVehicleTab(support, tab)) return false;
    return menuEnabled(menuKeyOfTab(tab));
  };

  const [initial] = useState(() => {
    const resolved = resolveEditTab(parseTab(searchParams.get('tab')), services);
    return tabEnabled(resolved.tab)
      ? resolved
      : { tab: VEHICLE_EDIT_TAB.INFORMATION as VehicleEditTab, termsOf: null };
  });
  const [activeTab, setActiveTab] = useState<VehicleEditTab>(initial.tab);
  const [pendingTab, setPendingTab] = useState<VehicleEditTab | null>(null);

  function goToTab(next: VehicleEditTab) {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${vehiclePaths.edit(vehicle.id)}?${params.toString()}`, { scroll: false });
  }

  /** Đổi mục — còn thay đổi chưa lưu thì hỏi trước. Đổi tab dịch vụ trong CÙNG mục thì không hỏi. */
  function requestTab(next: VehicleEditTab) {
    if (next === activeTab) return;
    const sameMenu = menuKeyOfTab(next) === menuKeyOfTab(activeTab);
    if (!actions?.dirty || sameMenu) {
      goToTab(next);
      return;
    }
    setPendingTab(next);
  }

  // Số trên menu: góc ảnh bắt buộc còn thiếu · giấy tờ cốt lõi đã có / 3.
  const missingImages = missingVehicleImageTypes(vehicle.vehicleType, vehicle.media ?? []).length;
  const documents = useVehicleDocuments(vehicle.id, can.documents);
  const docsPresent = STANDARD_VEHICLE_DOCUMENT_TYPES.filter((type) =>
    (documents.data ?? []).some((doc) => doc.type === type && doc.hasFile),
  ).length;
  const badges: Partial<Record<EditMenuKey, EditMenuBadge>> = {
    ...(missingImages > 0
      ? {
          [EDIT_MENU.MEDIA]: {
            text: t('menu.missingBadge', { count: missingImages }),
            label: t('menu.missingImages', { count: missingImages }),
            warn: true,
          },
        }
      : {}),
    ...(documents.data
      ? {
          [EDIT_MENU.DOCUMENTS]: {
            text: `${docsPresent}/${STANDARD_VEHICLE_DOCUMENT_TYPES.length}`,
            label: t('menu.documentsCount', {
              count: docsPresent,
              total: STANDARD_VEHICLE_DOCUMENT_TYPES.length,
            }),
            warn: docsPresent < STANDARD_VEHICLE_DOCUMENT_TYPES.length,
          },
        }
      : {}),
  };

  const openMedia = tabEnabled(VEHICLE_EDIT_TAB.MEDIA)
    ? () => requestTab(VEHICLE_EDIT_TAB.MEDIA)
    : undefined;
  const openPolicy = tabEnabled(VEHICLE_EDIT_TAB.POLICY)
    ? () => requestTab(VEHICLE_EDIT_TAB.POLICY)
    : undefined;
  /*
   * Khối vận hành (thời gian chuẩn bị xe, tự nhận chuyến, thiết lập có tài xế) trong phiên hỗ trợ
   * còn đòi capability riêng `VEHICLE_OPERATIONS_UPDATE` — đúng phép nhân của khối vận hành cũ.
   */
  const canEditOperations = canUpdate && canOperate;
  const managed = { vehicle, canEdit: canUpdate };

  let content: ReactNode;
  switch (menuKeyOfTab(activeTab)) {
    case EDIT_MENU.MEDIA:
      // Ảnh dùng NGUYÊN section tự lưu (tiến trình upload, thử lại, kéo thả sắp xếp).
      content = (
        <VehicleManageProvider value={managed}>
          <VehicleImagesSection />
        </VehicleManageProvider>
      );
      break;
    case EDIT_MENU.DOCUMENTS:
      content = <VehicleDocumentsWorkspace vehicle={vehicle} />;
      break;
    case EDIT_MENU.TRIP_HISTORY:
      content = (
        <VehicleManageProvider value={managed}>
          <TripHistorySection />
        </VehicleManageProvider>
      );
      break;
    case EDIT_MENU.SERVICES:
      content = (
        <ServicesPane
          vehicle={vehicle}
          tab={activeTab}
          canUpdate={canUpdate}
          onTab={requestTab}
          onOpenPolicy={openPolicy}
        />
      );
      break;
    case EDIT_MENU.POLICY:
      content = (
        <PolicyPane
          vehicle={vehicle}
          canUpdate={canUpdate}
          canEditOperations={canEditOperations}
        />
      );
      break;
    case EDIT_MENU.MAINTENANCE:
      content = <VehicleMaintenanceWorkspace vehicle={vehicle} />;
      break;
    case EDIT_MENU.SOURCE:
      content = <VehicleSourceWorkspace vehicle={vehicle} />;
      break;
    default:
      content = (
        <InformationPane
          vehicle={vehicle}
          canUpdate={canUpdate}
          errorMessage={errorMessage}
          onSave={onSave}
        />
      );
  }

  return (
    <div className={shell.workspace}>
      <div className={shell.layout}>
        <aside className={shell.nav}>
          <VehicleEditMenu
            active={menuKeyOfTab(activeTab)}
            enabled={(key) => menuEnabled(key)}
            badges={badges}
            onSelect={(key) => requestTab(tabOfMenu(key, services))}
          />
        </aside>

        <div className={shell.main}>{content}</div>

        <aside className={shell.aside} aria-label={t('asideLabel')}>
          <VehicleEditSummary
            vehicle={vehicle}
            statusEditable={canUpdate && !supportPinned('operationStatus')}
            showSource={isManage && can.source}
            showOwnerStats={!isManage}
            onOpenMedia={menuKeyOfTab(activeTab) === EDIT_MENU.MEDIA ? undefined : openMedia}
          />
          {canUpdate && actions?.hasForms ? (
            <div className={shell.actions}>
              <Button
                size="large"
                onClick={actions.undo}
                disabled={!actions.dirty || actions.submitting}
              >
                {tEdit('revert')}
              </Button>
              <Button
                type="primary"
                size="large"
                icon={decorativeIcon(<CheckOutlined />)}
                loading={actions.submitting}
                disabled={!actions.dirty}
                onClick={() => void actions.save()}
              >
                {tActions('saveChanges')}
              </Button>
            </div>
          ) : null}
        </aside>
      </div>

      <ResponsiveDialog
        open={pendingTab !== null}
        title={tEdit('discard.title')}
        size="sm"
        onClose={() => setPendingTab(null)}
        onOk={() => {
          actions?.undo();
          const next = pendingTab;
          setPendingTab(null);
          if (next) goToTab(next);
        }}
        okText={tEdit('discard.ok')}
        cancelText={tEdit('discard.cancel')}
        destructive
      >
        {tEdit('discard.body')}
      </ResponsiveDialog>
    </div>
  );
}
