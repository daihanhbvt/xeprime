import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/**
 * `iconUrl` của danh mục là đường dẫn GỐC WEB (`/brands/toyota.webp`) — web đọc được vì cùng
 * origin, điện thoại thì không có host nào để tải. Ghép với địa chỉ bản web (nơi phục vụ
 * `public/brands`); URL tuyệt đối (admin tải logo lên R2) giữ nguyên.
 */
function absoluteIconUrl(iconUrl: string): string {
  if (/^https?:\/\//i.test(iconUrl)) return iconUrl;
  return `${resolveWebBaseUrl()}${iconUrl.startsWith('/') ? '' : '/'}${iconUrl}`;
}

/** Ô logo hãng 20×20, bo `radius.sm` — đúng `.logo` / `.monogram` của web `BrandMark`. */
const SIZE = 20;

const styles = StyleSheet.create({
  logo: { width: SIZE, height: SIZE, borderRadius: radius.sm },
});

/**
 * Logo hãng xe — bản native của web `BrandMark` (#222): logo do admin khai ở danh mục
 * (`catalog_items.icon_url`), lỗi tải hoặc chưa có thì hiện CHỮ CÁI ĐẦU trên nền vàng nhạt.
 *
 * Trước #222 app đọc bộ ảnh đóng gói sẵn theo khoá hãng; nay logo là DỮ LIỆU của danh mục — cùng
 * nguồn với web, admin thay logo là cả hai nơi đổi theo.
 */
export function BrandMark({ label, iconUrl }: { label: string; iconUrl?: string | null }) {
  const colors = useColors();
  // Nhớ URL đã lỗi chứ không nhớ cờ `true`: admin thay logo thì URL mới được thử lại (như web).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = useMemo(() => (iconUrl ? absoluteIconUrl(iconUrl) : null), [iconUrl]);

  if (!src || failedSrc === src) {
    return (
      <YStack w={SIZE} h={SIZE} br={radius.sm} bg={colors.primaryLight} ai="center" jc="center">
        <Text col={colors.primaryStrong} fos={fontSize.bodySm} fow={fontWeight.bold}>
          {label.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </YStack>
    );
  }

  return (
    <Image
      source={{ uri: src }}
      style={styles.logo}
      contentFit="contain"
      accessible={false}
      onError={() => setFailedSrc(src)}
    />
  );
}
