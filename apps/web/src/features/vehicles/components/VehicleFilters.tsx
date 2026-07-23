'use client';

import { SearchOutlined } from '@ant-design/icons';
import { Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import {
  OPERATION_STATUS_OPTIONS,
  PUBLIC_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  VEHICLE_SORT_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '../constants';
import type { VehicleFilters, VehicleSort } from '../types';
import styles from './VehicleFilters.module.css';

interface VehicleFiltersBarProps {
  filters: VehicleFilters;
  onChange: (patch: Partial<VehicleFilters>) => void;
}

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Thanh lọc danh sách xe. Ô tìm kiếm gõ tới đâu debounce tới đó rồi mới đẩy vào URL, tránh
 * đổi searchParams (và gọi API) theo từng phím. Các select đổi là áp ngay.
 */
export function VehicleFiltersBar({ filters, onChange }: VehicleFiltersBarProps) {
  const [search, setSearch] = useState(filters.q ?? '');

  // Đồng bộ khi filter đổi từ ngoài (nút xoá lọc, back/forward): so với giá trị render trước
  // và chỉnh state ngay trong render — pattern React chính thống ("lưu thông tin render trước"),
  // không setState-trong-effect, không mutate ref lúc render.
  const [prevQ, setPrevQ] = useState(filters.q);
  if (prevQ !== filters.q) {
    setPrevQ(filters.q);
    setSearch(filters.q ?? '');
  }

  // Debounce: gõ tới đâu chờ tới đó rồi mới đẩy vào URL.
  useEffect(() => {
    const current = filters.q ?? '';
    if (search === current) return;
    const timer = setTimeout(() => onChange({ q: search || undefined }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, filters.q, onChange]);

  return (
    <div className={styles.bar}>
      <Input
        className={styles.search}
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm theo tên, mã, biển số, hãng…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        className={styles.select}
        size="large"
        allowClear
        placeholder="Loại xe"
        options={VEHICLE_TYPE_OPTIONS as { value: string; label: string }[]}
        value={filters.vehicleType ?? undefined}
        onChange={(value: string | undefined) => onChange({ vehicleType: value })}
      />
      <Select
        className={styles.select}
        size="large"
        allowClear
        placeholder="Dịch vụ"
        options={SERVICE_TYPE_OPTIONS as { value: string; label: string }[]}
        value={filters.serviceType ?? undefined}
        onChange={(value: string | undefined) => onChange({ serviceType: value })}
      />
      <Select
        className={styles.select}
        size="large"
        allowClear
        placeholder="Vận hành"
        options={OPERATION_STATUS_OPTIONS as { value: string; label: string }[]}
        value={filters.operationStatus ?? undefined}
        onChange={(value: string | undefined) => onChange({ operationStatus: value })}
      />
      <Select
        className={styles.select}
        size="large"
        allowClear
        placeholder="Trạng thái public"
        options={PUBLIC_STATUS_OPTIONS as { value: string; label: string }[]}
        value={filters.publicStatus ?? undefined}
        onChange={(value: string | undefined) => onChange({ publicStatus: value })}
      />
      <Select
        className={styles.select}
        size="large"
        placeholder="Sắp xếp"
        options={VEHICLE_SORT_OPTIONS as { value: string; label: string }[]}
        value={filters.sort ?? 'newest'}
        onChange={(value: VehicleSort) => onChange({ sort: value })}
      />
    </div>
  );
}
