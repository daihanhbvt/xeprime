import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { HomeSectionHeading } from './home/HomeSectionHeading';

/**
 * Bốn bước theo thứ tự đặt xe thật (ADR 0044: gửi yêu cầu → duyệt → giữ chỗ → nhận xe) — cùng
 * khoá với web. Hình là các ô cắt của MỘT tấm sprite; vị trí và khung cắt (phần trăm của ô hình)
 * chép từ `.art*` trong CSS bên web.
 */
const STEPS = [
  { key: 'search', top: -0.2102, left: -0.1372, width: 4.7023, height: 1.9068 },
  { key: 'request', top: -0.3286, left: -1.5398, width: 5.288, height: 2.1443 },
  { key: 'pickup', top: -0.2538, left: -2.575, width: 4.9169, height: 1.9938 },
  { key: 'return', top: -0.2318, left: -3.6912, width: 4.8334, height: 1.96 },
] as const;

/** Ô hình 240 × 213 của bản vẽ. */
const ART_RATIO = 240 / 213;

/**
 * "Các bước thuê xe — Thuê xe đơn giản chỉ với 4 bước" (design v2, ADR 0062).
 *
 * Lưới 2 × 2 như bản vẽ mobile (`19771:56025`); mũi tên nối giữa các bước của web chỉ có ở hàng
 * ngang máy tính, web cũng ẩn nó dưới 1024px.
 */
export function RentalSteps() {
  const colors = useColors();
  const t = useTranslations('Home.steps');
  // Bề ngang ô đo một lần lúc dựng: vị trí cắt sprite tính theo số đo thật của ô.
  const [artWidth, setArtWidth] = useState(0);
  const artHeight = artWidth / ART_RATIO;

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />
      {/* Lưới 2 × 2 theo Figma mobile; hai ô một hàng cao bằng nhau (stretch của dòng wrap). */}
      <XStack flexWrap="wrap" jc="space-between" rowGap={space.xl}>
        {STEPS.map((step, index) => (
          <YStack key={step.key} w="47%" gap={space.sm} ai="center">
            <YStack
              w="100%"
              aspectRatio={ART_RATIO}
              ov="hidden"
              onLayout={
                index === 0 ? (event) => setArtWidth(event.nativeEvent.layout.width) : undefined
              }
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {artWidth > 0 ? (
                <Image
                  source={images.homeStepsSprite}
                  contentFit="fill"
                  style={{
                    position: 'absolute',
                    top: artHeight * step.top,
                    left: artWidth * step.left,
                    width: artWidth * step.width,
                    height: artHeight * step.height,
                  }}
                />
              ) : null}
            </YStack>
            <YStack gap={space.xs} ai="center">
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} ta="center">
                {t(`items.${step.key}.title`)}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t(`items.${step.key}.desc`)}
              </Text>
            </YStack>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}
