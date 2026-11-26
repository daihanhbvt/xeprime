import { dismissKeyboardFirst } from '@/lib/dismiss-keyboard-first';
import { usePathname } from 'expo-router';
import {
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  KeyboardState,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  runOnJS,
  useAnimatedKeyboard,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spring } from '@/theme/motion';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FocusRevealProvider,
  KeyboardHoldProvider,
  revealFocusedInput,
  revealNodeAboveKeyboard,
  type KeyboardHold,
} from '@/components/layout/focus-reveal';
import { IconButton } from './IconButton';
import { useSheetLevel, useSheetPortal } from './SheetPortal';
import { layout } from '@/theme/layout';
import { useResponsive } from '@/theme/use-responsive';
import { useAppStyles } from '@/theme/styles';
import { useAppScheme, useColors, useFloatingSurfaceBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { LineIcon } from '@/components/icons/LineIcon';
import { IS_PARTNER_APP } from '@/lib/app-kind';

/** Tấm trượt trồi lên bằng lò xo (luồng UI). Tôn trọng "Giảm chuyển động". */
const sheetEntering = SlideInDown.springify()
  .damping(spring.sheet.damping)
  .stiffness(spring.sheet.stiffness)
  .mass(spring.sheet.mass)
  .reduceMotion(ReduceMotion.System);

/** Lớp phủ trong cửa sổ chính (`portal` / `overlay`): nền mờ dần, tấm trượt xuống khi đóng. */
const scrimEntering = FadeIn.reduceMotion(ReduceMotion.System);
const scrimExiting = FadeOut.reduceMotion(ReduceMotion.System);
const sheetExiting = SlideOutDown.reduceMotion(ReduceMotion.System);

/** Nhịp báo vị trí cuộn — chỉ ghi vào ref, đủ gần đúng cho lần cuộn tới ô đang gõ. */
const SCROLL_REPORT_MS = 100;

/**
 * Chiều cao bàn phím đang che, đo trực tiếp từ sự kiện của hệ điều hành.
 *
 * KHÔNG dùng `KeyboardAvoidingView` ở đây. Edge-to-edge (Expo SDK 53+) không co cửa sổ theo bàn
 * phím, còn trong `Modal` nó tính phần đệm từ khung cửa sổ đo được lúc bàn phím ĐANG mở; khi bàn
 * phím sập xuống, phần đệm đó không phải lúc nào cũng trở về 0 — tấm trượt kẹt lơ lửng trên đáy
 * màn hình (đúng triệu chứng gặp phải sau khi gõ xong rồi đóng bàn phím).
 *
 * Đo lấy thì chỉ có hai trạng thái: có bàn phím = chiều cao thật, không có = 0. Không còn phép
 * trừ nào để sai.
 *
 * Dùng cho iOS (mọi chế độ) và cho `Modal` trên Android. Android trong cửa sổ chính dùng
 * {@link useSettledImeHeight}: sự kiện của RN trên Android trả chiều cao ĐÃ TRỪ thanh điều hướng -
 * đúng cho cửa sổ `Modal` (dừng trên thanh đó), nhưng hụt đúng chừng ấy với tấm phủ tới mép màn.
 */
function useKeyboardEventHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // iOS bắn `Will*` sớm hơn nên tấm trượt đi cùng nhịp animation của bàn phím; Android chỉ có `Did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardHeight;
}

/**
 * Inset bàn phím (`WindowInsetsCompat.Type.ime()`, đo từ mép dưới CÙNG của cửa sổ - gồm cả phần
 * bàn phím phủ lên thanh điều hướng), cùng nguồn với `Screen`. Chỉ đẩy sang JS khi bàn phím đã
 * đứng yên: nâng tấm theo từng khung hình là render lại cả tấm mỗi khung (giật), và phép cuộn ô
 * đang gõ chỉ có nghĩa khi bàn phím đã tới nơi - cùng nhịp với `keyboardDidShow` trước đây.
 */
function useSettledImeHeight() {
  const keyboard = useAnimatedKeyboard();
  const lastPushed = useSharedValue(-1);
  const [imeHeight, setImeHeight] = useState(0);
  useDerivedValue(() => {
    const settled =
      keyboard.state.value === KeyboardState.OPEN || keyboard.state.value === KeyboardState.CLOSED;
    if (!settled) return;
    if (keyboard.height.value === lastPushed.value) return;
    lastPushed.value = keyboard.height.value;
    runOnJS(setImeHeight)(keyboard.height.value);
  });
  return imeHeight;
}

/** `modal` = cửa sổ `Modal` riêng · `portal` = host ở gốc app · `overlay` = ngay trong cây màn. */
type SheetMode = 'modal' | 'portal' | 'overlay';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Phần tử nhỏ đặt SÁT sau chữ tiêu đề (v2) - vd dấu (!) giải thích. */
  titleAdornment?: ReactNode;
  /** Dòng phụ dưới tiêu đề - chuỗi, hoặc node khi cần chữ đậm (`t.rich`) như câu dẫn của tấm quyết định. */
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxRatio?: number;
  padded?: boolean;
  dismissable?: boolean;
  /**
   * Nội dung TỰ cuộn lấy — tắt vùng cuộn của tấm trượt.
   *
   * Mặc định tấm trượt bọc `children` trong một `ScrollView`, đúng cho phần lớn nội dung
   * (biểu mẫu, menu chọn). Nhưng lồng một danh sách ảo hoá (`FlatList`) vào đó thì React Native
   * cảnh báo "VirtualizedList should never be nested inside plain ScrollViews" và cảnh báo ấy
   * nói đúng: hai vùng cuộn dọc chồng nhau làm ảo hoá mất tác dụng (danh sách bị đo là cao vô
   * hạn nên dựng HẾT mọi dòng), `onEndReached` không bao giờ bắn, và không trục nào cuộn ra hồn.
   *
   * Đặt `scroll={false}` khi con của tấm trượt là một danh sách như vậy — nó sẽ nhận đúng chiều
   * cao còn lại của tấm và tự cuộn.
   */
  scroll?: boolean;
  /**
   * Tấm trượt vẽ ở đâu:
   *
   * - `portal` (mặc định) — vào host ở GỐC app (`SheetPortalProvider`), trên navigator, thanh tab
   *   và header, phủ tới mép dưới màn hình. Cửa sổ `Modal` của Android (edge-to-edge, Expo 54)
   *   dừng TRÊN vùng thanh điều hướng nên mọi tấm hụt ~52dp và lộ trang bên dưới (đo 16/11/2026).
   *   Nội dung dựng ở host: chỉ thấy context của provider gốc - xem `SheetPortal.tsx`. Không có
   *   host (test, màn lỗi gốc) ⇒ tự lùi về `modal`.
   * - `overlay` — NGAY TRONG cây màn (lớp phủ tuyệt đối). Dành cho `ManageSectionSheet` mở từ thanh
   *   tab nổi của app Partner; nơi gọi PHẢI đặt nó trong một khung phủ cả màn.
   * - `modal` — cửa sổ `Modal` riêng. Chỉ khi tấm phải nằm trên một `Modal` native khác (trình xem
   *   ảnh, máy ảnh): host ở cửa sổ chính sẽ bị cửa sổ đó che.
   */
  presentation?: SheetMode;
  /**
   * `v2` — đầu tấm theo Figma "_Filter Modal" (`24175:57561`): tay nắm 48×4 `shape/gray-100`, tiêu
   * đề 18/28 semibold, nút đóng là icon trần 24 ở góc phải; bo trên 16.
   */
  chrome?: 'default' | 'v2';
  /**
   * Chỉ với `chrome="v2"`: đầu tấm có đệm đáy 16 + vạch 1px ngăn với thân (Figma "Header cố định"
   * của tấm biểu mẫu `24145:96205`). Menu mục (`ManageSectionSheet`) không có vạch nên mặc định tắt.
   */
  headerDivider?: boolean;
  /** Chỉ với `chrome="v2"`: một thao tác nhỏ đứng trước nút ✕ (vd link "Đọc tất cả" của tấm Thông báo). */
  headerAction?: ReactNode;
  /**
   * Đổi giá trị (khác rỗng) ⇒ cuộn xuống CUỐI nội dung sau lượt vẽ kế tiếp - khi một khối vừa mở
   * ra ở đáy tấm (thẻ "Thêm danh mục mới") mà người dùng phải thấy ngay, không phải tự cuộn tìm.
   */
  scrollToEndKey?: string | number | false | null;
}

export function BottomSheet(rawProps: BottomSheetProps) {
  /*
   * Tấm trượt ĐÓNG (hoặc bị gỡ) khi ô nhập bên trong còn tiêu điểm thì Android để bàn phím lại - cất nó
   * ở đây cho MỌI tấm (người dùng 25/11/2026). Cleanup chạy đúng lúc `open` chuyển true → false hoặc
   * tấm unmount; `Keyboard.dismiss()` no-op khi không có bàn phím.
   */
  useEffect(() => {
    if (!rawProps.open) return undefined;
    return () => Keyboard.dismiss();
  }, [rawProps.open]);
  /*
   * Màn chứa tấm KHÔNG còn trên cùng (vd bấm "Chính sách huỷ" trong tấm duyệt ⇒ sang màn chính
   * sách) ⇒ tấm TẠM ẨN, quay lại thì hiện lại nguyên trạng. Tấm vẽ ở host phủ trên cả ngăn xếp,
   * nên không ẩn thì nó đè lên màn mới (người dùng 20/11/2026). Không gọi `onClose`.
   */
  const screenFocused = useHostScreenFocused(rawProps.open);
  const props = screenFocused || !rawProps.open ? rawProps : { ...rawProps, open: false };
  const { open, onClose, dismissable = true, presentation = 'portal' } = props;
  const portal = useSheetPortal();
  /* Mở từ BÊN TRONG một tấm khác (vd. ô chọn trong tấm Từ chối) ⇒ level lớn hơn ⇒ vẽ trên tấm đó. */
  const level = useSheetLevel();
  const sheetId = useId();
  const mode: SheetMode =
    presentation === 'overlay' ? 'overlay' : presentation === 'modal' || !portal ? 'modal' : 'portal';
  const inPortal = mode === 'portal' && open;
  const portalNode = inPortal ? <SheetSurface {...props} mode="portal" sheetId={sheetId} /> : null;

  // Gỡ khỏi host khi đóng / khi nơi gọi unmount.
  useLayoutEffect(() => {
    if (!inPortal || !portal) return;
    return () => portal.remove(sheetId);
  }, [inPortal, portal, sheetId]);

  /*
   * Đẩy bản dựng MỚI NHẤT vào host sau MỖI lần render (không deps): nội dung tấm đổi theo state của
   * nơi gọi. Layout effect ⇒ host dựng lại đồng bộ trong cùng nhịp commit, không trễ một khung hình.
   */
  useLayoutEffect(() => {
    if (inPortal && portal) portal.upsert(sheetId, level, portalNode);
  });

  if (mode === 'portal') return null;
  if (mode === 'overlay') {
    return open ? <SheetSurface {...props} mode="overlay" sheetId={sheetId} /> : null;
  }

  return (
    <Modal
      visible={open}
      transparent
      // Nền mờ DẦN, tấm trượt lên bằng lò xo riêng (`sheetEntering`) — `slide` của Modal kéo cả
      // lớp nền tối trượt theo, đọc ra như cả màn bị đẩy lên.
      animationType="fade"
      onRequestClose={dismissable ? onClose : undefined}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/*
        Cửa sổ `Modal` riêng: phần tránh bàn phím của `Screen` không với tới được - tấm tự nâng theo
        chiều cao bàn phím (`useKeyboardEventHeight`). Android: cửa sổ này dừng TRÊN thanh điều
        hướng dù có `navigationBarTranslucent` - lý do `portal` là mặc định.
      */}
      <SheetSurface {...props} mode="modal" sheetId={sheetId} />
    </Modal>
  );
}

function SheetSurface({
  open,
  onClose,
  title,
  subtitle,
  titleAdornment,
  children,
  footer,
  maxRatio = 0.9,
  padded = true,
  dismissable = true,
  scroll = true,
  // App Partner: MỌI tấm theo Figma (tấm Thông báo `24512:124878`, người dùng chốt 20/11/2026) -
  // bo 16, tay nắm 48, tiêu đề 18/28 semibold, ✕ 24 xám, vạch dưới đầu tấm.
  chrome = IS_PARTNER_APP ? 'v2' : 'default',
  headerDivider = IS_PARTNER_APP,
  headerAction,
  scrollToEndKey,
  mode,
  sheetId,
}: BottomSheetProps & { mode: SheetMode; sheetId: string }) {
  /** Trong cửa sổ chính (host gốc hoặc ngay trong cây): tự lo nền mờ, nút Back, hiệu ứng đóng. */
  const layered = mode !== 'modal';
  const portal = useSheetPortal();
  const v2 = chrome === 'v2';
  /* v2 (Figma "Filter Form" / "Footer cố định"): đệm 16 bốn phía, các khối cách 12. */
  const bodyPad = v2 ? V2_PAD_X : layout.screenX;
  const bodyGap = v2 ? V2_BODY_GAP : space.md;
  const appStyles = useAppStyles();
  const colors = useColors();
  const { scheme } = useAppScheme();
  const floatingBorder = useFloatingSurfaceBorder();
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const eventKeyboardHeight = useKeyboardEventHeight();
  const imeHeight = useSettledImeHeight();
  const keyboardHeight = Platform.OS === 'android' && layered ? imeHeight : eventKeyboardHeight;
  const { isTablet, sheetWidth } = useResponsive();

  /*
   * Tấm trượt có vùng cuộn RIÊNG, nên nó cũng phải tự kéo ô đang gõ vào tầm nhìn: vòng cuộn của
   * `Screen` chỉ cuộn màn nền, không với tới nội dung ở đây. Không có nó thì ô nằm ở nửa dưới một
   * tấm trượt cao — Ghi chú, Lý do chi tiết — vẫn bị bàn phím che sau khi tấm đã nâng.
   *
   * Cung cấp cả khi `scroll={false}`: giá trị mặc định của context là hàm rỗng, nhưng ô nhập
   * trong tấm trượt vẫn thấy context của `Screen` bên dưới qua cây React và sẽ cuộn NHẦM màn nền.
   */
  const scroller = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  /* Chờ nội dung đổi cỡ (khối mới đã vẽ) rồi mới cuộn - cuộn ngay thì đáy cũ chưa dài ra. */
  const pendingScrollEnd = useRef(false);
  useEffect(() => {
    if (!scrollToEndKey) return;
    pendingScrollEnd.current = true;
  }, [scrollToEndKey]);
  const revealOnFocus = useCallback(() => {
    if (keyboardHeight <= 0) return;
    requestAnimationFrame(() => {
      revealFocusedInput(scroller.current, scrollY.current, height - keyboardHeight);
    });
  }, [height, keyboardHeight]);

  /*
   * Cùng hợp đồng `KeyboardHold` với `Screen`: ô có danh sách gợi ý (địa chỉ chi nhánh) xin kéo cả
   * khối ô + gợi ý lên trên bàn phím. Tấm trượt không tự sập bàn phím khi kéo nên chỉ còn việc cuộn.
   * Bàn phím tới SAU lượt focus ⇒ đo lại cả khi chiều cao bàn phím đổi.
   */
  const heldNode = useRef<View | null>(null);
  const revealHeld = useCallback(() => {
    if (keyboardHeight <= 0 || !heldNode.current) return;
    requestAnimationFrame(() => {
      revealNodeAboveKeyboard(
        scroller.current,
        scrollY.current,
        height - keyboardHeight,
        heldNode.current,
      );
    });
  }, [height, keyboardHeight]);
  const revealHeldRef = useRef(revealHeld);
  useEffect(() => {
    revealHeldRef.current = revealHeld;
    revealHeld();
  }, [revealHeld]);
  const keyboardHold = useMemo<KeyboardHold>(
    () => ({
      hold: (node) => {
        heldNode.current = node;
        revealHeldRef.current();
      },
      release: () => {
        heldNode.current = null;
      },
    }),
    [],
  );

  /*
    Bàn phím mở: nâng tấm trượt lên đúng chiều cao bàn phím (`mb`) và thu trần chiều cao theo
    phần màn hình còn lại — nội dung dài vẫn cuộn được thay vì bị đẩy khuất.
    Bàn phím đóng: `mb` về 0, tấm trượt trở lại bám đáy, không còn khe hở.
  */
  /*
   * Lớp phủ không có `onRequestClose` của `Modal` — tự nghe nút Back của Android. Đăng ký lúc tấm
   * mở ⇒ sau listener của màn ⇒ được gọi TRƯỚC (BackHandler gọi ngược thứ tự đăng ký), nên Back
   * đóng tấm chứ không lùi màn - như `Modal` trước đây. Tấm nằm dưới một tấm khác thì nhường
   * (`false`): chỉ tấm TRÊN CÙNG đóng, kể cả khi hai tấm mở trong cùng một nhịp commit.
   */
  useEffect(() => {
    if (!layered || !open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode === 'portal' && portal && !portal.isTop(sheetId)) return false;
      if (dismissable) onClose();
      return true;
    });
    return () => sub.remove();
  }, [layered, mode, portal, sheetId, open, dismissable, onClose]);

  const lifted = keyboardHeight > 0;
  // Chạm ra ngoài khi bàn phím mở = cất bàn phím trước (quy tắc chung `dismissKeyboardFirst`).
  const onScrimPress = dismissKeyboardFirst(onClose);
  const available = height - keyboardHeight;
  const ceiling = available * maxRatio;

  return (
      <View style={layered ? appStyles.overlayFill : appStyles.fill} accessibilityViewIsModal>
        <FocusRevealProvider reveal={revealOnFocus}>
          <KeyboardHoldProvider value={keyboardHold}>
            {/*
              Lớp phủ tối PHỦ TRỌN khung (kể cả phía sau tấm), không chỉ phần phía trên: chỗ khuyết
              của góc bo 16 phải là màu phủ, không lộ "tai" sáng của màn bên dưới (Figma tấm Thông
              báo, người dùng bắt lỗi 20/11/2026). Khoảng trống đẩy tấm xuống đáy không nhận chạm
              nên chạm ra ngoài vẫn rơi vào lớp phủ.
            */}
            <View style={StyleSheet.absoluteFill}>
            {layered ? (
              <Animated.View style={appStyles.fill} entering={scrimEntering} exiting={scrimExiting}>
                <Pressable
                  style={appStyles.scrim}
                  onPress={dismissable ? onScrimPress : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                />
              </Animated.View>
            ) : (
              <Pressable
                style={appStyles.scrim}
                onPress={dismissable ? onScrimPress : undefined}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
              />
            )}
            </View>
            <View style={appStyles.fill} pointerEvents="none" />
            {/* Màn rộng (iPad): tấm trượt có trần bề rộng và nằm giữa, như một hộp thoại. */}
            <Animated.View
              entering={sheetEntering}
              {...(layered ? { exiting: sheetExiting } : {})}
              style={isTablet ? { width: sheetWidth, alignSelf: 'center' } : undefined}
            >
            <YStack
              /*
               * Dựng lại khung tấm trượt khi đổi sáng/tối lúc đang mở: đổi tối → sáng gỡ viền nổi
               * (`floatingBorder`) và co chiều cao cùng lúc, Fabric vẽ lại không trọn - nội dung trắng
               * trơn tới khi mở lại (đo emulator 10/11/2026). Vỏ `Animated.View` giữ nguyên nên không
               * chạy lại hiệu ứng trượt vào.
               */
              key={scheme}
              maxHeight={ceiling}
              /*
            Chế độ `scroll={false}`: tấm trượt phải có chiều cao XÁC ĐỊNH, không phải `maxHeight`.

            Ở chế độ cuộn, chiều cao tấm = chiều cao nội dung (bị chặn trên bởi `maxHeight`) và
            mọi thứ ổn. Nhưng khi con là một danh sách `f={1}`, chiều cao của nó lại đi HỎI chính
            tấm trượt — mà tấm trượt đang chờ con đo xong mới biết mình cao bao nhiêu. Yoga cắt
            vòng đó bằng cách cho `flex: 1` trong một khung cao tự-động ra 0, nên vùng nội dung
            sập xuống 0dp: người dùng thấy tay nắm và tiêu đề, còn danh sách thì "không tải được".

            Chốt luôn bằng trần: một tấm trượt chứa danh sách thì vốn dĩ muốn cao hết mức nó được
            phép, và `maxRatio` chính là con số đó.
          */
              {...(scroll ? {} : { height: ceiling })}
              bg={colors.surface}
              borderTopLeftRadius={v2 ? radius.card : radius.lg}
              borderTopRightRadius={v2 ? radius.card : radius.lg}
              // v2 (Figma tấm Thông báo): KHÔNG viền - mép tấm chỉ là nền trắng trên lớp phủ tối.
              {...(v2 ? {} : { borderTopWidth: 1, borderColor: colors.borderSubtle, ...floatingBorder })}
              ov="hidden"
              /*
            Lề đáy có SÀN, không chỉ là safe-area inset.

            Ở host gốc / lớp phủ (phủ tới mép màn) inset đáy là thật - lề vượt qua thanh điều
            hướng. Trong `Modal` của Android `useSafeAreaInsets()` trả bottom = 0, còn thanh cử
            chỉ có thể rất mỏng: lấy max với một lề thật để dòng cuối luôn có chỗ thở.
          */
              pb={lifted ? space.md : Math.max(insets.bottom, v2 ? V2_BOTTOM_PAD : space.md)}
              mb={keyboardHeight}
            >
              <YStack ai="center" pt={space.sm}>
                <YStack
                  w={v2 ? V2_HANDLE_WIDTH : space.xl}
                  h={space.xs}
                  br={radius.pill}
                  bg={v2 ? colors.surfaceMuted : colors.borderInput}
                />
              </YStack>

              {title && v2 ? (
                <XStack
                  ai="flex-start"
                  gap={space.sm}
                  px={V2_PAD_X}
                  pt={space.xs}
                  {...(headerDivider
                    ? { pb: V2_PAD_X, borderBottomWidth: 1, borderColor: colors.border }
                    : null)}
                >
                  <YStack f={1} gap={2}>
                    <XStack ai="center" gap={space.xs}>
                      <Text
                        col={colors.text}
                        fos={typeScale.heading.fontSize}
                        lh={typeScale.heading.lineHeight}
                        fow={fontWeight.semibold}
                        accessibilityRole="header"
                        flexShrink={1}
                      >
                        {title}
                      </Text>
                      {titleAdornment}
                    </XStack>
                    {subtitle ? (
                      !isValidElement(subtitle) || subtitle.type === Fragment ? (
                        // Figma: 14/22 `text/gray/low`.
                        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={V2_SUBTITLE_LH}>
                          {subtitle}
                        </Text>
                      ) : (
                        // MỘT phần tử dựng sẵn (khối nhiều dòng, có chip...) - nơi gọi lo kiểu chữ, không bọc `Text`.
                        // Chuỗi / mảng `t.rich` vẫn đi nhánh `Text` ở trên (chữ trần ngoài `Text` là crash).
                        subtitle
                      )
                    ) : null}
                  </YStack>
                  {headerAction ? <YStack minHeight={V2_CLOSE} jc="center">{headerAction}</YStack> : null}
                  {dismissable ? (
                    <Pressable
                      onPress={onClose}
                      accessibilityRole="button"
                      accessibilityLabel={t('close')}
                      hitSlop={space.md}
                    >
                      <LineIcon name="close" size={V2_CLOSE} color={colors.placeholder} />
                    </Pressable>
                  ) : null}
                </XStack>
              ) : title ? (
                <XStack ai="center" gap={space.sm} px={layout.screenX} pt={space.sm} pb={space.xs}>
                  <YStack f={1} gap={2}>
                    <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text col={colors.textMuted} fos={fontSize.bodySm}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </YStack>
                  {dismissable ? (
                    <IconButton icon="close" label={t('close')} onPress={onClose} />
                  ) : null}
                </XStack>
              ) : null}

              {scroll ? (
                <ScrollView
                  ref={scroller}
                  /*
                    Vùng cuộn là phần DUY NHẤT được co khi nội dung vượt trần `maxHeight`; dải nút bên
                    dưới `flexShrink={0}` - thiếu cặp này dải nút bị co nhầm hoặc bị `overflow` cắt (develop).
                  */
                  style={styles.scroll}
                  contentContainerStyle={{
                    padding: padded ? bodyPad : 0,
                    gap: padded ? bodyGap : 0,
                  }}
                  keyboardShouldPersistTaps="handled"
                  onScroll={(event) => {
                    scrollY.current = event.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={SCROLL_REPORT_MS}
                  onContentSizeChange={() => {
                    if (!pendingScrollEnd.current) return;
                    pendingScrollEnd.current = false;
                    scroller.current?.scrollToEnd({ animated: true });
                  }}
                >
                  {children}
                </ScrollView>
              ) : (
                /*
              `f={1}` chứ không để nội dung tự cao: danh sách bên trong cần một chiều cao CÓ TRẦN
              để ảo hoá và để biết khi nào chạm đáy. Trần đến từ `maxHeight` của tấm trượt ở trên.
            */
                <YStack f={1} {...(padded ? { p: bodyPad, gap: bodyGap } : {})}>
                  {children}
                </YStack>
              )}

              {footer ? (
                <YStack
                  flexShrink={0}
                  px={bodyPad}
                  py={space.md}
                  gap={space.sm}
                  bg={colors.surface}
                  borderTopWidth={1}
                  borderColor={colors.borderSubtle}
                >
                  {footer}
                </YStack>
              ) : null}
            </YStack>
            </Animated.View>
          </KeyboardHoldProvider>
        </FocusRevealProvider>
      </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
});
/** Figma "_Filter Modal": tay nắm rộng 48, đệm ngang 16, nút đóng 24, đệm đáy 20. */
const V2_HANDLE_WIDTH = 48;
const V2_PAD_X = 16;
const V2_CLOSE = 24;
const V2_BOTTOM_PAD = 20;
const V2_BODY_GAP = 12;
const V2_SUBTITLE_LH = 22;

/**
 * Màn mở tấm còn là màn đang hiện? So ĐƯỜNG DẪN lúc mở với đường dẫn hiện tại (`usePathname` chạy
 * được ở mọi chỗ, kể cả ngoài một màn). Đóng tấm thì quên mốc.
 */
function useHostScreenFocused(open: boolean): boolean {
  const pathname = usePathname();
  const openedAt = useRef<string | null>(null);
  if (!open) openedAt.current = null;
  else if (openedAt.current === null) openedAt.current = pathname;
  return openedAt.current === null || openedAt.current === pathname;
}
