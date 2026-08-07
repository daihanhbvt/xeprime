'use client';

import { DatePicker, Form } from 'antd';
import { useId } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import type { Dayjs } from '@/lib/datetime';

import styles from './field.module.css';

interface DateTimeFieldBaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
}

/**
 * `range` đổi luôn KIỂU giá trị của field, nên nó là union chứ không phải một cờ boolean rời:
 * - không có `range` → `Dayjs | null`
 * - `range` → `[Dayjs | null, Dayjs | null] | null`
 *
 * Schema Yup của feature phải khai đúng kiểu tương ứng; sai kiểu là lỗi biên dịch chứ không phải
 * lỗi lúc chạy.
 */
type DateTimeFieldProps<T extends FieldValues> = DateTimeFieldBaseProps<T> &
  ({ range?: false } | { range: true; rangePlaceholder?: [string, string] });

const TIME_CONFIG = { format: 'HH:mm', minuteStep: 15 } as const;
const DISPLAY_FORMAT = 'DD/MM/YYYY HH:mm';

/**
 * Ô chọn ngày-giờ nối RHF ↔ AntD DatePicker.
 *
 * **Giá trị giữ nguyên là `Dayjs`, không tự chuyển sang chuỗi hay UTC.** Việc serialize thuộc về
 * feature (`.toISOString()` khi gửi API), đúng như trước Wave 1C-C — component này đổi cách
 * chuyển đổi là làm lệch giờ ở mọi form đặt xe cùng lúc. CLAUDE.md §9: lưu UTC, hiển thị
 * `Asia/Ho_Chi_Minh`; chỗ áp múi giờ là [lib/datetime](../../lib/datetime.ts), không phải ở đây.
 *
 * Xoá giá trị: `onChange(null)` của AntD được truyền thẳng thành `null` cho RHF (không hoá
 * `undefined`), để `dirty`/validation của Yup nhìn thấy một giá trị rỗng tường minh.
 */
export function DateTimeField<T extends FieldValues>(props: DateTimeFieldProps<T>) {
  const { control, name, label, placeholder } = props;
  const { field, fieldState } = useController({ control, name });
  const id = useId();

  const shared = {
    id,
    className: styles.control,
    size: 'large' as const,
    showTime: TIME_CONFIG,
    format: DISPLAY_FORMAT,
    onBlur: field.onBlur,
    status: fieldState.error ? ('error' as const) : undefined,
  };

  return (
    <Form.Item
      label={label}
      htmlFor={id}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      className={styles.item}
    >
      {props.range ? (
        <DatePicker.RangePicker
          {...shared}
          placeholder={props.rangePlaceholder ?? ['Từ ngày', 'Đến ngày']}
          value={(field.value as [Dayjs | null, Dayjs | null] | null) ?? null}
          onChange={(value) => field.onChange(value ?? null)}
        />
      ) : (
        <DatePicker
          {...shared}
          placeholder={placeholder}
          value={(field.value as Dayjs | null) ?? null}
          onChange={(value) => field.onChange(value)}
        />
      )}
    </Form.Item>
  );
}
