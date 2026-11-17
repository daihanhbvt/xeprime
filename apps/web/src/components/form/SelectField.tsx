'use client';

import { Form, Select } from 'antd';
import type React from 'react';
import { useId, useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

/** Giá trị nội bộ của dòng "Thêm …" — không bao giờ ghi xuống form. */
const CREATE_VALUE = '__select_field_create__';

/**
 * Ô chọn cho phép GÕ THÊM một lựa chọn chưa có: khi chữ đang gõ không trùng nhãn nào, cuối danh
 * sách hiện một dòng "Thêm …"; chọn dòng đó gọi `onCreate` với chữ đã gõ (field KHÔNG đổi — nơi gọi
 * tự quyết tạo gì và ghi gì).
 */
export interface SelectFieldCreatable {
  /** Nhãn của dòng thêm mới, đã dịch: `(text) => t('addNew', { text })`. */
  optionLabel: (text: string) => string;
  onCreate: (text: string) => void;
}

export interface SelectFieldOptionGroup {
  readonly label: string;
  readonly options: readonly SelectFieldOption[];
}

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  options: readonly SelectFieldOption[];
  /**
   * Options chia NHÓM — thắng `options` khi có mặt.
   *
   * Cần cho ô "Mẫu xe": mẫu đang phân phối và mẫu đời trước phải tách nhóm, vì gộp một danh
   * sách phẳng thì xe đang bán chìm giữa xe đã ngừng. Nhãn nhóm do nơi gọi dịch.
   */
  optionGroups?: readonly SelectFieldOptionGroup[];
  /** Chữ hiện khi danh sách rỗng — mặc định của AntD là tiếng Anh. */
  notFoundContent?: ReactNode;
  placeholder?: string;
  /** Cho phép xoá chọn (field về null) — dùng cho select tuỳ chọn như nhiên liệu. */
  allowClear?: boolean;
  disabled?: boolean;
  /** Dấu bắt buộc của AntD. Ràng buộc thật vẫn ở schema Yup. */
  required?: boolean;
  /** Gợi ý dưới ô chọn khi KHÔNG có lỗi. Lỗi luôn thắng. */
  help?: ReactNode;
  /** Gõ để lọc trong danh sách — bật cho danh mục dài (hãng xe hiện có ~17 mục). */
  showSearch?: boolean;
  /**
   * Options đang được nạp từ API (danh mục tỉnh, chi nhánh). Hiện spinner trong ô thay vì để
   * người dùng nhìn một dropdown rỗng và tưởng là "không có lựa chọn nào".
   */
  loading?: boolean;
  /** `multiple` = field giữ MẢNG giá trị (vd `serviceTypes` — một xe nhiều dịch vụ, 17/08). */
  mode?: 'multiple';
  /**
   * Tìm kiếm ở SERVER thay vì lọc danh sách đã tải.
   *
   * Cần khi tập nguồn lớn hơn thứ tải nổi một lần — ô chọn đơn thuê ở form phiếu thu-chi lấy
   * 20 đơn ưu tiên còn nợ, nên đơn cũ chỉ tìm ra qua đường này. Truyền vào là tự động tắt lọc
   * phía client (`filterOption={false}`): lọc lần nữa trên tập server vừa trả về sẽ giấu mất
   * chính kết quả vừa tìm được.
   */
  onSearch?: (value: string) => void;
  /**
   * Hệ quả của chính CÚ ĐỔI, chạy ngay sau khi field nhận giá trị mới.
   *
   * Dùng cho những ô mà đổi giá trị làm ô KHÁC hết đúng — đổi tỉnh thì mã xã cũ chắc chắn sai.
   * Dọn ở đây, trong trình xử lý sự kiện, thay vì ở effect nhìn giá trị đổi: effect không phân
   * biệt được "người dùng vừa đổi tỉnh" với "form vừa mở ở chế độ sửa và đã có sẵn tỉnh", nên
   * nó cần thêm một ref đọc lúc render để nhớ mốc cũ — hai thứ `react-hooks` chặn đúng chỗ.
   */
  onAfterChange?: (value: string | string[] | null) => void;
  /**
   * Vẽ một lựa chọn — dùng cho CẢ dòng trong danh sách lẫn giá trị đang chọn (vd logo ngân hàng
   * trước tên). Lọc khi gõ vẫn chạy trên `label` chữ, nên phần vẽ thêm không làm hỏng tìm kiếm.
   */
  renderOption?: (option: SelectFieldOption) => ReactNode;
  /**
   * Ẩn nhãn khi ô đứng trong một hàng đã tự nói nó là gì (khung giờ "05:00 – 12:00") — nhãn vẫn là
   * tên khả truy cập của ô (`aria-label`), chỉ không vẽ ra.
   */
  hideLabel?: boolean;
  /** Cho gõ thêm lựa chọn chưa có — xem `SelectFieldCreatable`. Cần `showSearch`. */
  creatable?: SelectFieldCreatable;
}

/**
 * Select nối RHF ↔ AntD (ADR 0004: form state ở RHF). Options truyền vào từ META/LABEL của
 * `@xeprime/types`, component không tự biết giá trị nghiệp vụ nào (CLAUDE.md mục 5).
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  optionGroups,
  placeholder,
  allowClear,
  disabled,
  required,
  help,
  showSearch,
  loading,
  mode,
  onSearch,
  onAfterChange,
  notFoundContent,
  renderOption,
  hideLabel = false,
  creatable,
}: SelectFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  // AntD `Select` không tự nhận `htmlFor` của `Form.Item` — thiếu `id` tường minh thì bấm nhãn
  // không mở được danh sách và `getByLabelText` không tìm ra ô chọn.
  const selectId = `${String(name)}-${useId()}`;
  const describedById = `${selectId}-help`;
  const helpText = fieldState.error?.message ?? help;
  const [search, setSearch] = useState('');
  const typed = search.trim();
  const flat = optionGroups ? optionGroups.flatMap((g) => g.options) : options;
  const createOption =
    creatable && typed && !flat.some((o) => o.label.trim().toLowerCase() === typed.toLowerCase())
      ? { value: CREATE_VALUE, label: creatable.optionLabel(typed) }
      : null;
  const baseOptions = (optionGroups ?? options) as readonly unknown[];
  const allOptions = createOption ? [...baseOptions, createOption] : baseOptions;

  return (
    <Form.Item
      label={hideLabel ? undefined : label}
      htmlFor={selectId}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <Select
        id={selectId}
        aria-label={hideLabel && typeof label === 'string' ? label : undefined}
        aria-describedby={helpText ? describedById : undefined}
        mode={mode}
        // `''` là "chưa chọn" của form (giá trị mặc định) — đưa về `undefined` để AntD hiện
        // placeholder thay vì vẽ một lựa chọn rỗng.
        // Trường SỐ (vd mốc gói tháng) với option là chuỗi: so khớp bằng chuỗi để ô hiện NHÃN ("1
        // tháng") thay vì số trần, và trả lại SỐ cho form — không đổi kiểu dữ liệu của trường.
        value={
          field.value === ''
            ? undefined
            : typeof field.value === 'number'
              ? String(field.value)
              : ((field.value as string | string[] | null | undefined) ?? undefined)
        }
        // multiple: bỏ hết lựa chọn trả mảng RỖNG (schema .min(1) báo lỗi) chứ không phải null.
        onChange={(value: string | string[] | undefined) => {
          if (value === CREATE_VALUE && creatable) {
            creatable.onCreate(typed);
            setSearch('');
            return;
          }
          setSearch('');
          const raw = value ?? (mode === 'multiple' ? [] : null);
          const next =
            typeof field.value === 'number' && typeof raw === 'string' ? Number(raw) : raw;
          field.onChange(next);
          // Giá trị đi kèm: nơi nghe thường cần chính nó (ghi bộ nhớ, tra danh mục con). Đọc lại
          // `field.value` ở đó sẽ ra giá trị CŨ — RHF chưa render lại tại thời điểm này.
          onAfterChange?.(raw);
        }}
        onBlur={field.onBlur}
        options={allOptions as React.ComponentProps<typeof Select>['options']}
        notFoundContent={notFoundContent}
        placeholder={placeholder}
        allowClear={allowClear}
        disabled={disabled}
        loading={loading}
        showSearch={showSearch}
        // Ô cho thêm mới cần biết chữ đang gõ, nhưng VẪN lọc ở client (dòng "Thêm …" chứa chính chữ
        // đó nên luôn lọt bộ lọc theo nhãn).
        onSearch={onSearch ?? (creatable ? setSearch : undefined)}
        // Tìm ở server thì KHÔNG lọc lại ở client — nếu không, kết quả server vừa trả về sẽ bị
        // chính ô tìm kiếm giấu đi vì nhãn không chứa nguyên văn chuỗi đã gõ.
        filterOption={onSearch ? false : undefined}
        // Mặc định AntD lọc theo `value` (là key slug), nên gõ "Mercedes" không ra `mercedes`.
        optionFilterProp={showSearch && !onSearch ? 'label' : undefined}
        status={fieldState.error ? 'error' : undefined}
        {...(renderOption
          ? {
              optionRender: (option: { value?: unknown; label?: ReactNode }) =>
                renderOption({ value: String(option.value), label: String(option.label ?? '') }),
              labelRender: (option: { value?: unknown; label?: ReactNode }) =>
                renderOption({ value: String(option.value), label: String(option.label ?? '') }),
            }
          : {})}
      />
    </Form.Item>
  );
}
