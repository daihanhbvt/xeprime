import { useCallback, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type TenantStatus,
} from '@xeprime/types';
import { nowInAppTz } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ReceiptDetailSheet } from '@/features/finance/components/ReceiptDetailSheet';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors } from '@/theme/tokens';
import { shopStatusNotice } from '@/features/shop/status-notice';
import { dashboardMonthRange } from './api';
import { BookingMiniList } from './components/BookingMiniList';
import { DashboardPanel } from './components/DashboardPanel';
import { ReceiptMiniList } from './components/ReceiptMiniList';
import { ShopOnboardingCard } from './components/ShopOnboardingCard';
import { useDashboardBookings, useDashboardMoney, useFleetStats } from './hooks/use-dashboard';

/**
 * Tổng quan gian hàng (SHP-07) — bản native của `DashboardView` bên web.
 *
 * Ba nguyên tắc, và cả ba đều là chuyện đúng-sai chứ không phải thẩm mỹ:
 *
 * 1. **Không khối nào bịa số 0.** Truy vấn lỗi thì ô đó nói "lỗi", không nói "0" — một gian hàng
 *    chưa có doanh thu và một sổ quỹ hỏng là hai sự thật khác nhau.
 * 2. **Một khối lỗi không kéo cả màn thành màn lỗi.** Mỗi khối có loading/rỗng/lỗi RIÊNG.
 * 3. **Không gọi API cho khối người dùng không có quyền/không có gói.** `enabled` tắt query từ
 *    gốc thay vì gọi rồi nuốt 403.
 *
 * Số liệu KHÔNG tính lại ở đây: đội xe lấy `fleetSummary`, đơn lấy `/bookings` có phân trang,
 * tiền lấy `/finance/summary` — cùng endpoint, cùng định nghĩa với chính các màn nguồn, nên thẻ
 * ở đây và bảng ở kia không thể nói hai con số.
 */
export function ShopDashboardScreen() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common.labels');
  const tShop = useTranslations('Shop');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const comingSoon = useComingSoon();
  const { tenant } = useTenantScope();

  /*
   * Kéo-làm-mới đọc lại HỒ SƠ PHIÊN trước tiên: trạng thái gian hàng và quyền đều đến từ
   * `/auth/me`. Chủ shop vừa gia hạn gói, hay vừa bị gỡ khỏi gian hàng — đó là những thứ màn này
   * hiển thị, và không có lối làm mới thì phải đóng app mở lại mới thấy.
   */
  const session = useCurrentUser();

  /** Phiếu đang mở ở tấm trượt chi tiết. `null` = đóng, và `ReceiptDetailSheet` không gọi API. */
  const [receiptDetailId, setReceiptDetailId] = useState<string | null>(null);

  const canViewVehicles = permissions.has(PERMISSION.VEHICLE_VIEW);
  const canViewBookings = permissions.has(PERMISSION.BOOKING_VIEW);

  const fleet = useFleetStats(canViewVehicles);
  const bookings = useDashboardBookings(canViewBookings);
  const money = useDashboardMoney();

  const status = tenant?.status as TenantStatus | undefined;
  const notice = status ? shopStatusNotice(status) : null;

  /*
   * Ngày hôm nay kèm THỨ — theo giờ Việt Nam, không phải giờ máy: "hôm nay" của một chiếc điện
   * thoại đang ở múi giờ khác không phải hôm nay của gian hàng.
   */
  const today = fmt.fullDate(nowInAppTz());
  const todayLabel = today.charAt(0).toLocaleUpperCase() + today.slice(1);

  const goBookings = useCallback(
    () => navigateOnce(ROUTES.manage.bookings()),
    [navigateOnce],
  );

  /*
   * Đích của hai thẻ tiền phải LỌC ĐÚNG bộ mà con số trên thẻ được cộng ra — cùng bộ tham số mà
   * màn Tổng quan doanh thu dùng. Thiếu `status`/`sourceGroup` thì thẻ nói một số còn sổ nó mở ra
   * nói số khác: `revenue` đã LOẠI tiền giữ hộ và chỉ tính phiếu đã duyệt.
   *
   * Thẻ cọc KHÔNG mang kỳ: `depositHeld` là số TẠI THỜI ĐIỂM NÀY (cọc đã thu chưa hoàn), không
   * phải số của tháng — kẹp thêm `from`/`to` là dẫn sang một tập phiếu khác hẳn.
   */
  const goRevenueReceipts = useCallback(
    () =>
      navigateOnce(
        ROUTES.manage.receipts({
          ...dashboardMonthRange(),
          status: RECEIPT_STATUS.APPROVED,
          type: RECEIPT_TYPE.INCOME,
          sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
        }),
      ),
    [navigateOnce],
  );

  const goDepositReceipts = useCallback(
    () =>
      navigateOnce(
        ROUTES.manage.receipts({
          status: RECEIPT_STATUS.APPROVED,
          sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
        }),
      ),
    [navigateOnce],
  );


  /**
   * Giá trị của một ô số: lỗi nói ra thành CHỮ, chưa có dữ liệu thì `—`.
   *
   * Nuốt lỗi thành `—` cũng được, nhưng nuốt thành `0` thì không: một thẻ hỏng sẽ trông y hệt
   * một gian hàng chưa có doanh thu.
   */
  const cellValue = (isError: boolean, value: string | undefined): string =>
    isError ? tCommon('unknown') : (value ?? tCommon('emptyValue'));

  const cells: StatCell[] = [];

  if (canViewVehicles) {
    cells.push({
      key: 'available',
      icon: 'car-outline',
      label: t('stats.available'),
      value: cellValue(
        fleet.isError,
        fleet.data ? `${fleet.data.available}/${fleet.data.total}` : undefined,
      ),
      tone: colors.success,
      surface: colors.successSurface,
    });
  }

  if (canViewBookings) {
    cells.push(
      {
        key: 'renting',
        icon: 'key-outline',
        label: t('stats.renting'),
        value: cellValue(
          bookings.activeError,
          bookings.activeCount === undefined
            ? undefined
            : t('stats.rentingValue', { count: bookings.activeCount }),
        ),
        tone: colors.info,
        surface: colors.infoSurface,
      },
      {
        key: 'overdue',
        icon: 'alert-circle-outline',
        label: t('stats.overdue'),
        value: cellValue(
          bookings.overdueError,
          bookings.overdueCount === undefined
            ? undefined
            : t('stats.overdueValue', { count: bookings.overdueCount }),
        ),
        tone: colors.danger,
        surface: colors.dangerSurface,
        ...(bookings.overdueCount ? { valueTone: colors.danger } : {}),
        onPress: goBookings,
      },
    );
  }

  /*
   * Hai thẻ tiền chỉ có ở bậc CÓ sổ tổng hợp (ADR 0027 điều 1). Bậc cơ bản KHÔNG thấy chúng —
   * thẻ "Doanh thu 0 ₫" cho người chưa mua gói vừa sai vừa trông như hỏng.
   */
  if (money.visible) {
    cells.push(
      {
        key: 'revenue',
        icon: 'cash-outline',
        label: t('stats.revenue'),
        hint: t('stats.revenueHint'),
        value: cellValue(
          money.summary.isError,
          money.summary.data ? fmt.money(money.summary.data.revenue) : undefined,
        ),
        tone: colors.primaryActive,
        surface: colors.primaryLight,
        onPress: goRevenueReceipts,
      },
      {
        key: 'deposit',
        icon: 'lock-closed-outline',
        label: t('stats.deposit'),
        // Mẫu số chỉ có nghĩa khi con số bên trên có nghĩa — lỗi thì bỏ trống.
        ...(money.summary.data
          ? { hint: t('stats.depositHint', { count: money.summary.data.depositHeldBookings }) }
          : {}),
        value: cellValue(
          money.summary.isError,
          money.summary.data ? fmt.money(money.summary.data.depositHeld) : undefined,
        ),
        tone: colors.primaryActive,
        surface: colors.primaryLight,
        onPress: goDepositReceipts,
      },
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={session.isRefetching}
        onRefresh={() => void session.refetch()}
      >
        <ManagePageTitle title={t('title')} total={todayLabel} />

        <YStack px={layout.screenX} gap={layout.section} pb={layout.section}>
          {/*
            Dải trạng thái gian hàng đọc từ CÙNG bảng mà màn hồ sơ dùng (`shopStatusNotice`) —
            `active` thì không hiện gì, vì một dải "mọi thứ đều ổn" đứng thường trực chỉ dạy
            người dùng bỏ qua vùng đó.
          */}
          {notice?.showInShell ? (
            <Callout
              tone={notice.tone}
              title={tShop(`status.${notice.key}.title` as 'status.draft.title')}
            >
              <CalloutBody>
                {tShop(`status.${notice.key}.shell` as 'status.draft.shell')}
              </CalloutBody>
              {/*
                Nút nằm TRONG dải, không đứng dưới nó: một nút rời bên ngoài đọc ra như hành động
                của cả trang, trong khi nó chỉ giải quyết đúng chuyện mà dải vừa nói. Cỡ `sm` và
                không chiếm trọn bề ngang vì đây là hành động của MỘT khối, không phải của màn.

                `href` vắng = web CÓ lối đi này nhưng app chưa dựng màn (Hỗ trợ — SYS-05). Nút
                vẫn hiện và báo "đang phát triển", đúng quy ước của menu quản lý.
              */}
              {notice.action ? (
                <XStack>
                  <Button
                    label={tShop(`status.action.${notice.action.key}` as 'status.action.view')}
                    variant="secondary"
                    size="sm"
                    shape="square"
                    block={false}
                    onPress={() => {
                      const href = notice.action?.href;
                      if (href) navigateOnce(href);
                      else comingSoon();
                    }}
                  />
                </XStack>
              ) : null}
            </Callout>
          ) : null}

          {/*
            Gian hàng chưa duyệt xong / chưa có xe: ba bước cần làm đứng TRƯỚC bảng số liệu, vì
            lúc đó mọi ô đều là 0 và không ô nào nói được việc gì tiếp theo. Thẻ tự ẩn khi hết việc.
          */}
          <ShopOnboardingCard vehicleCount={fleet.data?.total} />

          {/*
            Dải chỉ số ở dạng DÒNG SỔ trong MỘT thẻ — cùng khuôn với `FinanceOverviewCards` ở màn
            Thu–Chi, và cùng lý do: mỗi chỉ số một hàng, nhãn đầy đủ bên trái, con số căn phải nên
            cả cột số thẳng một mép và mắt dò dọc được.

            Lưới hai cột thì mỗi ô cao gấp đôi (hình · số · nhãn · chú thích xếp chồng) và năm chỉ
            số ăn gần trọn màn hình trước khi tới khối đầu tiên — đúng cái làm Tổng quan phải cuộn
            mới thấy được việc cần làm.

            Thẻ bọc là BẮT BUỘC: `StatGrid` cố ý không có vỏ, để trần thì mấy nét kẻ chia ô trôi
            trên nền trang và cả dải trông như một khối chưa dựng xong.
          */}
          {cells.length > 0 ? (
            <Card padded={false}>
              {/*
                `emphasis="even"`: dải này đứng một mình dưới tiêu đề trang, không có `BlockTitle`
                nào ở trên như bên màn Tài chính — nhãn chính là thứ người ta quét mắt qua, nên nó
                phải ăn mực đen và đứng cùng bậc chữ với con số, không lép vế trước nó.
              */}
              <StatGrid variant="list" cells={cells} emphasis="even" />
            </Card>
          ) : null}

          {canViewBookings ? (
            <>
              <DashboardPanel
                title={t('panels.recent')}
                icon="document-text"
                tone="primary"
                loading={bookings.recent.isPending}
                error={bookings.recent.isError && !bookings.recent.data}
                empty={t('panels.recentEmpty')}
              >
                {bookings.recent.data?.items.length ? (
                  <BookingMiniList
                    items={bookings.recent.data.items}
                    onSelect={(booking) =>
                      navigateOnce(ROUTES.manage.bookingDetail(booking.id))
                    }
                  />
                ) : null}
              </DashboardPanel>

              <DashboardPanel
                title={t('panels.dueToday')}
                icon="alert-circle"
                tone="danger"
                loading={bookings.dueToday.isPending}
                error={bookings.dueToday.isError && !bookings.dueToday.data}
                empty={t('panels.dueTodayEmpty')}
              >
                {bookings.dueToday.data?.items.length ? (
                  <BookingMiniList
                    items={bookings.dueToday.data.items}
                    onSelect={(booking) =>
                      navigateOnce(ROUTES.manage.bookingDetail(booking.id))
                    }
                  />
                ) : null}
              </DashboardPanel>

              <DashboardPanel
                title={t('panels.upcoming')}
                icon="time"
                tone="warning"
                loading={bookings.upcoming.isPending}
                error={bookings.upcoming.isError && !bookings.upcoming.data}
                empty={t('panels.upcomingEmpty')}
              >
                {bookings.upcoming.data?.items.length ? (
                  <BookingMiniList
                    items={bookings.upcoming.data.items}
                    onSelect={(booking) =>
                      navigateOnce(ROUTES.manage.bookingDetail(booking.id))
                    }
                  />
                ) : null}
              </DashboardPanel>
            </>
          ) : null}

          {/* Khối sổ quỹ đi cùng điều kiện với hai thẻ tiền — cùng tính năng, cùng quyền. */}
          {money.visible ? (
            <DashboardPanel
              title={t('panels.receipts')}
              icon="swap-horizontal"
              tone="success"
              loading={money.todayReceipts.isPending}
              error={money.todayReceipts.isError && !money.todayReceipts.data}
              empty={t('panels.receiptsEmpty')}
            >
              {money.todayReceipts.data?.items.length ? (
                <ReceiptMiniList
                  items={money.todayReceipts.data.items}
                  onSelect={(receipt) => setReceiptDetailId(receipt.id)}
                />
              ) : null}
            </DashboardPanel>
          ) : null}
        </YStack>
      </Screen>

      {/*
        Chạm một dòng sổ quỹ mở CHI TIẾT phiếu ngay tại chỗ, không nhảy sang màn Thu-Chi.

        Dùng lại `ReceiptDetailSheet` — MỘT implementation cho mọi lối vào (sổ Thu-Chi, hồ sơ
        khách, hồ sơ xe, và giờ là Tổng quan). Chép một bản rút gọn ở đây là thêm một nơi phải nhớ
        cập nhật, và nơi bị bỏ quên luôn là nơi người dùng đang mở.

        Tấm trượt KHÔNG phát request nào khi `receiptId` là `null` — nó nằm ngoài `Screen` để lớp
        phủ che trọn màn thay vì nằm trong vùng cuộn.
      */}
      <ReceiptDetailSheet
        receiptId={receiptDetailId}
        onClose={() => setReceiptDetailId(null)}
      />
    </>
  );
}
