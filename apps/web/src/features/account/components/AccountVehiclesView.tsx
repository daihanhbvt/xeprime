'use client';

import { BookOutlined, FileProtectOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';

import type { RowAction } from '@/components/data-display/RowActions';
import { PermissionState } from '@/components/feedback/PermissionState';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  accountVehiclePath,
  listYourVehicleRegisterPath,
} from '@/constants/routes';
import { VehicleCardGrid } from '@/features/vehicles/components/VehicleCardGrid';
import { VehicleStatusChips } from '@/features/vehicles/components/VehicleStatusChips';
import { VEHICLES_DEFAULT_LIMIT } from '@/features/vehicles/api';
import { useVehicleFilters } from '@/features/vehicles/hooks/use-vehicle-filters';
import { useVehicleOptions } from '@/features/vehicles/hooks/use-vehicle-options';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/types';
import { usePermissions } from '@/hooks/use-permissions';

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
  const tManage = useTranslations('ManageCommon.permission');
  const router = useRouter();
  const { has } = usePermissions();
  const { filters, setFilters } = useVehicleFilters();
  const options = useVehicleOptions();
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
      onClick={() =>
        router.push(listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.ACCOUNT))
      }
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

      <div className={styles.filters}>
        <VehicleStatusChips
          value={filters.serviceType}
          onChange={(serviceType) => setFilters({ serviceType })}
          options={options.serviceType}
          ariaLabel={t('serviceFilterLabel')}
        />
        <Select
          className={styles.statusSelect}
          aria-label={t('statusFilterLabel')}
          placeholder={t('statusAll')}
          allowClear
          options={options.operationStatus}
          value={filters.operationStatus}
          onChange={(operationStatus) => setFilters({ operationStatus })}
        />
      </div>

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
