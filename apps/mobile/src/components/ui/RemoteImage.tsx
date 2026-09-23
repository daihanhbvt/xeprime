import { useState, type ReactNode } from 'react';
import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import { mapDebug } from '@/lib/map-debug';
import { colors } from '@/theme/tokens';
import { duration } from '@/theme/motion';
import { Skeleton } from './Skeleton';

/** Ba trạng thái của MỘT tấm ảnh, tách hẳn khỏi trạng thái của truy vấn đã mang URL về. */
type Phase = 'pending' | 'ready' | 'failed';

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});

/**
 * Hiện dần do CHÍNH `expo-image` chạy, không phải Reanimated.
 *
 * Bản trước bọc ảnh trong một `Animated.View` với `useAnimatedStyle` + `withTiming`. Trên một
 * thẻ đứng yên thì hai cách nhìn giống nhau, nhưng trong DANH SÁCH CUỘN thì không: mỗi hàng
 * đang sống là thêm một shared value và một mapper chạy mỗi khung hình trên luồng UI, và hàng
 * mới thì dựng thêm một bộ nữa ĐÚNG LÚC đang cuộn — tức là đúng lúc luồng UI bận nhất. Với
 * `windowSize: 7` con số đó là vài chục bộ cùng lúc.
 *
 * `transition` của `expo-image` làm cùng việc ấy ở tầng native, không đi qua JS và không đi qua
 * Reanimated: không có gì để dựng khi hàng mới vào, không có gì phải gỡ khi hàng ra.
 */
const FADE_IN = { duration: duration.base, effect: 'cross-dissolve' } as const;

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
  pendingOverlay,
}: {
  uri?: string | null;
  recyclingKey?: string;
  /** Vẽ khi KHÔNG có URL, và khi tải hỏng. */
  fallback: ReactNode;
  contentFit?: ImageContentFit;
  radius?: number;
  accessibilityLabel?: string;
  /**
   * Vẽ TRÊN ảnh trong lúc THAY một ảnh đã hiện được bằng ảnh khác — cố ý không áp cho lượt tải
   * đầu.
   *
   * Lượt đầu đã có khung chờ nằm dưới, và ô thì đang trống nên không có gì để che. Lượt THAY thì
   * ngược lại: `expo-image` giữ nguyên ảnh cũ cho tới byte cuối của ảnh mới, nên ô trông y như
   * đã xong trong khi nó đang tải — và người dùng đọc quãng đó ra "chạm không ăn". Nơi gọi nào
   * cần nói ra quãng ấy (ảnh bản đồ đổi sang vị trí khác) thì đưa lớp phủ vào đây; nơi nào không
   * cần (thẻ xe trong danh sách cuộn) giữ nguyên nếp cũ, không thêm một lớp nào.
   */
  pendingOverlay?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>('pending');
  /**
   * Ảnh trong instance này ĐÃ từng hiện được hay chưa — mốc phân biệt lượt tải ĐẦU với lượt THAY.
   *
   * Cố ý KHÔNG bị `uri` đổi dọn về `false`: nó nói về cái Ô, không về tấm ảnh. Ô đã có gì để
   * nhìn thì mọi lượt thay sau đó đều là một lượt THAY, dù thay bao nhiêu lần.
   */
  const [shown, setShown] = useState(false);
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

      <Image
        source={{ uri }}
        style={styles.fill}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        transition={FADE_IN}
        {...(recyclingKey === undefined ? {} : { recyclingKey })}
        {...(accessibilityLabel === undefined ? { accessible: false } : { accessibilityLabel })}
        onLoad={() => {
          setShown(true);
          setPhase('ready');
        }}
        /*
         * Một ảnh hỏng chỉ để lại `fallback` trên màn — không mã lỗi, không URL, không gì để
         * lần. Ghi lại ở mức DEV: đây là nửa thứ hai của chẩn đoán bản đồ (nửa đầu là
         * `mapDebug.urlNull`), và nó phân biệt "app không dựng nổi URL" với "URL đúng nhưng
         * mạng/khoá từ chối" — hai nguyên nhân sửa bằng hai cách hoàn toàn khác nhau.
         */
        onError={() => {
          mapDebug.imageFailed(uri);
          setPhase('failed');
        }}
      />

      {/* Lớp phủ của lượt THAY — nằm trên ảnh cũ, không thay chỗ nó. Xem `pendingOverlay`. */}
      {phase === 'pending' && shown ? pendingOverlay : null}
    </YStack>
  );
}
