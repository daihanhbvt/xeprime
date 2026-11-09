import type { ReactNode } from 'react';
import { RevealText, ScrollReveal } from '@/components/motion/ScrollReveal';
import { RevealCountUp } from '@/components/motion/use-count-up';
import { Image } from 'expo-image';
import { ImageBackground, StyleSheet, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRevealPop, useScrollParallax } from '@/components/motion/reveal-effects';
import { SvgXml } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { XP_TOKENS } from '@xeprime/ui';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, space } from '@/theme/tokens';
import { HomeSectionHeading } from './HomeSectionHeading';
import { WHY_FLEET_ART, WHY_PRICE_ART, WHY_SUPPORT_ART, WHY_TIME_ART } from './why-art';

/** Cùng khoá, thứ tự và nét vẽ với `WhyChooseUs` bên web (`/home/why-*.svg`). */
const ITEMS = [
  { key: 'price', art: WHY_PRICE_ART },
  { key: 'fleet', art: WHY_FLEET_ART },
  { key: 'time', art: WHY_TIME_ART },
  { key: 'support', art: WHY_SUPPORT_ART },
] as const;

/** Figma MB `19879:67459`: ô icon 30, đệm 12 ⇒ đĩa 54; nét vẽ 32px của web thu về 30/32. */
const ICON_BOX = 30;
const ICON_SCALE = ICON_BOX / 32;

/** Ảnh tĩnh 532×488 (web `/home/why-image.png`); góc dưới-trái trong suốt là chỗ của ô số. */
const IMAGE_RATIO = 532 / 488;
/** Ô số chiếm 173 × 124 của ảnh 532 × 488 — tính ra px theo bề ngang ảnh (RN không co % đúng cho ô tuyệt đối). */
const IMAGE_MAX_WIDTH = 532;
const TABLET_MIN_WIDTH = 768;
const STAT_RATIO = { width: 173 / 532, height: 124 / 488 };

/**
 * "Lý do nên chọn XePrime" — bố cục Figma MB (`19879:67457`): tiêu đề canh giữa, lưới 2 × 2 canh
 * giữa (cách 16). Bản MB chưa vẽ đoạn giới thiệu và ảnh "100+" của desktop (`21965:5232`) — app vẫn
 * hiện đủ như web mobile: mô tả dưới tiêu đề, ảnh dưới lưới. Con số là chữ tĩnh trong bản dịch.
 */
export function WhyChooseUs() {
  const colors = useColors();
  // Ảnh ghép có khoét chỗ cho ô "100+": ảnh và ô phải trôi CÙNG NHAU, không phóng - tách rời là vỡ hình.
  const parallax = useScrollParallax(0.15, 24, 1);
  // Figma dark: tiêu đề mục vàng, mô tả xám sáng (`21965:6841`, `19879:66279`).
  const dark = useAppScheme().scheme === 'dark';
  const onDarkMuted = XP_TOKENS['color-text-on-dark-muted'];
  const t = useTranslations('Home.why');
  const { width } = useWindowDimensions();
  // Máy tính bảng / điện thoại lớn: ảnh không giãn quá cỡ Figma desktop (532) để không vỡ nét,
  // canh giữa. Cỡ chữ ô số co theo bề ngang ảnh để vừa ô ở máy nhỏ (≤ 360) lẫn tablet.
  const imageWidth = Math.min(width - layout.screenX * 2, IMAGE_MAX_WIDTH);
  const imageHeight = imageWidth / IMAGE_RATIO;
  const statScale = Math.min(Math.max(imageWidth / 343, 0.8), 1.3);
  const statValueSize = Math.round(fontSize.h1 * statScale);
  const statLabelSize = Math.round(fontSize.bodySm * statScale);
  // Tablet: bốn cam kết chia 4 cột (hai cột trên tablet rất thưa); điện thoại giữ 2 × 2.
  const cellBasis = width >= TABLET_MIN_WIDTH ? '22%' : '40%';

  return (
    <YStack gap={28}>
      <YStack gap={20}>
        <HomeSectionHeading
          kicker={t('kicker')}
          title={t.rich('title', {
            accent: (chunks) => <Text col={colors.primary}>{chunks}</Text>,
          })}
        />
        <RevealText delay={300}>
        <YStack gap={space.sm}>
          <Text col={dark ? onDarkMuted : colors.textMuted} fos={fontSize.bodyLg} lh={24} ta="center">
            {t('intro')}
          </Text>
          <Text col={colors.text} fos={fontSize.bodyLg} lh={24} fow={fontWeight.medium} ta="center">
            {t('closing')}
          </Text>
        </YStack>
        </RevealText>
      </YStack>

      <XStack flexWrap="wrap" rowGap={space.md} columnGap={space.md}>
        {ITEMS.map((item, index) => (
          // Mỗi ô tự hiện khi CHÍNH NÓ cuộn vào màn (không theo đầu khối); trễ nhỏ theo cột.
          <ScrollReveal key={item.key} index={index} style={[styles.cell, { flexBasis: cellBasis }]}>
          <YStack ai="center" gap={12}>
            <IconBounce index={index % 2}>
            <YStack p={12} br={radius.pill} bg={colors.primarySubtle}>
              <YStack w={ICON_BOX} h={ICON_BOX} ai="center" jc="center">
                <SvgXml
                  xml={item.art.xml}
                  width={item.art.width * ICON_SCALE}
                  height={item.art.height * ICON_SCALE}
                />
              </YStack>
            </YStack>
            </IconBounce>
            <RevealText delay={160 + (index % 2) * 80}>
            <YStack gap={2} ai="center">
              <Text col={dark ? colors.primary : colors.text} fos={fontSize.bodyLg} lh={24} fow={fontWeight.semibold} ta="center">
                {t(`items.${item.key}.title`)}
              </Text>
              <Text col={dark ? onDarkMuted : colors.text} fos={fontSize.body} lh={22} ta="center">
                {t(`items.${item.key}.desc`)}
              </Text>
            </YStack>
            </RevealText>
          </YStack>
          </ScrollReveal>
        ))}
      </XStack>

      {/* Parallax nhẹ khi cuộn: cả khối ảnh + ô "100+" trôi chậm - đo ở khung ngoài đứng yên. */}
      <Animated.View ref={parallax.ref} collapsable={false}>
      <Animated.View style={parallax.style}>
      <YStack w={imageWidth} aspectRatio={IMAGE_RATIO} als="center">
        <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <ImageBackground
          source={require('../../../../../assets/images/home/why-stat-bg.png')}
          resizeMode="cover"
          imageStyle={{ borderRadius: radius.banner }}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: Math.round(imageWidth * STAT_RATIO.width),
            height: Math.round(imageHeight * STAT_RATIO.height),
            justifyContent: 'center',
            padding: Math.round(12 * statScale),
          }}
        >
          <Text col={market.onDark} fos={statValueSize} lh={Math.round(statValueSize * 1.2)} fow={fontWeight.semibold}>
            <RevealCountUp text={t('statValue')} />
          </Text>
          <Text col={market.onDark} fos={statLabelSize} lh={Math.round(statLabelSize * 1.4)} numberOfLines={2} fow={fontWeight.medium}>
            {t('statLabel')}
          </Text>
        </ImageBackground>
        </Animated.View>
        <Animated.View style={styles.fill}>
        <Image
          source={require('../../../../../assets/images/home/why-image.png')}
          accessibilityLabel={t('imageAlt')}
          contentFit="contain"
          style={{ width: '100%', height: '100%' }}
        />
        </Animated.View>
      </YStack>
      </Animated.View>
      </Animated.View>
    </YStack>
  );
}

/** Icon tròn (không bóng) bounce-in lần lượt khi khối hiện. */
function IconBounce({ index, children }: { index: number; children: ReactNode }) {
  const style = useRevealPop(index * 110, 0.6);
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  cell: { flexGrow: 1 },
});
