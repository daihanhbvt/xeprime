import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, market, radius } from '@/theme/tokens';
import { SEAL_ART } from './home-art';

/**
 * Dấu xác thực XANH của THẺ trang chủ — bản native của `/home/card-verified.svg` bên web.
 *
 * KHÁC con dấu gold `VerifiedMark`: web chỉ dùng dấu xanh này trên hai loại thẻ trang chủ (thẻ xe
 * `VehicleCard`, thẻ gian hàng `FeaturedHosts`), còn đầu trang gian hàng, thẻ thông tin gian hàng
 * và gợi ý tìm kiếm vẫn là `VerifiedMark` gold. Vì vậy dấu này sống cạnh thẻ, không thay toàn cục.
 */
const SEAL_PATH =
  'M9.2714 3.85999C9.12059 3.77191 8.98495 3.66013 8.86967 3.52894C8.88151 3.34596 8.92509 3.16645 8.99847 2.99841C9.13377 2.61668 9.28674 2.18426 9.04124 1.84809C8.79574 1.51192 8.33217 1.52261 7.92533 1.53191C7.74556 1.55061 7.56391 1.53834 7.38829 1.49564C7.29496 1.34325 7.22814 1.17612 7.19068 1.00139C7.07537 0.608492 6.94379 0.16445 6.53973 0.0314703C6.15009 -0.0940702 5.78928 0.182119 5.47031 0.424831C5.33258 0.550394 5.17313 0.649815 4.99977 0.718224C4.82459 0.650369 4.66336 0.550922 4.52411 0.424831C4.20607 0.183514 3.84665 -0.0954651 3.45515 0.0319353C3.05203 0.163055 2.92044 0.608492 2.8042 1.00139C2.76722 1.17569 2.70104 1.34248 2.60845 1.49471C2.43245 1.53694 2.25063 1.54952 2.07049 1.53191C1.66225 1.52075 1.2024 1.50866 0.954573 1.84809C0.706747 2.18751 0.86158 2.61668 0.99735 2.99795C1.07229 3.16555 1.11654 3.34524 1.128 3.52847C1.0129 3.65979 0.877415 3.77173 0.72674 3.85999C0.386386 4.09247 0 4.35704 0 4.78667C0 5.21629 0.386386 5.47993 0.72674 5.71334C0.877381 5.80146 1.01287 5.91324 1.128 6.0444C1.11778 6.22756 1.07478 6.4074 1.00107 6.57539C0.86623 6.95666 0.713721 7.38908 0.958758 7.72525C1.20379 8.06141 1.66597 8.05072 2.07467 8.04142C2.2546 8.02267 2.4364 8.03494 2.61217 8.07769C2.70534 8.23012 2.772 8.39724 2.80932 8.57195C2.92463 8.96484 3.05621 9.40888 3.46027 9.54186C3.52501 9.56281 3.59263 9.57348 3.66067 9.57348C3.98747 9.52601 4.2912 9.3774 4.52922 9.1485C4.66695 9.02294 4.8264 8.92352 4.99977 8.85511C5.17494 8.92296 5.33617 9.02241 5.47543 9.1485C5.79393 9.39168 6.15474 9.66926 6.54485 9.5414C6.94797 9.41028 7.07956 8.96484 7.1958 8.57241C7.23316 8.39786 7.29982 8.23091 7.39294 8.07862C7.56821 8.03571 7.74953 8.02313 7.92905 8.04142C8.33729 8.05119 8.79714 8.06467 9.04496 7.72525C9.29279 7.38582 9.13796 6.95666 9.00219 6.57492C8.92828 6.40729 8.88407 6.2281 8.87153 6.04533C8.98619 5.91337 9.12194 5.80134 9.27326 5.71381C9.61361 5.48132 10 5.21629 10 4.78667C10 4.35704 9.61222 4.09294 9.2714 3.85999Z';
const CHECK_PATH =
  'M4.53834 6.06531C4.44589 6.06522 4.35725 6.02843 4.29191 5.96301L3.36198 5.03308C3.30038 4.96698 3.26685 4.87954 3.26844 4.7892C3.27003 4.69886 3.30663 4.61266 3.37053 4.54877C3.43442 4.48487 3.52061 4.44827 3.61096 4.44668C3.7013 4.44509 3.78874 4.47862 3.85484 4.54022L4.57089 5.25627L6.18897 4.04271C6.26296 3.98722 6.35596 3.96339 6.44752 3.97647C6.53908 3.98955 6.62169 4.03846 6.67718 4.11245C6.73267 4.18644 6.7565 4.27945 6.74342 4.371C6.73034 4.46256 6.68143 4.54517 6.60744 4.60067L4.74758 5.99556C4.68721 6.04083 4.61379 6.06531 4.53834 6.06531Z';

export function CardVerifiedMark({ size = 10 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.957} viewBox="0 0 10 9.57364">
      <Path d={SEAL_PATH} fill={SEAL_ART} />
      <Path d={CHECK_PATH} fill={market.onDark} />
    </Svg>
  );
}

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
