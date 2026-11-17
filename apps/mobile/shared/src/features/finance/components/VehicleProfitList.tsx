import { useMemo } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEFAULT_VEHICLE_PROFIT_SORT,
  PERMISSION,
  STATUS_COLOR,
  VEHICLE_PROFIT_SORT_VALUES,
  type PaginationMeta,
} from '@xeprime/types';
import { isNegativeMoney, isZeroMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Button } from '@/components/ui/Button';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { VehicleProfit } from '../api';

/** Ô biểu tượng đầu thẻ — vừa đúng chiều cao hai dòng chữ (tên xe + biển số). */
const TILE_SIZE = 36;

/** Biển số giãn chữ nhẹ để đọc như một MÃ, không như một từ. */
const PLATE_TRACKING = 0.5;

/**
 * Lãi/lỗ theo từng xe trong kỳ — bảng của web thành một dải THẺ.
 *
 * **Sắp xếp bằng ô chọn, không bằng đầu cột** (web cũng vậy): sắp xếp chạy trên SERVER, và một
 * mũi tên trên đầu cột hứa sắp xếp tại chỗ trong khi thực tế nó nạp lại trang.
 *
 * Dải luôn hiện đủ mọi xe CÓ PHÁT SINH trong kỳ, kể cả xe doanh thu 0 mà có chuyến — đó chính
 * là dấu hiệu cần đi ghi phiếu, nên giấu nó đi là giấu mất việc cần làm.
 */
export function VehicleProfitList({
  items,
  meta,
  sort,
  unassignedCost,
  loading,
  error,
  onSortChange,
  onPageChange,
  embedded = false,
}: {
  items: readonly VehicleProfit[];
  meta: PaginationMeta;
  sort: string | undefined;
  /** Chi phí trong kỳ KHÔNG gắn xe nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedCost: string | undefined;
  loading: boolean;
  error: { error: unknown; onRetry: () => void } | null;
  onSortChange: (next: string) => void;
  onPageChange: (page: number) => void;
  /**
   * Nằm TRONG thẻ "Hiệu suất kinh doanh" (web `BusinessPerformanceCard`, ledger 09 §3.9): thẻ đã
   * có tiêu đề + tab, nên dải không in tiêu đề riêng của nó.
   */
  embedded?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.overview.vehicles');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canOpenVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);

  const sortOptions = useMemo(
    () => VEHICLE_PROFIT_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  return (
    <YStack gap={space.sm}>
      {embedded ? null : <SectionHeader icon="car-outline">{t('title')}</SectionHeader>}

      <SelectControl
        label={t('sort.label')}
        value={sort ?? DEFAULT_VEHICLE_PROFIT_SORT}
        options={sortOptions}
        onChange={onSortChange}
      />

      {error ? (
        <ScreenError error={error.error} title={t('error')} onRetry={error.onRetry} />
      ) : loading && items.length === 0 ? (
        <SkeletonText lines={5} />
      ) : items.length === 0 ? (
        <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('total', { count: meta.total })}
          </Text>

          {items.map((row, index) => {
            const loss = isNegativeMoney(row.profit);
            const profitTone = loss ? colors.danger : colors.success;
            const margin = row.profitMarginPercent;
            // Biên: âm đỏ · thấp (<40%) cam · cao xanh - như Figma "Hiệu suất kinh doanh"; `null` là "-".
            const marginTone =
              margin == null ? colors.textMuted : margin < 0 ? colors.danger : margin < 40 ? colors.warning : colors.success;

            return (
              // Hàng phẳng như Figma (`24228:98928`): ảnh + tên/biển·chuyến + lợi nhuận/biên, rồi hai ô Thu / Chi.
              <Pressable
                key={row.vehicleId}
                disabled={!canOpenVehicle}
                onPress={() => navigateOnce(ROUTES.manage.vehicleDetail(row.vehicleId))}
                accessibilityRole={canOpenVehicle ? 'button' : undefined}
                accessibilityLabel={row.vehicleName}
              >
                <YStack gap={space.sm} py={space.sm} borderTopWidth={index === 0 ? 0 : 1} borderTopColor={colors.borderSubtle}>
                  <XStack ai="center" gap={space.sm}>
                    <VehicleThumb uri={row.mainImageUrl} accessibilityLabel={row.vehicleName} />
                    <YStack f={1} minWidth={0} gap={2}>
                      <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold} numberOfLines={1}>
                        {row.vehicleName}
                      </Text>
                      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                        {[row.plateNumber ?? tLabels('emptyValue'), t('tripsCount', { trips: row.trips })].join(LIST_SEPARATOR)}
                      </Text>
                    </YStack>
                    <YStack ai="flex-end" gap={2} flexShrink={0}>
                      <Text col={profitTone} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.bold} numberOfLines={1}>
                        {fmt.money(row.profit)}
                      </Text>
                      <Text col={marginTone} fos={fontSize.label} numberOfLines={1}>
                        {t('marginLine', {
                          value: margin == null ? tLabels('emptyValue') : t('marginValue', { value: margin }),
                        })}
                      </Text>
                    </YStack>
                  </XStack>
                  <XStack gap={space.sm}>
                    <YStack f={1} minWidth={0} br={radius.md} bg={colors.surfaceMuted} p={space.sm} gap={2}>
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {t('columns.revenue')}
                      </Text>
                      <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.bold} numberOfLines={1}>
                        {fmt.money(row.revenue)}
                      </Text>
                    </YStack>
                    <YStack f={1} minWidth={0} br={radius.md} bg={colors.surfaceMuted} p={space.sm} gap={2}>
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {t('columns.cost')}
                      </Text>
                      <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.bold} numberOfLines={1}>
                        {fmt.money(row.cost)}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>
              </Pressable>
            );
          })}

          {/* Cuộn/dồn trang như Đơn thuê: "Xem thêm" tải trang kế, danh sách dồn lại (người dùng 17/11/2026). */}
          {meta.page * meta.limit < meta.total ? (
            <Button
              label={tActions('viewMore')}
              variant="outline"
              size="compact"
              loading={loading}
              onPress={() => onPageChange(meta.page + 1)}
            />
          ) : null}
        </>
      )}

      {/*
        Chi phí chung không gắn xe. Thiếu dòng này thì tổng "Chi phí" của dải nhỏ hơn ô "Chi phí"
        ở lớp Kết quả kinh doanh, và người dùng đi tìm mãi phần chênh mà không có chỗ nào giải
        thích. Nó KHÔNG phải một thẻ xe giả — nó là chú thích.

        Cố ý KHÔNG có lối đi ra sổ: sổ chưa lọc được "phiếu không gắn xe nào", nên một đường dẫn ở
        đây sẽ mở ra TOÀN BỘ phiếu chi và cho một con số khác hẳn câu vừa nói.
      */}
      {unassignedCost && !isZeroMoney(unassignedCost) ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('unassigned', { value: fmt.money(unassignedCost) })}
        </Text>
      ) : null}
    </YStack>
  );
}
