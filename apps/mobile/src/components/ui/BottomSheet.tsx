import { useEffect, useState, type ReactNode } from 'react';
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
}: BottomSheetProps) {
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  /*
    Bàn phím mở: nâng tấm trượt lên đúng chiều cao bàn phím (`mb`) và thu trần chiều cao theo
    phần màn hình còn lại — nội dung dài vẫn cuộn được thay vì bị đẩy khuất.
    Bàn phím đóng: `mb` về 0, tấm trượt trở lại bám đáy, không còn khe hở.
  */
  const lifted = keyboardHeight > 0;
  const available = height - keyboardHeight;

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
        <Pressable
          style={appStyles.scrim}
          onPress={dismissable ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <YStack
          maxHeight={available * maxRatio}
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

          <ScrollView
            contentContainerStyle={{
              padding: padded ? layout.screenX : 0,
              gap: padded ? space.md : 0,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

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
      </View>
    </Modal>
  );
}
