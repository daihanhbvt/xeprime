import { useState, type ReactNode } from 'react';
import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { colors } from '@/theme/tokens';
import { duration, easing } from '@/theme/motion';
import { Skeleton } from './Skeleton';

/** Ba trạng thái của MỘT tấm ảnh, tách hẳn khỏi trạng thái của truy vấn đã mang URL về. */
type Phase = 'pending' | 'ready' | 'failed';

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});

/**
 * Ảnh tải từ mạng, có ĐỦ ba trạng thái: đang tải · xong · hỏng.
 *
 * Danh sách về không có nghĩa là ẢNH về. `<Image>` vẽ một ô rỗng cho tới byte cuối, nên trên một
 * khung ảnh tràn viền nó đọc ra đúng như "thẻ trắng" — và khi URL hỏng hẳn (ảnh bị gỡ khỏi máy
 * chủ, bị chặn tần suất) thì ô rỗng đó ở lại vĩnh viễn, không ai biết là hỏng hay đang chờ.
 *
 * Ở đây: khung chờ có nhịp thở trong lúc tải, ảnh hiện dần khi xong, và `fallback` thế chỗ khi
 * hỏng — cùng thứ vẽ khi không có URL, nên hai ca đó trông giống nhau đúng như người dùng hiểu
 * chúng ("xe này chưa có ảnh").
 *
 * `recyclingKey` là thứ giữ ảnh KHỚP với hàng khi cuộn: `FlatList` tái dùng view, cùng một
 * `<Image>` native lần lượt phục vụ nhiều bản ghi, và không có khoá này thì nó giữ khung cũ hoặc
 * xoá trắng rồi đứng im.
 *
 * Ô đựng do NƠI GỌI quyết định (tỉ lệ, bề rộng, viền); component này phủ kín ô đó.
 *
 * Ghi chú: `BannerSlide` ở màn chủ còn một bản riêng cùng ý tưởng nhưng cố định kích thước và
 * không có nhánh hỏng — chuyển nó sang đây khi có dịp đụng vào màn đó.
 */
export function RemoteImage({
  uri,
  recyclingKey,
  fallback,
  contentFit = 'cover',
  radius,
  accessibilityLabel,
}: {
  uri?: string | null;
  recyclingKey?: string;
  /** Vẽ khi KHÔNG có URL, và khi tải hỏng. */
  fallback: ReactNode;
  contentFit?: ImageContentFit;
  radius?: number;
  accessibilityLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>('pending');
  /*
   * `phase` phải theo `uri`, không theo lượt gắn kết: một item `FlatList` tái dùng view (đổi
   * `recyclingKey` + `uri` mà KHÔNG unmount), và nếu ảnh cũ từng hỏng thì `failed` đứng lại mãi
   * cho một `uri` mới hoàn toàn hợp lệ — hoặc ngược lại, ảnh mới không có khung chờ vì `phase`
   * vẫn đọc `ready` từ ảnh trước. Chỉnh NGAY TRONG lượt render (không qua `useEffect`) để không
   * vẽ một khung hình thừa mang `phase` cũ trước khi effect kịp chạy.
   */
  const [renderedUri, setRenderedUri] = useState(uri);
  if (uri !== renderedUri) {
    setRenderedUri(uri);
    setPhase('pending');
  }

  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(phase === 'ready' ? 1 : 0, {
      duration: duration.base,
      easing: Easing.bezier(...easing.standard),
    }),
  }));

  if (!uri || phase === 'failed') {
    return (
      <YStack
        f={1}
        {...(radius === undefined ? {} : { br: radius })}
        bg={colors.surfaceMuted}
        ai="center"
        jc="center"
      >
        {fallback}
      </YStack>
    );
  }

  return (
    <YStack
      f={1}
      {...(radius === undefined ? {} : { br: radius })}
      bg={colors.surfaceMuted}
      ov="hidden"
    >
      {/* Khung chờ nằm DƯỚI ảnh và tắt khi ảnh xong — không nhấp nháy giữa hai lớp. */}
      {phase === 'pending' ? <Skeleton fill /> : null}

      <Animated.View style={[styles.fill, fade]}>
        <Image
          source={{ uri }}
          style={styles.fill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          {...(recyclingKey === undefined ? {} : { recyclingKey })}
          {...(accessibilityLabel === undefined ? { accessible: false } : { accessibilityLabel })}
          onLoad={() => setPhase('ready')}
          onError={() => setPhase('failed')}
        />
      </Animated.View>
    </YStack>
  );
}
