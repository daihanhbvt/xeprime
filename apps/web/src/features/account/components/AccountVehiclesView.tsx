'use client';

import { BookOutlined, FileProtectOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { PERMISSION } from '@xeprime/types';

import type { RowAction } from '@/components/data-display/RowActions';
import { PermissionState } from '@/components/feedback/PermissionState';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  accountVehiclePath,
  listYourVehicleRegisterPath,
} from '@/constants/routes';
import { FleetSummaryBar } from '@/features/vehicles/components/FleetSummaryBar';
import { VehicleCardGrid } from '@/features/vehicles/components/VehicleCardGrid';
import { VehicleStatusChips } from '@/features/vehicles/components/VehicleStatusChips';
import { VEHICLES_DEFAULT_LIMIT } from '@/features/vehicles/api';
import { useVehicleFilters } from '@/features/vehicles/hooks/use-vehicle-filters';
import { useVehicleOptions } from '@/features/vehicles/hooks/use-vehicle-options';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleFilters, VehicleListItem } from '@/features/vehicles/types';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import { AccountPageHeader } from './AccountPageHeader';
import styles from './AccountVehiclesView.module.css';

/**
 * Danh sách xe của CHỦ XE trong khu tài khoản — bản rút gọn của `/manage/vehicles`.
 *
 * Cùng API, cùng hook lọc (URL — ADR 0004), cùng lưới thẻ và cùng ba trạng thái tải/rỗng/lỗi với
 * cổng quản lý; khác nhau ở bộ lọc ít hơn (dịch vụ + trạng thái vận hành, theo mockup) và ở hai
 * hành động trên thẻ:
 *  - "Xem chi tiết" → `/account/vehicles/[id]` (cùng `VehicleDetailContent`, khác vỏ);
 *  - "Quản lý xe" → `/account/vehicles/[id]/manage` (08/09/2026): không gian riêng của xe với
 *    menu trái theo dịch vụ — cùng feature/API với `/manage`, chỉ khác vỏ.
 *
 * Được `OwnerGate` bọc ở trang: người không phải chủ gian hàng không tới được đây, nên không có
 * request tenant nào bay đi vô ích.
 */
export function AccountVehiclesView() {
  const t = useTranslations('Account.vehicles');
  const tSort = useTranslations('Vehicles.list.sort');
  // Cẩm nang + chứng từ mẫu là tài liệu CÁ NHÂN của chủ xe ở khu tài khoản — phiên hỗ trợ gian hàng
  // không mở khu đó (ADR 0050 §12), nên hai thẻ dẫn đường không dựng.
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.OWNER_GUIDES);
  const tManage = useTranslations('ManageCommon.permission');
  const router = useRouter();
  const { has } = usePermissions();
  const isMobile = useIsMobile();
  const { filters, setFilters } = useVehicleFilters();
  const options = useVehicleOptions();
  /**
   * HAI trường lọc, không phải năm.
   *
   * Đây là toàn bộ khác biệt giữa thanh lọc của chủ xe cá nhân và của gian hàng: cùng một
   * `FilterBar`, cùng một `useVehicleFilters` đọc URL, chỉ khác danh sách khai ở đây. Loại xe và
   * trạng thái kiểm duyệt là bộ lọc của người quản một ĐỘI xe; với một tới ba chiếc, chúng chỉ
   * là hai ô luôn để trống.
   */
  const accountVehicleFilterFields: FilterField[] = useMemo(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('searchLabel'),
        placeholder: t('searchPlaceholder'),
      },
      {
        kind: 'select',
        key: 'operationStatus',
        label: t('statusFilterLabel'),
        options: options.operationStatus,
      },
    ],
    [options.operationStatus, t],
  );
  const { data, isError, refetch, isFetching } = useVehicles(filters);

  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canCreate = has(PERMISSION.VEHICLE_CREATE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: VEHICLES_DEFAULT_LIMIT, total: 0, hasNext: false };
  /*
   * Đếm CẢ năm tham số lọc chứ không chỉ hai ô trên màn này: `useVehicleFilters` đọc thẳng URL,
   * nên một đường link mang sẵn `?q=` vẫn thu hẹp danh sách. Bỏ sót chúng thì màn rỗng sẽ nói
   * "chưa có xe nào" trong khi thật ra là "không khớp bộ lọc" — hai câu dẫn tới hai hành động
   * khác hẳn nhau.
   */
  const hasFilters = Boolean(
    filters.q ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.operationStatus ||
    filters.publicStatus,
  );

  function clearFilters() {
    setFilters({
      q: undefined,
      vehicleType: undefined,
      serviceType: undefined,
      operationStatus: undefined,
      publicStatus: undefined,
    });
  }

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.ACCOUNT.ROOT}>
            <Button type="primary">{tManage('backHome')}</Button>
          </Link>
        }
      />
    );
  }

  const addButton = canCreate ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => router.push(listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.ACCOUNT))}
    >
      {t('addVehicle')}
    </Button>
  ) : null;

  function rowActions(row: VehicleListItem): RowAction[] {
    return [
      {
        key: 'manage',
        label: t('manage'),
        showLabel: true,
        primary: true,
        onClick: () => router.push(accountVehiclePath.manage(row.id)),
      },
      {
        key: 'view',
        label: t('viewDetail'),
        showLabel: true,
        onClick: () => router.push(accountVehiclePath.detail(row.id)),
      },
    ];
  }

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('subtitle')} extra={addButton} />

      {/* Hai thẻ dẫn đường — trỏ tới tài liệu THẬT trong khu này, không nhắc nghị định/tỷ lệ. */}
      {inSupport ? null : (
        <div className={styles.tips}>
          <Link href={ROUTES.ACCOUNT.HOST_GUIDE} className={styles.tip}>
            <span className={styles.tipIcon} aria-hidden="true">
              <BookOutlined />
            </span>
            <span className={styles.tipText}>
              <span className={styles.tipTitle}>{t('tips.guideTitle')}</span>
              <span className={styles.tipBody}>{t('tips.guideBody')}</span>
            </span>
            <RightOutlined className={styles.tipChevron} aria-hidden="true" />
          </Link>
          <Link href={ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS} className={styles.tip}>
            <span className={styles.tipIcon} aria-hidden="true">
              <FileProtectOutlined />
            </span>
            <span className={styles.tipText}>
              <span className={styles.tipTitle}>{t('tips.documentsTitle')}</span>
              <span className={styles.tipBody}>{t('tips.documentsBody')}</span>
            </span>
            <RightOutlined className={styles.tipChevron} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/*
        Dải chỉ số đội xe ở mobile — parity với `/manage/vehicles` (29/09/2026).

        `GET /vehicles/fleet-summary` chỉ đòi `vehicles.view`, không có cờ gói nào gác, nên nó
        vốn đã dùng được ở tuyến hoa hồng; chỉ là khu tài khoản chưa bao giờ dựng nó. Ba con số
        (tổng · sẵn sàng · đang thuê) nói về CẢ đội xe, không theo trang hay bộ lọc — với người
        có ba chiếc xe thì đó đúng là câu hỏi đầu tiên khi mở máy.
      */}
      {isMobile ? <FleetSummaryBar enabled /> : null}

      {/*
        Dải chip DỊCH VỤ — lối tắt một-chạm, giữ ngoài `FilterBar` có chủ đích.

        Ở `/manage` dải chip tương ứng lọc theo TRẠNG THÁI VẬN HÀNH; ở đây là DỊCH VỤ, vì đó là
        câu hỏi đầu tiên của một người có vài chiếc xe ("xe tự lái của tôi đâu"), còn trạng thái
        vận hành đã có ô chọn trong thanh lọc ngay dưới.
      */}
      <VehicleStatusChips
        value={filters.serviceType}
        onChange={(serviceType) => setFilters({ serviceType })}
        options={options.serviceType}
        ariaLabel={t('serviceFilterLabel')}
      />

      {/*
        CÙNG `FilterBar` với `/manage/vehicles` (29/09/2026) — một cơ chế lọc cho cả hai khu.

        Khác biệt giữa hai khu nằm ở SỐ TRƯỜNG, không ở cơ chế: chủ xe cá nhân không có lọc loại
        xe và lọc trạng thái kiểm duyệt (một người có một tới ba chiếc xe không cần bốn ô lọc),
        nhưng vẫn được nguyên bottom-sheet ở mobile, chip gỡ từng bộ lọc và huy hiệu đếm mà
        trước đây chỉ `/manage` có.

        Thu được thêm hai thứ mà hàng lọc tự dựng trước đó không có:
         - `showActiveChips` hiện CẢ bộ lọc đến từ URL mà màn này không vẽ ô riêng
           (`?vehicleType=`, `?publicStatus=`) — trước đây chúng thu hẹp danh sách một cách vô
           hình, và lối thoát duy nhất nằm trong màn rỗng;
         - `sort` nằm ở slot `actions`, KHÔNG phải một `field` — nó không lọc dữ liệu, gộp vào sẽ
           làm huy hiệu đếm luôn sai và nút "Xoá bộ lọc" hiện vĩnh viễn (xem `VehicleFiltersBar`).
      */}
      <FilterBar
        fields={accountVehicleFilterFields}
        values={{ q: filters.q, operationStatus: filters.operationStatus }}
        onChange={(patch) => setFilters(patch as Partial<VehicleFilters>)}
        onClear={clearFilters}
        showActiveChips
        compactFields
        actions={
          <Select
            className={styles.sortSelect}
            aria-label={tSort('label')}
            placeholder={tSort('label')}
            // Cùng hình thái "Nhãn: Giá trị" với `/manage` — một quy ước, hai khu.
            labelRender={(item) => tSort('value', { label: String(item.label) })}
            options={options.sort}
            value={filters.sort ?? 'newest'}
            onChange={(sort) => setFilters({ sort })}
          />
        }
      />

      <VehicleCardGrid
        items={items}
        meta={meta}
        loading={isFetching}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ danh sách đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={clearFilters}
        emptyAction={addButton ?? undefined}
        rowActions={rowActions}
        detailHref={accountVehiclePath.detail}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
