import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { SectionHeader } from './SectionHeader';

/** Bốn bước cố định, không phải dữ liệu từ API. Cùng thứ tự và cùng chữ với web. */
const STEPS: readonly { key: string; icon: IconName }[] = [
  { key: 'search', icon: 'search' },
  { key: 'request', icon: 'paper-plane' },
  { key: 'pickup', icon: 'key' },
  { key: 'return', icon: 'checkmark-done' },
];

const BADGE_HEIGHT = 34;

/**
 * "Thuê xe chỉ với 4 bước". Web xếp 4 cột ngang; native xếp dọc vì màn hẹp.
 *
 * Biểu tượng rồi tới số thứ tự có dấu chấm, chung một viên: chúng cùng trả lời "bước này là
 * bước nào", tách thành hai khối chồng nhau thì hàng nào cũng có hai thứ tranh chỗ mở đầu.
 * Đường nối dọc giữa các viên nói ra đây là một chuỗi có thứ tự, không phải bốn mục rời.
 */
export function RentalSteps() {
  const t = useTranslations('Marketplace.steps');

  return (
    <YStack gap={layout.block}>
      <SectionHeader title={t('title')} />

      {/* Bọc trong thẻ chìm: đây là nội dung GIỚI THIỆU cuối trang, lùi một bậc so với danh
          sách xe để không tranh sự chú ý với phần người dùng thật sự thao tác. */}
      <Card tone="muted" lift="flat">
        <YStack>
          {STEPS.map((step, index) => {
            const last = index === STEPS.length - 1;

            return (
              <XStack key={step.key} gap={space.md}>
                <YStack ai="center">
                  <XStack
                    ai="center"
                    gap={space.xs}
                    h={BADGE_HEIGHT}
                    px={space.sm}
                    br={radius.pill}
                    bg={colors.primary}
                  >
                    <Ionicons name={step.icon} size={15} color={colors.onPrimary} />
                    <Text col={colors.onPrimary} fos={fontSize.bodySm} fow={fontWeight.bold}>
                      {index + 1}.
                    </Text>
                  </XStack>

                  {/* Đường nối chạy tới viên kế tiếp; bước cuối không có gì để nối. */}
                  {last ? null : (
                    <YStack w={2} f={1} bg={colors.primaryLight} minHeight={space.sm} />
                  )}
                </YStack>

                <YStack f={1} gap={2} pb={last ? 0 : space.md}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {t(`${step.key}.title` as never)}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t(`${step.key}.desc` as never)}
                  </Text>
                </YStack>
              </XStack>
            );
          })}
        </YStack>
      </Card>
    </YStack>
  );
}
