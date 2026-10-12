'use client';

import { useTranslations } from 'next-intl';
import { isShopOwner } from '@/constants/account-nav';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { greetingKey, todayLabel } from '../dashboard-model';
import { useDashboardAnswer } from '../hooks/use-dashboard-answer';
import { useDashboardLinks } from '../hooks/use-dashboard-links';
import { usePartnerOverview } from '../hooks/use-partner-overview';
import { AgendaPanel } from './AgendaPanel';
import { DashboardHeader } from './DashboardHeader';
import { MonthKpis } from './MonthKpis';
import { OwnerVehiclesPanel } from './OwnerVehiclesPanel';
import { ReputationPanel } from './ReputationPanel';
import { TodayFocus } from './TodayFocus';
import { WalletPanel } from './WalletPanel';
import styles from './DashboardView.module.css';

/**
 * TỔNG QUAN của CHỦ XE CÁ NHÂN (tuyến hoa hồng — Owner Lite, ADR 0051 điều 3).
 *
 * Người dùng ở đây có một tới ba chiếc xe và thường mở màn bằng điện thoại, giữa hai việc khác.
 * Họ hỏi bốn câu, theo đúng thứ tự này:
 *
 *  1. Có ai đang hỏi thuê xe tôi không, và tôi phải trả lời trước mấy giờ? → ô "Yêu cầu chờ duyệt";
 *  2. Hôm nay tôi phải giao / nhận xe nào, mấy giờ? → câu trả lời đầu trang + lịch giao nhận;
 *  3. Tháng này tôi kiếm được bao nhiêu, tiền đang ở đâu? → panel "Tiền của bạn" (sổ ví);
 *  4. Xe của tôi có đang hiện trên chợ không? → panel "Xe của bạn".
 *
 * Cố ý KHÔNG có: biểu đồ doanh thu theo tháng, doanh thu theo xe, sổ thu chi — "sổ tổng hợp" là
 * năng lực của gói (ADR 0027 điều 1); server cũng không trả `trend` cho tuyến này. Con số tiền duy
 * nhất là thu nhập THÁNG NÀY của bảng tổng hợp giao dịch — thứ chủ xe đã thấy ở trang số dư.
 *
 * Không có ô chọn chi nhánh: chủ xe cá nhân chỉ có chi nhánh mặc định.
 */
export function OwnerDashboardView() {
  const t = useTranslations('Dashboard');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const overview = usePartnerOverview();
  const links = useDashboardLinks();
  const answer = useDashboardAnswer(overview.data);
  const data = overview.data;

  const name = user?.displayName?.trim();
  const title = name ? t(`greeting.${greetingKey(dayjs())}`, { name }) : t('title');

  return (
    <div className={styles.wrap}>
      <DashboardHeader title={title} subtitle={todayLabel(fmt, dayjs())} answer={answer} />

      <TodayFocus overview={data} isError={overview.isError} links={links} />

      <MonthKpis month={data?.month} loading={overview.isLoading} links={links} />

      <div className={styles.columns}>
        <div className={styles.main}>
          {data?.agenda !== null ? (
            <AgendaPanel
              agenda={data?.agenda ?? undefined}
              generatedAt={data?.generatedAt}
              isError={overview.isError}
              onRetry={() => void overview.refetch()}
              bookingHref={links.booking}
              moreHref={links.allBookings}
            />
          ) : null}
          <OwnerVehiclesPanel links={links} />
        </div>

        <aside className={styles.side}>
          {/* Ví là của CHỦ (`@ShopOwnerOnly`) — thành viên không có ví nào để xem. */}
          {isShopOwner(user) ? <WalletPanel showIncome href={links.balance} /> : null}
          <ReputationPanel metrics={data?.reputation} />
        </aside>
      </div>
    </div>
  );
}
