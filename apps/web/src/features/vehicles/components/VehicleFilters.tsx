'use client';

import { Select } from 'antd';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
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
 *  3. Figma đặt nó **tách khỏi cụm lọc**: `186:1665` nằm ở lề phải hàng filter `186:1643`, cách
 *     bốn dropdown lọc một khoảng trống lớn — đúng vai của slot `actions`.
 */
export function VehicleFiltersBar({ filters, onChange, onClear }: VehicleFiltersBarProps) {
  const t = useTranslations('Vehicles.list');
  const options = useVehicleOptions();

  const fields: FilterField[] = useMemo(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.search'),
        // Ô chỉ rộng 240px ở thanh gọn — Figma `197:1549` rút placeholder còn "Tìm kiếm xe...".
        placeholder: t('filters.searchPlaceholder'),
      },
      {
        kind: 'select',
        key: 'vehicleType',
        label: t('filters.vehicleType'),
        options: options.vehicleType,
      },
      {
        kind: 'select',
        key: 'serviceType',
        label: t('filters.serviceType'),
        options: options.serviceType,
      },
      {
        kind: 'select',
        key: 'operationStatus',
        label: t('filters.operationStatus'),
        options: options.operationStatus,
      },
      {
        kind: 'select',
        key: 'publicStatus',
        label: t('filters.publicStatus'),
        options: options.publicStatus,
      },
    ],
    [options, t],
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
      // Figma `188:4514`: filter đang bật hiện thành chip gỡ được từng cái.
      showActiveChips
      // Figma `186:1639`: một hàng — tìm kiếm 240px, gạch dọc, pill mang sẵn nhãn, sắp xếp dồn phải.
      compactFields
      actions={
        <Select<VehicleSort>
          className={styles.sort}
          aria-label={t('sort.label')}
          placeholder={t('sort.label')}
          // Cùng hình thái "Nhãn: Giá trị" với cụm lọc — Figma `186:1665`.
          labelRender={(item) => t('sort.value', { label: String(item.label) })}
          options={options.sort}
          value={filters.sort ?? 'newest'}
          onChange={(value) => onChange({ sort: value })}
        />
      }
    />
  );
}
