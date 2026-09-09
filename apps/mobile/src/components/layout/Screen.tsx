import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { layout } from '@/theme/layout';
import { colors, space } from '@/theme/tokens';

/** Khoảng thở giữa đáy ô đang gõ và mép trên bàn phím. */
const KEYBOARD_GAP = space.md;

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
}: ScreenProps) {
  /**
   * Khoảng cách từ MÉP TRÊN CỬA SỔ xuống đầu vùng tránh bàn phím.
   *
   * ĐO chứ không hỏi bằng prop: có màn đặt `<AppHeader>` lên trên `Screen`, có màn không, và
   * mười một màn hiện tại thuộc nhóm sau. Một cờ `headered` bắt mọi nơi gọi phải nhớ, và chỗ
   * nào quên thì nội dung bị đẩy dư đúng 56dp — một lỗi im lặng, chỉ lộ ra khi bàn phím mở.
   *
   * `measureInWindow` trả về BẤT ĐỒNG BỘ, nên khung hình đầu tiên luôn là 0. Với màn mở bàn
   * phím ngay lúc mount thì con số 0 đó là con số được dùng thật — xem effect đo lại bên dưới.
   */
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  /** Đệm đuôi nội dung khi bàn phím đang mở — xem {@link KEYBOARD_TAIL}. */
  const [keyboardTail, setKeyboardTail] = useState(0);
  const frame = useRef<View>(null);

  const measureFrame = useCallback(() => {
    frame.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
  }, []);

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
  const scrollY = useRef(0);

  const revealFocusedInput = useCallback((keyboardTop: number) => {
    const input = TextInput.State.currentlyFocusedInput();
    if (!input || !scroller.current) return;

    input.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + KEYBOARD_GAP - keyboardTop;
      /*
       * Không chồng lấn thì không cuộn — gồm luôn trường hợp ô đang gõ thuộc một tấm trượt mở đè
       * lên màn: tấm trượt tự nâng nội dung của nó, ở đây không có gì để làm.
       */
      if (overlap <= 0) return;
      scroller.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
    });
  }, []);

  /*
   * ĐO LẠI mỗi lần bàn phím bật lên: `onLayout` chỉ bắn lúc dựng và `measureInWindow` trả về bất
   * đồng bộ, nên màn mở bàn phím ngay lúc mount (ô OTP `autoFocus`) chạy lần tránh đầu tiên với
   * offset 0 — ô vẫn nằm dưới bàn phím, và không layout nào bắn thêm để tự sửa.
   */
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      measureFrame();
      setKeyboardTail(KEYBOARD_TAIL);
      revealFocusedInput(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTail(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measureFrame, revealFocusedInput]);

  const contentStyle = [
    styles.content,
    padded ? styles.padded : null,
    centered ? styles.centered : null,
  ];

  const body = scroll ? (
    <ScrollView
      ref={scroller}
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
    <SafeAreaView
      ref={frame}
      style={styles.flex}
      onLayout={measureFrame}
      {...(edges ? { edges } : {})}
    >
      {/*
        CÙNG cơ chế với `BottomSheet` (`behavior="padding"` cho cả hai nền), cộng thêm thứ tấm
        trượt không cần: `keyboardVerticalOffset`.

        `KeyboardAvoidingView` đẩy nội dung lên bằng "chiều cao bàn phím trừ phần màn hình nằm
        DƯỚI khung của nó" — phép trừ đó chỉ đúng khi khung bắt đầu từ mép trên cửa sổ. Tấm trượt
        thoả vì nó là gốc của một `Modal`; `Screen` thì KHÔNG, `AppHeader` là anh em đứng trên nó,
        nên khung hụt đúng chiều cao thanh đó cộng safe area và ô cuối màn vẫn nằm dưới bàn phím.
      */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={keyboardOffset}
        style={styles.flex}
      >
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
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
