import CheckCircleOutlined from '@ant-design/icons-svg/es/asn/CheckCircleOutlined';
import FileAddOutlined from '@ant-design/icons-svg/es/asn/FileAddOutlined';
import PieChartOutlined from '@ant-design/icons-svg/es/asn/PieChartOutlined';
import { useTranslations } from 'use-intl';
import { countChangePercent } from '@xeprime/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import type { PartnerOverviewMonth } from '../api';
import type { KpiCard } from '../components/MonthKpis';
import { utilizationPointChange } from '../dashboard-model';
import type { DashboardLinks } from './use-dashboard';

/**
 * Ba KPI vận hành của THÁNG NÀY (đơn mới · chuyến hoàn thành · tỉ lệ lấp đầy), mỗi thẻ so cùng kỳ
 * tháng trước và dẫn tới danh sách tạo nên nó — bản native của web `MonthKpis` (cùng icon, tông,
 * thứ tự và `ChangeBadge`).
 *
 * `month === null` (thiếu `bookings.view`) ⇒ không thẻ nào. `undefined` (đang tải / lỗi) ⇒ thẻ hiện
 * `-`/"Không rõ", không bao giờ 0.
 */
export function useMonthKpiCards(
  month: PartnerOverviewMonth | null | undefined,
  isError: boolean,
  links: DashboardLinks,
): KpiCard[] {
  const t = useTranslations('Dashboard.kpi');
  const tApp = useTranslations('Dashboard.partnerApp');
  const tCommon = useTranslations('Common.labels');
  // Web: `month ? … : '-'`, `loading = isLoading && !month` - lỗi cũng chỉ là `-`, không thành 0.
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  if (month === null) return [];
  const missing = tCommon('emptyValue');
  const loading = !month && !isError;

  return [
    {
      key: 'newBookings',
      icon: FileAddOutlined,
      label: t('newBookings'),
      value: month ? fmt.count(month.newBookings) : missing,
      ...(month
        ? {
            change: {
              value: countChangePercent(month.newBookings, month.newBookingsPrevious),
              previous: fmt.count(month.newBookingsPrevious),
            },
          }
        : {}),
      tone: 'blue',
      loading,
      onPress: () => navigateOnce(links.allBookings),
    },
    {
      key: 'completedTrips',
      icon: CheckCircleOutlined,
      label: t('completedTrips'),
      value: month ? fmt.count(month.completedTrips) : missing,
      ...(month
        ? {
            change: {
              value: countChangePercent(month.completedTrips, month.completedTripsPrevious),
              previous: fmt.count(month.completedTripsPrevious),
            },
          }
        : {}),
      tone: 'green',
      loading,
      onPress: () => navigateOnce(links.completed),
    },
    {
      key: 'utilization',
      icon: PieChartOutlined,
      // Figma "Tỷ lệ lấp đầy" - khoá riêng app.
      label: tApp('utilization'),
      value: month
        ? month.utilizationPercent === null
          ? t('utilizationEmpty')
          : t('utilizationValue', { value: month.utilizationPercent })
        : missing,
      hint: t('utilizationHint'),
      ...(month && month.utilizationPercent !== null
        ? {
            change: {
              value: utilizationPointChange(month.utilizationPercent, month.utilizationPercentPrevious),
              unit: 'points' as const,
              ...(month.utilizationPercentPrevious != null
                ? { previous: t('utilizationValue', { value: month.utilizationPercentPrevious }) }
                : {}),
            },
          }
        : {}),
      tone: 'gold',
      loading,
      onPress: () => navigateOnce(links.calendar),
    },
  ];
}
