'use client';

import { ArrowRightOutlined, EditOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Input, Select } from 'antd';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  DRIVER_ASSIGNMENT_STATUS_META,
  type BookingStatus,
  type DriverAssignmentStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { ALL_FILTER } from '@/constants/filters';
import { bookingPath, ROUTES } from '@/constants/routes';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { dayjs, toAppTz } from '@/lib/datetime';
import type { Paged } from '@/services/api-client';
import type { DriverCurrentTrip, DriverOverview } from '../types';
import { DRIVER_MONTH_FORMAT } from './DriverMonthPicker';
import styles from './DriverDetail.module.css';

/** Một dòng "nhãn — giá trị" của thẻ hồ sơ; dòng chưa có giá trị thì không dựng. */
export interface ProfileFact {
  key: string;
  label: string;
  value: ReactNode;
}

/**
 * Thẻ hồ sơ đầu cột trái (Figma `24042:71009`): ảnh 64 · tên · SĐT · viên trạng thái/hình thức ·
 * "Chỉnh sửa" + Gọi + Zalo · các dòng thông tin. Nút Chat của design KHÔNG dựng — chưa có kênh nhắn
 * giữa bên thuê và tài xế (chốt 25/11/2026).
 */
export function DriverProfileCard({
  name,
  phone,
  photoUrl,
  chips,
  onEdit,
  facts,
}: {
  name: string;
  phone: string;
  photoUrl?: string | null;
  chips: ReactNode;
  /** Vắng ⇒ không có nút "Chỉnh sửa" (thiếu quyền, liên kết đã đóng, phiên hỗ trợ). */
  onEdit?: () => void;
  facts: ProfileFact[];
}) {
  const t = useTranslations('Drivers.detailPage.profile');
  return (
    <section className={styles.card} aria-label={name}>
      <div className={styles.profileHead}>
        <span className={styles.photo}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh tài khoản / kho R2, cỡ cố định
            <img src={photoUrl} alt={t('photoAlt', { name })} />
          ) : (
            <UserOutlined aria-hidden="true" />
          )}
        </span>
        <div className={styles.identity}>
          <h2 className={styles.name}>{name}</h2>
          <span className={styles.phone}>{phone}</span>
          <div className={styles.chips}>{chips}</div>
        </div>
      </div>
      <div className={styles.profileActions}>
        {onEdit ? (
          <Button icon={<EditOutlined />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null}
        <CustomerContactButtons name={name} phone={phone} variant="icon" compact />
      </div>
      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Thẻ "Ghi chú nội bộ" — chữ thô của bên thuê, "Sửa" mở hộp sửa của tài xế đó. */
export function DriverNoteCard({
  note,
  onEdit,
}: {
  note?: string | null;
  onEdit?: () => void;
}) {
  const t = useTranslations('Drivers.detailPage.note');
  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('title')}</h3>
        {onEdit ? (
          <button type="button" className={styles.textAction} onClick={onEdit}>
            <EditOutlined aria-hidden="true" />
            {t('edit')}
          </button>
        ) : null}
      </div>
      {note ? <p className={styles.note}>{note}</p> : <p className={styles.muted}>{t('empty')}</p>}
    </section>
  );
}

/**
 * "Chuyến sắp tới" — các đơn đang gán (chiếm lịch), sớm nhất trước: ô ngày, mã đơn · xe, khung giờ,
 * khách, tiền công (tài xế liên kết), "Chi tiết đơn". Liên hệ khách đọc được vì đơn đã tồn tại
 * (ADR 0056).
 */
export function DriverUpcomingTrips({
  trips,
  total,
  showWage,
}: {
  trips: DriverCurrentTrip[];
  total: number;
  showWage: boolean;
}) {
  const t = useTranslations('Drivers.detailPage.overview.upcoming');
  const fmt = useAppFormat();
  const availableHref = useAvailableHref();
  const calendarHref = availableHref(ROUTES.MANAGE.CALENDAR);

  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('title')}</h3>
        {calendarHref ? (
          <Link href={calendarHref} className={styles.linkAction}>
            {t('viewCalendar')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {trips.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <ul className={styles.tripList}>
          {trips.map((trip) => {
            const pickup = toAppTz(trip.pickupAt);
            const bookingHref = availableHref(bookingPath.detail(trip.bookingId));
            return (
              <li key={trip.bookingId} className={styles.trip}>
                <span className={styles.tripDate} aria-hidden="true">
                  <span>{fmt.weekdayShort(pickup)}</span>
                  <b>{fmt.dayMonth(trip.pickupAt)}</b>
                </span>
                <div className={styles.tripBody}>
                  <span className={styles.tripTitle}>
                    {bookingHref ? (
                      <Link href={bookingHref}>{trip.bookingCode}</Link>
                    ) : (
                      trip.bookingCode
                    )}
                    <span className={styles.muted} aria-hidden="true">
                      •
                    </span>
                    <span>{trip.vehicleName}</span>
                  </span>
                  <span className={styles.muted}>{fmt.rentalRange(trip.pickupAt, trip.returnAt)}</span>
                  <span className={styles.badges}>
                    <StatusBadge
                      value={trip.bookingStatus as BookingStatus}
                      meta={BOOKING_STATUS_META}
                      group="bookingStatus"
                    />
                    {trip.assignmentStatus ? (
                      <StatusBadge
                        value={trip.assignmentStatus as DriverAssignmentStatus}
                        meta={DRIVER_ASSIGNMENT_STATUS_META}
                        group="driverAssignmentStatus"
                      />
                    ) : null}
                  </span>
                  {showWage ? (
                    <span className={styles.tripAmount}>
                      {trip.wageAmount ? (
                        fmt.money(trip.wageAmount)
                      ) : (
                        <span className={styles.muted}>{t('noWage')}</span>
                      )}
                    </span>
                  ) : null}
                </div>
                <div className={styles.tripSide}>
                  <PersonCell name={trip.customerName} phone={trip.customerPhone} />
                  {bookingHref ? (
                    <Link href={bookingHref} className={styles.linkAction}>
                      {t('openBooking')}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > trips.length ? (
        <p className={styles.smallNote}>{t('more', { shown: trips.length, total })}</p>
      ) : null}
    </section>
  );
}

function PersonCell({ name, phone }: { name: string; phone?: string | null }) {
  return (
    <span className={styles.person}>
      <Avatar size={32} icon={<UserOutlined />} />
      <span className={styles.personText}>
        <span className={styles.personName}>{name}</span>
        {phone ? <span className={styles.muted}>{phone}</span> : null}
      </span>
    </span>
  );
}

/**
 * Cột tiền công 6 tháng (Figma: cột nhạt, tháng đang chọn đậm, số tiền gọn trên đầu cột, tháng + số
 * chuyến bên dưới). CSS thuần — chiều cao cột là giá trị lúc chạy nên đi qua biến CSS (ngoại lệ duy
 * nhất của luật không inline style).
 */
export function DriverWageBars({ overview }: { overview: DriverOverview }) {
  const t = useTranslations('Drivers.detailPage.overview.chart');
  const fmt = useAppFormat();
  const { trend, month } = overview;
  const max = Math.max(...trend.map((p) => Number(p.wageTotal)), 0);
  const hasData = trend.some((p) => p.trips > 0 || Number(p.wageTotal) > 0);
  const monthName = (key: string) => fmt.monthYear(dayjs(key, DRIVER_MONTH_FORMAT).toDate());

  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('title')}</h3>
        <span className={styles.cardHint}>{t('hint')}</span>
      </div>
      {hasData ? (
        <>
          <div
            className={styles.bars}
            role="img"
            aria-label={t('label')}
            style={{ '--bar-count': trend.length } as CSSProperties}
          >
            {trend.map((p) => {
              const value = Number(p.wageTotal);
              const percent = max > 0 ? Math.round((value / max) * 100) : 0;
              return (
                <div
                  key={p.month}
                  className={cx(styles.bar, p.month === month.month && styles.barActive)}
                  title={t('bar', {
                    month: monthName(p.month),
                    amount: fmt.money(p.wageTotal),
                    trips: t('trips', { count: p.trips }),
                  })}
                >
                  <span className={styles.barValue}>{fmt.moneyCompact(p.wageTotal)}</span>
                  <span
                    className={styles.barFill}
                    style={{ '--bar-height': `${Math.max(percent, 2)}%` } as CSSProperties}
                  />
                </div>
              );
            })}
          </div>
          <div className={styles.barLabels} style={{ '--bar-count': trend.length } as CSSProperties}>
            {trend.map((p) => (
              <span key={p.month}>
                <span className={styles.barMonth}>{monthName(p.month)}</span>
                <span className={styles.barTrips}>{t('trips', { count: p.trips })}</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.chartEmpty}>{t('empty')}</p>
      )}
    </section>
  );
}

/** Một dòng chung của bảng chuyến — tài xế liên kết (lượt gán) và nội bộ (đơn) quy về đây. */
export interface DriverTripTableRow {
  key: string;
  bookingId: string;
  bookingCode: string;
  vehicleName: string;
  vehiclePlate?: string | null;
  vehicleImageUrl?: string | null;
  customerName: string;
  customerPhone?: string | null;
  pickupAt: string;
  returnAt: string;
  status: ReactNode;
  /** Vắng ⇒ bảng không có cột tiền công (tài xế nội bộ). */
  wage?: ReactNode;
}

/**
 * Bảng chuyến của trang chi tiết (Figma `24051:80844`): mã đơn · xe (ảnh + biển) · khách · thời
 * gian (+ số ngày) · trạng thái · tiền công · "Chi tiết". Phân trang ở server.
 */
export function DriverTripsTable({
  label,
  page,
  loading,
  error,
  empty,
  onPage,
  withWage,
}: {
  label: string;
  page: Paged<DriverTripTableRow> | undefined;
  loading: boolean;
  error: { title: string; onRetry: () => void } | null;
  empty: { title: string; description?: string };
  onPage: (page: number, limit: number) => void;
  withWage: boolean;
}) {
  const t = useTranslations('Drivers.detailPage.trips');
  const tCount = useTranslations('Drivers.detail.trips');
  const fmt = useAppFormat();
  const availableHref = useAvailableHref();

  const columns: DataTableColumn<DriverTripTableRow>[] = [
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 140,
      render: (_, row) => <span className={styles.code}>{row.bookingCode}</span>,
    },
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 260,
      render: (_, row) => (
        <span className={styles.vehicleCell}>
          {row.vehicleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh xe công khai, cỡ 32
            <img src={row.vehicleImageUrl} alt="" className={styles.vehicleThumb} />
          ) : (
            <Avatar size={32} className={styles.vehicleThumb} />
          )}
          <span className={styles.personText}>
            <span className={styles.personName}>{row.vehicleName}</span>
            {row.vehiclePlate ? <span className={styles.muted}>{row.vehiclePlate}</span> : null}
          </span>
        </span>
      ),
    },
    {
      title: t('columns.customer'),
      key: 'customer',
      width: 200,
      render: (_, row) => <PersonCell name={row.customerName} phone={row.customerPhone} />,
    },
    {
      title: t('columns.period'),
      key: 'period',
      width: 220,
      render: (_, row) => (
        <span className={styles.personText}>
          <span>{fmt.rentalRange(row.pickupAt, row.returnAt)}</span>
          <span className={styles.muted}>
            {fmt.rentalDuration(toAppTz(row.pickupAt), toAppTz(row.returnAt))}
          </span>
        </span>
      ),
    },
    { title: t('columns.status'), key: 'status', width: 150, render: (_, row) => row.status },
    ...(withWage
      ? [
          {
            title: t('columns.wage'),
            key: 'wage',
            width: 160,
            align: 'right' as const,
            render: (_: unknown, row: DriverTripTableRow) => row.wage,
          },
        ]
      : []),
    {
      title: t('columns.actions'),
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_, row) => {
        const href = availableHref(bookingPath.detail(row.bookingId));
        return href ? (
          <Button href={href} size="small">
            {t('detail')}
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <DataTable<DriverTripTableRow>
      label={label}
      columns={columns}
      items={page?.items ?? []}
      rowKey={(row) => row.key}
      minWidth={withWage ? 1100 : 940}
      loading={loading}
      error={error}
      empty={empty}
      pagination={
        page
          ? {
              meta: page.meta,
              onChange: onPage,
              totalLabel: (total) => tCount('total', { count: total }),
            }
          : undefined
      }
    />
  );
}

/**
 * Hàng lọc của bảng chuyến: ô tìm (gửi khi dừng gõ / Enter) + chọn trạng thái + phần phải tuỳ trang
 * (tổng ghi nhận, xuất bảng kê). Giá trị sống trên URL ở trang gọi.
 */
export function DriverTripsToolbar({
  q,
  status,
  statusOptions,
  onSearch,
  onStatus,
  end,
}: {
  q: string | undefined;
  status: string | undefined;
  statusOptions: { value: string; label: string }[];
  onSearch: (q: string | undefined) => void;
  onStatus: (status: string | undefined) => void;
  end?: ReactNode;
}) {
  const t = useTranslations('Drivers.detailPage.trips');
  const [text, setText] = useState(q ?? '');
  // URL đổi từ nơi khác (Back, xoá lọc) — ô tìm theo kịp (dẫn xuất trong lúc render, không effect).
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setText(q ?? '');
  }

  return (
    <div className={styles.toolbar}>
      <Input
        className={styles.search}
        size="large"
        allowClear
        prefix={<SearchOutlined aria-hidden="true" />}
        value={text}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchLabel')}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value) onSearch(undefined);
        }}
        onPressEnter={() => onSearch(text.trim() || undefined)}
        onBlur={() => {
          if ((text.trim() || undefined) !== q) onSearch(text.trim() || undefined);
        }}
      />
      <Select
        className={styles.statusSelect}
        size="large"
        aria-label={t('status')}
        value={status ?? ALL_FILTER}
        options={[{ value: ALL_FILTER, label: t('allStatuses') }, ...statusOptions]}
        onChange={(value: string) => onStatus(value === ALL_FILTER ? undefined : value)}
      />
      {end ? <div className={styles.toolbarEnd}>{end}</div> : null}
    </div>
  );
}
