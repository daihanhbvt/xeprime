import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { RentalMode } from '@xeprime/domain';
import type { Dayjs } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { RentalRangeSheet, type RentalRangeDraft } from './RentalRangeSheet';

interface RentalRangeFieldProps {
  value: RentalRangeDraft;
  mode: RentalMode;
  onChange: (next: RentalRangeDraft) => void;
  onModeChange: (mode: RentalMode) => void;
  /** Gọi khi bấm "Áp dụng" — nơi gọi quyết định có nạp lại danh sách hay không. */
  onApply?: () => void;
  minDays?: number;
  /** Chữ gợi ý khi chưa chọn gì (`rental.placeholder` của thẻ tìm kiếm web). */
  placeholder?: string;
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
  placeholder,
}: RentalRangeFieldProps) {
  const colors = useColors();
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
        {/*
          Cùng ngôn ngữ với ô địa điểm ngay trên (nền trắng + viền `borderInput`, icon màu
          thương hiệu) — cả hai là ô nhập của cùng một thẻ tìm kiếm, `SearchCard.tsx`.
        */}
        <XStack
          h={44}
          ai="center"
          gap={space.sm}
          bg={colors.surface}
          br={toPx(XP_TOKENS['border-radius-control'])}
          bw={1}
          bc={colors.borderInput}
          px={14}
        >
          {value.pickupAt || value.returnAt || !placeholder ? (
            /* MỘT dòng, tự co chữ cho vừa máy hẹp — web hiện đủ cả hai mốc, không cắt bằng dấu ba chấm. */
            <Text
              f={1}
              col={colors.text}
              fos={fontSize.body}
              fow={fontWeight.semibold}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {`${point(value.pickupAt)}  →  ${point(value.returnAt)}`}
            </Text>
          ) : (
            <Text f={1} col={colors.placeholder} fos={fontSize.bodyLg} numberOfLines={1}>
              {placeholder}
            </Text>
          )}
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
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
