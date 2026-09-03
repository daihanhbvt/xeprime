import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';

import { LOCALES } from '@/i18n/config';
import { useAppLocale } from '@/i18n/I18nProvider';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/**
 * Đổi ngôn ngữ.
 *
 * Trên header chỉ chiếm một nút tròn 44pt: hai nút chữ "Tiếng Việt" / "English" nằm sẵn ngoài
 * header ăn hết chỗ của thứ người dùng thực sự cần thấy — đăng nhập và tài khoản. Danh sách
 * mở ra trong một tấm trượt từ đáy, đúng chỗ ngón cái với tới.
 */
export function LocaleSwitcher() {
  const t = useTranslations('Common.locale');
  const { locale, setLocale } = useAppLocale();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      {/*
        Quả địa cầu + MÃ ngôn ngữ, giống web: một quả địa cầu trần không nói đang ở ngôn ngữ
        nào, mà đó chính là thứ người dùng cần biết trước khi bấm.

        Không hiện cờ quốc gia — ngôn ngữ không phải quốc gia, và tiếng Anh không thuộc về một
        lá cờ nào.
      */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('switchAriaLabel', { current: t(locale) })}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        <XStack
          ai="center"
          gap={4}
          bw={1}
          bc={colors.border}
          br={radius.pill}
          px={space.sm}
          minHeight={sizing.touchTarget}
        >
          <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t(`${locale}Short` as never)}
          </Text>
        </XStack>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={appStyles.scrim} onPress={() => setOpen(false)}>
          {/* Chạm ra ngoài để đóng; chặn sự kiện ở tấm nội dung để chạm bên trong không đóng theo. */}
          <Pressable style={{ marginTop: 'auto' }} onPress={() => undefined}>
            <YStack
              bg={colors.surface}
              borderTopLeftRadius={radius.lg}
              borderTopRightRadius={radius.lg}
              p={space.lg}
              gap={space.sm}
              // Cộng inset đáy: tấm trượt chạm mép dưới màn hình, mà thanh điều hướng của hệ
              // thống (hoặc vạch Home của iOS) nằm ĐÈ lên đó — lề cố định là mục cuối bị che.
              pb={insets.bottom + space.lg}
            >
              <YStack w={40} h={4} br={radius.pill} bg={colors.border} alignSelf="center" mb={space.sm} />

              {LOCALES.map((option) => (
                <LocaleRow
                  key={option}
                  label={t(option)}
                  selected={option === locale}
                  onPress={() => {
                    setLocale(option);
                    setOpen(false);
                  }}
                />
              ))}
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function LocaleRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <XStack
        ai="center"
        jc="space-between"
        px={space.md}
        minHeight={sizing.touchTarget}
        br={radius.md}
        bg={selected ? colors.surfaceSelected : 'transparent'}
      >
        <Text
          col={selected ? colors.primaryActive : colors.text}
          fos={fontSize.body}
          fow={selected ? fontWeight.semibold : fontWeight.regular}
        >
          {label}
        </Text>
        {selected ? <Ionicons name="checkmark" size={18} color={colors.primaryActive} /> : null}
      </XStack>
    </Pressable>
  );
}
