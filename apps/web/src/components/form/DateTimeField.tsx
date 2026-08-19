'use client';

import { DatePicker, Form } from 'antd';
import { useId } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';

import styles from './field.module.css';
import { useDatePickerPattern } from '@/i18n/use-app-format';

interface DateTimeFieldBaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
}

/**
 * `range`/`dateOnly` đổi luôn KIỂU giá trị của field, nên là union chứ không phải cờ rời:
 * - không có gì → `Dayjs | null`
 * - `range` → `[Dayjs | null, Dayjs | null] | null`
 * - `dateOnly` → **`string | null`** dạng `YYYY-MM-DD` — ngày-không-giờ (ngày hợp đồng,
 *   ngày mua xe) là dữ liệu lịch, không phải mốc thời gian; giữ chuỗi để không dính múi giờ.
 *
 * Schema Yup của feature phải khai đúng kiểu tương ứng; sai kiểu là lỗi biên dịch chứ không phải
 * lỗi lúc chạy.
 */
type DateTimeFieldProps<T extends FieldValues> = DateTimeFieldBaseProps<T> &
  (
    | { range?: false; dateOnly?: false }
    | { range: true; dateOnly?: false; rangePlaceholder?: [string, string] }
    | { range?: false; dateOnly: true }
  );

const TIME_CONFIG = { format: 'HH:mm', minuteStep: 15 } as const;

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
  const datePattern = useDatePickerPattern();
  const { field, fieldState } = useController({ control, name });
  const id = useId();

  const dateOnly = !props.range && props.dateOnly === true;
  const shared = {
    id,
    className: styles.control,
    ...(dateOnly ? {} : { showTime: TIME_CONFIG }),
    format: dateOnly ? datePattern.date : datePattern.dateTime,
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
      {dateOnly ? (
        <DatePicker
          {...shared}
          placeholder={placeholder}
          value={field.value ? dayjs(field.value as string, DAY_PARAM_FORMAT) : null}
          onChange={(value: Dayjs | null) =>
            field.onChange(value ? value.format(DAY_PARAM_FORMAT) : null)
          }
        />
      ) : props.range ? (
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
