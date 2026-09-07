import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Nhãn của một KHỐI bên trong thẻ — nhỏ, viết hoa, mờ, có vạch gold dẫn đầu.
 *
 * Ở `components/ui/` chứ không nằm trong từng màn: đây là thứ quyết định "một thẻ trông thế nào"
 * ở khu quản lý, và khi mỗi màn tự vẽ tiêu đề riêng thì cùng một trang có chỗ viết hoa nhỏ, chỗ
 * viết thường cỡ lớn — đúng lỗi đã thấy giữa các thẻ của Hồ sơ 360 và thẻ gửi duyệt.
 *
 * Viết hoa ở đây chứ không viết hoa trong file message: HOA/thường là quyết định TRÌNH BÀY, còn
 * message là nội dung. Bắt bộ dịch giữ sẵn chữ hoa thì tiếng Anh mất luôn khả năng đổi cách.
 *
 * `action` là ô bên PHẢI cùng hàng — chỗ của một liên kết đi tới màn quản lý đầy đủ của khối đó
 * ("Quản lý giấy tờ", "Chỉnh sửa giá"), đúng vai `extra` của `<Card>` bên web. Nằm ở đây chứ
 * không để mỗi màn tự dựng: một hàng tiêu đề có nút phải luôn là hàng tiêu đề, không phải một
 * hàng khác.
 */
export function BlockTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    /*
      Tiêu đề và ĐƯỜNG KẺ đi liền nhau thành một khối.

      Không có đường kẻ thì tiêu đề chỉ là một dòng chữ nhỏ nằm sát nội dung, và ở một màn dài
      như hồ sơ xe (mười mấy thẻ) mắt không tìm ra ranh giới giữa hai khối. Kẻ CÙNG màu vàng với
      vạch dẫn đầu: vàng nhạt ở độ dày 1px gần như tàng hình trên nền thẻ trắng.

      **Ba khoảng bằng nhau, đều `space.md`** — mép thẻ → tiêu đề, tiêu đề → đường kẻ, đường kẻ →
      nội dung. Chữ tiêu đề nằm giữa hai đường (mép thẻ và đường kẻ), nên lệch một trong ba là cả
      dải đọc ra như bị đẩy về một phía.

      - mép thẻ → tiêu đề: đệm của `Card` (`space.md`), không do file này đặt
      - tiêu đề → đường kẻ: `gap` dưới đây
      - đường kẻ → nội dung: `pb` dưới đây **cộng** `gap` của stack cha

      Vế thứ ba là chỗ dễ vỡ: `pb` một mình không đủ, nó phải cộng với khoảng cách mà stack cha
      tự chèn giữa hai con. Thẻ chuẩn dùng `gap={space.sm}` nên `pb` cũng là `space.sm` → tổng
      `space.md`. Ba khối con của `BookingDetailScreen` nằm trên nền mờ dùng `gap={space.xs}` và
      ra 12pt — chúng là panel lồng bên trong, nhịp chặt hơn là đúng, không phải lỗi.

      Đổi đệm của `Card`, hay đổi `gap` của thẻ, thì phải tính lại cả cụm này.
    */
    <YStack gap={space.md} pb={space.sm}>
      <XStack ai="center" gap={space.xs}>
        <YStack w={3} h={iconSize.sm} br={radius.pill} bg={colors.primary} />
        {/*
          `flexShrink` phải khai TƯỜNG MINH: trong React Native nó mặc định là 0, không phải 1
          như CSS. Thiếu nó thì một tiêu đề dài ("CHỈ SỐ KILOMETER HIỆN TẠI (ODO)") giữ nguyên
          bề rộng tự nhiên và đẩy `action` bên phải tràn khỏi thẻ, thay vì tự xuống dòng.
        */}
        <Text
          flexShrink={1}
          col={colors.textMuted}
          fos={fontSize.label}
          fow={fontWeight.semibold}
        >
          {children.toUpperCase()}
        </Text>
        {action ? (
          <>
            <YStack f={1} />
            {action}
          </>
        ) : null}
      </XStack>
      <YStack h={1} bg={colors.primary} />
    </YStack>
  );
}

/**
 * Liên kết nhỏ nằm bên phải một `BlockTitle` — bản native của `styles.cardLink` bên web.
 *
 * `hitSlop` chứ không phải chiều cao 44pt: vùng chạm phải đủ ngón tay, nhưng nếu ép bằng
 * `minHeight` thì hàng tiêu đề cao gấp đôi mọi hàng tiêu đề khác và cả trang so le. `hitSlop`
 * nới vùng nhận chạm RA NGOÀI mà không đụng tới bố cục.
 */
export function BlockLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={BLOCK_LINK_HIT_SLOP}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Nới vùng chạm lên ~44pt mà không làm hàng tiêu đề cao thêm. */
const BLOCK_LINK_HIT_SLOP = { top: space.sm, bottom: space.sm, left: space.sm, right: space.sm };
