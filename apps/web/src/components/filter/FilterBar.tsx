'use client';

import { FilterOutlined, SearchOutlined } from '@ant-design/icons';
import { Badge, Button, DatePicker, Input, Segmented, Select } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';

import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { DATE_FORMAT, DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';

import styles from './FilterBar.module.css';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Ba loại điều khiển lọc đang thực sự có mặt trên 14 danh sách quản lý (kiểm kê Batch 1C-A):
 * ô tìm kiếm (8 trang), select (12 trang), khoảng ngày (`receipts` dùng `from`/`to`, `admin/audit`
 * dùng lọc theo ngày). Không thêm loại nào chưa có nơi dùng.
 */
export type FilterField =
  | { kind: 'search'; key: string; label: string; placeholder?: string }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: readonly FilterOption[];
      allowClear?: boolean;
      /** Danh sách dài thì cho gõ để lọc (nhật ký hệ thống có ~28 loại hành động). */
      searchable?: boolean;
    }
  | {
      /**
       * Nhóm nút chọn-một, luôn hiện hết lựa chọn. Dùng khi số lựa chọn ít và người dùng cần
       * thấy ngay mình đang ở nhánh nào — `admin/audit` (phạm vi), `admin/plans` (trạng thái),
       * `admin/vehicles` (lối tắt) đều đang dùng hình thái này.
       */
      kind: 'segmented';
      key: string;
      label: string;
      options: readonly FilterOption[];
    }
  | { kind: 'dateRange'; fromKey: string; toKey: string; label: string };

/** Giá trị lọc dạng chuỗi — khớp đúng thứ nằm được trên URL. */
export type FilterValues = Record<string, string | undefined>;

interface FilterBarProps {
  fields: readonly FilterField[];
  values: FilterValues;
  /** Ghi thẳng vào `setFilters` của `useUrlFilters`; `undefined` = xoá tham số. */
  onChange: (patch: FilterValues) => void;
  /** Hiện nút "Xoá bộ lọc" khi có filter đang bật. Không truyền → không có nút. */
  onClear?: () => void;
  /** Nút riêng của trang ("Tạo phiếu", "Danh mục"…) — luôn nằm cuối, không bị xuống dòng lẫn với filter. */
  actions?: ReactNode;
  searchDebounceMs?: number;
}

/** Cùng độ trễ với `VehicleFiltersBar` đang chạy — giữ nguyên cảm giác gõ đã quen. */
const DEFAULT_SEARCH_DEBOUNCE_MS = 400;

function fieldKeys(field: FilterField): string[] {
  return field.kind === 'dateRange' ? [field.fromKey, field.toKey] : [field.key];
}

/**
 * Số filter đang bật.
 *
 * Khoảng ngày tính là MỘT dù chiếm hai tham số. `'all'` **không** tính là bật — đó là giá trị
 * sentinel "không lọc" dùng thống nhất toàn repo (`useUrlFilters` cũng xoá nó khỏi URL).
 */
export function countActiveFilters(fields: readonly FilterField[], values: FilterValues): number {
  const isActive = (key: string) => {
    const value = values[key];
    return Boolean(value) && value !== 'all';
  };
  return fields.filter((field) => fieldKeys(field).some(isActive)).length;
}

function toDayjs(value: string | undefined): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value, DAY_PARAM_FORMAT);
  return parsed.isValid() ? parsed : null;
}

/**
 * Ô tìm kiếm có debounce.
 *
 * Tách thành component riêng để state cục bộ chết theo nó: khi `FilterBar` đổi sang chế độ sheet
 * hoặc trang unmount, `useEffect` dọn `setTimeout` — không còn lần ghi URL nào bay sau khi
 * component đã biến mất (điều hướng giữa chừng sẽ ghi đè URL của trang MỚI).
 */
function SearchField({
  field,
  value,
  onChange,
  delayMs,
}: {
  field: Extract<FilterField, { kind: 'search' }>;
  value: string | undefined;
  onChange: (patch: FilterValues) => void;
  delayMs: number;
}) {
  const [draft, setDraft] = useState(value ?? '');

  // Đồng bộ khi giá trị đổi từ ngoài (bấm "Xoá bộ lọc", nút back): so với giá trị render trước
  // và chỉnh ngay trong render — pattern React chính thống, không setState-trong-effect.
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(value ?? '');
  }

  useEffect(() => {
    const current = value ?? '';
    if (draft === current) return;
    const timer = setTimeout(() => onChange({ [field.key]: draft.trim() || undefined }), delayMs);
    return () => clearTimeout(timer);
  }, [draft, value, field.key, onChange, delayMs]);

  return (
    <Input
      className={styles.search}
      size="large"
      allowClear
      prefix={<SearchOutlined aria-hidden="true" />}
      aria-label={field.label}
      placeholder={field.placeholder ?? field.label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

function FieldControl({
  field,
  values,
  onChange,
  searchDebounceMs,
}: {
  field: FilterField;
  values: FilterValues;
  onChange: (patch: FilterValues) => void;
  searchDebounceMs: number;
}) {
  if (field.kind === 'search') {
    return (
      <SearchField
        field={field}
        value={values[field.key]}
        onChange={onChange}
        delayMs={searchDebounceMs}
      />
    );
  }

  if (field.kind === 'select') {
    return (
      <Select
        className={styles.select}
        size="large"
        allowClear={field.allowClear ?? true}
        showSearch={field.searchable}
        optionFilterProp="label"
        aria-label={field.label}
        placeholder={field.label}
        options={field.options as FilterOption[]}
        value={values[field.key] ?? undefined}
        onChange={(next: string | undefined) => onChange({ [field.key]: next })}
      />
    );
  }

  if (field.kind === 'segmented') {
    return (
      <Segmented
        className={styles.segmented}
        aria-label={field.label}
        value={values[field.key] ?? field.options[0]?.value ?? ''}
        options={field.options as FilterOption[]}
        onChange={(next) => onChange({ [field.key]: String(next) })}
      />
    );
  }

  return (
    <DatePicker.RangePicker
      className={styles.range}
      size="large"
      // Hiển thị theo quy ước Việt Nam (CLAUDE.md §9) nhưng **ghi ra URL** bằng `YYYY-MM-DD`
      // ở `onChange` — hai định dạng khác nhau là có chủ đích, không phải sơ suất.
      format={DATE_FORMAT}
      allowEmpty={[true, true]}
      aria-label={field.label}
      value={[toDayjs(values[field.fromKey]), toDayjs(values[field.toKey])]}
      onChange={(range) =>
        onChange({
          // Ghi đúng định dạng ngày của URL (`YYYY-MM-DD`), không đụng múi giờ: đây là ranh giới
          // ngày theo lịch, không phải một mốc thời gian tuyệt đối.
          [field.fromKey]: range?.[0]?.format(DAY_PARAM_FORMAT) || undefined,
          [field.toKey]: range?.[1]?.format(DAY_PARAM_FORMAT) || undefined,
        })
      }
    />
  );
}

/**
 * Thanh lọc dùng chung cho **bảng quản lý**.
 *
 * KHÔNG dùng cho marketplace: [FilterPanel](../../features/marketplace/components/FilterPanel.tsx)
 * là lọc theo facet (đếm kết quả sống, khoảng giá, mảng CSV, "Áp dụng (N xe)") — ngữ nghĩa khác
 * hẳn lọc bảng. Gộp hai thứ sẽ tạo một component biết cả hai miền.
 *
 * Ở ≤640px các điều khiển (trừ ô tìm kiếm) chuyển vào bottom sheet theo Figma `127:2339` R8 và
 * `127:2463`; sheet dùng lại `ResponsiveDialog` chứ không tự chế lớp overlay thứ hai.
 */
export function FilterBar({
  fields,
  values,
  onChange,
  onClear,
  actions,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: FilterBarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeCount = countActiveFilters(fields, values);
  const searchFields = fields.filter((field) => field.kind === 'search');
  const sheetFields = fields.filter((field) => field.kind !== 'search');

  const clearButton =
    onClear && activeCount > 0 ? (
      <Button
        onClick={() => {
          onClear();
          setSheetOpen(false);
        }}
      >
        Xoá bộ lọc
      </Button>
    ) : null;

  if (isMobile) {
    return (
      <div className={styles.mobileRoot}>
        <div className={styles.mobileTop}>
          {searchFields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              values={values}
              onChange={onChange}
              searchDebounceMs={searchDebounceMs}
            />
          ))}
          {sheetFields.length > 0 ? (
            <Badge count={activeCount} size="small">
              <Button
                size="large"
                icon={<FilterOutlined aria-hidden="true" />}
                onClick={() => setSheetOpen(true)}
              >
                Bộ lọc
              </Button>
            </Badge>
          ) : null}
        </div>
        {actions ? <div className={styles.mobileActions}>{actions}</div> : null}

        <ResponsiveDialog
          title="Bộ lọc"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          size="sm"
          mobileMode="sheet"
          footer={
            <div className={styles.sheetFooter}>
              {clearButton}
              <Button type="primary" onClick={() => setSheetOpen(false)}>
                Áp dụng
              </Button>
            </div>
          }
        >
          <div className={styles.sheetFields}>
            {sheetFields.map((field) => (
              <FieldControl
                key={field.kind === 'dateRange' ? field.fromKey : field.key}
                field={field}
                values={values}
                onChange={onChange}
                searchDebounceMs={searchDebounceMs}
              />
            ))}
          </div>
        </ResponsiveDialog>
      </div>
    );
  }

  return (
    // `search` là landmark đúng ngữ nghĩa cho một cụm điều khiển lọc/tìm.
    <div className={styles.root} role="search" aria-label="Bộ lọc danh sách">
      <div className={styles.fields}>
        {fields.map((field) => (
          <FieldControl
            key={field.kind === 'dateRange' ? field.fromKey : field.key}
            field={field}
            values={values}
            onChange={onChange}
            searchDebounceMs={searchDebounceMs}
          />
        ))}
      </div>
      {clearButton || actions ? (
        <div className={styles.actions}>
          {clearButton}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
