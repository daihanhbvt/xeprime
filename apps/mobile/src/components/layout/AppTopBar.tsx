import { Image, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { images } from '@/assets';
import { HeaderActions } from './HeaderActions';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Logo thanh gốc của app, lớn hơn logo header màn con (`AppHeader` dùng 26). */
const BRAND_LOGO = 30;

const styles = StyleSheet.create({
  logo: { width: BRAND_LOGO, height: BRAND_LOGO, borderRadius: radius.sm },
});

export function AppTopBar() {
  return (
    <XStack
      ai="center"
      jc="space-between"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      bg={colors.background}
    >
      <XStack ai="center" gap={space.xs}>
        <Image source={images.logo} style={styles.logo} resizeMode="contain" />
        <XStack ai="baseline">
          <Text col={colors.primaryActive} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            xe
          </Text>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.regular}>
            prime
          </Text>
        </XStack>
      </XStack>

      <HeaderActions />
    </XStack>
  );
}
