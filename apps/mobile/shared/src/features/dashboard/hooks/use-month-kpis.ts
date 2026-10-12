import { useTranslations } from 'use-intl';
import { countChangePercent } from '@xeprime/domain';
import type { StatCell } from '@/components/ui/StatGrid';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors } from '@/theme/tokens';
import type { PartnerOverviewMonth } from '../api';
import { utilizationPointChange } from '../dashboard-model';
import type { DashboardLinks } from './use-dashboard';

/**
 * Dòng "so với cùng kỳ tháng trước" — bản native của `ChangeBadge` bên web, rút về MỘT dòng chữ để
 * nằm vừa hàng chú thích của `StatGrid` (`hint`). `null` ⇒ "Chưa có số cùng kỳ để so", KHÔNG phải
 * "0%" — một gian hàng tháng trước chưa có chuyến nào mà thẻ hiện 0% là nói sai về chính họ.
 */
export function useChangeText(): (value: number | null, unit?: 'percent' | 'points') => string {
  const t = useTranslations('Dashboard.change');
  return (value, unit = 'percent') => {
    if (value === null) return t('none');
    if (value === 0) return `${t('flat')} ${t('suffix')}`;
    const up = value > 0;
    const magnitude = Math.abs(value);
    const text =
      unit === 'points'
        ? t(up ? 'pointsUp' : 'pointsDown', { value: magnitude })
        : t(up ? 'up' : 'down', { value: magnitude });
    return `${text} ${t('suffix')}`;
  };
}

/**
 * Ba KPI vận hành của THÁNG NÀY (đơn mới · chuyến hoàn thành · tỉ lệ lấp đầy), mỗi ô so cùng kỳ
 * tháng trước và dẫn tới danh sách tạo nên nó — bản native của `MonthKpis` bên web.
 *
 * `month === null` (thiếu `bookings.view`) ⇒ không ô nào. `undefined` (đang tải / lỗi) ⇒ ô hiện
 * `—`/"Không rõ", không bao giờ 0.
 */
export function useMonthKpiCells(
  month: PartnerOverviewMonth | null | undefined,
  isError: boolean,
  links: DashboardLinks,
): StatCell[] {
  const t = useTranslations('Dashboard.kpi');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const change = useChangeText();

  if (month === null) return [];
  const missing = isError ? tCommon('unknown') : tCommon('emptyValue');

  return [
    {
      key: 'newBookings',
      icon: 'document-text-outline',
      label: t('newBookings'),
      value: month ? fmt.count(month.newBookings) : missing,
      ...(month ? { hint: change(countChangePercent(month.newBookings, month.newBookingsPrevious)) } : {}),
      tone: colors.info,
      surface: colors.infoSurface,
      onPress: () => navigateOnce(links.allBookings),
    },
    {
      key: 'completedTrips',
      icon: 'checkmark-circle-outline',
      label: t('completedTrips'),
      value: month ? fmt.count(month.completedTrips) : missing,
      ...(month
        ? { hint: change(countChangePercent(month.completedTrips, month.completedTripsPrevious)) }
        : {}),
      tone: colors.success,
      surface: colors.successSurface,
      onPress: () => navigateOnce(links.completed),
    },
    {
      key: 'utilization',
      icon: 'pie-chart-outline',
      label: t('utilization'),
      value: month
        ? month.utilizationPercent === null
          ? t('utilizationEmpty')
          : t('utilizationValue', { value: month.utilizationPercent })
        : missing,
      hint:
        month && month.utilizationPercent !== null
          ? [
              t('utilizationHint'),
              change(
                utilizationPointChange(month.utilizationPercent, month.utilizationPercentPrevious),
                'points',
              ),
            ]
          : t('utilizationHint'),
      tone: colors.primaryActive,
      surface: colors.primaryLight,
      onPress: () => navigateOnce(links.calendar),
    },
  ];
}
