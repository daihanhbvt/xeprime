'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import {
  ROUTES,
  ownerVehiclePath,
  vehiclePath,
} from '@/constants/routes';
import { withBranchReturn } from '@/features/branches/branch-link';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { VehicleStatusChips } from './VehicleStatusChips';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { VEHICLES_DEFAULT_LIMIT } from '../api';
import { vehicleSchedulePath } from '../calendar-link';
import { VEHICLE_LIST_PAIRS_FROM } from '../constants';
import { useFleetSummary } from '../hooks/use-fleet-summary';
import { useVehicleFilters } from '../hooks/use-vehicle-filters';
import { useVehicleRowActions } from '../hooks/use-vehicle-row-actions';
import { useVehicles } from '../hooks/use-vehicles';
import type { VehicleListItem } from '../types';
import { VehicleCardGrid, type VehicleGridLayout } from './VehicleCardGrid';
import { VehicleFiltersBar, type VehicleFiltersScope } from './VehicleFilters';
import styles from './VehiclesListView.module.css';

/**
 * Danh sách xe `/vehicles` — MỘT màn cho hai tuyến (Figma Partner-XePrime 03/11/2026, chốt cùng
 * ngày: chủ xe tuyến hoa hồng dùng chung giao diện gian hàng).
 *
 *  - `shop` (gian hàng tuyến gói): đủ năm ô lọc, "Thêm xe mới" mở wizard đầy đủ, "Chỉnh sửa" mở
 *    trang sửa xe;
 *  - `owner` (chủ xe tuyến hoa hồng — Owner Lite): lọc dịch vụ + vận hành, "Thêm xe mới" mở luồng
 *    đăng xe của chủ xe, "Quản lý xe" mở không gian riêng của xe.
 *
 * Bố cục theo TỔNG xe của chi nhánh đang chọn (không theo các ô lọc khác, để gõ tìm kiếm không
 * làm bố cục nhảy): dưới `VEHICLE_LIST_PAIRS_FROM` xe là một xe một hàng; từ đó trở lên là hai
 * thẻ một hàng (chốt 16/11/2026 — không còn lưới thẻ gọn và nút chuyển kiểu xem).
 */
export function VehiclesListView({ scope }: { scope: VehicleFiltersScope }) {
  const t = useTranslations('Vehicles.list.page');

  // `useVehicleFilters` đọc `useSearchParams` → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<LoadingState variant="page" label={t('loading')} />}>
      <VehiclesListBody scope={scope} />
    </Suspense>
  );
}

function VehiclesListBody({ scope }: { scope: VehicleFiltersScope }) {
  const t = useTranslations('Vehicles.list.page');
  const tManage = useTranslations('ManageCommon.permission');
  const router = useRouter();
  const { has } = usePermissions();
  const isMobile = useIsMobile();
  const rowActions = useVehicleRowActions();
  const options = useVehicleOptions();
  const { filters, setFilters } = useVehicleFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });
  const { data, isError, refetch, isFetching } = useVehicles(filters);

  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canCreate = has(PERMISSION.VEHICLE_CREATE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const isOwner = scope === 'owner';
  /*
   * Phiên hỗ trợ (ADR 0050 §13): chỉ wizard tạo xe NHÁP của gian hàng. Luồng đăng xe của chủ xe
   * là luồng công khai tạo-và-gửi-duyệt trong một bước — nó nằm ngoài khu làm việc và không mở
   * cho phiên, nên ở tuyến hoa hồng nút thêm xe vắng hẳn trong phiên.
   */
  const ownerCreateHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CREATE_AND_SUBMIT);
  const showCreate = canCreate && !(isOwner && ownerCreateHidden);

  /*
   * Tổng xe của CHI NHÁNH đang chọn — cùng `fleet-summary` với dải chỉ số mobile. Chưa có số thì
   * chưa vẽ thẻ (khung chờ), để không vẽ một kiểu rồi nhảy sang kiểu kia. Hỏng thì suy từ trang
   * hiện tại khi không lọc gì; còn đang lọc thì không biết tổng ⇒ giữ bố cục đội xe đông.
   */
  const summary = useFleetSummary(canView, filters.branchId);
  const hasFilters = Boolean(
    filters.q ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.operationStatus ||
    filters.publicStatus ||
    filters.branchId,
  );
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: VEHICLES_DEFAULT_LIMIT, total: 0, hasNext: false };
  const fleetTotal =
    summary.data?.total ??
    (summary.isError ? (hasFilters ? VEHICLE_LIST_PAIRS_FROM : meta.total) : null);
  const layout: VehicleGridLayout =
    fleetTotal != null && fleetTotal < VEHICLE_LIST_PAIRS_FROM ? 'list' : 'pairs';

  function clearFilters() {
    setFilters({
      q: undefined,
      vehicleType: undefined,
      serviceType: undefined,
      operationStatus: undefined,
      publicStatus: undefined,
      branchId: undefined,
    });
  }

  function goCreate() {
    // MỘT wizard thêm xe cho hai tuyến (18/11/2026) - trang tự ẩn phần không thuộc tuyến hoa hồng.
    router.push(ROUTES.MANAGE.VEHICLE_NEW);
  }

  /** "Lịch" của một xe — cùng một đích với nút ở Hồ sơ xe (`vehicleSchedulePath`). */
  function openSchedule(row: VehicleListItem) {
    router.push(vehicleSchedulePath(row, { branchId: filters.branchId }));
  }

  // Thiếu quyền xem → thay TOÀN BỘ nội dung, không dựng tiêu đề và bộ lọc cho một trang không
  // xem được. Đây chỉ là lớp trải nghiệm; chặn thật là guard backend.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tManage('backHome')}</Button>
          </Link>
        }
      />
    );
  }

  const createButton = showCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={goCreate}>
      {t('addNewVehicle')}
    </Button>
  ) : null;

  // Lối tạo ở màn rỗng nói đúng hoàn cảnh ("xe đầu tiên"), cùng đích với nút ở tiêu đề.
  const firstVehicleButton = showCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={goCreate}>
      {t('addFirstVehicle')}
    </Button>
  ) : undefined;

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} extra={createButton} />

      {/*
        Khổ điện thoại (Figma Partner "Vehice / List" MB): ô tìm + nút "Lọc" và dải tab trạng thái
        (Tất cả · Sẵn sàng · Đang thuê…) như màn Đơn thuê; dải chỉ số đội xe đã bỏ.
      */}
      <VehicleFiltersBar
        scope={scope}
        filters={filters}
        branchField={branch.field}
        onChange={(patch) => {
          /*
           * `remember` chứ không `select`: `select` tự ghi URL, nên gọi nó rồi gọi `setFilters`
           * là hai lượt `router.replace` trong cùng một tick — cả hai đọc `searchParams` của lần
           * render trước và lượt sau ghi đè lượt trước. URL do MỘT lượt `setFilters` lo (ADR 0052).
           */
          setFilters(
            'branchId' in patch
              ? { ...patch, branchId: patch.branchId === ALL_FILTER ? undefined : patch.branchId }
              : patch,
          );
        }}
        onClear={clearFilters}
      />

      {isMobile ? (
        isOwner ? (
          <VehicleStatusChips
            value={filters.serviceType}
            onChange={(serviceType) => setFilters({ serviceType })}
            options={options.serviceType}
            ariaLabel={t('serviceChipsLabel')}
          />
        ) : (
          <VehicleStatusChips
            value={filters.operationStatus}
            onChange={(operationStatus) => setFilters({ operationStatus })}
          />
        )
      ) : null}

      <VehicleCardGrid
        layout={layout}
        // Chưa biết tổng xe thì chưa biết bố cục — giữ khung chờ thay vì vẽ rồi nhảy.
        items={fleetTotal == null ? [] : items}
        meta={meta}
        loading={isFetching || fleetTotal == null}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ danh sách đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={clearFilters}
        emptyAction={firstVehicleButton}
        rowActions={(row, shape) =>
          rowActions({
            row,
            canEdit,
            compact: shape === 'row',
            editKind: isOwner ? 'manage' : 'edit',
            // Mang chi nhánh đang lọc sang màn chi tiết làm MẨU ĐƯỜNG VỀ (ADR 0052).
            onView: (id) =>
              router.push(
                isOwner
                  ? ownerVehiclePath.detail(id)
                  : withBranchReturn(vehiclePath.detail(id), filters.branchId),
              ),
            onEdit: (id) =>
              router.push(
                isOwner
                  ? ownerVehiclePath.manage(id)
                  : withBranchReturn(vehiclePath.edit(id), filters.branchId),
              ),
            onSchedule: openSchedule,
          })
        }
        detailHref={isOwner ? ownerVehiclePath.detail : undefined}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
