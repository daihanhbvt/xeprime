'use client';

/**
 * CỘT PHỤ của Hồ sơ 360 — "xe đang chạy thế nào": hiệu suất · lịch sắp tới · hoạt động gần đây ·
 * các khu vực quản lý. Đứng cạnh cột chính suốt mọi tab; hẹp thì xuống dưới (xem CSS).
 */

import {
  AccountBookOutlined,
  BankOutlined,
  CalendarOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  PictureOutlined,
  ProfileOutlined,
  RightOutlined,
  StarFilled,
  TagOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Card, Skeleton } from 'antd';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, PERMISSION } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { statusColorClass } from '@/components/data-display/status-color';
import { ROUTES, VEHICLE_EDIT_TAB, VEHICLE_MANAGE_SECTION, receiptsPath } from '@/constants/routes';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { toAppTz } from '@/lib/datetime';
import { vehicleSchedulePath } from '../calendar-link';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from '../types';
import styles from './Vehicle360Overview.module.css';

/**
 * Khoảng ngày RÚT GỌN của thẻ lịch/hoạt động: "25/10 – 27/10" (vi) · "10/25 – 10/27" (en).
 *
 * Bỏ năm là cố ý (Figma `236:2374`) — lịch thuê nhìn gần. Mẫu ngày lấy theo NGÔN NGỮ đang xem,
 * không cứng `DD/MM`: người đọc tiếng Anh đọc `10/25` là 25 tháng 10, còn `25/10` thì không.
 *
 * Có khoá riêng chứ KHÔNG dùng `Common.units.range`: khoá chung nối bằng mũi tên (`→`, cho một
 * chuyển tiếp trạng thái), còn khoảng ngày ở đây thiết kế vẽ gạch ngang (`–`).
 */
function useShortRange(): (from: string, to: string) => string {
  const pattern = useDatePickerPattern();
  const t = useTranslations('Vehicles.overview');
  return (from, to) =>
    t('dateRange', {
      from: toAppTz(from).format(pattern.dayMonth),
      to: toAppTz(to).format(pattern.dayMonth),
    });
}

export function Vehicle360Aside({
  vehicle,
  summary,
  loading,
  failed,
  canEdit,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const { isManage } = useWorkspace();

  // Hai danh sách đơn chỉ có khi người xem có `bookings.view` — backend bỏ hẳn trường, không trả
  // rỗng. Đang tải/tải hỏng thì chưa biết, nên vẫn dựng thẻ để nó tự báo trạng thái.
  const unknown = loading || failed;
  const showSchedule = isManage && (summary?.upcomingBookings !== undefined || unknown);
  const showActivity = summary?.recentBookings !== undefined || unknown;

  return (
    <aside className={styles.aside} aria-label={t('asideLabel')}>
      {/*
        Hiệu suất + lịch sắp tới chỉ ở cổng quản lý (30/09/2026): chủ xe tuyến hoa hồng xem chuyến
        ở "Lịch sử chuyến" của không gian quản lý xe.
      */}
      {isManage ? <PerformanceCard summary={summary} loading={loading} failed={failed} /> : null}
      {showSchedule ? (
        <ScheduleCard bookings={summary?.upcomingBookings} loading={loading} failed={failed} />
      ) : null}
      {showActivity ? (
        <ActivityCard bookings={summary?.recentBookings} loading={loading} failed={failed} />
      ) : null}
      <ModuleLinks vehicle={vehicle} canEdit={canEdit} />
    </aside>
  );
}

function PerformanceCard({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();

  const stats = summary?.stats;
  const rated = stats && stats.ratingCount > 0 && stats.ratingAvg;

  return (
    /*
     * Thẻ này CHỈ nói chuyện vận hành: xe đã chạy bao nhiêu chuyến, đang có mấy đơn, khách chấm
     * bao nhiêu. Tiền nằm ở tab Tài chính theo kỳ — một màn, một bề mặt tiền.
     */
    <Card title={t('performance.title')} className={styles.card}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !stats ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        <dl className={styles.statGrid}>
          <div className={styles.stat}>
            <dt>{t('performance.rentals')}</dt>
            <dd>{t('performance.tripCount', { count: stats.completedBookings })}</dd>
          </div>
          <div className={styles.stat}>
            <dt>{t('performance.active')}</dt>
            <dd>{t('performance.activeCount', { count: stats.activeBookings })}</dd>
          </div>
          {/* Chưa ai chấm thì KHÔNG dựng ô — "0/5" là một lời chê không có thật. */}
          {rated ? (
            <div className={cx(styles.stat, styles.statWide)}>
              <dt>{t('performance.rating')}</dt>
              <dd>
                <span className={styles.star}>{decorativeIcon(<StarFilled />)}</span>
                {t('performance.ratingValue', {
                  rating: fmt.rating(Number(stats.ratingAvg)),
                  count: stats.ratingCount,
                })}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </Card>
  );
}

function ScheduleCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();

  return (
    <Card title={t('schedules.title')} className={styles.card}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : bookings.length === 0 ? (
        <div className={styles.emptyNote}>
          <span className={cx(styles.iconTile, styles.toneMuted)} aria-hidden="true">
            <CalendarOutlined />
          </span>
          <p className={styles.muted}>{t('schedules.empty')}</p>
        </div>
      ) : (
        <ul className={styles.scheduleList}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.scheduleItem}>
              <p className={styles.scheduleTitle}>
                {t('schedules.item', {
                  customer: booking.customerName,
                  range: shortRange(booking.pickupAt, booking.returnAt),
                })}
              </p>
              <p className={styles.scheduleSub}>
                {t('schedules.sub', {
                  amount: fmt.money(booking.totalAmount),
                  status: domainLabel('bookingStatus', booking.status),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const shortRange = useShortRange();

  return (
    <Card title={t('activity.title')} className={styles.card}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : bookings.length === 0 ? (
        <p className={styles.muted}>{t('activity.empty')}</p>
      ) : (
        <ol className={styles.timeline}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.timelineItem}>
              {/* Chấm mốc cùng màu meta với thẻ trạng thái bên dưới — một nguồn màu. */}
              <span
                className={cx(
                  styles.timelineDot,
                  statusColorClass(BOOKING_STATUS_META[booking.status]?.color),
                )}
                aria-hidden="true"
              />
              <div className={styles.timelineHead}>
                <p className={styles.timelineTitle}>{booking.customerName}</p>
                <span className={styles.timelineAmount}>{fmt.money(booking.totalAmount)}</span>
              </div>
              <p className={styles.timelineSub}>
                {t('activity.bookingRange', {
                  code: booking.code,
                  range: shortRange(booking.pickupAt, booking.returnAt),
                })}
              </p>
              <div className={styles.timelineFoot}>
                <time dateTime={booking.updatedAt}>{fmt.shortDateTime(booking.updatedAt)}</time>
                <StatusTag value={booking.status} meta={BOOKING_STATUS_META} group="bookingStatus" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Lối đi chuẩn sang các module liên quan (Wave 8).
 *
 * Hồ sơ 360 là trang TỔNG QUAN, không phải form thứ hai — nên nó chỉ dẫn đường sang đúng tab
 * sửa/mô-đun đã có, dùng nguyên giá trị `?tab=` mà `VehicleEditWorkspace` hiểu. Không dựng lại
 * form nào ở đây, và không có nút dẫn tới tính năng chưa tồn tại.
 *
 * Bày thành DANH SÁCH dọc ở cột phụ (02/10/2026): mỗi mục một hàng có icon — đọc như mục lục của
 * chiếc xe, không như một hàng bộ lọc.
 */
function ModuleLinks({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview.links');
  // `useId` chứ không id cứng: trang và modal hồ sơ xe có thể cùng mount một lúc.
  const headingId = useId();
  // Link "Xem lịch" giữ chi nhánh đang lọc (ADR 0052).
  const branchCrumb = useBranchCrumb();
  const { has } = usePermissions();
  const { paths, vehicles: vehiclePaths, isManage } = useWorkspace();
  const can = useVehicleCapabilities();
  const available = useAvailableHref();
  const vehicleId = vehicle.id;
  const links: { href: string; label: string; icon: ReactNode }[] = [];

  /*
   * Hồ sơ 360 hiện ở CẢ HAI khu, nhưng cùng một mục dẫn tới hai nơi khác nhau: ở cổng quản lý là
   * tab của `/manage/vehicles/:id/edit`, ở khu tài khoản là mục trong không gian "Quản lý xe".
   * `vehicles.part` giữ phép ánh xạ đó ở MỘT chỗ — cùng bảng mà nút "Chỉnh sửa", thẻ Giấy tờ và
   * CTA "Hoàn tất hồ sơ" dùng, nên bốn lối vào không thể trôi khỏi nhau.
   */
  const push = (label: string, icon: ReactNode, href: string | null) => {
    if (href) links.push({ href, label, icon });
  };

  if (canEdit) {
    push(
      t('information'),
      <ProfileOutlined />,
      vehiclePaths.part(
        vehicleId,
        VEHICLE_EDIT_TAB.INFORMATION,
        VEHICLE_MANAGE_SECTION.INFORMATION,
      ),
    );
    push(
      t('media'),
      <PictureOutlined />,
      vehiclePaths.part(vehicleId, VEHICLE_EDIT_TAB.MEDIA, VEHICLE_MANAGE_SECTION.IMAGES),
    );
    push(t('pricing'), <TagOutlined />, vehiclePaths.pricing(vehicleId));
    /*
     * Nguồn xe (ký gửi/hợp tác) là sổ sách của gian hàng — thuộc năng lực `finance` và không có
     * bản `/account`, nên `part(..., null)` tự trả `null` ở khu tài khoản.
     */
    if (can.source) {
      push(
        t('source'),
        <BankOutlined />,
        vehiclePaths.part(vehicleId, VEHICLE_EDIT_TAB.SOURCE, null),
      );
    }
  }
  if (can.documents) {
    push(
      t('documents'),
      <FileProtectOutlined />,
      vehiclePaths.part(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS, VEHICLE_MANAGE_SECTION.DOCUMENTS),
    );
  }
  // Bảo dưỡng là tính năng của GÓI (ADR 0027 điều 1) — `can.maintenance` kiểm cả quyền lẫn cờ.
  if (can.maintenance) {
    push(
      t('maintenance'),
      <ToolOutlined />,
      vehiclePaths.part(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE, null),
    );
    if (isManage) push(t('maintenanceCenter'), <ToolOutlined />, ROUTES.MANAGE.MAINTENANCE);
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Cùng helper với nút "Xem lịch" và thẻ ở danh sách — một đường dẫn lịch duy nhất.
    push(
      t('calendar'),
      <CalendarOutlined />,
      vehicleSchedulePath(vehicle, { basePath: paths.calendar, branchId: branchCrumb }),
    );
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    /*
     * Ở khu tài khoản, "đơn của xe này" là "Chuyến của tôi" — một danh sách gồm cả hai phía, và
     * nó KHÔNG lọc theo `vehicleId`. Dẫn thẳng tới đó thay vì gắn một tham số lọc mà trang bên
     * kia không đọc, rồi người dùng tưởng bộ lọc hỏng.
     */
    push(
      t('bookings'),
      <FileTextOutlined />,
      isManage ? `${ROUTES.MANAGE.BOOKINGS}?vehicleId=${vehicleId}` : paths.bookings,
    );
  }
  if (isManage && can.money) {
    // Doanh thu và chi phí của riêng xe này — chi phí bảo dưỡng đã tự lên sổ, nên đây mới là chỗ
    // trả lời được "xe này lãi thật bao nhiêu".
    push(t('receipts'), <AccountBookOutlined />, receiptsPath.filtered({ vehicleId }));
  }
  // Trong phiên hỗ trợ: bỏ mục dẫn tới màn không mở trong phiên (giá, giấy tờ…).
  const shown = links.flatMap((link) => {
    const href = available(link.href);
    return href ? [{ ...link, href }] : [];
  });
  if (shown.length === 0) return null;

  return (
    <section className={styles.linksPanel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.bandTitle}>
        {t('title')}
      </h2>
      <nav aria-label={t('ariaLabel')}>
        <ul className={styles.linkList}>
          {shown.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={styles.linkItem}>
                <span className={styles.linkIcon}>{decorativeIcon(link.icon)}</span>
                <span className={styles.linkLabel}>{link.label}</span>
                <span className={styles.linkChevron}>{decorativeIcon(<RightOutlined />)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
