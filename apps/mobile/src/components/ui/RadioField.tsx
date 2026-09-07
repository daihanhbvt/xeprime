import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { YStack } from 'tamagui';
import { FieldLabel, FieldMessage } from './Field';
import { RadioOption } from './RadioOption';
import type { IconName } from './Chip';
import { space } from '@/theme/tokens';

export interface RadioFieldOption {
  value: string;
  label: string;
  /** Dòng phụ dưới nhãn — chỉ khi có thứ cần nói thêm mà nhãn không chứa nổi. */
  hint?: string;
  /** Hình đại diện cho lựa chọn — xem `RadioOption`. */
  icon?: IconName;
}

/**
 * Nhóm lựa chọn loại trừ nhau gắn với React Hook Form — bản native của `<Radio.Group>` trong
 * `<Controller>` bên web.
 *
 * Đứng cạnh [`SelectField`](./SelectField.tsx) chứ không thay nó: bày hết hay giấu sau một menu
 * là quyết định của SỐ LỰA CHỌN (xem docblock `RadioOption`). File này chỉ lo phần nối RHF —
 * nhãn, lỗi và gợi ý đi qua đúng `FieldLabel`/`FieldMessage` như mọi ô nhập khác, để một nhóm
 * radio không có kiểu nhãn riêng giữa một form toàn ô nhập.
 */
export function RadioField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  hint,
  required = false,
  disabled = false,
}: {
  control: Control<T>;
  name: Path<T>;
  /** Bỏ trống khi tiêu đề THẺ đã là câu hỏi — nếu không thì cùng một câu hiện hai lần. */
  label?: string;
  options: readonly RadioFieldOption[];
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <YStack gap={space.xs}>
      {label ? <FieldLabel label={label} required={required} /> : null}

      {options.map((option) => (
        <RadioOption
          key={option.value}
          label={option.label}
          {...(option.hint === undefined ? {} : { hint: option.hint })}
          {...(option.icon === undefined ? {} : { icon: option.icon })}
          checked={field.value === option.value}
          disabled={disabled}
          onPress={() => field.onChange(option.value)}
        />
      ))}

      <FieldMessage error={fieldState.error?.message} hint={hint} />
    </YStack>
  );
}
