import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { PublicShop } from '../api';
import { ShopMapIcon, ShopStarIcon } from './shop-icons';

/** Ô icon tròn trước tên chi nhánh (web `.icon` 36×36). */
const BRANCH_ICON = 36;

/**
 * "Chi nhánh" của trang gian hàng — bản native của web `ShopBranches` (#222, Figma `20063:59234`).
 *
 * Chỉ những chi nhánh đang GIỮ xe công khai (backend gộp từ `public_listings`); điểm là trung bình
 * có trọng số theo số đánh giá — chưa có đánh giá thì ô điểm biến mất, không hiện 0. Danh sách hữu
 * hạn và nhỏ, không phân trang.
 */
export function ShopBranches({ branches }: { branches: PublicShop['branches'] }) {
  const colors = useColors();
  const t = useTranslations('Shops.branches');
  const fmt = useAppFormat();
  if (branches.length === 0) return null;

  return (
    <YStack gap={space.md}>
      <Text col={colors.text} fos={fontSize.lead} fow={fontWeight.semibold} accessibilityRole="header">
        {t('title')}
      </Text>
      {/* Bề ngang điện thoại: một cột (web @760px `grid-template-columns: minmax(0, 1fr)`). */}
      <YStack gap={space.md}>
        {branches.map((branch) => {
          const rating = branch.ratingAvg == null ? null : Number(branch.ratingAvg);
          const showRating = rating !== null && Number.isFinite(rating);
          return (
            <XStack
              key={branch.id}
              ai="center"
              gap={space.sm + space.xs}
              p={space.md}
              bw={1}
              bc={colors.border}
              br={radius.card}
              bg={colors.surface}
            >
              <YStack
                w={BRANCH_ICON}
                h={BRANCH_ICON}
                br={radius.pill}
                bg={colors.primaryLight}
                ai="center"
                jc="center"
              >
                <ShopMapIcon color={colors.primary} />
              </YStack>
              <YStack f={1} minWidth={0}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} numberOfLines={1}>
                  {branch.name}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {t('vehicles', { count: branch.vehicleCount })}
                  {branch.provinceName && !branch.name.includes(branch.provinceName)
                    ? ` · ${branch.provinceName}`
                    : null}
                </Text>
              </YStack>
              {showRating ? (
                <XStack
                  ai="center"
                  gap={space.xs}
                  alignSelf="flex-start"
                  accessibilityLabel={t('rating', { rating: fmt.rating(rating) })}
                >
                  <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
                    {fmt.rating(rating)}
                  </Text>
                  <ShopStarIcon size={16} />
                </XStack>
              ) : null}
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
}
