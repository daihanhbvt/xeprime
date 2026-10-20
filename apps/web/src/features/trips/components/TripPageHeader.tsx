'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PageBreadcrumb, type PageCrumb } from '@/components/navigation/PageBreadcrumb';
import { ROUTES, listingPath } from '@/constants/routes';
import styles from './TripPageHeader.module.css';

/** Một mắt của đường dẫn — có `href` thì là liên kết, mắt cuối (trang đang xem) thì không. */
export type TripCrumb = PageCrumb;

/**
 * Đầu trang của các màn sau khi gửi yêu cầu thuê — Figma "Search Fields" (`19759:40223` ở màn đã
 * xác nhận, cùng khuôn ở màn chờ phản hồi, chờ giữ chỗ và thanh toán): nút quay lại tròn + đường dẫn
 * "Trang chủ / … / trang hiện tại" (`PageBreadcrumb`, chung với trang chi tiết xe — ở mobile là
 * thanh trắng tràn mép), tiêu đề trang (`h1` DUY NHẤT của trang) + một câu dẫn, và tiến trình
 * hành trình đặt xe ở bên phải.
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
  /*
   * Mobile chỉ giữ "Trang chủ / trang hiện tại" như thanh 390px của bản vẽ (`19771:72105`): các mắt
   * giữa ẩn đi, nút tròn đã là lối về bước trước.
   */
  const trail: TripCrumb[] = [
    { key: 'home', label: t('home'), href: ROUTES.HOME },
    ...crumbs.map((crumb, index) =>
      index < crumbs.length - 1 ? { ...crumb, hideOnMobile: true } : crumb,
    ),
  ];

  return (
    <header className={styles.header}>
      <PageBreadcrumb
        ariaLabel={t('breadcrumbLabel')}
        crumbs={trail}
        back={{ href: backHref, label: backLabel }}
      />

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
