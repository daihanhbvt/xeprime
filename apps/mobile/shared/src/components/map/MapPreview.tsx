import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { MAP_PREVIEW_RATIO } from '@/lib/map-static';
import { colors, fontSize, radius } from '@/theme/tokens';

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: MAP_PREVIEW_RATIO },
  /* Lớp phủ "đang đổi vị trí" — phủ kín khung ảnh bản đồ, xem chú thích dưới. */
  busy: { ...StyleSheet.absoluteFillObject },
});

/**
 * Khung ẢNH BẢN ĐỒ TĨNH — bản native của `StaticMap` bên web, và là chỗ DUY NHẤT dựng khung đó.
 *
 * Mọi bề mặt chỉ để XEM một vị trí đều đi qua đây: ô địa chỉ trong form (`AddressFields`) và
 * khối "Điểm nhận xe" ở trang xe. Lặp khối ảnh ở từng nơi là từng đó chỗ để bo góc, viền, tỉ lệ
 * và nhánh ảnh hỏng trôi khỏi nhau — đúng thứ đã xảy ra khi trang xe không có bản đồ nào cả.
 *
 * Chạm được CHỈ KHI nơi gọi đưa `onOpen` — tức chỉ khi có một vị trí THẬT để mở tới. Một vùng
 * chạm dẫn tới tâm tỉnh là hứa sai về thứ người dùng vừa chạm.
 *
 * ## Vì sao có một lớp PHỦ thay vì một khung chờ
 *
 * Bấm một gợi ý địa chỉ xong, ghim không nhảy ngay: trước nó còn một lượt `/places/detail` lấy
 * toạ độ, rồi một lượt tải ảnh bản đồ mới — cộng lại là hai ba giây trên mạng 3G. Suốt quãng đó
 * ảnh CŨ vẫn nằm đó trọn vẹn (`expo-image` giữ khung cũ tới byte cuối của khung mới), nên khung
 * bản đồ trông y như đã xong việc trong khi nó chưa: người dùng đọc ra là cú chạm bị trượt, và
 * bấm lại.
 *
 * Thay ảnh bằng khung chờ thì mất luôn bản đồ — ô trắng giữa form, tệ hơn hẳn. Nên bản đồ ở lại
 * và chỉ bị mờ đi dưới một lớp phủ có vòng xoay: thấy rõ là "đang đổi", mà vẫn còn thứ để đối
 * chiếu khi nó đổi xong.
 */
export function MapPreview({
  uri,
  unavailableLabel,
  busy = false,
  busyLabel,
  onOpen,
  openLabel,
}: {
  uri: string;
  unavailableLabel: string;
  /**
   * Đang có một lượt gọi MẠNG sẽ dời ghim (tra chi tiết địa điểm) — `uri` còn là của vị trí cũ,
   * nên không có gì trong tấm ảnh nói được rằng có việc đang chạy.
   */
  busy?: boolean;
  busyLabel: string;
  onOpen?: () => void;
  openLabel?: string;
}) {
  /*
   * MỘT node cho cả hai chặng đợi — lượt gọi mạng (`busy`) rồi lượt tải ảnh (`pendingOverlay`).
   * Hai chặng nối nhau liền mạch nên chúng phải trông giống nhau; hai node riêng là hai chỗ để
   * độ mờ và cỡ vòng xoay trôi khỏi nhau.
   */
  const busyOverlay = (
    <YStack
      style={styles.busy}
      bg={colors.overlay}
      ai="center"
      jc="center"
      accessibilityRole="progressbar"
      accessibilityLabel={busyLabel}
    >
      <ActivityIndicator color={colors.primaryActive} />
    </YStack>
  );

  const frame = (
    <YStack style={styles.frame} br={radius.md} bw={1} bc={colors.border} ov="hidden">
      <RemoteImage
        uri={uri}
        radius={radius.md}
        /*
         * Đang chờ mạng thì lớp phủ đã do `MapPreview` vẽ — đưa thêm một bản vào `RemoteImage`
         * là hai lớp cùng nằm đó và nền tối gấp đôi ở đúng nhịp giao giữa hai chặng.
         */
        {...(busy ? {} : { pendingOverlay: busyOverlay })}
        fallback={
          <Text col={colors.textMuted} fos={fontSize.label}>
            {unavailableLabel}
          </Text>
        }
      />
      {busy ? busyOverlay : null}
    </YStack>
  );

  if (!onOpen) return frame;
  return (
    <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={openLabel}>
      {frame}
    </Pressable>
  );
}
