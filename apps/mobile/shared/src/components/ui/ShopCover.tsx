import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { XP_TOKENS } from '@xeprime/ui';
import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/**
 * Ảnh HỎNG (bị gỡ khỏi máy chủ, URL sai) phải rơi về ĐÚNG hình chưa-có-ảnh, chứ không phải một
 * `<Image>` không vẽ được gì nằm im trên đó. `failed` không được đứng lại khi `url` vừa đổi sang
 * một địa chỉ khác — chỉnh NGAY TRONG lượt render (không qua `useEffect`) để không vẽ một khung
 * hình thừa mang cờ `failed` cũ trước khi effect kịp chạy.
 */
export function useImageLoadFailure(url: string | null | undefined) {
  const [failed, setFailed] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState(url);
  if (url !== renderedUrl) {
    setRenderedUrl(url);
    setFailed(false);
  }
  return { failed, onError: () => setFailed(true) };
}

/**
 * Chiều cao ảnh bìa — đúng `.cover { height: clamp(180px, 22.8vw, 328px) }` của web `ShopHeader`.
 * Ở bề ngang điện thoại 22,8vw < 180 nên ảnh bìa CAO 180 (mockup mobile); máy tính bảng mới cao dần.
 */
const COVER_MIN = 180;
const COVER_MAX = 328;
const COVER_VW = 0.228;

export function useShopCoverHeight(): number {
  const { width } = useWindowDimensions();
  return Math.min(COVER_MAX, Math.max(COVER_MIN, Math.round(width * COVER_VW)));
}

/*
 * Nền dự phòng khi chưa có/không tải được ảnh bìa — `--xp-hero-backdrop`
 * (`linear-gradient(120deg, #241d12, #3a2f1a)`): nâu tối, cố định ở cả hai giao diện. Đọc hai màu
 * từ token; góc 120° quy ra điểm đầu/cuối của `LinearGradient`.
 */
const HERO_BACKDROP = [...XP_TOKENS['hero-backdrop'].matchAll(/#[0-9a-f]{3,8}/gi)].map((m) => m[0]) as [
  string,
  string,
];
const HERO_START = { x: 0, y: 0.21 };
const HERO_END = { x: 1, y: 0.79 };

export const SHOP_LOGO = 72;
/** Vòng viền cùng màu nền trang, để logo tách khỏi ảnh bìa dù ảnh sáng hay tối. */
const LOGO_RING = 3;

const styles = StyleSheet.create({
  logoImage: { width: '100%', height: '100%' },
});

/**
 * Ảnh bìa + logo tròn của một gian hàng — MỘT hiện thực cho cả hai bề mặt:
 *
 *   - `ShopIdentityCard` (khu quản lý) — chủ shop sửa hai tấm ảnh này;
 *   - `ShopHeader` (trang gian hàng công khai) — khách nhìn thấy kết quả.
 *
 * Đây không phải chuyện gọn code. Khu quản lý là XEM TRƯỚC của trang công khai: hai bên lệch tỉ
 * lệ khung hay cỡ logo thì chủ shop căn ảnh vừa khít ở một nơi rồi thấy nó bị xén khác ở nơi
 * kia — và không có cách nào biết trước bên nào đúng. Từng có hai bản chép tay 2.2 và 8/3.
 *
 * `children` là lớp phủ của TỪNG bề mặt (viên máy ảnh khi sửa được, hình `image-outline` khi
 * chỉ đọc); phần khung, nền và cách xén ảnh thì không bên nào được tự đặt lại.
 *
 * `ShopProfileSkeleton`/`ShopDetailSkeleton` dựng khung chờ theo đúng hai hằng trên.
 */
export function ShopCover({ url, children }: { url?: string | null; children?: ReactNode }) {
  const { failed, onError } = useImageLoadFailure(url);
  const showImage = Boolean(url) && !failed;
  const height = useShopCoverHeight();

  return (
    /* Vùng ảnh bìa — web `.cover`: rộng hết trang, cao clamp(180, 22.8vw, 328), nền `hero-backdrop`. */
    <YStack w="100%" h={height} ai="center" jc="center" ov="hidden">
      <LinearGradient
        colors={HERO_BACKDROP}
        start={HERO_START}
        end={HERO_END}
        style={StyleSheet.absoluteFill}
      />
      {showImage ? (
        <Image
          source={{ uri: url as string }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
          onError={onError}
        />
      ) : null}
      {children}
    </YStack>
  );
}

/**
 * Logo tròn, ĐÈ lên nửa dưới ảnh bìa — nơi gọi tự đặt `mt={-SHOP_LOGO / 2}` cho hàng chứa nó,
 * vì hai bề mặt xếp hàng đó khác nhau (khu quản lý còn nhét nút sang trang công khai vào cùng
 * hàng).
 *
 * Chưa có logo thì hiện CHỮ CÁI ĐẦU trên nền thương hiệu, không phải một ô xám: gian hàng mới
 * mở chưa kịp tải logo vẫn phải có một dấu nhận diện, và web làm đúng như vậy.
 */
export function ShopLogo({
  url,
  name,
  children,
}: {
  url?: string | null;
  name: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  const { failed, onError } = useImageLoadFailure(url);
  const showImage = Boolean(url) && !failed;

  return (
    <YStack
      w={SHOP_LOGO}
      h={SHOP_LOGO}
      br={radius.pill}
      bw={LOGO_RING}
      bc={colors.background}
      bg={colors.primary}
      ai="center"
      jc="center"
      ov="hidden"
    >
      {showImage ? (
        <Image
          source={{ uri: url as string }}
          style={styles.logoImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
          onError={onError}
        />
      ) : (
        <Text col={colors.onPrimary} fos={fontSize.h2} fow={fontWeight.bold}>
          {name.trim().charAt(0).toLocaleUpperCase() || '?'}
        </Text>
      )}
      {children}
    </YStack>
  );
}
