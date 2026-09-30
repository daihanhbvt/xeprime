import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_STATUS,
  SYSTEM_FINANCE_CATEGORY_VALUES,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type {
  FinanceCategoryBreakdown,
  FinanceCategoryBreakdownItem,
  FinancePeriodFilters,
} from '../api';

/** Chiều cao thanh tỷ trọng — đủ dày để đọc được ở đuôi mắt, không dày tới mức thành một khối. */
const BAR_HEIGHT = 6;

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

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{title}</BlockTitle>

      {error && !data ? (
        <Callout tone="warning">{t('error')}</Callout>
      ) : loading && !data ? (
        <SkeletonText lines={4} />
      ) : !data || data.items.length === 0 ? (
        <ScreenMessage icon="pie-chart-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <Card>
          <YStack gap={space.md}>
            {data.items.map((item) => (
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
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              >
                <YStack gap={space.xs}>
                  <XStack ai="center" gap={space.sm}>
                    <Text
                      f={1}
                      minWidth={0}
                      col={colors.text}
                      fos={fontSize.bodySm}
                      numberOfLines={1}
                    >
                      {labelOf(item)}
                    </Text>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {fmt.money(item.amount)}
                    </Text>
                    <DetailChevron />
                  </XStack>

                  {/* Chiều dài thanh chỉ biết lúc chạy — server đã tính `sharePercent` trên Decimal. */}
                  <YStack h={BAR_HEIGHT} br={radius.sm} bg={colors.surfaceMuted} ov="hidden">
                    <YStack
                      h={BAR_HEIGHT}
                      w={`${Math.max(0, Math.min(100, item.sharePercent))}%`}
                      br={radius.sm}
                      bg={tone === 'revenue' ? colors.success : colors.danger}
                    />
                  </YStack>

                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('share', { percent: item.sharePercent })} ·{' '}
                    {t('count', { count: item.count })}
                  </Text>
                </YStack>
              </Pressable>
            ))}
          </YStack>
        </Card>
      )}
    </YStack>
  );
}

/** Khoá danh mục hệ thống có bản dịch riêng — mọi khoá khác rơi về tên trong DB. */
function isSystemCategoryKey(key: string): key is SystemFinanceCategoryKey {
  return (SYSTEM_FINANCE_CATEGORY_VALUES as readonly string[]).includes(key);
}
