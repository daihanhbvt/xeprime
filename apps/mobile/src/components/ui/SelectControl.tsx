import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from './BottomSheet';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { colors, fieldFontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

export interface SelectControlOption {
  readonly value: string;
  readonly label: string;
  /** Dòng phụ dưới nhãn trong danh sách — dùng khi nhãn thôi chưa đủ để chọn đúng. */
  readonly hint?: string;
}

/**
 * Ô CHỌN của biểu mẫu, bản KHÔNG gắn với React Hook Form.
 *
 * Tách khỏi [`SelectField`](./SelectField.tsx) vì hai lớp giải hai bài khác nhau: cái này là
 * HÌNH DẠNG + hành vi mở/chọn, còn `SelectField` chỉ thêm phần nối vào RHF. Có những giá trị
 * sống ở state component chứ không ở form — dịch vụ và gói thuê của luồng đặt hộ chẳng hạn, vì
 * chúng quyết định cả schema lẫn tham số báo giá — và trước khi tách thì chúng không có cách nào
 * dùng lại đúng ô này, nên phải rơi về hàng chip.
 *
 * **Mọi lựa chọn từ HAI giá trị trở lên đều đi qua đây**, không dùng hàng chip: chip chỉ đọc được
 * khi nhãn ngắn, còn "Thuê dài hạn" hay "Liên tỉnh một chiều" xếp ngang trên màn 360dp là tự
 * xuống ba hàng và đẩy nội dung phía dưới ra khỏi tầm nhìn.
 */
export function SelectControl({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  placeholder,
}: {
  label: string;
  value: string | null;
  options: readonly SelectControlOption[];
  onChange: (next: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Chữ mờ khi chưa chọn gì. Bỏ trống thì dùng "Chọn…" của `Common.actions`. */
  placeholder?: string;
}) {
  const t = useTranslations('Common.actions');
  const [open, setOpen] = useState(false);

  const current = options.find((option) => option.value === value);

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      {/*
        Vỏ chạm là `Pressable`: vai "button" đặt trên stack Tamagui không nổi lên cây khả truy
        cập, nên ô chọn sẽ đọc ra như một mảng chữ chứ không phải một nút bấm được.
      */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <FieldShell focused={false} invalid={Boolean(error)} align="center">
          <Text
            f={1}
            col={current ? colors.text : colors.placeholder}
            fos={fieldFontSize.value}
            numberOfLines={1}
          >
            {current?.label ?? placeholder ?? t('choose')}
          </Text>
          <Ionicons name="chevron-down" size={iconSize.sm} color={colors.textMuted} />
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={hint} />

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
            >
              <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
                <YStack f={1} gap={2}>
                  <Text
                    col={selected ? colors.primaryActive : colors.text}
                    fos={fieldFontSize.value}
                    fow={selected ? fontWeight.semibold : fontWeight.regular}
                  >
                    {option.label}
                  </Text>
                  {option.hint ? (
                    <Text col={colors.textMuted} fos={fieldFontSize.message}>
                      {option.hint}
                    </Text>
                  ) : null}
                </YStack>
                {selected ? (
                  <Ionicons name="checkmark" size={iconSize.md} color={colors.primaryActive} />
                ) : null}
              </XStack>
            </Pressable>
          );
        })}
      </BottomSheet>
    </YStack>
  );
}
