'use client';

import { LeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ROUTES, listingPath } from '@/constants/routes';
import styles from './TripPageHeader.module.css';

/** Một mắt của đường dẫn — có `href` thì là liên kết, mắt cuối (trang đang xem) thì không. */
export interface TripCrumb {
  key: string;
  label: string;
  href?: string;
}

/**
 * Đầu trang của các màn sau khi gửi yêu cầu thuê — Figma "Search Fields" (`19759:40223` ở màn đã
 * xác nhận, cùng khuôn ở màn chờ phản hồi, chờ giữ chỗ và thanh toán): nút quay lại tròn + đường dẫn
 * "Trang chủ / … / trang hiện tại", tiêu đề trang (`h1` DUY NHẤT của trang) + một câu dẫn, và tiến
 * trình hành trình đặt xe ở bên phải.
 *
 * "Trang chủ" luôn là mắt đầu, nên nơi gọi chỉ truyền phần sau nó. Mắt cuối tô vàng — trang khách
 * đang đứng — và mang `aria-current`.
 */
export function TripPageHeader({
  backHref,
  backLabel,
  crumbs,
  title,
  description,
  aside,
}: {
  /** Đích của nút tròn — danh sách chuyến, hoặc chi tiết chuyến khi đang ở trang thanh toán. */
  backHref: string;
  /** Tên khả truy cập của nút tròn (nút chỉ có icon). */
  backLabel: string;
  crumbs: readonly TripCrumb[];
  title: string;
  description?: string;
  /** Tiến trình hành trình — `BookingJourney`. */
  aside?: ReactNode;
}) {
  const t = useTranslations('Trips.pageHeader');
  const trail: TripCrumb[] = [{ key: 'home', label: t('home'), href: ROUTES.HOME }, ...crumbs];

  return (
    <header className={styles.header}>
      <nav className={styles.breadcrumb} aria-label={t('breadcrumbLabel')}>
        <Link href={backHref} className={styles.back} aria-label={backLabel}>
          <LeftOutlined aria-hidden />
        </Link>
        <ol className={styles.trail}>
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <li key={crumb.key} className={styles.crumb}>
                {last ? (
                  <span className={styles.current} aria-current="page">
                    {crumb.label}
                  </span>
                ) : crumb.href ? (
                  <Link href={crumb.href} className={styles.link}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {last ? null : (
                  <span className={styles.separator} aria-hidden>
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={styles.heading}>
        <div className={styles.copy}>
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </div>
    </header>
  );
}

/**
 * Đường dẫn của hành trình đặt xe sau "Trang chủ" — "Chi tiết xe / Gửi yêu cầu thuê xe" (Figma
 * `19759:40224`). Mắt "Gửi yêu cầu thuê xe" là trang đang đứng ở các màn chuyến; trang thanh toán
 * truyền `requestHref` để nó thành liên kết về chuyến và nối thêm mắt của chính mình.
 *
 * Chưa biết xe nào (đang tải) ⇒ "Chi tiết xe" là chữ thường, không phải một liên kết hỏng.
 */
export function useTripFlowCrumbs(
  vehicleId: string | null,
  opts: { requestHref?: string } = {},
): TripCrumb[] {
  const t = useTranslations('Trips.pageHeader');
  return [
    {
      key: 'vehicle',
      label: t('vehicle'),
      href: vehicleId ? listingPath.detail(vehicleId) : undefined,
    },
    { key: 'request', label: t('request'), href: opts.requestHref },
  ];
}
