import { Fragment } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { isNegativeMoney } from '@xeprime/domain';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import type { VehicleProfit } from '../api';
import { PerformanceDivider, PERFORMANCE_LIST_GAP } from './PerformanceDivider';
import { PerformanceRow } from './PerformanceRow';

/** Biên dưới mốc này tô cam như Figma ("Biên 50%" cam, "Biên 73,3%" xanh). */
const LOW_MARGIN_PERCENT = 40;

/**
 * TOP xe theo lợi nhuận của kỳ (Figma "Hiệu suất kinh doanh" `24228:99117`) - chỉ trang đầu, sắp
 * xếp mặc định của server (lợi nhuận giảm dần); không ô sắp xếp, không "Xem thêm" (người dùng
 * chốt 25/11/2026 làm y Figma).
 */
export function VehicleProfitList({
  items,
  loading,
  error,
}: {
  items: readonly VehicleProfit[];
  loading: boolean;
  error: { error: unknown; onRetry: () => void } | null;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.overview.vehicles');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canOpenVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);

  if (error) return <ScreenError error={error.error} title={t('error')} onRetry={error.onRetry} />;
  if (loading && items.length === 0) return <SkeletonText lines={5} />;
  if (items.length === 0) {
    return <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />;
  }

  return (
    <YStack gap={PERFORMANCE_LIST_GAP}>
      {items.map((row, index) => {
        const margin = row.profitMarginPercent;
        // Biên: âm đỏ · thấp cam · cao xanh như Figma; `null` là "-".
        const marginTone =
          margin == null
            ? colors.textMuted
            : margin < 0
              ? colors.danger
              : margin < LOW_MARGIN_PERCENT
                ? colors.warningHigh
                : colors.success;
        return (
          <Fragment key={row.vehicleId}>
            {index > 0 ? <PerformanceDivider /> : null}
            <PerformanceRow
              name={row.vehicleName}
              imageUrl={row.mainImageUrl}
              subParts={[row.plateNumber ?? tLabels('emptyValue'), t('tripsCount', { trips: row.trips })]}
              amount={fmt.money(row.profit)}
              {...(isNegativeMoney(row.profit) ? { amountTone: colors.danger } : {})}
              note={t('marginLine', {
                value: margin == null ? tLabels('emptyValue') : t('marginValue', { value: margin }),
              })}
              noteTone={marginTone}
              facts={[
                { label: t('columns.revenue'), value: fmt.money(row.revenue) },
                { label: t('columns.cost'), value: fmt.money(row.cost) },
              ]}
              {...(canOpenVehicle
                ? { onPress: () => navigateOnce(ROUTES.manage.vehicleDetail(row.vehicleId)) }
                : {})}
            />
          </Fragment>
        );
      })}
    </YStack>
  );
}
