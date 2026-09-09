import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { layout } from '@/theme/layout';
import { colors, fieldFontSize, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

/**
 * Một dòng trong MENU chọn giá trị — tấm trượt của `SelectControl`, bộ chọn chi nhánh, đổi ngôn
 * ngữ, hộp xổ thời lượng và tấm chọn giờ của thẻ tìm kiếm.
 *
 * Năm nơi đó từng tự vẽ lấy một dòng gần giống nhau, và chúng lệch nhau ở cỡ chữ, ở dấu chọn lẫn
 * màu khi chọn — cùng một cử chỉ mà mỗi menu một mặt.
 */
export function MenuOption({
  label,
  hint,
  meta,
  selected,
  inset = false,
  onPress,
}: {
  label: string;
  /** Dòng phụ dưới nhãn — chỉ khi nhãn thôi chưa đủ để chọn đúng. */
  hint?: string;
  /**
   * Chữ phụ căn PHẢI — hệ quả của lựa chọn, thứ người dùng cần đọc cùng lúc với nhãn: chọn "6
   * giờ" thì kèm luôn giờ trả xe. Khác `hint` ở chỗ nó không giải thích nhãn mà bổ sung cho nó,
   * nên đứng cùng hàng chứ không xuống dòng.
   */
  meta?: string;
  selected: boolean;
  /**
   * Dòng TỰ gánh lề ngang.
   *
   * Mặc định dòng không có lề vì nó nằm trong `BottomSheet` đã có đệm sẵn. Bật cờ này khi danh
   * sách nằm trong khung KHÔNG đệm (tấm chọn giờ, hộp xổ thời lượng): để khung bên ngoài gánh lề
   * thì dải 16px hai mép rơi ra ngoài vùng chạm, và chạm vào đó không ra gì.
   */
  inset?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        minHeight={sizing.touchTarget}
        py={space.xs}
        {...(inset ? { px: layout.screenX } : {})}
      >
        <YStack f={1} gap={2}>
          <Text
            col={selected ? colors.primaryActive : colors.text}
            fos={fieldFontSize.value}
            fow={selected ? fontWeight.semibold : fontWeight.regular}
          >
            {label}
          </Text>
          {hint ? (
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {hint}
            </Text>
          ) : null}
        </YStack>
        {meta ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {meta}
          </Text>
        ) : null}
        {selected ? (
          <Ionicons name="checkmark" size={iconSize.md} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}

/**
 * Độ mờ của nét kẻ — gold thương hiệu pha loãng, KHÔNG phải một mã màu mới.
 *
 * Thang gold chỉ có ba bậc đặc (#d6a02c · #c4920f · #a9761a) rồi nhảy thẳng xuống `primaryLight`
 * (#fdf6e3) — thứ đó là màu NỀN, kẻ 1px bằng nó trên nền trắng thì mất hẳn. Không có bậc trung
 * gian, và nét kẻ này chỉ có ở app nên thêm một token vào `@xeprime/ui` là dựng một màu mà web
 * không dùng. Hạ độ mờ cho ra đúng sắc gold pha trắng đó mà vẫn treo vào một nguồn màu duy nhất:
 * đổi gold ở token thì nét kẻ đổi theo.
 */
const RULE_OPACITY = 0.2;

/**
 * Cả danh sách lựa chọn của một menu — kẻ một GẠCH GOLD giữa hai dòng kề nhau.
 *
 * Gạch nằm ở đây chứ không ở `MenuOption` vì dòng cuối không được có gạch: một nét kẻ dưới mục
 * cuối trông như còn mục nữa bị cắt mất, đúng lúc người dùng đang muốn biết danh sách hết chưa.
 * Chỉ dòng nào CÓ dòng kế mới cần nét ngăn với nó.
 *
 * Màu là gold thương hiệu `primary` hạ độ mờ (`RULE_OPACITY`) — xem ghi chú ở hằng đó.
 *
 * Cũng gom cả khoảng cách: `BottomSheet` giãn các con trực tiếp của nó 16px — đúng cho các KHỐI
 * của một biểu mẫu, nhưng ở đây nó thổi khoảng trắng vào giữa các dòng và nét kẻ mất luôn tác
 * dụng gom nhóm. Gói cả danh sách thành MỘT con thì nhịp bên trong do đây quyết định.
 */
export function MenuOptionList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);

  return (
    <YStack>
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) && row.key !== null ? row.key : index}>
          {index > 0 ? <YStack h={1} bg={colors.primary} opacity={RULE_OPACITY} /> : null}
          {row}
        </Fragment>
      ))}
    </YStack>
  );
}
