import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dimensions, Keyboard, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  KeyboardState,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { FocusRevealProvider, revealFocusedInput } from './focus-reveal';
import { layout } from '@/theme/layout';
import { colors, space } from '@/theme/tokens';

/**
 * Đệm thêm dưới nội dung KHI bàn phím mở.
 *
 * Không có nó thì ô CUỐI trang không cuộn lên được: cuộn tối đa bị chặn bởi chiều cao nội dung,
 * mà ô cuối gần như chạm đáy nội dung — `scrollTo` bị kẹp lại và ô vẫn nằm dưới bàn phím.
 */
const KEYBOARD_TAIL = space.xl;

/**
 * Nhịp báo vị trí cuộn. Handler chỉ ghi một số vào ref (không render lại), nhưng vẫn là một lần
 * gọi qua cầu JS mỗi nhịp — 100ms đủ để giữ con số gần đúng mà không bám theo từng khung hình.
 */
const SCROLL_REPORT_MS = 100;

/**
 * Mép trên bàn phím, quy về HỆ TOẠ ĐỘ CỬA SỔ.
 *
 * `keyboardDidShow` trả `endCoordinates.screenY` — đo từ mép trên MÀN HÌNH. Mọi phép đo
 * còn lại ở đây dùng `measureInWindow` — đo từ mép trên CỬA SỔ. Trên Android hai gốc đó
 * KHÔNG trùng nhau: cửa sổ của ứng dụng thường bắt đầu dưới thanh trạng thái, nên cùng một
 * vật thể mang hai con số lệch nhau đúng bằng chiều cao thanh đó.
 *
 * Đo thật trên một máy Android: `windowH=853` trong khi bàn phím khai `screenY=550`. Vòng bù
 * so thẳng `footerBottom=550` với `550` rồi kết luận `hidden=0` — khớp hoàn hảo, và thanh soạn
 * tin vẫn nằm dưới bàn phím trên màn. Cơ chế không sai; nó so hai thứ không cùng thước đo.
 *
 * Quy đổi qua CHIỀU CAO bàn phím, không qua vị trí: chiều cao là con số giống nhau ở cả hai
 * hệ, và đáy cửa sổ luôn trùng đáy màn hình (thanh trạng thái nằm ở TRÊN). Lấy hiệu vị trí
 * thì phải biết cửa sổ bắt đầu từ đâu — thứ không API nào trả lời chắc chắn dưới chế độ
 * edge-to-edge.
 *
 * iOS: hai hệ vốn trùng nhau nên phép quy đổi trả về đúng `screenY` — không đổi hành vi.
 */
export function keyboardTopInWindow(screenY: number, windowH: number, screenH: number): number {
  // Số đo vô lý (chưa có kích thước, xoay màn giữa chừng) ⇒ giữ nguyên hành vi cũ.
  if (!(windowH > 0) || !(screenH > 0) || screenH < windowH) return screenY;
  return windowH - (screenH - screenY);
}

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly Edge[];
  centered?: boolean;
  /**
   * Đặt `false` cho màn danh sách tràn viền (FlatList kẻ phân cách sát mép).
   *
   * Có prop này vì `Screen` gánh hai việc khác nhau: an toàn viền + bàn phím là CẤU TRÚC,
   * còn lề trang là TRÌNH BÀY. Không tách được thì màn đầu tiên cần tràn viền sẽ bỏ luôn
   * `Screen` — và mất theo cả safe area lẫn xử lý bàn phím.
   */
  padded?: boolean;
  /**
   * Thanh cố định dưới đáy, NGOÀI vùng cuộn và trong lớp tránh bàn phím.
   *
   * ⚠️ Đệm dọc của khung này (`styles.footer`) KHÔNG phải thứ trang trí thừa: nó là biên an
   * toàn cho sai số của `KeyboardAvoidingView` trên Android edge-to-edge. Đã thử bỏ nó cho thanh
   * soạn tin nhắn — bàn phím Samsung (có thanh công cụ emoji phía trên) liền che mất hai phần ba
   * ô nhập. Nội dung footer muốn gọn hơn thì bỏ đệm CỦA CHÍNH NÓ, đừng bỏ đệm ở đây.
   */
  footer?: ReactNode;
  /**
   * Kéo-xuống-làm-mới. Truyền cả hai thì màn có thao tác này, thiếu một là không.
   *
   * Ở đây chứ không phải ở từng màn: mỗi màn tự dựng `ScrollView` riêng để nhét
   * `RefreshControl` là mất luôn safe area và xử lý bàn phím của `Screen` — đúng cái bẫy mà
   * component này sinh ra để chặn.
   */
  refreshing?: boolean;
  /**
   * Có `onRefresh` hay không là quyết định MỘT LẦN cho vòng đời màn — đừng bật/tắt theo state.
   *
   * React Native chỉ bọc `AndroidSwipeRefreshLayout` quanh `ScrollView` khi có `refreshControl`;
   * cho prop này lúc có lúc không là đổi cây view gốc, và `ScrollView` bị dựng lại — ô đang gõ
   * mất tiêu điểm, bàn phím sập, màn nhảy về đầu. Muốn tạm ngưng làm mới thì để `onRefresh` nằm
   * yên và tự bỏ qua bên trong.
   */
  onRefresh?: () => void;
  /**
   * Ref tới `ScrollView` của màn — cho màn cần CUỘN TỚI một khối của chính nó (bản native của một
   * liên kết `#anchor` bên web). Chỉ đọc để gọi `scrollTo`; bàn phím và vị trí cuộn vẫn do
   * `Screen` giữ. Bỏ qua khi `scroll={false}`.
   */
  scrollRef?: RefObject<ScrollView | null>;
}

/**
 * Gom safe area + tránh bàn phím + cuộn vào một chỗ vì luôn có một cái bị quên: thiếu
 * `SafeAreaView` là chữ chui vào tai thỏ, thiếu `KeyboardAvoidingView` là bàn phím che ô
 * nhập, thiếu `keyboardShouldPersistTaps` là phải chạm hai lần mới bấm được nút.
 */
export function Screen({
  children,
  scroll = true,
  edges,
  centered = false,
  padded = true,
  footer,
  refreshing = false,
  onRefresh,
  scrollRef,
}: ScreenProps) {
  /**
   * Chiều cao bàn phím đọc từ WINDOW INSET, không từ sự kiện `keyboardDidShow`.
   *
   * Ba vòng chẩn đoán trên máy thật (21/09/2026) đều cho ra những con số tự chúng hợp lý —
   * `footerBottom` đúng bằng `keyboardTop`, `hidden=0`, thanh soạn tin cao đủ 73dp — trong khi
   * trên màn nó vẫn bị bàn phím cắt mất khoảng 34dp. Nghĩa là `endCoordinates.screenY` mô tả
   * một khung KHÁC với vùng bàn phím thật sự chiếm, và mọi phép bù dựa trên nó đều bù đúng
   * một con số sai.
   *
   * `useAnimatedKeyboard` của Reanimated đọc `WindowInsetsCompat.Type.ime()` — chính con số
   * hệ thống dùng để chừa chỗ cho bàn phím, gồm cả dải công cụ của bộ gõ lẫn phần nó phủ lên
   * thanh điều hướng. Reanimated đã là module native có sẵn trong bản build, nên đây không
   * phải thêm một phụ thuộc mới.
   */
  const keyboard = useAnimatedKeyboard();
  /** Giá trị đã đẩy sang JS lần gần nhất — chốt chặn để không gọi lại với cùng con số. */
  const lastPushed = useSharedValue(-1);
  const insets = useSafeAreaInsets();
  /**
   * Trừ phần safe area ĐÁY: `SafeAreaView` đã chừa sẵn dải điều hướng, còn inset của bàn phím
   * đo từ mép dưới CÙNG của cửa sổ. Không trừ thì một dải trống bằng đúng thanh điều hướng
   * nằm lại giữa bàn phím và ô nhập.
   */
  const keyboardPad = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value - insets.bottom, 0),
  }));
  /* Bản JS của cùng con số — phần cuộn và vòng bù chạy trên luồng JS nên cần một state thật. */
  const [imeHeight, setImeHeight] = useState(0);
  const imeHeightRef = useRef(0);
  /*
   * Ghi ref TRONG callback, không giữa lúc render: listener bàn phím đọc giá trị mới nhất qua
   * ref nên không phải dựng lại mỗi lần chiều cao đổi, còn ghi ref lúc render là thứ React
   * Compiler chặn — và cũng sai về thời điểm.
   */
  const applyImeHeight = useCallback((next: number) => {
    imeHeightRef.current = next;
    setImeHeight(next);
  }, []);
  /*
   * Chỉ đẩy sang luồng JS khi bàn phím ĐÃ ĐỨNG YÊN.
   *
   * `keyboard.height` đổi ở MỌI khung hình của animation bung/thu. Gọi `runOnJS` theo từng
   * khung nghĩa là một lượt `setState` — và một lượt render cả cây màn hình — trên mỗi khung,
   * đúng lúc luồng JS phải rảnh nhất. Đó chính là cái giật khi bàn phím lên xuống.
   *
   * Phần ĐỆM vẫn chạy mượt theo từng khung, vì nó nằm ở `useAnimatedStyle` trên luồng UI và
   * không đi qua JS. Thứ duy nhất cần con số bằng JS là phép cuộn ô đang gõ vào tầm nhìn, và
   * phép đó chỉ có nghĩa khi bàn phím đã tới nơi.
   */
  useDerivedValue(() => {
    const settled =
      keyboard.state.value === KeyboardState.OPEN || keyboard.state.value === KeyboardState.CLOSED;
    if (!settled) return;
    // Cùng một giá trị thì không đánh thức JS: trạng thái OPEN giữ nguyên qua nhiều khung.
    if (keyboard.height.value === lastPushed.value) return;
    lastPushed.value = keyboard.height.value;
    runOnJS(applyImeHeight)(keyboard.height.value);
  });
  /** Đệm đuôi nội dung khi bàn phím đang mở — xem {@link KEYBOARD_TAIL}. */
  const [keyboardTail, setKeyboardTail] = useState(0);

  /**
   * Bàn phím mở lên KHÔNG tự kéo ô đang gõ vào tầm nhìn — đây là việc phải tự làm.
   *
   * `KeyboardAvoidingView` chỉ CO vùng nhìn thấy lại (để thanh `footer` không bị che); nội dung
   * trong `ScrollView` đứng yên, nên ô nằm ở nửa dưới trang lọt xuống dưới mép bàn phím và người
   * dùng gõ mù. React Native không có auto-scroll cho việc này: `ScrollView` chỉ phơi ra hàm cuộn
   * theo lệnh, còn `automaticallyAdjustKeyboardInsets` là của riêng iOS và sẽ cộng chồng lên phần
   * mà `KeyboardAvoidingView` đã co.
   *
   * Trên Android `softwareKeyboardLayoutMode: "resize"` cũng không cứu được: từ Expo SDK 53 ứng
   * dụng chạy edge-to-edge, cửa sổ KHÔNG còn tự co lại theo bàn phím nữa.
   *
   * Đo bằng toạ độ CỬA SỔ cho cả hai đầu (ô nhập và mép bàn phím) — cùng một hệ quy chiếu, nên
   * không phải bù chiều cao thanh trên như phép tính nội-dung-tương-đối của `ScrollView`.
   */
  const scroller = useRef<ScrollView>(null);
  /*
   * Ref gộp: `Screen` cần `ScrollView` cho việc tránh bàn phím, màn gọi (tuỳ chọn) cần nó để cuộn
   * tới một khối của chính nó. `useCallback` để React không gọi lại ref mỗi lần render.
   */
  const attachScroller = useCallback(
    (node: ScrollView | null) => {
      scroller.current = node;
      if (scrollRef) scrollRef.current = node;
    },
    [scrollRef],
  );
  const scrollY = useRef(0);

  /** Mép trên bàn phím trong hệ CỬA SỔ — `null` khi bàn phím đang đóng. */
  const keyboardTop = useRef<number | null>(null);

  const reveal = useCallback((top: number) => {
    revealFocusedInput(scroller.current, scrollY.current, top);
  }, []);

  /**
   * Cùng việc đó nhưng dùng mép bàn phím ĐÃ BIẾT — cho ô nhập gọi khi NHẬN TIÊU ĐIỂM.
   *
   * `keyboardDidShow` chỉ bắn lúc bàn phím BẬT LÊN. Chuyển tiêu điểm từ ô này sang ô khác trong
   * lúc bàn phím đang mở thì Android không bắn lại, iOS chỉ bắn khi hình dạng bàn phím đổi — nên
   * ô cuối form, thứ người dùng chạm sau khi đã gõ ô trên, nằm im dưới bàn phím.
   *
   * Bàn phím đang đóng thì không làm gì: `keyboardDidShow` sắp bắn và sẽ lo. Đợi một khung hình
   * để `KeyboardAvoidingView` và phần nâng `footer` áp xong đệm của chúng — không thì `scrollTo`
   * bị kẹp lại theo chiều cao nội dung CŨ.
   */
  const revealOnFocus = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) return;
    requestAnimationFrame(() => reveal(top));
  }, [reveal]);

  /*
   * ĐO LẠI mỗi lần bàn phím bật lên: `onLayout` chỉ bắn lúc dựng và `measureInWindow` trả về bất
   * đồng bộ, nên màn mở bàn phím ngay lúc mount (ô OTP `autoFocus`) chạy lần tránh đầu tiên với
   * offset 0 — ô vẫn nằm dưới bàn phím, và không layout nào bắn thêm để tự sửa.
   */
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      /*
       * Đọc lại kích thước ở MỖI lần bàn phím bật: xoay màn, chia đôi màn hình và chế độ cửa
       * sổ nổi đều đổi cả hai con số, và một giá trị chụp lúc mount sẽ sai im lặng sau đó.
       */
      const windowH = Dimensions.get('window').height;
      const screenH = Dimensions.get('screen').height;
      /*
       * Sự kiện chỉ còn dùng làm TÍN HIỆU "bàn phím vừa mở"; con số thì lấy từ inset. Giữ lại
       * phép quy đổi cũ làm vế dự phòng cho lúc inset chưa kịp về (khung hình đầu tiên).
       */
      const top =
        imeHeightRef.current > 0
          ? windowH - imeHeightRef.current
          : keyboardTopInWindow(event.endCoordinates.screenY, windowH, screenH);

      /*
       * Đuôi đệm chỉ có nghĩa với màn CUỘN — nó nằm trong `contentContainerStyle` của
       * `ScrollView`. Màn không cuộn (chat) mà vẫn gọi `setKeyboardTail` là một lượt render cả
       * cây, đúng vào khung hình bàn phím vừa mở xong, để ghi một giá trị không ai đọc.
       */
      if (scroll) setKeyboardTail(KEYBOARD_TAIL);
      reveal(top);
      keyboardTop.current = top;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (scroll) setKeyboardTail(0);
      keyboardTop.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal, scroll]);

  /*
   * Chiều cao bàn phím ĐỔI trong lúc nó đang mở: đổi bộ gõ, bật dải gợi ý, xoay máy. Sự kiện
   * `keyboardDidShow` không bắn lại ở những ca đó, nên nếu chỉ nghe sự kiện thì mép trên bàn
   * phím đứng lại ở giá trị cũ và ô nhập lệch đúng phần vừa đổi.
   */
  useEffect(() => {
    if (imeHeight <= 0) return;
    keyboardTop.current = Dimensions.get('window').height - imeHeight;
  }, [imeHeight]);

  const contentStyle = [
    styles.content,
    padded ? styles.padded : null,
    centered ? styles.centered : null,
  ];

  const body = scroll ? (
    <ScrollView
      ref={attachScroller}
      contentContainerStyle={[
        contentStyle,
        keyboardTail > 0 ? { paddingBottom: (padded ? space.lg : 0) + keyboardTail } : null,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // Ghi vào ref, không vào state — vị trí cuộn chỉ cần cho lần cuộn tới ô đang gõ.
      onScroll={(event) => {
        scrollY.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={SCROLL_REPORT_MS}
      {...(onRefresh
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primaryActive}
              />
            ),
          }
        : {})}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[contentStyle, styles.flex]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.flex} {...(edges ? { edges } : {})}>
      {/*
        CÙNG cơ chế với `BottomSheet` (`behavior="padding"` cho cả hai nền), cộng thêm thứ tấm
        trượt không cần: `keyboardVerticalOffset`.

        `KeyboardAvoidingView` đẩy nội dung lên bằng "chiều cao bàn phím trừ phần màn hình nằm
        DƯỚI khung của nó" — phép trừ đó chỉ đúng khi khung bắt đầu từ mép trên cửa sổ. Tấm trượt
        thoả vì nó là gốc của một `Modal`; `Screen` thì KHÔNG, `AppHeader` là anh em đứng trên nó,
        nên khung hụt đúng chiều cao thanh đó cộng safe area và ô cuối màn vẫn nằm dưới bàn phím.
      */}
      <Animated.View style={[styles.flex, keyboardPad]}>
        {/*
          Lớp bọc chỉ để mang phần NÂNG. Không đặt được lên chính `KeyboardAvoidingView`: nó tự
          ghi `paddingBottom` của mình đè lên style truyền vào. Nâng ở đây kéo cả thân lẫn thanh
          dưới lên, và dải trống sinh ra nằm SAU bàn phím nên không ai nhìn thấy.
        */}
        <FocusRevealProvider reveal={revealOnFocus}>
          {body}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </FocusRevealProvider>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    gap: space.md,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.lg,
  },
  centered: {
    justifyContent: 'center',
  },
  footer: {
    backgroundColor: colors.surfaceElevated,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
});
