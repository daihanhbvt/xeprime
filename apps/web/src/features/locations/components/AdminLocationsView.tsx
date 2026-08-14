'use client';

import { Input, Switch, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { PERMISSION, PROVINCE_ADMINISTRATIVE_TYPE } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { useAdminProvinces, useUpdateProvince } from '../hooks/use-admin-locations';
import type { PlatformProvince } from '../types';
import styles from './AdminLocationsView.module.css';

/**
 * Danh mục hành chính của nền tảng.
 *
 * Hai công tắc KHÁC NHAU và màn này phải làm rõ điều đó:
 *  - **Cho chọn mới**: tỉnh còn xuất hiện khi đăng ký gian hàng / tạo chi nhánh.
 *  - **Hiện công khai**: khách còn tìm thấy xe ở tỉnh đó trên marketplace.
 *
 * Tắt cái nào cũng KHÔNG xoá dữ liệu: chi nhánh và xe đang ở đó vẫn nguyên, chỉ ngừng xuất hiện.
 * Vì thế bảng hiển thị số chi nhánh/xe/xe-công-khai ngay cạnh công tắc — để người bấm biết mình
 * đang ảnh hưởng tới bao nhiêu người trước khi bấm.
 */
export function AdminLocationsView() {
  const permissions = usePermissions();
  const canManage = permissions.has(PERMISSION.PLATFORM_LOCATION_MANAGE);
  const canView = permissions.has(PERMISSION.PLATFORM_LOCATION_VIEW);
  const [search, setSearch] = useState('');

  const query = useAdminProvinces(search);
  const update = useUpdateProvince();

  const columns: DataTableColumn<PlatformProvince>[] = [
    {
      title: 'Mã',
      dataIndex: 'code',
      width: 80,
      render: (v: string) => <code className={styles.code}>{v}</code>,
    },
    {
      title: 'Tỉnh/thành',
      dataIndex: 'name',
      render: (_v, row) => (
        <div className={styles.identity}>
          <span className={styles.name}>{row.name}</span>
          <Tag color={row.administrativeType === PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY ? 'blue' : 'default'}>
            {row.administrativeType === PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY
              ? 'Thành phố TW'
              : 'Tỉnh'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Tên cũ / cách viết khác',
      dataIndex: 'aliases',
      render: (aliases: string[]) =>
        aliases.length === 0 ? (
          '—'
        ) : (
          <Tooltip title={aliases.join(' · ')}>
            <span className={styles.aliases}>{aliases.slice(0, 3).join(' · ')}</span>
          </Tooltip>
        ),
    },
    { title: 'Chi nhánh', dataIndex: 'branchCount', width: 100, align: 'right' },
    { title: 'Xe', dataIndex: 'vehicleCount', width: 80, align: 'right' },
    {
      title: 'Xe công khai',
      dataIndex: 'publicVehicleCount',
      width: 120,
      align: 'right',
    },
    {
      title: 'Cho chọn mới',
      dataIndex: 'isEnabled',
      width: 130,
      render: (v: boolean, row) => (
        <Switch
          checked={v}
          disabled={!canManage}
          onChange={(checked) => update.mutate({ code: row.code, isEnabled: checked })}
          aria-label={`Cho chọn ${row.name} khi đăng ký`}
        />
      ),
    },
    {
      title: 'Hiện công khai',
      dataIndex: 'isPublicVisible',
      width: 140,
      render: (v: boolean, row) => (
        <Tooltip
          title={
            v && row.publicVehicleCount > 0
              ? `Tắt sẽ ẩn ${row.publicVehicleCount} xe khỏi marketplace`
              : undefined
          }
        >
          <Switch
            checked={v}
            disabled={!canManage}
            onChange={(checked) => update.mutate({ code: row.code, isPublicVisible: checked })}
            aria-label={`Hiện ${row.name} trên marketplace`}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title="Danh mục tỉnh/thành"
        subtitle="34 đơn vị hành chính cấp tỉnh (từ 01/07/2025). Tắt hiển thị KHÔNG xoá dữ liệu — chi nhánh và xe ở đó vẫn còn."
      />

      <Input.Search
        allowClear
        placeholder="Tìm theo mã, tên hoặc tên cũ (VD: 79, Hồ Chí Minh, Bà Rịa)"
        onSearch={setSearch}
        className={styles.search}
        aria-label="Tìm tỉnh/thành"
      />

      <DataTable<PlatformProvince>
        label="Danh mục tỉnh/thành"
        columns={columns}
        items={query.data ?? []}
        rowKey={(row) => row.code}
        minWidth={1100}
        loading={query.isLoading}
        error={
          query.isError && !query.data
            ? {
                title: 'Không tải được danh mục tỉnh/thành',
                description: getErrorMessage(query.error),
                onRetry: () => void query.refetch(),
              }
            : null
        }
        permission={
          canView
            ? null
            : {
                title: 'Bạn không có quyền xem danh mục hành chính',
                description: 'Cần quyền platform.locations.view.',
              }
        }
        filtered={Boolean(search)}
        empty={{ title: 'Danh mục trống', description: 'Chưa có đơn vị hành chính nào.' }}
        noResults={{
          title: 'Không tìm thấy tỉnh/thành',
          description: 'Thử tìm bằng mã (79), tên chuẩn hoặc tên cũ trước sáp nhập.',
        }}
        renderCard={(row) => (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <code className={styles.code}>{row.code}</code>
              <span className={styles.name}>{row.name}</span>
            </div>
            <div className={styles.cardMeta}>
              {row.branchCount} chi nhánh · {row.vehicleCount} xe · {row.publicVehicleCount} công
              khai
            </div>
            <div className={styles.cardSwitches}>
              <label className={styles.switchRow}>
                <span>Cho chọn mới</span>
                <Switch
                  checked={row.isEnabled}
                  disabled={!canManage}
                  onChange={(checked) => update.mutate({ code: row.code, isEnabled: checked })}
                />
              </label>
              <label className={styles.switchRow}>
                <span>Hiện công khai</span>
                <Switch
                  checked={row.isPublicVisible}
                  disabled={!canManage}
                  onChange={(checked) =>
                    update.mutate({ code: row.code, isPublicVisible: checked })
                  }
                />
              </label>
            </div>
          </div>
        )}
      />
    </div>
  );
}
