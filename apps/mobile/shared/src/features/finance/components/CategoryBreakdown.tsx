import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_STATUS,
  SYSTEM_FINANCE_CATEGORY_VALUES,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import type {
  FinanceCategoryBreakdown,
  FinanceCategoryBreakdownItem,
  FinancePeriodFilters,
} from '../api';

/** Chiều cao thanh tỷ trọng — đủ dày để đọc được ở đuôi mắt, không dày tới mức thành một khối. */
const BAR_HEIGHT = 8;
const BAR_RADIUS = 4;
/** Figma: tiêu đề và các dòng cách nhau 12. */
const ROW_GAP = 12;

/**
 * Cơ cấu doanh thu (hoặc chi phí) theo danh mục — thanh ngang, không phải bánh tròn.
 *
 * Vì sao thanh ngang: gian hàng có 18 danh mục hệ thống cộng danh mục riêng. Bánh tròn quá 5 lát
 * là không đọc được, còn thanh ngang xếp giảm dần đọc được ở mọi số lượng, mang được cả số tiền
 * lẫn tỷ trọng lẫn số phiếu trên cùng một dòng, và **bấm được từng dòng**.
 *
 * Màu ở đây KHÔNG mã hoá danh mục — mỗi dòng đã có tên chữ ngay bên trái, nên màu chỉ nói dòng
 * này thuộc chiều thu hay chiều chi.
 */
export function CategoryBreakdown({
  title,
  type,
  tone,
  data,
  filters,
  loading,
  error,
}: {
  title: string;
  /** Chiều tiền của khối này — quyết định màu thanh và tham số của đường dẫn ra sổ. */
  type: string;
  tone: 'revenue' | 'cost';
  data: FinanceCategoryBreakdown | undefined;
  filters: FinancePeriodFilters;
  loading: boolean;
  error: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.overview.categories');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  /**
   * Nhãn của một dòng.
   *
   * Danh mục HỆ THỐNG có tên tiếng Việt nằm trong DB, nên bản tiếng Anh dịch từ `systemKey` —
   * mã là dữ liệu, chỉ nhãn mới dịch (ADR 0012). Danh mục riêng của gian hàng (`systemKey` rỗng)
   * giữ nguyên tên người dùng tự đặt. Phiếu chưa gán danh mục có cả hai đều rỗng → một nhãn
   * riêng, không phải một ô trắng.
   */
  const labelOf = (item: FinanceCategoryBreakdownItem): string => {
    const key = item.systemKey;
    if (key && isSystemCategoryKey(key)) return t(`system.${key}`);
    return item.name ?? t('uncategorized');
  };

  /*
    Figma "Cơ cấu doanh thu" (`24228:99092`): khối NẰM TRONG một thẻ chung với cơ cấu chi phí (màn
    gọi bọc thẻ + vạch chia). Mỗi dòng: "tên · N phiếu" 14 mờ + tỷ trọng 14 đậm vừa, số tiền 14 mờ
    bên phải, rồi thanh 8 bo 4 - nền `information-low`, phần đầy xanh (thu) / tím (chi).
  */
  return (
    <YStack gap={ROW_GAP}>
      <SectionHeader>{title}</SectionHeader>

      {error && !data ? (
        <Callout tone="warning">{t('error')}</Callout>
      ) : loading && !data ? (
        <SkeletonText lines={4} />
      ) : !data || data.items.length === 0 ? (
        <ScreenMessage icon="pie-chart-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        data.items.map((item) => (
          <Pressable
            key={item.categoryId ?? 'uncategorized'}
            accessibilityRole="button"
            accessibilityLabel={`${labelOf(item)}: ${fmt.money(item.amount)}`}
            onPress={() =>
              navigateOnce(
                ROUTES.manage.receipts({
                  type,
                  status: RECEIPT_STATUS.APPROVED,
                  ...(item.categoryId ? { categoryId: item.categoryId } : {}),
                  ...(filters.from ? { from: filters.from } : {}),
                  ...(filters.to ? { to: filters.to } : {}),
                }),
              )
            }
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <YStack gap={space.sm}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <XStack f={1} minWidth={0} ai="center" gap={space.sm}>
                  <Text
                    flexShrink={1}
                    col={colors.textMuted}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    numberOfLines={1}
                  >
                    {t('row', { name: labelOf(item), count: item.count })}
                  </Text>
                  <Text
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {t('share', { percent: item.sharePercent })}
                  </Text>
                </XStack>
                <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {fmt.money(item.amount)}
                </Text>
              </XStack>

              {/* Chiều dài thanh chỉ biết lúc chạy — server đã tính `sharePercent` trên Decimal. */}
              <YStack h={BAR_HEIGHT} br={BAR_RADIUS} bg={colors.infoLow} ov="hidden">
                <YStack
                  h={BAR_HEIGHT}
                  w={`${Math.max(0, Math.min(100, item.sharePercent))}%`}
                  br={BAR_RADIUS}
                  bg={tone === 'revenue' ? colors.infoStrong : colors.purpleStrong}
                />
              </YStack>
            </YStack>
          </Pressable>
        ))
      )}
    </YStack>
  );
}

const styles = StyleSheet.create({ pressed: { opacity: 0.7 } });

/** Khoá danh mục hệ thống có bản dịch riêng — mọi khoá khác rơi về tên trong DB. */
function isSystemCategoryKey(key: string): key is SystemFinanceCategoryKey {
  return (SYSTEM_FINANCE_CATEGORY_VALUES as readonly string[]).includes(key);
}
