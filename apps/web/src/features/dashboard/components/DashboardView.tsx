'use client';

import {
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  KeyOutlined,
  LockOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { UseQueryResult } from '@tanstack/react-query';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { ROUTES, receiptsPath } from '@/constants/routes';
import { dayjs } from '@/lib/datetime';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { dashboardMonthRange, dashboardTodayRange } from '../api';
import { useVehicleStats } from '../hooks/use-vehicle-stats';
import { useDashboardBookings } from '../hooks/use-dashboard-bookings';
import { useDashboardMoney } from '../hooks/use-dashboard-money';
import { BookingMiniList } from './BookingMiniList';
import { DashboardPanel } from './DashboardPanel';
import { ReceiptMiniList } from './ReceiptMiniList';
import { ShopOnboardingCard } from './ShopOnboardingCard';
import { StatCard } from './StatCard';
import styles from './DashboardView.module.css';

/**
 * Ngày hôm nay kèm THỨ.
 *
 * Trước đây là `dayjs().format('dddd, …')` và chỉ ra tiếng Việt nhờ một lời gọi
 * `dayjs.locale('vi')` toàn tiến trình ở providers. Lời gọi đó đã bị gỡ (ADR 0012: nó rò
 * ngôn ngữ giữa các request render song song), nên chỗ này đi qua formatter của request.
 */
function todayLabel(fmt: AppFormat): string {
  const text = fmt.fullDate(dayjs());
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export function DashboardView() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const router = useRouter();
  const { data: stats, isLoading } = useVehicleStats();
  const { recent, dueToday, upcoming, activeCount, overdueCount } = useDashboardBookings();
  const money = useDashboardMoney();

  const goBookings = () => router.push(ROUTES.MANAGE.BOOKINGS);
  const goTodayReceipts = () => router.push(receiptsPath.filtered(dashboardTodayRange()));

  /*
   * Đích của hai thẻ tiền phải LỌC ĐÚNG bộ mà con số trên thẻ được cộng ra — cùng bộ tham số
   * mà `FinanceOverviewCards` dùng cho hai thẻ tương ứng ở màn Tổng quan doanh thu.
   *
   * Thiếu `status`/`sourceGroup` thì thẻ nói một số còn sổ nó dẫn tới nói số khác (cảnh báo ghi
   * sẵn ở docblock của `receiptsPath`): `revenue` đã LOẠI tiền giữ hộ và chỉ tính phiếu đã
   * duyệt, còn sổ không lọc thì cộng cả cọc lẫn phiếu chờ duyệt.
   *
   * Thẻ cọc KHÔNG mang kỳ: `depositHeld` là số TẠI THỜI ĐIỂM NÀY (cọc đã thu chưa hoàn), không
   * phải số của tháng — kẹp thêm `from`/`to` vào đây là dẫn sang một tập phiếu khác hẳn.
   */
  const goRevenueReceipts = () =>
    router.push(
      receiptsPath.filtered({
        ...dashboardMonthRange(),
        status: RECEIPT_STATUS.APPROVED,
        type: RECEIPT_TYPE.INCOME,
        sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
      }),
    );

  const goDepositReceipts = () =>
    router.push(
      receiptsPath.filtered({
        status: RECEIPT_STATUS.APPROVED,
        sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
      }),
    );

  /**
   * Giá trị của một thẻ tiền: lỗi nói ra thành chữ, chưa có dữ liệu thì để `loading` của
   * `StatCard` lo. Nuốt lỗi thành `—` là cách một thẻ hỏng trông y hệt một gian hàng chưa
   * có doanh thu.
   */
  function moneyValue<T>(query: UseQueryResult<T>, render: (data: T) => string): string {
    if (query.isError) return tCommon('states.error');
    if (!query.data) return tCommon('labels.emptyValue');
    return render(query.data);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.date}>{todayLabel(fmt)}</p>
      </header>

      {/*
        Gian hàng chưa duyệt xong / chưa có xe: ba bước cần làm đứng TRƯỚC bảng số liệu, vì lúc
        đó mọi ô số đều là 0 và không ô nào nói được việc gì tiếp theo. Thẻ tự ẩn khi hết việc.
      */}
      <ShopOnboardingCard vehicleCount={stats?.total} />

      <div className={styles.stats}>
        <StatCard
          label={t('stats.available')}
          value={stats ? `${stats.available}/${stats.total}` : '—'}
          icon={CarOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.renting')}
          value={activeCount === undefined ? '—' : t('stats.rentingValue', { count: activeCount })}
          icon={KeyOutlined}
          tone="blue"
        />
        {/*
          Hai thẻ tiền chỉ có ở bậc có sổ tổng hợp (ADR 0027 điều 1). Bậc cơ bản KHÔNG thấy
          chúng — thẻ "Doanh thu 0 ₫" cho người chưa mua gói vừa sai vừa trông như hỏng.
        */}
        {money.visible ? (
          <>
            <StatCard
              label={t('stats.revenue')}
              value={moneyValue(money.summary, (s) => fmt.money(s.revenue))}
              hint={t('stats.revenueHint')}
              icon={DollarOutlined}
              tone="gold"
              loading={money.summary.isLoading}
              onClick={goRevenueReceipts}
            />
            <StatCard
              label={t('stats.deposit')}
              value={moneyValue(money.summary, (s) => fmt.money(s.depositHeld))}
              // Mẫu số chỉ có nghĩa khi con số bên trên có nghĩa — lỗi thì bỏ trống, đừng
              // in "Đã có lỗi xảy ra" hai lần trong cùng một thẻ.
              hint={
                money.summary.data
                  ? t('stats.depositHint', { count: money.summary.data.depositHeldBookings })
                  : undefined
              }
              icon={LockOutlined}
              tone="gold"
              loading={money.summary.isLoading}
              onClick={goDepositReceipts}
            />
          </>
        ) : null}
        <StatCard
          label={t('stats.overdue')}
          value={
            overdueCount === undefined ? '—' : t('stats.overdueValue', { count: overdueCount })
          }
          icon={ExclamationCircleOutlined}
          tone="red"
          danger={Boolean(overdueCount)}
        />
      </div>

      <div className={styles.panels}>
        <DashboardPanel title={t('panels.recent')} icon={<FileTextOutlined />}>
          <BookingMiniList
            items={recent.data?.items ?? []}
            loading={recent.isLoading}
            empty={t('panels.recentEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title={t('panels.dueToday')} icon={<WarningOutlined />}>
          <BookingMiniList
            items={dueToday.data?.items ?? []}
            loading={dueToday.isLoading}
            empty={t('panels.dueTodayEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        <DashboardPanel title={t('panels.upcoming')} icon={<ClockCircleOutlined />}>
          <BookingMiniList
            items={upcoming.data?.items ?? []}
            loading={upcoming.isLoading}
            empty={t('panels.upcomingEmpty')}
            onSelect={goBookings}
          />
        </DashboardPanel>
        {/* Panel sổ quỹ đi cùng điều kiện với hai thẻ tiền — cùng một tính năng, cùng một quyền. */}
        {money.visible ? (
          <DashboardPanel title={t('panels.receipts')} icon={<SwapOutlined />}>
            <ReceiptMiniList
              items={money.todayReceipts.data?.items ?? []}
              loading={money.todayReceipts.isLoading}
              empty={
                money.todayReceipts.isError ? tCommon('states.error') : t('panels.receiptsEmpty')
              }
              onSelect={goTodayReceipts}
            />
          </DashboardPanel>
        ) : null}
      </div>
    </div>
  );
}
