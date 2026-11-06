import { Image } from 'expo-image';
import { ImageBackground, useWindowDimensions } from 'react-native';
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
const STAT_RATIO = { width: 173 / 532, height: 124 / 488 };

/**
 * "Lý do nên chọn XePrime" — bố cục Figma MB (`19879:67457`): tiêu đề canh giữa, lưới 2 × 2 canh
 * giữa (cách 16). Bản MB chưa vẽ đoạn giới thiệu và ảnh "100+" của desktop (`21965:5232`) — app vẫn
 * hiện đủ như web mobile: mô tả dưới tiêu đề, ảnh dưới lưới. Con số là chữ tĩnh trong bản dịch.
 */
export function WhyChooseUs() {
  const colors = useColors();
  // Figma dark: tiêu đề mục vàng, mô tả xám sáng (`21965:6841`, `19879:66279`).
  const dark = useAppScheme().scheme === 'dark';
  const onDarkMuted = XP_TOKENS['color-text-on-dark-muted'];
  const t = useTranslations('Home.why');
  const { width } = useWindowDimensions();
  const imageWidth = width - layout.screenX * 2;
  const imageHeight = imageWidth / IMAGE_RATIO;

  return (
    <YStack gap={28}>
      <YStack gap={20}>
        <HomeSectionHeading
          kicker={t('kicker')}
          title={t.rich('title', {
            accent: (chunks) => <Text col={colors.primary}>{chunks}</Text>,
          })}
        />
        <YStack gap={space.sm}>
          <Text col={dark ? onDarkMuted : colors.textMuted} fos={fontSize.bodyLg} lh={24} ta="center">
            {t('intro')}
          </Text>
          <Text col={colors.text} fos={fontSize.bodyLg} lh={24} fow={fontWeight.medium} ta="center">
            {t('closing')}
          </Text>
        </YStack>
      </YStack>

      <XStack flexWrap="wrap" rowGap={space.md} columnGap={space.md}>
        {ITEMS.map((item) => (
          <YStack key={item.key} flexBasis="40%" flexGrow={1} ai="center" gap={12}>
            <YStack p={12} br={radius.pill} bg={colors.primarySubtle}>
              <YStack w={ICON_BOX} h={ICON_BOX} ai="center" jc="center">
                <SvgXml
                  xml={item.art.xml}
                  width={item.art.width * ICON_SCALE}
                  height={item.art.height * ICON_SCALE}
                />
              </YStack>
            </YStack>
            <YStack gap={2} ai="center">
              <Text col={dark ? colors.primary : colors.text} fos={fontSize.bodyLg} lh={24} fow={fontWeight.semibold} ta="center">
                {t(`items.${item.key}.title`)}
              </Text>
              <Text col={dark ? onDarkMuted : colors.text} fos={fontSize.body} lh={22} ta="center">
                {t(`items.${item.key}.desc`)}
              </Text>
            </YStack>
          </YStack>
        ))}
      </XStack>

      <YStack w="100%" aspectRatio={IMAGE_RATIO}>
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
            padding: 12,
          }}
        >
          <Text col={market.onDark} fos={fontSize.h1} lh={38} fow={fontWeight.semibold}>
            {t('statValue')}
          </Text>
          <Text col={market.onDark} fos={fontSize.bodySm} lh={18} fow={fontWeight.medium}>
            {t('statLabel')}
          </Text>
        </ImageBackground>
        <Image
          source={require('../../../../../assets/images/home/why-image.png')}
          accessibilityLabel={t('imageAlt')}
          contentFit="contain"
          style={{ width: '100%', height: '100%' }}
        />
      </YStack>
    </YStack>
  );
}
