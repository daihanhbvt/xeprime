import { Fragment } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import type { CustomerRevenue } from '../api';
import { PerformanceDivider, PERFORMANCE_LIST_GAP } from './PerformanceDivider';
import { PerformanceRow } from './PerformanceRow';

/**
 * TOP khách theo doanh thu của kỳ - tab "Theo khách" của thẻ "Hiệu suất kinh doanh", cùng kiểu dòng
 * với tab Theo xe (Figma chỉ vẽ tab xe). Chỉ trang đầu, sắp xếp mặc định của server (doanh thu
 * giảm dần), không ô sắp xếp, không "Xem thêm" (người dùng chốt 25/11/2026).
 *
 * **Cơ sở là TIỀN THẬT ĐÃ THU**, không phải giá trị đơn đã chốt - cùng phép tính với ô "Doanh thu"
 * đầu màn. Tỷ trọng do SERVER tính trên Decimal (ADR 0007), ở đây chỉ hiển thị.
 */
export function CustomerRevenueList({
  items,
  loading,
  error,
}: {
  items: readonly CustomerRevenue[];
  loading: boolean;
  error: { error: unknown; onRetry: () => void } | null;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.overview.customers');
  const tVehicles = useTranslations('Finance.overview.vehicles');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canOpenCustomer = permissions.has(PERMISSION.CUSTOMER_VIEW);

  if (error) return <ScreenError error={error.error} title={t('error')} onRetry={error.onRetry} />;
  if (loading && items.length === 0) return <SkeletonText lines={5} />;
  if (items.length === 0) {
    return <ScreenMessage icon="people-outline" title={t('empty')} description={t('emptyHint')} />;
  }

  return (
    <YStack gap={PERFORMANCE_LIST_GAP}>
      {items.map((row, index) => (
        <Fragment key={row.tenantCustomerId ?? `none-${index}`}>
          {index > 0 ? <PerformanceDivider /> : null}
          <PerformanceRow
            name={row.fullName}
            imageUrl={row.avatarUrl}
            // SĐT chỉ có khi người xem có `customer.view` - server đã che.
            subParts={[
              ...(row.phone ? [row.phone] : []),
              tVehicles('tripsCount', { trips: row.trips }),
            ]}
            amount={fmt.money(row.revenue)}
            note={row.sharePercent == null ? tLabels('emptyValue') : t('shareOfPeriod', { value: row.sharePercent })}
            noteTone={colors.infoStrong}
            // Tỷ trọng đã ở góc phải, chuyến ở dòng phụ - không lặp lại trong ô xám (người dùng 26/11/2026).
            facts={[]}
            {...(canOpenCustomer && row.tenantCustomerId
              ? { onPress: () => navigateOnce(ROUTES.manage.customerDetail(row.tenantCustomerId as string)) }
              : {})}
          />
        </Fragment>
      ))}
    </YStack>
  );
}
