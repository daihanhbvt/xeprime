import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { BottomSheet } from './BottomSheet';
import { MenuOption, MenuOptionList } from './MenuOption';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, typeScale } from '@/theme/tokens';

/** Figma "Input - Select" (`8663:16373`): cao tối thiểu 40, đệm 14/8, khoảng 8, bo 12. */
const MIN_HEIGHT = 40;
const PAD_X = 14;
const PAD_Y = 8;
const GAP = 8;

/**
 * Ô CHỌN gọn của thanh công cụ - Figma "Input - Select" (Tổng quan doanh thu `24228:98931`):
 * nền trắng, viền `stroke/gray-low300`, bóng xs, chữ 14/20 thường, icon 20 bên phải (mũi tên
 * xuống "Down 2" hoặc lịch "Calender 2"). Chỉ là HÌNH + vùng chạm; thứ mở ra do nơi gọi quyết.
 */
export function SelectTrigger({
  label,
  accessibilityLabel,
  icon = 'chevron-down-md',
  locked = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  icon?: 'chevron-down-md' | 'calendar';
  /** Chỉ đọc (vd chi nhánh bị khoá): nền mờ, khoá thay mũi tên, không bấm được. */
  locked?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const box = (
    <XStack
      ai="center"
      gap={GAP}
      minHeight={MIN_HEIGHT}
      px={PAD_X}
      py={PAD_Y}
      br={radius.control}
      bw={1}
      bc={colors.borderInput}
      bg={locked ? colors.surfaceMuted : colors.surface}
      style={elevation.xs}
    >
      <Text
        f={1}
        minWidth={0}
        col={locked ? colors.textMuted : colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.regular}
        numberOfLines={1}
      >
        {label}
      </Text>
      {locked ? (
        <Ionicons name="lock-closed-outline" size={iconSize.sm} color={colors.placeholder} />
      ) : (
        <LineIcon name={icon} color={colors.placeholder} size={20} />
      )}
    </XStack>
  );

  if (locked || !onPress) {
    return (
      <XStack accessible accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: true }}>
        {box}
      </XStack>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fill, pressed ? styles.pressed : null]}
    >
      {box}
    </Pressable>
  );
}

/**
 * `SelectTrigger` + tấm chọn một giá trị - ô "Tuần" của biểu đồ Figma. Danh sách ngắn (2-4 mục),
 * không tìm kiếm; danh sách dài/biểu mẫu dùng `SelectControl`.
 */
export function CompactSelect<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  /** Tiêu đề tấm chọn + tên trợ năng của ô. */
  title: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <SelectTrigger
        label={current?.label ?? ''}
        accessibilityLabel={`${title}: ${current?.label ?? ''}`}
        onPress={() => setOpen(true)}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <MenuOptionList>
          {options.map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7 },
});
