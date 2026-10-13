import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { dayjs } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { StatGrid } from '@/components/ui/StatGrid';
import { AccountTrackNotice } from '@/features/account/components/AccountTrackNotice';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { greetingKey, todayLabel } from './dashboard-model';
import { AgendaPanel } from './components/AgendaPanel';
import { OwnerVehiclesPanel, ReputationPanel, WalletPanel } from './components/SidePanels';
import { AnswerBanner, TodayFocus } from './components/TodayFocus';
import {
  useDashboardAnswer,
  useDashboardLinks,
  useDashboardRefresh,
  useIsShopOwner,
  usePartnerOverview,
} from './hooks/use-dashboard';
import { useMonthKpiCells } from './hooks/use-month-kpis';

/**
 * Tổng quan của CHỦ XE CÁ NHÂN (tuyến hoa hồng — Owner Lite) — bản native của `OwnerDashboardView`
 * bên web (PR #170). Bốn câu hỏi theo thứ tự: ai đang hỏi thuê → hôm nay giao/nhận xe nào → tháng
 * này kiếm được bao nhiêu (sổ ví) → xe có đang trên chợ không.
 *
 * Cố ý KHÔNG có biểu đồ doanh thu, sổ thu chi: "sổ tổng hợp" là năng lực của gói (ADR 0027 điều
 * 1); server cũng không trả `trend` cho tuyến này. Không có ô chi nhánh.
 */
export function OwnerDashboardScreen() {
  const t = useTranslations('Dashboard');
  const fmt = useAppFormat();
  const session = useCurrentUser();
  const isOwner = useIsShopOwner();
  const overview = usePartnerOverview();
  const links = useDashboardLinks();
  const refresh = useDashboardRefresh();
  const answer = useDashboardAnswer(overview.data);
  const data = overview.data;
  const monthCells = useMonthKpiCells(data?.month, overview.isError, links);

  const now = dayjs();
  const name = session.data?.displayName?.trim();
  const title = name ? t(`greeting.${greetingKey(now)}`, { name }) : t('title');

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      >
        <ManagePageTitle title={title} total={todayLabel(fmt, now)} />
        <YStack px={layout.screenX} gap={layout.section} pb={layout.section}>
          {/* Dải tuyến (chờ trả gói / lỗi cấu hình gói) đứng đầu như web `OwnerLiteHome` — ADR 0038. */}
          <AccountTrackNotice />
          <AnswerBanner answer={answer} />
          <TodayFocus overview={data} isError={overview.isError} links={links} />
          {monthCells.length > 0 ? (
            <Card padded={false}>
              <StatGrid variant="list" cells={monthCells} emphasis="even" />
            </Card>
          ) : null}
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
          {/* Ví là của CHỦ (`@ShopOwnerOnly`) — thành viên không có ví nào để xem. */}
          {isOwner ? <WalletPanel showIncome href={links.balance} /> : null}
          <OwnerVehiclesPanel links={links} />
          <ReputationPanel metrics={data?.reputation} />
        </YStack>
      </Screen>
    </>
  );
}
