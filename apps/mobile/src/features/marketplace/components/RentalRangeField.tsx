import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { RentalMode } from '@xeprime/domain';
import type { Dayjs } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { RentalRangeSheet, type RentalRangeDraft } from './RentalRangeSheet';

interface RentalRangeFieldProps {
  value: RentalRangeDraft;
  mode: RentalMode;
  onChange: (next: RentalRangeDraft) => void;
  onModeChange: (mode: RentalMode) => void;
  /** Gọi khi bấm "Áp dụng" — nơi gọi quyết định có nạp lại danh sách hay không. */
  onApply?: () => void;
  minDays?: number;
}

/**
 * Ô hiển thị khoảng thuê — bản native của `RentalDateTimeRangeField`.
 *
 * Bản thân ô KHÔNG sửa gì: nó chỉ mở `RentalRangeSheet` và hiển thị giá trị hiện tại, đúng như
 * web dùng một ô đọc-only mở panel. Nhờ vậy luật chọn dải nằm gọn một chỗ.
 *
 * Chỉnh sửa trong tấm trượt ghi thẳng vào `value` (giống web), nên bấm "Huỷ" sẽ khôi phục lại
 * giá trị lúc mở — đó là việc của hàm này, không phải của tấm trượt.
 */
export function RentalRangeField({
  value,
  mode,
  onChange,
  onModeChange,
  onApply,
  minDays,
}: RentalRangeFieldProps) {
  const t = useTranslations('Common.components.rentalRange');
  const fmt = useAppFormat();
  const [open, setOpen] = useState(false);
  // Ảnh chụp lúc mở, để "Huỷ" trả lại đúng giá trị cũ thay vì giữ những gì vừa bấm thử.
  const [snapshot, setSnapshot] = useState<{ value: RentalRangeDraft; mode: RentalMode } | null>(
    null,
  );

  const point = (d: Dayjs | null) => (d ? fmt.rentalPoint(d) : t('notSelected'));

  function close() {
    setOpen(false);
    setSnapshot(null);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setSnapshot({ value, mode });
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('ariaValue', {
          label: t('ariaLabel'),
          start: point(value.pickupAt),
          end: point(value.returnAt),
        })}
      >
        <XStack
          ai="center"
          gap={space.xs}
          bg={colors.surfaceMuted}
          br={radius.md}
          bw={1}
          bc={colors.borderSubtle}
          px={space.sm}
          minHeight={sizing.touchTarget}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          <Text
            col={colors.text}
            fos={fontSize.bodySm}
            fow={fontWeight.medium}
            numberOfLines={1}
            flexShrink={1}
          >
            {point(value.pickupAt)}
          </Text>
          <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
          <Text
            col={colors.text}
            fos={fontSize.bodySm}
            fow={fontWeight.medium}
            numberOfLines={1}
            flexShrink={1}
          >
            {point(value.returnAt)}
          </Text>
        </XStack>
      </Pressable>

      <RentalRangeSheet
        open={open}
        value={value}
        mode={mode}
        onChange={onChange}
        onModeChange={onModeChange}
        onApply={() => {
          onApply?.();
          close();
        }}
        onCancel={() => {
          if (snapshot) {
            onChange(snapshot.value);
            if (snapshot.mode !== mode) onModeChange(snapshot.mode);
          }
          close();
        }}
        {...(minDays ? { minDays } : {})}
      />
    </>
  );
}
