import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { MAP_PREVIEW_RATIO } from '@/lib/map-static';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: MAP_PREVIEW_RATIO },
  /* Lớp phủ "đang đổi vị trí" — phủ kín khung ảnh bản đồ, xem chú thích dưới. */
  busy: { ...StyleSheet.absoluteFillObject },
});

/**
 * Khung ẢNH BẢN ĐỒ TĨNH — bản native của `StaticMapImage` bên web, và là chỗ DUY NHẤT dựng khung đó.
 *
 * Ảnh do API vẽ hộ (Vietmap — ADR 0061 điều 1), không kéo, không phóng. Mọi bề mặt XEM một vị trí
 * đều đi qua đây: ô địa chỉ trong form (`ConfirmedPlaceField`), khối "Điểm nhận xe" ở trang xe và
 * khối địa chỉ xe ở Partner.
 *
 * ẢNH LỖI THÌ ẨN HẲN — khớp web: chưa cấu hình bản đồ, nhà cung cấp hỏng, mã địa điểm quá hạn
 * cache (API trả 404). Một khung ảnh vỡ tệ hơn không có khung nào; địa chỉ chữ và liên kết "Mở bằng
 * Google Maps" ở khối bao ngoài vẫn còn. Lỗi gắn với ĐÚNG `uri` đã hỏng: đổi sang điểm khác thì thử
 * lại từ đầu.
 *
 * Chạm được CHỈ KHI nơi gọi đưa `onOpen` (mở app bản đồ của máy để chỉ đường).
 *
 * ## Vì sao có một lớp PHỦ thay vì một khung chờ
 *
 * Bấm một gợi ý địa chỉ xong, ảnh không đổi ngay: trước nó còn một lượt `/places/detail`, rồi một
 * lượt tải ảnh mới. Suốt quãng đó ảnh CŨ vẫn nằm đó (`expo-image` giữ khung cũ tới byte cuối của
 * khung mới), nên bản đồ chỉ bị mờ đi dưới một lớp phủ có vòng xoay: thấy rõ là "đang đổi".
 */
export function MapPreview({
  uri,
  headers,
  busy = false,
  busyLabel,
  onOpen,
  openLabel,
  accessibilityLabel,
}: {
  uri: string;
  /** Header gửi kèm (Bearer cho `/branches/:id/map`). */
  headers?: Record<string, string>;
  /** Đang có một lượt gọi MẠNG sẽ đổi ảnh (tra chi tiết địa điểm). */
  busy?: boolean;
  busyLabel: string;
  onOpen?: () => void;
  openLabel?: string;
  /** Nội dung duy nhất trình đọc màn hình có được về tấm bản đồ. */
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (failedUri === uri) return null;

  /*
   * MỘT node cho cả hai chặng đợi — lượt gọi mạng (`busy`) rồi lượt tải ảnh (`pendingOverlay`).
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
        {...(headers ? { headers } : {})}
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        onError={() => setFailedUri(uri)}
        {...(busy ? {} : { pendingOverlay: busyOverlay })}
        fallback={null}
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
