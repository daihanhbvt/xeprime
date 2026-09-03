import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IconButton } from './IconButton';
import { layout } from '@/theme/layout';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

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

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={dismissable ? onClose : undefined}
      statusBarTranslucent
    >
      {/*
        `KeyboardAvoidingView` phải nằm TRONG `Modal`, không phải ở màn gọi.

        RN dựng `Modal` thành một cửa sổ riêng của hệ điều hành, nên `KeyboardAvoidingView` của
        `Screen` bên dưới không với tới được nội dung ở đây. Thiếu nó thì mọi ô nhập nằm nửa dưới
        tấm trượt — Ghi chú, Mã tra soát, Lý do chi tiết — bị bàn phím che kín và người dùng gõ
        mù.

        `behavior="padding"` cho cả hai nền: tấm trượt bám đáy màn hình nên đẩy đáy lên đúng
        bằng chiều cao bàn phím là vừa khít; `height` sẽ bóp méo bo góc trên.
      */}
      <KeyboardAvoidingView behavior="padding" style={appStyles.fill}>
        <Pressable
          style={appStyles.scrim}
          onPress={dismissable ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <YStack
          maxHeight={height * maxRatio}
          bg={colors.surface}
          borderTopLeftRadius={radius.lg}
          borderTopRightRadius={radius.lg}
          borderTopWidth={1}
          borderColor={colors.borderSubtle}
          ov="hidden"
          pb={insets.bottom}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
