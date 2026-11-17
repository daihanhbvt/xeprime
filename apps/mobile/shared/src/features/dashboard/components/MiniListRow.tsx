import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';

/**
 * Nền của một dòng đang bị nhấn — SÁNG lên, không mờ đi.
 *
 * Cùng lý do `StatGrid` chọn thế cho dòng sổ của nó: thứ người dùng cần thấy là "tôi đang chạm
 * vào ĐÚNG dòng này", không phải "dòng này đang tắt".
 */
const usePressedRow = themed((colors) => ({ backgroundColor: colors.surfaceMuted }) as const);

/**
 * Một dòng xem nhanh trong khối Tổng quan — bản native của `.rowBtn` (`MiniList.module.css`).
 *
 * **Bốn mẩu, đúng bằng web**: dòng chính · dòng meta gộp · số tiền · nhãn trạng thái. Bản trước
 * của app chỉ có hai mẩu đầu và một cái nhãn — mở cùng một gian hàng trên hai thiết bị thì bản
 * điện thoại thiếu hẳn tên khách và số tiền, tức thiếu đúng hai thứ quyết định người vận hành có
 * cần mở đơn đó ra hay không.
 *
 * **MỘT hàng như web** (`MiniList .rowBtn`): (tên 13.5 đậm vừa · meta 12 mờ) | (số tiền 13 đậm
 * vừa + nhãn trạng thái), đệm 10/2. Đệm ngang của khối do thân `DashboardPanel` (14/16) mang, kẻ
 * giữa các dòng là `Divider` của nơi gọi.
 */
export function MiniListRow({
  title,
  meta,
  amount,
  amountTone: amountToneProp,
  badge,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  /** Các mẩu phụ đã gộp sẵn bằng ` · ` — nơi gọi tự lọc mẩu rỗng. */
  meta: string;
  amount: string;
  /** Mặc định là màu GIÁ. Chỉ đổi khi dấu của số là thông tin (tiền ra ở sổ quỹ). */
  amountTone?: string;
  badge: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const amountTone = amountToneProp ?? colors.price;
  const pressedRow = usePressedRow();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? pressedRow : null)}
    >
      {/*
        Web `MiniList .rowBtn`: MỘT hàng - (tên 13.5 đậm vừa · dòng phụ 12 mờ) | (số tiền 13 đậm vừa
        rồi nhãn trạng thái, cách 10), đệm 10/2; thân khối đã đệm 14/16 nên hàng không tự đệm lề.
        `flexShrink={0}` cột phải: hết chỗ thì cắt chữ bên trái, số tiền không bao giờ cụt.
      */}
      <XStack ai="center" jc="space-between" gap={ROW_GAP} px={ROW_PAD_X} py={ROW_PAD_Y}>
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium} numberOfLines={1}>
            {title}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
            {meta}
          </Text>
        </YStack>
        <XStack flexShrink={0} ai="center" gap={RIGHT_GAP}>
          <Text col={amountTone} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
            {amount}
          </Text>
          {badge}
        </XStack>
      </XStack>
    </Pressable>
  );
}

/** Web `.rowBtn { gap: 12px; padding: 10px 2px }`, `.right { gap: 10px }`. */
const ROW_GAP = 12;
const ROW_PAD_X = 0;
const ROW_PAD_Y = 8;
const RIGHT_GAP = 10;
