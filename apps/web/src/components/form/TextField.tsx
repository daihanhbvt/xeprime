'use client';

import { Form, Input } from 'antd';
import { useHelpAsTip } from './help-as-tip';
import { sanitizePhoneInput } from '@xeprime/types';
import { useId, type ChangeEvent, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { LOCKED_FIELD_CLASS, fieldLockSuffix, type FieldLock } from './field-lock';
import styles from './field.module.css';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /**
   * `ReactNode` chứ không phải `string`: form nào cần gắn thêm dấu hiệu riêng cạnh nhãn thì tự
   * dựng lấy, thay vì common code phải biết quy ước của từng feature.
   */
  label: ReactNode;
  type?: 'text' | 'email' | 'password' | 'tel';
  placeholder?: string;
  autoComplete?: string;
  prefix?: ReactNode;
  /** Phần tử ở mép phải TRONG ô (vd nút bút mở khoá một ô đang khoá). */
  suffix?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Hiện dấu bắt buộc của AntD. Ràng buộc thật vẫn nằm ở schema Yup, đây chỉ là dấu hiệu. */
  required?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng — không hiện cả hai cùng lúc. */
  help?: ReactNode;
  /**
   * Chuẩn hoá giá trị NGAY KHI GÕ — cho ô định danh (mã gói: chữ hoa → thường, dấu cách → "-").
   * Người dùng thấy đúng thứ sẽ được lưu, thay vì gõ xong mới bị báo sai định dạng.
   */
  normalize?: (value: string) => string;
  /**
   * Icon nút ẩn/hiện của ô `password`, khi bản vẽ dùng icon riêng thay cho mắt mặc định của AntD.
   * `visible` = mật khẩu đang hiện chữ.
   */
  visibilityIcon?: (visible: boolean) => ReactNode;
  /**
   * Ô tự điền có thể KHOÁ (chỉ đọc + bút trong ô) — truyền cả khi đang mở để khung ô không đổi
   * giữa hai trạng thái (`field-lock.tsx`).
   */
  lock?: FieldLock;
}

/**
 * Ô nhập nối React Hook Form với AntD — hướng common (ADR 0004: form state ở RHF, không Redux).
 *
 * `useController` cầu nối field của RHF sang input AntD; lỗi validate (yup) hiện qua Form.Item.
 * Dùng chung cho mọi form auth để không lặp boilerplate ở từng trang.
 */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  prefix,
  suffix,
  autoFocus,
  disabled,
  required,
  help,
  normalize,
  visibilityIcon,
  lock,
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  // `Form.Item` chỉ tự nối label ↔ input khi nằm trong `<Form>` của AntD. Các form ở đây dùng
  // React Hook Form nên phải tự gán `id`/`htmlFor`: thiếu nó, bấm vào label không focus được ô
  // nhập và trình đọc màn hình không đọc ra tên trường.
  const inputId = `${String(name)}-${useId()}`;
  const describedById = `${inputId}-help`;
  // Vùng `HelpAsTipProvider`: ghi chú dời lên nhãn thành ⓘ, dưới ô chỉ còn lỗi.
  const tip = useHelpAsTip(label, help);
  const helpText = fieldState.error?.message ?? tip.help;
  // Ô SĐT (ADR 0082): chỉ giữ chữ số và một `+` đầu, lúc gõ lẫn lúc dán — `099 222 2222` vào là
  // `0992222222` ngay. Nơi gọi tự truyền `normalize` thì dùng bản đó.
  const applyNormalize = normalize ?? (type === 'tel' ? sanitizePhoneInput : undefined);
  const shared = {
    ...field,
    onChange: applyNormalize
      ? (event: ChangeEvent<HTMLInputElement>) => field.onChange(applyNormalize(event.target.value))
      : field.onChange,
    id: inputId,
    placeholder,
    autoComplete,
    inputMode: type === 'tel' ? ('tel' as const) : undefined,
    autoFocus,
    prefix,
    suffix: fieldLockSuffix(lock, suffix),
    readOnly: lock?.locked || undefined,
    className: lock?.locked ? LOCKED_FIELD_CLASS : undefined,
    disabled,
    'aria-describedby': helpText ? describedById : undefined,
    'aria-invalid': fieldState.error ? true : undefined,
    status: fieldState.error ? ('error' as const) : undefined,
  };

  return (
    <Form.Item
      label={tip.label}
      htmlFor={inputId}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      {type === 'password' ? (
        <Input.Password {...shared} iconRender={visibilityIcon} />
      ) : (
        <Input {...shared} type={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text'} />
      )}
    </Form.Item>
  );
}
