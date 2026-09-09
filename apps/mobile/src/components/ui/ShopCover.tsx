import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius } from '@/theme/tokens';

/**
 * Ảnh HỎNG (bị gỡ khỏi máy chủ, URL sai) phải rơi về ĐÚNG hình chưa-có-ảnh, chứ không phải một
 * `<Image>` không vẽ được gì nằm im trên đó. `failed` không được đứng lại khi `url` vừa đổi sang
 * một địa chỉ khác — chỉnh NGAY TRONG lượt render (không qua `useEffect`) để không vẽ một khung
 * hình thừa mang cờ `failed` cũ trước khi effect kịp chạy.
 */
function useImageLoadFailure(url: string | null | undefined) {
  const [failed, setFailed] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState(url);
  if (url !== renderedUrl) {
    setRenderedUrl(url);
    setFailed(false);
  }
  return { failed, onError: () => setFailed(true) };
}

/**
 * Tỉ lệ khung ảnh bìa — CAO hơn một chút so với tỉ lệ đề xuất 1600×600 (2,67).
 *
 * Khung đúng 2,67 thì một tấm ảnh chụp thường (16:9, 4:3) bị `contentFit="cover"` xén mất trên
 * và dưới, mà đó lại là chỗ chứa nội dung của ảnh bìa — mái hiên, biển hiệu, hàng xe. Khung cao
 * hơn đổi phần mất đó lấy một dải hẹp hai BÊN của tấm ảnh đúng chuẩn: ảnh bìa vốn chụp rộng nên
 * mép trái/phải là chỗ rẻ nhất để cắt.
 *
 * Sàn dưới là chỗ logo: logo đè lên NỬA DƯỚI ảnh bìa, nên khung thấp hơn cỡ 1,7 thì nửa logo
 * ăn gần hết phần ảnh còn nhìn được, và ảnh bìa thành một dải màu sau lưng logo.
 */
export const SHOP_COVER_RATIO = 1.9;

export const SHOP_LOGO = 72;
/** Vòng viền cùng màu nền trang, để logo tách khỏi ảnh bìa dù ảnh sáng hay tối. */
const LOGO_RING = 3;

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: SHOP_COVER_RATIO },
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

  return (
    <YStack style={styles.cover} bg={colors.primaryLight} ai="center" jc="center" ov="hidden">
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
