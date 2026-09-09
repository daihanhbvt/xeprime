import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Nền của một dòng đang bị nhấn — SÁNG lên, không mờ đi.
 *
 * Cùng lý do `StatGrid` chọn thế cho dòng sổ của nó: thứ người dùng cần thấy là "tôi đang chạm
 * vào ĐÚNG dòng này", không phải "dòng này đang tắt".
 */
const pressedRow = { backgroundColor: colors.surfaceMuted } as const;

/**
 * Một dòng xem nhanh trong khối Tổng quan — bản native của `.rowBtn` (`MiniList.module.css`).
 *
 * **Bốn mẩu, đúng bằng web**: dòng chính · dòng meta gộp · số tiền · nhãn trạng thái. Bản trước
 * của app chỉ có hai mẩu đầu và một cái nhãn — mở cùng một gian hàng trên hai thiết bị thì bản
 * điện thoại thiếu hẳn tên khách và số tiền, tức thiếu đúng hai thứ quyết định người vận hành có
 * cần mở đơn đó ra hay không.
 *
 * **Cột phải XẾP DỌC** (nhãn trên, tiền dưới), khác web xếp ngang: ở 390dp, tiền và nhãn nằm
 * cùng hàng ăn hết ~140dp và dòng meta bên trái chỉ còn chỗ cho "Toyota Vios · 08/…". Xếp dọc
 * thì cột phải rộng bằng mẩu rộng nhất trong hai mẩu, trả lại gần 70dp cho phần chữ.
 *
 * **Meta dùng bậc chữ nhỏ nhất** (`fontSize.meta`, 11px) — nó là dòng phụ của dòng ngay trên nó,
 * và ở 12px thì chuỗi ba mẩu nối bằng ` · ` bị cắt trên máy hẹp.
 *
 * KHÔNG có đĩa hình dẫn đầu: 40dp đầu dòng là 40dp lấy mất của chính phần thông tin mà khối này
 * tồn tại để hiện, và màu trạng thái đã nằm ở nhãn bên phải rồi. Màu của KHỐI do đầu khối mang
 * (xem `DashboardPanel`).
 *
 * Đệm ngang nằm ở DÒNG chứ không ở thân khối: xem docblock của `DashboardPanel` về nét kẻ chạm
 * mép thẻ.
 */
export function MiniListRow({
  title,
  meta,
  amount,
  amountTone = colors.price,
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? pressedRow : null)}
    >
      <XStack ai="center" gap={space.sm} px={space.md} py={space.sm}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
            {title}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.meta} numberOfLines={1}>
            {meta}
          </Text>
        </YStack>

        {/*
          Nhãn TRẠNG THÁI đứng trên, số tiền xuống dưới — hai cột khớp nhau theo VAI: dòng trên là
          định danh (ai / bước nào), dòng dưới là số liệu (xe + giờ / bao nhiêu tiền). Đảo lại thì
          một viên nhãn có nền và viền nằm ngang hàng với dòng meta 11px mờ, và nó kéo mắt xuống
          dòng phụ thay vì dòng chính.

          `flexShrink={0}`: hết chỗ thì dòng chữ bên trái cắt bớt, cột phải không bao giờ cắt —
          một số tiền cụt là một số SAI, còn một tên xe cụt vẫn đọc ra được xe nào.
        */}
        <YStack flexShrink={0} ai="stretch" gap={2}>
          {/*
            Viên nhãn phải được ĐẨY sang phải bằng `jc` của một hàng bọc, không bằng `ai` của cột.

            `StatusBadge` khai `alignSelf: flex-start` bên trong chính nó — cần thiết ở mọi chỗ
            khác (một viên nhãn trong cột dọc không được kéo dài hết bề ngang), nhưng `alignSelf`
            của con luôn thắng `alignItems` của cha. Đặt `ai="flex-end"` cho cả cột thì con số
            nghe theo còn viên nhãn thì không: nó dạt về mép TRÁI của cột — đúng cảnh viên "Đã
            duyệt" lệch khỏi cột tiền ở khối Thu Chi.

            Cột `ai="stretch"` (rộng bằng mẩu rộng nhất) + hàng bọc `jc="flex-end"` + `ta="right"`
            cho con số: cả hai mẩu khớp một mép phải, bất kể mẩu nào rộng hơn.
          */}
          <XStack jc="flex-end">{badge}</XStack>
          <Text
            col={amountTone}
            fos={fontSize.bodySm}
            fow={fontWeight.semibold}
            ta="right"
            numberOfLines={1}
          >
            {amount}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  );
}
