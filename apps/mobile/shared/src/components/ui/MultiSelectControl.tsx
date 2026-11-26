import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import {
  FIELD_V2,
  FieldLabel,
  FieldMessage,
  FieldShell,
  belowHint,
  inLabelHint,
} from './Field';
import { MenuOption, MenuOptionList } from './MenuOption';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
  /** Mục KHOÁ: không hiện trong tấm chọn, nhưng nếu đã nằm trong giá trị thì vẫn hiện thành thẻ. */
  readonly disabled?: boolean;
}

/** Thẻ giá trị đã chọn (Figma "_Badge" `Chi nhánh Quận 5 ×`): bo 16, đệm 8/2, chữ 12/18 medium, × 12. */
const TAG_ICON = 12;

/**
 * Ô CHỌN NHIỀU — bản native của `<Select mode="multiple">` bên web (AntD): các giá trị đã chọn là
 * thẻ nhỏ có nút ×, mũi tên bên phải; chạm ô mở tấm chọn với dấu tích từng mục.
 *
 * Ô KHÔNG tự đổi giá trị: mỗi lần bật/tắt (chạm một mục trong tấm, hay × trên thẻ) gọi `onToggle`
 * với giá trị đó, nơi gọi quyết mảng mới - nên luật riêng của từng ô (vd "Tất cả chi nhánh" loại trừ
 * chi nhánh cụ thể, không bao giờ rỗng) nằm ở nơi gọi chứ không rò vào thành phần chung này.
 */
export function MultiSelectControl({
  label,
  value,
  options,
  onToggle,
  hint,
  error,
  required = false,
  placeholder,
  disabled = false,
  nonRemovable = [],
  maxVisible = 1,
}: {
  label: string;
  value: readonly string[];
  options: readonly MultiSelectOption[];
  onToggle: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Giá trị mà thẻ không có nút × (vd "Tất cả chi nhánh" - bỏ nó đi bằng cách chọn mục khác). */
  nonRemovable?: readonly string[];
  /** Số thẻ hiện trong ô trước khi gộp phần còn lại thành "+N" (mặc định 1). */
  maxVisible?: number;
}) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  const [open, setOpen] = useState(false);

  const selected = value
    .map((v) => options.find((option) => option.value === v))
    .filter((option): option is MultiSelectOption => option !== undefined);
  // Ô giữ MỘT dòng: hiện `maxVisible` thẻ đầu + thẻ "+N" cho phần còn lại - nhiều chi nhánh không
  // làm ô cao lên hay vỡ bố cục. Gỡ từng cái nằm trong tấm chọn (chạm ô để mở).
  const shown = selected.slice(0, maxVisible);
  const hidden = selected.length - shown.length;

  return (
    <YStack gap={FIELD_V2.labelGap}>
      <FieldLabel label={label} required={required} hint={inLabelHint(hint)} />

      <Pressable
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <FieldShell focused={false} invalid={Boolean(error)} disabled={disabled} align="center">
          <XStack f={1} minWidth={0} ai="center" gap={space.xs} py={space.xs}>
            {selected.length === 0 ? (
              <Text col={colors.textPlaceholder} fos={FIELD_V2.selectFontSize} numberOfLines={1}>
                {placeholder ?? t('choose')}
              </Text>
            ) : (
              shown.map((option) => (
                <XStack
                  key={option.value}
                  ai="center"
                  gap={6}
                  px={space.sm}
                  py={2}
                  br={radius.card}
                  bw={1}
                  bc={colors.borderInput}
                  bg={colors.background}
                  flexShrink={1}
                  minWidth={0}
                >
                  <Text
                    col={colors.textMuted}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                    flexShrink={1}
                  >
                    {option.label}
                  </Text>
                  {disabled || nonRemovable.includes(option.value) ? null : (
                    <Pressable
                      onPress={() => onToggle(option.value)}
                      hitSlop={space.sm}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('remove')} ${option.label}`}
                    >
                      <LineIcon name="close" size={TAG_ICON} color={colors.textMuted} />
                    </Pressable>
                  )}
                </XStack>
              ))
            )}
            {hidden > 0 ? (
              <XStack
                px={space.sm}
                py={2}
                br={radius.card}
                bw={1}
                bc={colors.borderInput}
                bg={colors.background}
                flexShrink={0}
                accessibilityLabel={t('moreSelected', { count: hidden })}
              >
                <Text
                  col={colors.textMuted}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                >
                  {`+${hidden}`}
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <LineIcon
            name="chevron-down-md"
            size={FIELD_V2.icon}
            color={disabled ? colors.textDisabled : colors.placeholder}
          />
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={belowHint(hint)} />

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={<Button variant="gradient" label={t('done')} onPress={() => setOpen(false)} />}
      >
        <MenuOptionList>
          {options
            .filter((option) => !option.disabled)
            .map((option) => (
              <MenuOption
                key={option.value}
                label={option.label}
                selected={value.includes(option.value)}
                onPress={() => onToggle(option.value)}
              />
            ))}
        </MenuOptionList>
      </BottomSheet>
    </YStack>
  );
}
