import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { Ionicons } from '@/components/icons/Ionicons';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { FieldLabel, FieldMessage, FieldShell, inLabelHint, belowHint } from './Field';

/**
 * Khoá của MỘT ô tự điền (ADR 0102 - thông số theo mẫu xe, chữ máy đọc trên cà vẹt): bản native của
 * web `FieldLock`. Khoá là trạng thái giao diện, không phải luật server - chủ xe bấm bút để sửa.
 */
export interface FieldLock {
  locked: boolean;
  /** Nhãn khả truy cập của nút bút, đã dịch ("Sửa Số chỗ ngồi"). */
  editLabel: string;
  onUnlock: () => void;
}

/**
 * Ô ĐANG KHOÁ - chỉ đọc, giá trị đã định dạng, bút nằm trong ô (web `LockedValueField`). Nơi gọi
 * vẽ ô nhập thật của trường khi `lock.locked = false`.
 */
export function LockedValueField({
  label,
  value,
  lock,
  hint,
  error,
  required = false,
}: {
  label: string;
  /** Giá trị đã định dạng để đọc ("5 chỗ", "Điện", "1496"). */
  value: string;
  lock: FieldLock;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean;
}) {
  const colors = useColors();
  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} hint={inLabelHint(hint)} />
      <FieldShell disabled invalid={Boolean(error)}>
        <Text
          f={1}
          py={space.sm}
          col={colors.text}
          fos={fieldFontSize.value}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Pressable
          onPress={lock.onUnlock}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel={lock.editLabel}
        >
          <Ionicons name="create-outline" size={iconSize.sm} color={colors.primaryActive} />
        </Pressable>
      </FieldShell>
      <FieldMessage error={error} hint={belowHint(hint)} />
    </YStack>
  );
}
