import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, market, radius } from '@/theme/tokens';
import { CardVerifiedMark } from '@/components/ui/VerifiedMark';

// Dấu xanh dùng CHUNG toàn app — định nghĩa ở `components/ui/VerifiedMark` (28/10/2026).
export { CardVerifiedMark };

const styles = StyleSheet.create({ logo: { width: '100%', height: '100%' } });

/**
 * Avatar của thẻ trang chủ (`.avatar` FeaturedHosts / `.shopAvatar` VehicleCard bên web): tròn,
 * viền 1px `border` (đã xác thực: `primary-glow`), nền `primary-subtle`, chữ cái `primary-strong`,
 * dấu xanh trong đĩa nền thẻ ở góc phải-dưới (−2px).
 */
export function HomeCardAvatar({
  name,
  url,
  size,
  verified,
  markDisc,
  markIcon,
}: {
  name: string;
  url?: string | null;
  size: number;
  verified: boolean;
  /** Đĩa nền sau dấu: 14 ở thẻ gian hàng, 12 ở thẻ xe (web). */
  markDisc: number;
  markIcon: number;
}) {
  const colors = useColors();
  const initial = name.trim().charAt(0).toLocaleUpperCase() || '?';
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <YStack
        w={size}
        h={size}
        br={radius.pill}
        bw={1}
        bc={verified ? market.glow : colors.border}
        bg={colors.primarySubtle}
        ai="center"
        jc="center"
        ov="hidden"
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={styles.logo}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text col={colors.primaryStrong} fos={Math.round(size / 2.6)} fow={fontWeight.semibold}>
            {initial}
          </Text>
        )}
      </YStack>
      {verified ? (
        <YStack
          pos="absolute"
          right={-2}
          bottom={-2}
          w={markDisc}
          h={markDisc}
          br={radius.pill}
          bg={colors.surface}
          ai="center"
          jc="center"
        >
          <CardVerifiedMark size={markIcon} />
        </YStack>
      ) : null}
    </View>
  );
}
