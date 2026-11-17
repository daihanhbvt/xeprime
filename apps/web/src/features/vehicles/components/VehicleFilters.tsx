'use client';

import { Select } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
import type { VehicleFilters, VehicleSort } from '../types';
import styles from './VehicleFilters.module.css';

/**
 * Trường lọc của từng tuyến. Gian hàng quản một ĐỘI xe nên có đủ năm ô (design `23649:30744`);
 * chủ xe tuyến hoa hồng có một tới ba chiếc — loại xe và trạng thái kiểm duyệt chỉ là hai ô luôn
 * để trống, nên chỉ giữ dịch vụ + vận hành (chốt 03/11/2026). Tham số đến từ URL mà ô không vẽ
 * (`?publicStatus=`) vẫn hiện thành chip gỡ được — không bao giờ lọc vô hình.
 */
const FIELDS_BY_SCOPE = {
  shop: ['vehicleType', 'serviceType', 'operationStatus', 'publicStatus'],
  owner: ['serviceType', 'operationStatus'],
} as const satisfies Record<string, readonly (keyof VehicleFilters)[]>;

export type VehicleFiltersScope = keyof typeof FIELDS_BY_SCOPE;

/**
 * Màn laptop (1366–1500): tìm kiếm + năm ô chọn + sắp xếp + nút kiểu xem không vừa một hàng, và ô
 * cuối rơi lẻ xuống hàng hai. Giữ bốn ô trên hàng, phần còn lại vào nút "Bộ lọc" có số đếm — cơ
 * chế sẵn có của `FilterBar`, không cắt trường nào. Màn rộng (design 1920) vẫn đủ một hàng.
 */
const NARROW_DESKTOP_QUERY = '(max-width: 1500px)';
const NARROW_DESKTOP_INLINE_FIELDS = 4;

/** Nhãn của từng ô — "Trạng thái" là chữ của design cho ô kiểm duyệt (`publicStatus`). */
const FIELD_LABEL_KEY = {
  vehicleType: 'filters.vehicleType',
  serviceType: 'filters.serviceType',
  operationStatus: 'filters.operationStatus',
  publicStatus: 'filters.reviewStatus',
} as const;

interface VehicleFiltersBarProps {
  filters: VehicleFilters;
  scope: VehicleFiltersScope;
  onChange: (patch: Partial<VehicleFilters>) => void;
  /** Xoá các tham số lọc — KHÔNG đụng `sort` (xem docblock). */
  onClear?: () => void;
  /**
   * Ô "Chi nhánh" do TRANG dựng và truyền xuống, không phải thanh lọc tự gọi `useBranchFilter`.
   *
   * Trang đã phải giữ hook đó để điền lại lựa chọn đã nhớ và để `remember()` dùng chung với nút
   * "Xoá bộ lọc"; gọi thêm một lần ở đây là hai nguồn cho cùng một `visible`, và là đúng thứ
   * docblock của hook can ngăn. `null` = gian hàng một chi nhánh, không hiện ô nào.
   */
  branchField?: FilterField | null;
  /** Điều khiển phụ đứng sau ô sắp xếp — nút chuyển Lưới/Danh sách. */
  extraActions?: ReactNode;
}

/**
 * Bộ lọc danh sách xe.
 *
 * Đây là **composition của Fleet**, không phải một thanh lọc thứ hai: bố cục, debounce và hình
 * thái bottom-sheet ở mobile đều thuộc `FilterBar` dùng chung. File này chỉ khai **định nghĩa
 * filter riêng của Fleet** + ô sắp xếp.
 *
 * Design 03/11/2026 (`23649:30744`): một hàng ô cao 40 — tìm kiếm giãn, các ô chọn mang nhãn của
 * nó làm chữ chờ ("Loại xe", "Dịch vụ"…), "Sắp xếp: Mới nhất" cuối hàng. Đúng hình thái mặc định
 * của `FilterBar` (như màn Quản lý đơn thuê xe), nên không còn `compactFields`.
 *
 * **Vì sao `sort` KHÔNG phải một `field` của `FilterBar`:**
 *  1. nó không lọc dữ liệu, chỉ đổi thứ tự — gộp vào sẽ làm huy hiệu đếm của mobile luôn sai;
 *  2. "Xoá bộ lọc" phải giữ nguyên sắp xếp — hành vi đã có test khoá từ Wave 1C;
 *  3. cần hình thái "Sắp xếp: Giá trị" mà ô lọc thường không có.
 */
export function VehicleFiltersBar({
  filters,
  scope,
  onChange,
  onClear,
  branchField,
  extraActions,
}: VehicleFiltersBarProps) {
  const t = useTranslations('Vehicles.list');
  const options = useVehicleOptions();
  const narrowDesktop = useMediaQuery(NARROW_DESKTOP_QUERY);

  const fields: FilterField[] = useMemo(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.search'),
        placeholder: t('filters.searchPlaceholder'),
      },
      // Chi nhánh đứng NGAY SAU ô tìm kiếm: nó thu hẹp phạm vi nhiều nhất trong các ô ở đây, nên
      // là thứ người dùng chọn trước. Vắng mặt khi gian hàng chỉ có một chi nhánh (`field === null`).
      ...(branchField ? [branchField] : []),
      ...FIELDS_BY_SCOPE[scope].map((key): FilterField => ({
        kind: 'select',
        key,
        label: t(FIELD_LABEL_KEY[key]),
        options: options[key],
      })),
    ],
    [options, t, branchField, scope],
  );

  const values: FilterValues = {
    q: filters.q,
    // `ALL_FILTER` chứ không `undefined`: ô này `allowClear: false` và luôn phải hiện một nhãn —
    // mục "Tất cả chi nhánh" là trạng thái nghỉ của nó. `useUrlFilters` xoá `'all'` khỏi URL.
    branchId: filters.branchId ?? ALL_FILTER,
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
      // Filter đang bật — kể cả tham số URL mà tuyến này không vẽ ô — hiện thành chip gỡ được.
      showActiveChips
      // Khổ điện thoại: tấm lọc v2 (Figma `24158:105500`) - lưới hai cột, ô sắp xếp nằm trong tấm.
      sheetLayout="grid"
      inlineFieldLimit={narrowDesktop ? NARROW_DESKTOP_INLINE_FIELDS : undefined}
      actions={
        <>
          <Select<VehicleSort>
            className={styles.sort}
            size="large"
            aria-label={t('sort.label')}
            placeholder={t('sort.label')}
            labelRender={(item) => t('sort.value', { label: String(item.label) })}
            options={options.sort}
            value={filters.sort ?? 'newest'}
            onChange={(value) => onChange({ sort: value })}
          />
          {extraActions}
        </>
      }
    />
  );
}
