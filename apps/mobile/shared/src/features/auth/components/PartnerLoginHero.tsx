import { memo, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { YStack } from 'tamagui';
import { PARTNER_LOGIN_ART, images } from '@/assets';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { useResponsive } from '@/theme/use-responsive';
import { space } from '@/theme/tokens';

/**
 * Mép trên lượn của tấm trắng (Figma `24464:24582` "Rectangle 1", khung 390): hai góc bo 20, giữa
 * võng xuống 8 - chỉ lấy phần đỉnh cao 20.11 của hình, thân tấm là `View` nền `surface`.
 */
const SHEET_EDGE_PATH =
  'M0 20.1078C0 8.40003 9.95978 -0.823872 21.6342 0.0584197C59.4191 2.914 138.766 8.35273 195 8.35273C251.234 8.35273 330.581 2.914 368.366 0.0584197C380.04 -0.823872 390 8.40003 390 20.1078Z';
const SHEET_EDGE_HEIGHT = 20.1078;
/** Phần mép lượn đè xuống thân tấm để không hở vạch ở chỗ nối. */
const SEAM_OVERLAP = 1;

/**
 * Khung màn ĐĂNG NHẬP app Partner — Figma Partner-XePrime "Login" (`24464:24574`):
 *
 *  - dải ảnh đường hầm cao 179 (khung 390) + logo "xe prime PARTNER" góc trên trái;
 *  - tấm trắng mép trên lượn đè lên đáy dải ảnh, linh vật + xe đứng trên mép tấm (lấn 16 vào trong);
 *  - nội dung (`children`) trong tấm: đệm 16, khe giữa các khối 24; tấm tự lo hai dải an toàn trên/dưới
 *    (màn bọc nó dùng `Screen edges={['left', 'right', 'bottom']} surface`: dải an toàn ĐÁY do `Screen`
 *    chừa, cùng nền trắng) để nền trắng chạy tới mép màn.
 *
 * Mọi số đo theo khung 390 của bản vẽ rồi nhân theo bề rộng cột thật (`scale`), để ảnh giữ đúng
 * tỉ lệ trên máy hẹp lẫn iPad (cột form 560). Ảnh là TRANG TRÍ - trình đọc màn hình bỏ qua.
 */
export const PartnerLoginHero = memo(function PartnerLoginHero({
  children,
}: {
  children: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsive();
  const art = PARTNER_LOGIN_ART;
  const scale = contentWidth / art.frameWidth;

  return (
    <YStack flexGrow={1} bg={colors.surface}>
      {/* Dải trạng thái: cùng nền tấm trắng như thanh trạng thái của bản vẽ. */}
      <View style={{ height: insets.top }} />

      <View style={{ height: art.bannerHeight * scale }} accessible={false}>
        <Image
          source={images.partnerLoginBanner}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
        />
        <Image
          source={images.partnerLoginLogo}
          style={{
            position: 'absolute',
            left: art.logo.left * scale,
            top: art.logo.top * scale,
            width: art.logo.width * scale,
            height: art.logo.height * scale,
          }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessible={false}
        />
      </View>

      <YStack flexGrow={1} bg={colors.surface}>
        {/*
          Mép lượn: đáy hình đè xuống thân tấm {SEAM_OVERLAP}px. Ghép SÁT ở toạ độ lẻ thì Android làm
          tròn điểm ảnh để hở một vạch, lộ ảnh banner thành một đường kẻ ngang (người dùng báo 19/11/2026).
        */}
        <Svg
          width={contentWidth}
          height={SHEET_EDGE_HEIGHT * scale + SEAM_OVERLAP}
          viewBox={`0 0 ${art.frameWidth} ${SHEET_EDGE_HEIGHT}`}
          preserveAspectRatio="none"
          style={[styles.edge, { top: -SHEET_EDGE_HEIGHT * scale }]}
          pointerEvents="none"
        >
          <Path d={SHEET_EDGE_PATH} fill={colors.surface} />
        </Svg>
        <Image
          source={images.partnerLoginMascot}
          style={{
            position: 'absolute',
            left: art.mascot.left * scale,
            top: (art.mascot.overlap - art.mascot.height) * scale,
            width: art.mascot.width * scale,
            height: art.mascot.height * scale,
          }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessible={false}
        />

        <YStack flexGrow={1} gap={space.xl} px={layout.padXLg} pt={space.lg} pb={space.xl}>
          {children}
        </YStack>
      </YStack>
    </YStack>
  );
});

const styles = StyleSheet.create({
  edge: { left: 0, position: 'absolute' },
});
