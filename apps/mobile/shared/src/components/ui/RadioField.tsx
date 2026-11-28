import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { FieldLabel, FieldMessage, inLabelHint, belowHint } from './Field';
import { RadioOption } from './RadioOption';
import type { IconName } from './Chip';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Figma "Radio Group" (`24238:61817`): vòng 16, chấm 6, hai lựa chọn cách 20, vòng ↔ chữ 8. */
const DOT_RING = 16;
const DOT = 6;
const INLINE_GAP = 20;

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
  inline = false,
}: {
  control: Control<T>;
  name: Path<T>;
  /** Bỏ trống khi tiêu đề THẺ đã là câu hỏi — nếu không thì cùng một câu hiện hai lần. */
  label?: string;
  options: readonly RadioFieldOption[];
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  /**
   * Lựa chọn NGẮN nằm ngang, không khung (Figma "Phương pháp tính lãi" `24238:61815`): vòng 16 +
   * chữ 14/20; hàng chật thì tự xuống dòng.
   */
  inline?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });
  const colors = useColors();

  if (inline) {
    return (
      <YStack gap={space.sm}>
        {label ? <FieldLabel label={label} required={required} hint={inLabelHint(hint)} /> : null}
        <XStack flexWrap="wrap" columnGap={INLINE_GAP} rowGap={space.sm} accessibilityRole="radiogroup">
          {options.map((option) => {
            const checked = field.value === option.value;
            return (
              <Pressable
                key={option.value}
                disabled={disabled}
                onPress={() => field.onChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked, disabled }}
                accessibilityLabel={option.label}
                hitSlop={space.xs}
              >
                <XStack gap={space.sm} ai="flex-start" opacity={disabled ? 0.6 : 1}>
                  <YStack pt={2}>
                    <YStack
                      w={DOT_RING}
                      h={DOT_RING}
                      br={radius.pill}
                      bw={1}
                      bc={checked ? colors.primary : colors.borderInput}
                      bg={checked ? colors.primary : colors.surface}
                      ai="center"
                      jc="center"
                    >
                      {checked ? <YStack w={DOT} h={DOT} br={radius.pill} bg={colors.surface} /> : null}
                    </YStack>
                  </YStack>
                  <Text
                    col={colors.textMuted}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {option.label}
                  </Text>
                </XStack>
              </Pressable>
            );
          })}
        </XStack>
        <FieldMessage error={fieldState.error?.message} hint={belowHint(hint)} />
      </YStack>
    );
  }

  return (
    <YStack gap={space.xs}>
      {label ? <FieldLabel label={label} required={required} hint={inLabelHint(hint)} /> : null}

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

      <FieldMessage error={fieldState.error?.message} hint={belowHint(hint)} />
    </YStack>
  );
}
