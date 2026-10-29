import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { IconName } from '@/components/ui/Chip';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { HomeSectionHeading } from './HomeSectionHeading';

/**
 * Bốn cam kết — cùng khoá và thứ tự với `WhyChooseUs` bên web. Biểu tượng là Ionicons gần nhất với
 * nét vẽ v2 (thẻ giá · nhóm người · đồng hồ · bong bóng chat): app chỉ có một bộ icon.
 */
const ITEMS: readonly { key: 'price' | 'fleet' | 'time' | 'support'; icon: IconName }[] = [
  { key: 'price', icon: 'pricetag-outline' },
  { key: 'fleet', icon: 'people-outline' },
  { key: 'time', icon: 'alarm-outline' },
  { key: 'support', icon: 'chatbubbles-outline' },
];

/** `.iconWrap` ≤640px: đệm 12 + ô 48 thu 0.75 = đĩa 60. */
const ICON_DISC = 60;

/** "Tại sao lại chọn XePrime" — nội dung tĩnh, lưới 2 × 2 như bản vẽ mobile v2 (`19771:51689`). */
export function WhyChooseUs() {
  const colors = useColors();
  const t = useTranslations('Home.why');

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />
      {/* `.list` web: đáy kẻ 1px màu `bg`, đệm dưới 40; hàng cách 24. */}
      <XStack
        flexWrap="wrap"
        rowGap={space.lg}
        pb={space.xl + space.sm}
        borderBottomWidth={1}
        borderBottomColor={colors.background}
      >
        {ITEMS.map((item, index) => (
          <YStack key={item.key} w="50%" px={space.sm} ai="center" gap={space.lg}>
            {/* Vạch ngăn giữa hai cột (`.item:nth-child(even)::before` web), màu `bg`. */}
            {index % 2 === 1 ? (
              <YStack pos="absolute" left={0} top={0} bottom={0} w={1} bg={colors.background} />
            ) : null}
            <YStack
              w={ICON_DISC}
              h={ICON_DISC}
              br={radius.pill}
              ai="center"
              jc="center"
              bg={colors.primarySubtle}
            >
              <Ionicons name={item.icon} size={27} color={colors.primary} />
            </YStack>
            <YStack gap={6} ai="center">
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} ta="center">
                {t(`items.${item.key}.title`)}
              </Text>
              <Text col={colors.text} fos={fontSize.body} ta="center">
                {t(`items.${item.key}.desc`)}
              </Text>
            </YStack>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}
