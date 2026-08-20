'use client';

import { CloseOutlined, FilterOutlined } from '@ant-design/icons';
import { Badge, Button, DatePicker, Popover, Segmented, Select, Tag } from 'antd';
import { useState, type ReactNode } from 'react';

import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { useIsMobile } from '@/hooks/use-media-query';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';

import styles from './FilterBar.module.css';
import { useDatePickerPattern } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

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
  /**
   * Hiện hàng chip liệt kê từng filter đang bật, mỗi chip gỡ được riêng (Figma `188:4514`).
   *
   * Opt-in vì hợp đồng "xoá một filter" chỉ đúng khi trang coi mọi filter là độc lập — đúng với
   * Fleet, chưa chắc đúng với danh sách có filter phụ thuộc nhau. Bật thì nút "Xoá bộ lọc" dời
   * xuống cuối hàng chip thay vì đứng cạnh ô sắp xếp.
   */
  showActiveChips?: boolean;
  /**
   * Thanh lọc **một hàng gọn** theo Figma `186:1639` (`search-filter-bar`, cao 34px):
   * ô tìm kiếm 240px → gạch dọc phân cách → các pill `Nhãn: Giá trị` → sắp xếp dồn phải.
   *
   * Khác mặc định ở ba điểm: ô tìm kiếm **không** giãn chiếm chỗ trống, điều khiển cao 32px thay
   * vì 40px, và nhãn trường vẫn hiện sau khi đã chọn.
   *
   * Opt-in vì 13 danh sách còn lại đang dùng hình thái cũ; đổi hàng loạt là việc của một đợt
   * riêng, không phải hệ quả phụ của batch này.
   */
  compactFields?: boolean;
  /**
   * Số trường lọc (KHÔNG tính ô tìm kiếm) được giữ trên hàng ở desktop; phần còn lại dồn vào
   * một popover "Bộ lọc" có huy hiệu đếm.
   *
   * Sinh ra cho sổ Thu-Chi: sáu điều khiển + ô tìm kiếm + hai nút hành động không có cách nào
   * đứng vừa một hàng, nên thanh lọc tự xuống dòng và ô chọn khoảng ngày rơi lẻ loi xuống hàng
   * hai. Cắt bớt trường thì mất chức năng; thu nhỏ nữa thì không đọc được. Cách còn lại là thứ
   * hình thái mobile đã làm đúng từ đầu — giấu nhóm phụ sau một nút có đếm — chỉ khác vỏ:
   * popover neo vào nút thay vì bottom sheet.
   *
   * Không đặt thì mọi trường vẫn nằm trên hàng, y như trước.
   */
  inlineFieldLimit?: number;
  /**
   * Class phụ đặt lên vỏ ngoài (cả desktop lẫn mobile) — dành cho trang cần chỉnh KHOẢNG CÁCH
   * của thanh lọc với thứ đứng cạnh nó, ví dụ khi nó nằm trong khe phải của một hàng tab.
   *
   * Chỉ dùng cho bố cục ngoài rìa; hình thức bên trong vẫn do component quyết.
   */
  className?: string;
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

/** Một filter đang bật, ở dạng gỡ được. */
interface ActiveChip {
  /** Khoá React + khoá nhận dạng. Khoảng ngày lấy `fromKey` làm id. */
  id: string;
  label: string;
  /** Patch gỡ đúng chip này — khoảng ngày xoá CẢ HAI đầu trong một lần ghi URL. */
  clear: FilterValues;
}

/**
 * Các filter đang bật, đã đổi sang nhãn người đọc được.
 *
 * Bỏ qua `search`: từ khoá đã hiện nguyên văn trong ô tìm kiếm, thêm một chip nữa là nói hai lần.
 *
 * Khoảng ngày CÓ chip (khác bản đầu). Lý do đổi: từ khi có `inlineFieldLimit`, ô chọn ngày có
 * thể nằm khuất trong popover — không chip thì người dùng chỉ thấy danh sách ngắn đi mà không
 * thấy vì sao. Chip gỡ cả hai đầu một lượt, nên phản đối cũ ("gỡ nửa khoảng thì vô nghĩa") không
 * còn đúng: không ai gỡ được nửa khoảng nữa.
 */
function activeChips(
  fields: readonly FilterField[],
  values: FilterValues,
  rangeLabel: (from: string | undefined, to: string | undefined) => string,
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const field of fields) {
    if (field.kind === 'select' || field.kind === 'segmented') {
      const value = values[field.key];
      if (!value || value === 'all') continue;
      const option = field.options.find((item) => item.value === value);
      chips.push({
        id: field.key,
        label: option?.label ?? value,
        clear: { [field.key]: undefined },
      });
      continue;
    }
    if (field.kind !== 'dateRange') continue;
    const from = values[field.fromKey];
    const to = values[field.toKey];
    if (!from && !to) continue;
    chips.push({
      id: field.fromKey,
      label: rangeLabel(from, to),
      clear: { [field.fromKey]: undefined, [field.toKey]: undefined },
    });
  }
  return chips;
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
  compact = false,
}: {
  field: Extract<FilterField, { kind: 'search' }>;
  value: string | undefined;
  onChange: (patch: FilterValues) => void;
  delayMs: number;
  compact?: boolean;
}) {
  return (
    <AutoSearchInput
      className={compact ? `${styles.search} ${styles.searchCompact}` : styles.search}
      size={compact ? 'middle' : 'large'}
      aria-label={field.label}
      placeholder={field.placeholder ?? field.label}
      value={value}
      debounceMs={delayMs}
      onSearch={(next) => onChange({ [field.key]: next || undefined })}
    />
  );
}

function FieldControl({
  field,
  values,
  onChange,
  searchDebounceMs,
  compact,
}: {
  field: FilterField;
  values: FilterValues;
  onChange: (patch: FilterValues) => void;
  searchDebounceMs: number;
  compact: boolean;
}) {
  const tCommon = useTranslations('Common');
  const datePattern = useDatePickerPattern();

  if (field.kind === 'search') {
    return (
      <SearchField
        field={field}
        value={values[field.key]}
        onChange={onChange}
        delayMs={searchDebounceMs}
        compact={compact}
      />
    );
  }

  if (field.kind === 'select') {
    return (
      <Select
        className={compact ? `${styles.select} ${styles.compact}` : styles.select}
        size={compact ? 'middle' : 'large'}
        allowClear={field.allowClear ?? true}
        showSearch={field.searchable}
        optionFilterProp="label"
        aria-label={field.label}
        // Figma `186:1645` giữ nhãn ngay cả khi đã chọn: "Loại xe: Ô tô". Chọn xong mà chỉ còn
        // "Ô tô" thì bốn dropdown cạnh nhau không còn phân biệt được cái nào lọc cái gì.
        placeholder={
          compact ? tCommon('components.filterBar.allOf', { label: field.label }) : field.label
        }
        labelRender={compact ? (item) => `${field.label}: ${item.label}` : undefined}
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
      format={datePattern.date}
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
  showActiveChips = false,
  compactFields = false,
  inlineFieldLimit,
  className,
}: FilterBarProps) {
  const tCommon = useTranslations('Common');
  const datePattern = useDatePickerPattern();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const activeCount = countActiveFilters(fields, values);
  const searchFields = fields.filter((field) => field.kind === 'search');
  const sheetFields = fields.filter((field) => field.kind !== 'search');

  /*
   * Desktop: cắt cụm lọc thành phần ĐỨNG TRÊN HÀNG và phần dồn vào popover. `inlineFieldLimit`
   * không đặt → giữ nguyên hình thái cũ (mọi trường trên hàng, popover không tồn tại).
   */
  const inlineFields =
    inlineFieldLimit === undefined ? sheetFields : sheetFields.slice(0, inlineFieldLimit);
  const overflowFields = inlineFieldLimit === undefined ? [] : sheetFields.slice(inlineFieldLimit);
  const overflowCount = countActiveFilters(overflowFields, values);

  /** Nhãn chip của một khoảng ngày — hiển thị theo quy ước người dùng, không theo dạng URL. */
  const rangeLabel = (from: string | undefined, to: string | undefined) => {
    const show = (value: string) => toDayjs(value)?.format(datePattern.date) ?? value;
    if (from && to) return tCommon('units.range', { from: show(from), to: show(to) });
    if (from) return `${tCommon('labels.from')} ${show(from)}`;
    return `${tCommon('labels.to')} ${show(to!)}`;
  };

  const clearButton =
    onClear && activeCount > 0 ? (
      <Button
        onClick={() => {
          onClear();
          setSheetOpen(false);
          setOverflowOpen(false);
        }}
      >
        {tCommon('actions.clear')}
      </Button>
    ) : null;

  const chips = showActiveChips ? activeChips(fields, values, rangeLabel) : [];
  const chipRow =
    chips.length > 0 ? (
      <div className={styles.chips}>
        {chips.map((chip) => (
          <Tag
            key={chip.id}
            closable
            // `closeIcon` mặc định là dấu ×; nhãn cho trình đọc màn hình phải nói bỏ CÁI GÌ.
            closeIcon={
              <CloseOutlined
                aria-label={tCommon('components.filterBar.removeFilter', { label: chip.label })}
              />
            }
            onClose={() => onChange(chip.clear)}
          >
            {chip.label}
          </Tag>
        ))}
        {onClear ? (
          <Button type="link" size="small" onClick={onClear}>
            {tCommon('actions.clear')}
          </Button>
        ) : null}
      </div>
    ) : null;

  if (isMobile) {
    return (
      <div className={className ? `${styles.mobileRoot} ${className}` : styles.mobileRoot}>
        <div className={styles.mobileTop}>
          {searchFields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              values={values}
              onChange={onChange}
              searchDebounceMs={searchDebounceMs}
              compact={compactFields}
            />
          ))}
          {sheetFields.length > 0 ? (
            <Badge count={activeCount} size="small">
              <Button
                size="large"
                icon={<FilterOutlined aria-hidden="true" />}
                onClick={() => setSheetOpen(true)}
              >
                {tCommon('actions.filter')}
              </Button>
            </Badge>
          ) : null}
        </div>
        {actions ? <div className={styles.mobileActions}>{actions}</div> : null}
        {chipRow}

        <ResponsiveDialog
          title={tCommon('actions.filter')}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          size="sm"
          mobileMode="sheet"
          footer={
            <div className={styles.sheetFooter}>
              {clearButton}
              <Button type="primary" onClick={() => setSheetOpen(false)}>
                {tCommon('actions.apply')}
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
                compact={compactFields}
              />
            ))}
          </div>
        </ResponsiveDialog>
      </div>
    );
  }

  const control = (field: FilterField) => (
    <FieldControl
      key={field.kind === 'dateRange' ? field.fromKey : field.key}
      field={field}
      values={values}
      onChange={onChange}
      searchDebounceMs={searchDebounceMs}
      compact={compactFields}
    />
  );

  // Gạch dọc ngăn ô tìm kiếm với cụm lọc (Figma `197:1550`) — thuần trang trí nên `aria-hidden`.
  const showSeparator = compactFields && searchFields.length > 0 && inlineFields.length > 0;

  /*
   * Nút mở nhóm lọc phụ. Cùng chữ và cùng huy hiệu đếm với nút ở mobile — một người dùng đổi
   * qua lại giữa laptop và điện thoại vẫn tìm đúng một thứ, chỉ khác chỗ nó mở ra.
   */
  const overflowButton =
    overflowFields.length > 0 ? (
      // `Badge` bọc NGOÀI `Popover`: popover phải gắn được onClick/ref lên đúng phần tử làm
      // neo, nên trigger của nó là chính cái nút, không phải lớp huy hiệu bao quanh.
      <Badge count={overflowCount} size="small" className={styles.overflowBadge}>
        <Popover
          open={overflowOpen}
          onOpenChange={setOverflowOpen}
          trigger="click"
          placement="bottomRight"
          title={tCommon('actions.filter')}
          content={
            <div className={styles.overflowPanel}>
              <div className={styles.sheetFields}>{overflowFields.map(control)}</div>
              <div className={styles.overflowFooter}>
                {clearButton}
                <Button type="primary" onClick={() => setOverflowOpen(false)}>
                  {tCommon('actions.done')}
                </Button>
              </div>
            </div>
          }
        >
          <Button
            size={compactFields ? 'middle' : 'large'}
            icon={<FilterOutlined aria-hidden="true" />}
            aria-expanded={overflowOpen}
          >
            {tCommon('actions.filter')}
          </Button>
        </Popover>
      </Badge>
    ) : null;

  return (
    // `search` là landmark đúng ngữ nghĩa cho một cụm điều khiển lọc/tìm.
    <div
      className={className ? `${styles.wrapper} ${className}` : styles.wrapper}
      role="search"
      aria-label={tCommon('components.filterBar.listFilters')}
    >
      <div className={styles.root}>
        <div className={compactFields ? `${styles.fields} ${styles.fieldsCompact}` : styles.fields}>
          {showSeparator ? (
            <>
              {searchFields.map(control)}
              <span className={styles.separator} aria-hidden="true" />
              {inlineFields.map(control)}
            </>
          ) : overflowFields.length > 0 ? (
            <>
              {searchFields.map(control)}
              {inlineFields.map(control)}
            </>
          ) : (
            // Không cắt nhóm phụ → giữ ĐÚNG thứ tự trang khai báo, kể cả khi ô tìm kiếm
            // không đứng đầu mảng.
            fields.map(control)
          )}
          {overflowButton}
        </div>
        {/* Bật chip thì "Xoá bộ lọc" thuộc về hàng chip — hai nút cùng tên trên một màn là thừa. */}
        {(!showActiveChips && clearButton) || actions ? (
          <div className={styles.actions}>
            {showActiveChips ? null : clearButton}
            {actions}
          </div>
        ) : null}
      </div>

      {chipRow}
    </div>
  );
}
