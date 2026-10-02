'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  MoreOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Dropdown, Popconfirm, Tabs } from 'antd';
import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  STATUS_COLOR,
  SUPPORT_CAPABILITY,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type StatusColor,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { StatusTag } from '@/components/data-display/StatusTag';
import { statusColorClass } from '@/components/data-display/status-color';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { useRepairVehicleListing } from '../hooks/use-vehicle-mutations';
import type { Vehicle360Summary, VehicleDetail } from '../types';
import { MarketplaceVisibilitySwitch } from './MarketplaceVisibilitySwitch';
import { Vehicle360Aside } from './Vehicle360Aside';
import {
  AutomationCard,
  DocumentsCard,
  KeySpecsCard,
  MediaCard,
  PricingCard,
  SourceCard,
  SpecsCard,
  TodoCard,
} from './Vehicle360Cards';
import styles from './Vehicle360Overview.module.css';

/** Tab của Hồ sơ 360 — Tổng quan · Thông số · Tài chính (theo năng lực) · Bảo dưỡng (theo năng lực). */
const OVERVIEW_VIEW = {
  SPECS: 'specs',
  MAINTENANCE: 'maintenance',
  OVERVIEW: 'overview',
  FINANCE: 'finance',
} as const;
type OverviewView = (typeof OVERVIEW_VIEW)[keyof typeof OVERVIEW_VIEW];

export interface Vehicle360OverviewProps {
  vehicle: VehicleDetail;
  /** Tổng hợp chỉ số + đơn thuê; `undefined` khi đang tải hoặc tải hỏng. */
  summary?: Vehicle360Summary;
  summaryLoading: boolean;
  /** Tổng hợp hỏng KHÔNG kéo sập trang — từng khối tự báo "không tải được". */
  summaryFailed: boolean;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}

/**
 * Hồ sơ 360 của một xe.
 *
 * Bố cục 02/10/2026 — HAI vùng:
 *  - **Cột chính**: thẻ hồ sơ (ảnh · định danh · hai trục trạng thái · công tắc "Trên chợ" · ⋮),
 *    rồi các tab. Tab Tổng quan là lưới hai cột thẻ — xem `Vehicle360Cards`.
 *  - **Cột phụ** đứng cạnh suốt mọi tab: hiệu suất · lịch sắp tới · hoạt động gần đây · các khu
 *    vực quản lý — xem `Vehicle360Aside`. Đây là phần "xe đang chạy thế nào"; đổi sang tab Tài
 *    chính hay Bảo dưỡng không được làm mất nó.
 *
 * Bố cục đo BỀ RỘNG THẬT của vùng nội dung (`@container`), không đo viewport: cùng component này
 * chạy trong cổng quản lý, khu tài khoản (có menu dọc) và modal hồ sơ xe.
 *
 * Không bịa dữ liệu chưa tồn tại (nguyên tắc "Chưa có" của `docs/design/12` §12): giấy tờ chỉ
 * hiện ĐẾM theo cảnh báo server; "Hiệu suất" giữ số chuyến LUỸ KẾ, còn TIỀN nằm ở tab Tài chính
 * theo kỳ — một màn, một bề mặt tiền.
 */
export function Vehicle360Overview({
  vehicle,
  summary,
  summaryLoading,
  summaryFailed,
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: Vehicle360OverviewProps) {
  const t = useTranslations('Vehicles.overview');
  const can = useVehicleCapabilities();
  const { isManage } = useWorkspace();
  const [view, setView] = useState<OverviewView>(OVERVIEW_VIEW.OVERVIEW);
  const tabsId = useId();

  /*
   * "Xem đầy đủ" đổi tab TẠI CHỖ — và đưa focus theo: nút vừa bấm nằm trong ô vừa bị ẩn, để nguyên
   * thì người dùng bàn phím lạc mất chỗ. Id của tab do antd dựng từ `id` của `Tabs`.
   */
  function showSpecs() {
    setView(OVERVIEW_VIEW.SPECS);
    requestAnimationFrame(() =>
      document.getElementById(`${tabsId}-tab-${OVERVIEW_VIEW.SPECS}`)?.focus(),
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <ProfileHeader
              vehicle={vehicle}
              summary={summary}
              canEdit={canEdit}
              canDelete={canDelete}
              deletePending={deletePending}
              onEdit={onEdit}
              onSchedule={onSchedule}
              onDelete={onDelete}
            />

            <Tabs
              id={tabsId}
              className={styles.viewTabs}
              activeKey={view}
              onChange={(key) => setView(key as OverviewView)}
              items={[
                {
                  key: OVERVIEW_VIEW.OVERVIEW,
                  label: t('tabs.overview'),
                  children: (
                    /*
                      Thứ tự (02/10/2026): Việc cần làm · Thông số chính trên cùng — hai thứ mở hồ
                      sơ ra là cần thấy; Thư viện ảnh · Giấy tờ ở hàng thứ hai.
                    */
                    <div className={styles.overviewGrid}>
                      <TodoCard
                        vehicle={vehicle}
                        summary={summary}
                        loading={summaryLoading}
                        failed={summaryFailed}
                      />
                      <KeySpecsCard vehicle={vehicle} onViewAll={showSpecs} />
                      <MediaCard vehicle={vehicle} canEdit={canEdit} />
                      <DocumentsCard vehicleId={vehicle.id} summary={summary} />
                      <PricingCard vehicle={vehicle} canEdit={canEdit} />
                      <AutomationCard vehicle={vehicle} canEdit={canEdit} />
                      {/* Nguồn xe & tài chính là của gian hàng — chủ xe tuyến hoa hồng không có. */}
                      {isManage ? <SourceCard vehicle={vehicle} /> : null}
                    </div>
                  ),
                },
                {
                  // Thông số kỹ thuật là một tab riêng (30/09/2026) — bảng dài, không đè lên tổng quan.
                  key: OVERVIEW_VIEW.SPECS,
                  label: t('tabs.specs'),
                  children: <SpecsCard vehicle={vehicle} />,
                },
                ...(can.money
                  ? [
                      {
                        key: OVERVIEW_VIEW.FINANCE,
                        label: t('tabs.finance'),
                        /*
                         * Tiền của riêng chiếc xe này, THEO KỲ. Gác bằng `can.money` (quyền ∧ cờ
                         * gói) — `finance/*` ở backend gác `@SubscriptionTrackOnly` +
                         * `@RequiresFeature`.
                         */
                        children: (
                          <FinanceEntityPanel
                            scope={{ vehicleId: vehicle.id }}
                            kind="vehicle"
                            canCreateReceipt={can.createReceipt}
                          />
                        ),
                      },
                    ]
                  : []),
                /*
                 * Bảo dưỡng & số KM — tuyến GÓI: `vehicles/:id/maintenance/*` gác
                 * `@SubscriptionTrackOnly` + `@RequiresFeature`, nên tab chỉ có khi
                 * `can.maintenance` (quyền ∧ cờ gói).
                 */
                ...(can.maintenance
                  ? [
                      {
                        key: OVERVIEW_VIEW.MAINTENANCE,
                        label: t('tabs.maintenance'),
                        children: <VehicleMaintenanceWorkspace vehicle={vehicle} />,
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          <Vehicle360Aside
            vehicle={vehicle}
            summary={summary}
            loading={summaryLoading}
            failed={summaryFailed}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* CTA cố định đáy màn ở mobile (Figma `236:4890`) — desktop dùng menu ⋮ trong thẻ hồ sơ. */}
      <div className={styles.mobileActions}>
        {canEdit ? (
          <Button type="primary" size="large" block onClick={onEdit}>
            {t('editMobile')}
          </Button>
        ) : null}
        <Button size="large" block onClick={onSchedule}>
          {t('scheduleMobile')}
        </Button>
      </div>
    </div>
  );
}

/* ─── Thẻ hồ sơ đầu trang ─────────────────────────────────────────────────── */

/**
 * Icon đứng trước nhãn trục trạng thái — HÌNH theo sắc thái của màu meta, MÀU qua
 * `statusColorClass`. Suy từ màu ngữ nghĩa chứ không từ mã: thêm một trạng thái vào
 * `@xeprime/types` là có icon đúng luôn. Thuần trang trí: thẻ trạng thái bên cạnh nói bằng chữ.
 */
function AxisIcon({ color }: { color: StatusColor | undefined }) {
  let icon: ReactNode;
  switch (color) {
    case STATUS_COLOR.SUCCESS:
      icon = <CheckCircleOutlined />;
      break;
    case STATUS_COLOR.DANGER:
      icon = <CloseCircleOutlined />;
      break;
    case STATUS_COLOR.WARNING:
      icon = <ExclamationCircleOutlined />;
      break;
    case STATUS_COLOR.WAITING:
    case STATUS_COLOR.PROCESSING:
      icon = <ClockCircleOutlined />;
      break;
    default:
      icon = <MinusCircleOutlined />;
  }
  return (
    <span className={cx(styles.axisIcon, statusColorClass(color))} aria-hidden="true">
      {icon}
    </span>
  );
}

function ProfileHeader({
  vehicle,
  summary,
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { statusCopy } = usePublicationLabels();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = vehicle.publicStatus as VehiclePublicStatus;
  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;

  // Banner một-dòng cho trạng thái cần chú ý; `approved_public`/`draft` không cần banner —
  // draft đã có mục "Việc cần làm" và panel gửi duyệt nói chi tiết hơn.
  const needsBanner =
    status === VEHICLE_PUBLIC_STATUS.REJECTED ||
    status === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION ||
    status === VEHICLE_PUBLIC_STATUS.HIDDEN ||
    status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const banner = needsBanner ? statusCopy(status, vehicle.latestPublicReview?.reason) : null;

  /*
   * Phiên hỗ trợ gian hàng (ADR 0050 §13): "Đồng bộ lại hiển thị công khai" là thao tác SỬA CHỮA của
   * nền tảng khi snapshot ngoài chợ kẹt — không phải việc của chủ xe, nên chỉ có trong phiên.
   */
  const support = useSupportSession();
  const canRepairListing = support?.can(SUPPORT_CAPABILITY.LISTING_REPAIR) ?? false;
  const repairListing = useRepairVehicleListing(vehicle.id);
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  /*
   * MỘT nút ⋮ cho toàn bộ thao tác của xe (30/09/2026) — một điểm bấm duy nhất thì không có gì để
   * xuống dòng ở bề rộng hẹp, và thứ tự thao tác đọc thành danh sách chứ không thành hình.
   *
   * "Xem lịch" không gác quyền: nó chỉ điều hướng sang màn lịch, nơi tự gác quyền của nó.
   */
  const menuItems = [
    ...(canEdit ? [{ key: 'edit', icon: decorativeIcon(<EditOutlined />), label: t('edit') }] : []),
    { key: 'schedule', icon: decorativeIcon(<CalendarOutlined />), label: t('schedule') },
    ...(canRepairListing || canDelete ? [{ type: 'divider' as const, key: 'sep' }] : []),
    ...(canRepairListing
      ? [
          {
            key: 'repair-listing',
            icon: decorativeIcon(<ToolOutlined />),
            label: t('repairListing.action'),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            key: 'delete',
            danger: true,
            icon: decorativeIcon(<DeleteOutlined />),
            label: t('delete'),
          },
        ]
      : []),
  ];

  return (
    <section className={styles.profile} aria-label={t('profileLabel')}>
      <div className={styles.profileMain}>
        <div className={styles.profileMedia}>
          {vehicle.mainImageUrl ? (
            <PreviewImage
              className={styles.profileImage}
              src={vehicle.mainImageUrl}
              alt={vehicle.name}
            />
          ) : (
            <span className={styles.profileMediaFallback} aria-hidden="true">
              <CarOutlined />
            </span>
          )}
        </div>

        <div className={styles.profileInfo}>
          <div className={styles.profileHead}>
            <div className={styles.profileTitle}>
              <h2 className={styles.vehicleName}>{vehicle.name}</h2>
              {/*
                Định danh trên MỘT dải, mỗi mục là một ô riêng: xuống dòng thì xuống nguyên mục,
                không cắt "Biển số:" khỏi giá trị của nó. Dấu chấm ngăn cách vẽ bằng CSS.
              */}
              <ul className={styles.metaList}>
                <li>
                  {t.rich('idLabel', { value: vehicle.code, b: (chunks) => <b>{chunks}</b> })}
                </li>
                <li>
                  {t.rich('plate', {
                    value: vehicle.plateNumber || tLabels('notAvailable'),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </li>
                {/*
                  KM có thẩm quyền + NGUỒN của nó (Wave 8). Chưa có số thì nói "Chưa có" — không
                  dựng "0 km" (docs §9). Nguồn cho biết số đến từ bàn giao, bảo dưỡng hay chỉnh
                  tay, để người đọc biết tin nó tới đâu.
                */}
                <li>
                  {t.rich('odometer', {
                    value: fmt.km(summary?.currentOdometerKm ?? null),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                  {summary?.currentOdometerSource ? (
                    <span className={styles.odometerSource}>
                      {' '}
                      · {domainLabel('odometerSource', summary.currentOdometerSource)}
                    </span>
                  ) : null}
                </li>
              </ul>
              <p className={styles.typeLine}>
                {domainLabel('vehicleType', vehicle.vehicleType)} /{' '}
                {fmt.serviceTypes(vehicle.serviceTypes)}
              </p>
            </div>

            {/*
              Nút ⋮ tách khỏi khung trạng thái vì hai thứ biến mất ở hai nhịp khác nhau: ở mobile
              thao tác chuyển xuống thanh CTA đáy màn, còn "Trên chợ" thì ở lại đầu trang.
            */}
            <div className={styles.profileButtons}>
              {/*
                Xác nhận xoá điều khiển bằng state và neo vào nút ⋮ — mục menu đã biến mất khi menu
                đóng, không còn chỗ khác để neo (cùng pattern với `RowActions`).
              */}
              <Popconfirm
                open={confirmingDelete}
                trigger={[]}
                title={t('deleteConfirmTitle', { name: vehicle.name })}
                description={t('deleteConfirmBody')}
                okText={tActions('delete')}
                okButtonProps={{ danger: true, loading: deletePending }}
                cancelText={tActions('cancel')}
                onConfirm={() => {
                  setConfirmingDelete(false);
                  onDelete();
                }}
                onCancel={() => setConfirmingDelete(false)}
              >
                <Dropdown
                  menu={{
                    items: menuItems,
                    onClick: ({ key }) => {
                      if (key === 'edit') onEdit();
                      if (key === 'schedule') onSchedule();
                      if (key === 'delete') setConfirmingDelete(true);
                      if (key === 'repair-listing') {
                        repairListing.mutate(undefined, {
                          onSuccess: (result) =>
                            message.success(
                              result.changed
                                ? t('repairListing.fixed')
                                : t('repairListing.unchanged'),
                            ),
                          onError: (err) => message.error(errorMessage(err)),
                        });
                      }
                    },
                  }}
                  trigger={['click']}
                >
                  <Button
                    className={styles.actionsTrigger}
                    icon={decorativeIcon(<MoreOutlined />)}
                    aria-label={t('moreActions', { name: vehicle.name })}
                    loading={deletePending || repairListing.isPending}
                  />
                </Dropdown>
              </Popconfirm>
            </div>
          </div>

          <div className={styles.statusPanel}>
            {/*
              Hai trục VẬN HÀNH và KIỂM DUYỆT (ADR 0048). Trục thứ ba — "xe có ngoài chợ không" —
              đứng ngay bên phải, cạnh chính cái công tắc đổi nó: hai chỗ nói cùng một điều là hai
              chỗ để lệch nhau, và chỗ có nút bấm là chỗ người dùng nhìn.
            */}
            <dl className={styles.axes}>
              <div className={styles.axis}>
                <dt>
                  <AxisIcon color={VEHICLE_OPERATION_STATUS_META[operationStatus]?.color} />
                  {t('axisOperation')}
                </dt>
                <dd>
                  <StatusTag
                    value={operationStatus}
                    meta={VEHICLE_OPERATION_STATUS_META}
                    group="vehicleOperationStatus"
                  />
                </dd>
              </div>
              <div className={styles.axis}>
                <dt>
                  <AxisIcon color={VEHICLE_PUBLIC_STATUS_META[status]?.color} />
                  {t('axisPublic')}
                </dt>
                <dd>
                  <StatusTag
                    value={status}
                    meta={VEHICLE_PUBLIC_STATUS_META}
                    group="vehiclePublicStatus"
                  />
                </dd>
              </div>
            </dl>
            {/*
              "Trên chợ" ở ĐẦU trang (ADR 0048): đây là thứ chủ xe kiểm tra thường xuyên nhất, và
              trước 23/09/2026 nó nằm ở một thẻ gần cuối trang. Đây là chỗ bấm DUY NHẤT để bật/tắt
              hiển thị — "Việc cần làm" chỉ nhắc, không có nút thứ hai.
            */}
            <div className={styles.marketplace}>
              <MarketplaceVisibilitySwitch vehicle={vehicle} bare />
            </div>
          </div>
        </div>
      </div>

      {banner ? (
        <Alert
          type={banner.type}
          showIcon
          title={banner.message}
          description={banner.description}
        />
      ) : null}
    </section>
  );
}
