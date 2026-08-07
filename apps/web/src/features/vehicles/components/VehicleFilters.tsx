'use client';

import { Select } from 'antd';
import { useMemo } from 'react';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
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
  /** Xoá 5 tham số lọc — KHÔNG đụng `sort` (xem docblock). */
  onClear?: () => void;
}

/**
 * Bộ lọc danh sách xe.
 *
 * Đây là **composition của Fleet**, không phải một thanh lọc thứ hai: bố cục, debounce và hình
 * thái bottom-sheet ở mobile đều thuộc `FilterBar` dùng chung (Wave 1C). File này chỉ khai
 * **định nghĩa filter riêng của Fleet** — 5 trường lọc + ô sắp xếp.
 *
 * **Vì sao `sort` KHÔNG phải một `field` của `FilterBar`:**
 *  1. nó không lọc dữ liệu, chỉ đổi thứ tự — gộp vào sẽ làm `countActiveFilters` luôn đếm ≥1
 *     (giá trị mặc định `newest` là chuỗi khác rỗng), nút "Xoá bộ lọc" hiện vĩnh viễn và huy
 *     hiệu số trên nút "Bộ lọc" ở mobile luôn sai;
 *  2. "Xoá bộ lọc" phải giữ nguyên sắp xếp — hành vi đã có test khoá từ Wave 1C;
 *  3. Figma đặt nó **tách khỏi cụm lọc**: `58:129` nằm lề phải của `58:107` trên desktop, và
 *     `58:2429` nằm cạnh nút "Bộ lọc" ở mobile — đúng vai của slot `actions`.
 */
export function VehicleFiltersBar({ filters, onChange, onClear }: VehicleFiltersBarProps) {
  const fields: FilterField[] = useMemo(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: 'Tìm xe',
        placeholder: 'Tìm theo tên, mã, biển số, hãng…',
      },
      { kind: 'select', key: 'vehicleType', label: 'Loại xe', options: VEHICLE_TYPE_OPTIONS },
      { kind: 'select', key: 'serviceType', label: 'Dịch vụ', options: SERVICE_TYPE_OPTIONS },
      {
        kind: 'select',
        key: 'operationStatus',
        label: 'Vận hành',
        options: OPERATION_STATUS_OPTIONS,
      },
      {
        kind: 'select',
        key: 'publicStatus',
        label: 'Trạng thái public',
        options: PUBLIC_STATUS_OPTIONS,
      },
    ],
    [],
  );

  const values: FilterValues = {
    q: filters.q,
    vehicleType: filters.vehicleType,
    serviceType: filters.serviceType,
    operationStatus: filters.operationStatus,
    publicStatus: filters.publicStatus,
  };

  return (
    <FilterBar
      fields={fields}
      values={values}
      onChange={(patch) => onChange(patch as Partial<VehicleFilters>)}
      onClear={onClear}
      actions={
        <Select<VehicleSort>
          className={styles.sort}
          size="large"
          aria-label="Sắp xếp"
          placeholder="Sắp xếp"
          options={VEHICLE_SORT_OPTIONS as { value: VehicleSort; label: string }[]}
          value={filters.sort ?? 'newest'}
          onChange={(value) => onChange({ sort: value })}
        />
      }
    />
  );
}
