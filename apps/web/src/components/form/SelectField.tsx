'use client';

import { Form, Select } from 'antd';
import type React from 'react';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
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
  notFoundContent,
}: SelectFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  // AntD `Select` không tự nhận `htmlFor` của `Form.Item` — thiếu `id` tường minh thì bấm nhãn
  // không mở được danh sách và `getByLabelText` không tìm ra ô chọn.
  const selectId = `${String(name)}-${useId()}`;
  const describedById = `${selectId}-help`;
  const helpText = fieldState.error?.message ?? help;

  return (
    <Form.Item
      label={label}
      htmlFor={selectId}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <Select
        id={selectId}
        aria-describedby={helpText ? describedById : undefined}
        mode={mode}
        value={(field.value as string | string[] | null | undefined) ?? undefined}
        // multiple: bỏ hết lựa chọn trả mảng RỖNG (schema .min(1) báo lỗi) chứ không phải null.
        onChange={(value: string | string[] | undefined) =>
          field.onChange(value ?? (mode === 'multiple' ? [] : null))
        }
        onBlur={field.onBlur}
        options={
          (optionGroups ?? options) as React.ComponentProps<typeof Select>['options']
        }
        notFoundContent={notFoundContent}
        placeholder={placeholder}
        allowClear={allowClear}
        disabled={disabled}
        loading={loading}
        showSearch={showSearch}
        onSearch={onSearch}
        // Tìm ở server thì KHÔNG lọc lại ở client — nếu không, kết quả server vừa trả về sẽ bị
        // chính ô tìm kiếm giấu đi vì nhãn không chứa nguyên văn chuỗi đã gõ.
        filterOption={onSearch ? false : undefined}
        // Mặc định AntD lọc theo `value` (là key slug), nên gõ "Mercedes" không ra `mercedes`.
        optionFilterProp={showSearch && !onSearch ? 'label' : undefined}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
