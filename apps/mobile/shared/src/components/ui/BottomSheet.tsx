import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { FocusRevealProvider, revealFocusedInput } from '@/components/layout/focus-reveal';
import { IconButton } from './IconButton';
import { layout } from '@/theme/layout';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Chiều cao bàn phím đang che, đo trực tiếp từ sự kiện của hệ điều hành.
 *
 * KHÔNG dùng `KeyboardAvoidingView` ở đây nữa. Trong `Modal` `statusBarTranslucent` chạy
 * edge-to-edge (Expo SDK 53+), nó tính phần đệm từ khung cửa sổ đo được lúc bàn phím ĐANG mở;
 * khi bàn phím sập xuống, phần đệm đó không phải lúc nào cũng trở về 0 — tấm trượt kẹt lơ lửng
 * trên đáy màn hình và để lộ nội dung màn bên dưới (đúng triệu chứng gặp phải sau khi gõ xong
 * rồi đóng bàn phím).
 *
 * Đo lấy thì chỉ có hai trạng thái: có bàn phím = chiều cao thật, không có = 0. Không còn phép
 * trừ nào để sai.
 */
/** Nhịp báo vị trí cuộn — chỉ ghi vào ref, đủ gần đúng cho lần cuộn tới ô đang gõ. */
const SCROLL_REPORT_MS = 100;

function useKeyboardHeight() {
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

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
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
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxRatio = 0.9,
  padded = true,
  dismissable = true,
  scroll = true,
}: BottomSheetProps) {
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  /*
   * Tấm trượt có vùng cuộn RIÊNG, nên nó cũng phải tự kéo ô đang gõ vào tầm nhìn: `Screen` nằm
   * ngoài `Modal` và không với tới được nội dung ở đây. Không có nó thì ô nằm ở nửa dưới một
   * tấm trượt cao — Ghi chú, Lý do chi tiết — vẫn bị bàn phím che sau khi tấm đã nâng.
   *
   * Cung cấp cả khi `scroll={false}`: giá trị mặc định của context là hàm rỗng, nhưng ô nhập
   * trong tấm trượt vẫn thấy context của `Screen` bên dưới qua cây React và sẽ cuộn NHẦM màn nền.
   */
  const scroller = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const revealOnFocus = useCallback(() => {
    if (keyboardHeight <= 0) return;
    requestAnimationFrame(() => {
      revealFocusedInput(scroller.current, scrollY.current, height - keyboardHeight);
    });
  }, [height, keyboardHeight]);

  /*
    Bàn phím mở: nâng tấm trượt lên đúng chiều cao bàn phím (`mb`) và thu trần chiều cao theo
    phần màn hình còn lại — nội dung dài vẫn cuộn được thay vì bị đẩy khuất.
    Bàn phím đóng: `mb` về 0, tấm trượt trở lại bám đáy, không còn khe hở.
  */
  const lifted = keyboardHeight > 0;
  const available = height - keyboardHeight;
  const ceiling = available * maxRatio;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={dismissable ? onClose : undefined}
      statusBarTranslucent
    >
      {/*
        Việc tránh bàn phím phải làm TRONG `Modal`, không phải ở màn gọi.

        RN dựng `Modal` thành một cửa sổ riêng của hệ điều hành, nên phần tránh bàn phím của
        `Screen` bên dưới không với tới được nội dung ở đây. Thiếu nó thì mọi ô nhập nằm nửa dưới
        tấm trượt — Ghi chú, Mã tra soát, Lý do chi tiết — bị bàn phím che kín và người dùng gõ
        mù. Cơ chế: `mb`/`maxHeight` theo `useKeyboardHeight()` ở trên.
      */}
      <View style={appStyles.fill}>
        <FocusRevealProvider reveal={revealOnFocus}>
          <Pressable
            style={appStyles.scrim}
            onPress={dismissable ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          />
          <YStack
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
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            borderTopWidth={1}
            borderColor={colors.borderSubtle}
            ov="hidden"
            /*
            Lề đáy có SÀN, không chỉ là safe-area inset.

            Trong `Modal` của Android, `useSafeAreaInsets()` trả bottom = 0 dù thanh điều hướng
            vẫn đè lên tấm trượt — nên lề bằng đúng inset cho ra 0, và MỤC CUỐI của danh sách
            nằm khuất dưới thanh đó. Lấy max với một lề thật để dòng cuối luôn có chỗ thở.
          */
            pb={lifted ? space.md : Math.max(insets.bottom, space.md)}
            mb={keyboardHeight}
          >
            <YStack ai="center" pt={space.sm}>
              <YStack w={space.xl} h={space.xs} br={radius.pill} bg={colors.borderInput} />
            </YStack>

            {title ? (
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
                contentContainerStyle={{
                  padding: padded ? layout.screenX : 0,
                  gap: padded ? space.md : 0,
                }}
                keyboardShouldPersistTaps="handled"
                onScroll={(event) => {
                  scrollY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={SCROLL_REPORT_MS}
              >
                {children}
              </ScrollView>
            ) : (
              /*
              `f={1}` chứ không để nội dung tự cao: danh sách bên trong cần một chiều cao CÓ TRẦN
              để ảo hoá và để biết khi nào chạm đáy. Trần đến từ `maxHeight` của tấm trượt ở trên.
            */
              <YStack f={1} {...(padded ? { p: layout.screenX, gap: space.md } : {})}>
                {children}
              </YStack>
            )}

            {footer ? (
              <YStack
                px={layout.screenX}
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
        </FocusRevealProvider>
      </View>
    </Modal>
  );
}
