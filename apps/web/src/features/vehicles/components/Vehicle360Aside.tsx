'use client';

/**
 * CỘT PHỤ của Hồ sơ xe (Figma `23672:25630`): giá thuê & chính sách · lịch thuê sắp tới · hoạt động
 * gần đây · lối tắt. Đứng cạnh cột chính suốt mọi tab; hẹp thì xuống dưới (xem CSS).
 */

import {
  AccountBookOutlined,
  CalendarOutlined,
  FileTextOutlined,
  RightOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, PERMISSION } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { statusColorClass } from '@/components/data-display/status-color';
import { ROUTES, receiptsPath } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { toAppTz } from '@/lib/datetime';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from '../types';
import { Panel, PricingCard } from './Vehicle360Cards';
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
      <PricingCard vehicle={vehicle} canEdit={canEdit} />
      {/*
        Lịch sắp tới chỉ ở tuyến gói (30/09/2026): chủ xe tuyến hoa hồng xem chuyến ở "Lịch sử
        chuyến" của không gian quản lý xe. Hiệu suất lũy kế nay nằm ở thẻ xe đầu trang.
      */}
      {showSchedule ? (
        <ScheduleCard bookings={summary?.upcomingBookings} loading={loading} failed={failed} />
      ) : null}
      {showActivity ? (
        <ActivityCard bookings={summary?.recentBookings} loading={loading} failed={failed} />
      ) : null}
      <ModuleLinks vehicle={vehicle} />
    </aside>
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

  return (
    <Panel title={t('schedules.title')}>
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
              <div className={styles.scheduleHead}>
                <p className={styles.scheduleTitle}>{booking.customerName}</p>
                <p className={styles.scheduleSub}>
                  {t('schedules.sub', {
                    amount: fmt.money(booking.totalAmount),
                    status: domainLabel('bookingStatus', booking.status),
                  })}
                </p>
              </div>
              <p className={styles.scheduleRange}>
                {t('dateRange', {
                  from: fmt.dateTime(booking.pickupAt),
                  to: fmt.dateTime(booking.returnAt),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
    <Panel title={t('activity.title')}>
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
                <StatusTag
                  value={booking.status}
                  meta={BOOKING_STATUS_META}
                  group="bookingStatus"
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/**
 * Lối tắt (chốt 03/11/2026) — CHỈ những đích không có lối nào khác trên trang: đơn thuê của xe,
 * thu chi của xe, trung tâm bảo dưỡng. Thông tin · ảnh · giá · giấy tờ · nguồn xe · bảo dưỡng đã có
 * trong menu trái của màn sửa ("Chỉnh sửa"), lịch đã có nút "Xem lịch xe" ở đầu trang — liệt kê lại
 * chúng ở đây là hai lối cho một chỗ.
 *
 * Mỗi đích đi qua cổng của phiên hỗ trợ (`useAvailableHref`): màn không mở trong phiên thì không
 * dựng link. Không còn đích nào thì không dựng thẻ.
 */
function ModuleLinks({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview.links');
  const headingId = useId();
  const { has } = usePermissions();
  const { paths, isManage } = useWorkspace();
  const can = useVehicleCapabilities();
  const available = useAvailableHref();
  const links: { href: string; label: string; icon: ReactNode }[] = [];

  if (has(PERMISSION.BOOKING_VIEW)) {
    /*
     * Ở tuyến hoa hồng, "đơn của xe này" là danh sách chuyến chung — nó KHÔNG lọc theo `vehicleId`.
     * Dẫn thẳng tới đó thay vì gắn một tham số lọc mà trang bên kia không đọc.
     */
    links.push({
      href: isManage ? `${ROUTES.MANAGE.BOOKINGS}?vehicleId=${vehicle.id}` : paths.bookings,
      label: t('bookings'),
      icon: <FileTextOutlined />,
    });
  }
  if (isManage && can.money) {
    links.push({
      href: receiptsPath.filtered({ vehicleId: vehicle.id }),
      label: t('receipts'),
      icon: <AccountBookOutlined />,
    });
  }
  if (isManage && can.maintenance) {
    links.push({
      href: ROUTES.MANAGE.MAINTENANCE,
      label: t('maintenanceCenter'),
      icon: <ToolOutlined />,
    });
  }
  const shown = links.flatMap((link) => {
    const href = available(link.href);
    return href ? [{ ...link, href }] : [];
  });
  if (shown.length === 0) return null;

  return (
    <section className={styles.linksPanel} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.panelTitle}>
        {t('shortcuts')}
      </h3>
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
