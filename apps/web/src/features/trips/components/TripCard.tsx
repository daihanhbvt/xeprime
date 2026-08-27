'use client';

import { CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import Link from 'next/link';
import {
  CUSTOMER_TRIP_STAGE_META,
  SERVICE_TYPE,
  type CustomerTripStage,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { tripPath } from '@/constants/routes';
import type { CustomerTrip } from '../types';
import styles from './TripCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';

/**
 * Một chuyến trong danh sách `Chuyến của tôi`.
 *
 * Cùng một thẻ cho mọi chặng — khác nhau ở nhãn trạng thái và ở chỗ có tiền hay chưa, không
 * phải ở cấu trúc. Dựng thẻ riêng cho từng chặng là bốn bản bố cục phải sửa cùng lúc mỗi lần
 * đổi một chi tiết.
 */
export function TripCard({ trip }: { trip: CustomerTrip }) {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const href = tripPath.detail(trip.id);

  return (
    <article className={styles.card}>
      {/*
        Ảnh chỉ hiện khi xe THẬT SỰ có. `next/image` cần host khai báo sẵn còn ảnh xe đến từ R2
        theo cấu hình từng môi trường, nên dùng thẻ ảnh thường.
      */}
      {trip.vehicle.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
        <img
          src={trip.vehicle.imageUrl}
          alt={trip.vehicle.name}
          className={styles.image}
          loading="lazy"
        />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" />
      )}

      <div className={styles.body}>
        <p className={styles.shop}>
          {t('card.owner')}: <span className={styles.shopName}>{trip.shop.name}</span>
        </p>
        <h3 className={styles.name}>
          <Link href={href} className={styles.nameLink}>
            {trip.vehicle.name}
          </Link>
        </h3>

        <p className={styles.meta}>
          <CalendarOutlined aria-hidden="true" />
          {/* Yêu cầu dài hạn chưa duyệt chưa có lịch — nói gói + nguyện vọng, không bịa ngày. */}
          <span>
            {trip.pickupAt && trip.returnAt
              ? fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)
              : [fmt.packageLabel(trip.longTermPackageMonths), fmt.pickupWish(trip)]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </p>
        <p className={styles.meta}>
          <EnvironmentOutlined aria-hidden="true" />
          <span>
            {/* Chuyến có tài xế: xe đến đón — nhãn giao/nhận xe tự lái không đúng ngữ cảnh. */}
            {trip.serviceType === SERVICE_TYPE.WITH_DRIVER
              ? `${dl('serviceType', trip.serviceType)}${trip.routeType ? ` · ${dl('routeType', trip.routeType)}` : ''}`
              : `${dl('serviceType', trip.serviceType)} · ${trip.deliveryRequested ? t('pickup.delivery') : t('pickup.agency')}`}
          </span>
        </p>
      </div>

      <div className={styles.side}>
        <StatusTag value={stage} meta={CUSTOMER_TRIP_STAGE_META} group="customerTripStage" />
        <div className={styles.money}>
          <span className={styles.moneyLabel}>{t('card.total')}</span>
          {/*
            Chưa có đơn thì chưa có giá chốt — nói thẳng thay vì hiện `0 đ`, thứ trông y hệt
            "chuyến này miễn phí".
          */}
          <span className={styles.moneyValue}>
            {trip.totalAmount ? fmt.money(trip.totalAmount) : t('card.awaitingQuote')}
          </span>
        </div>
        {/*
          MỘT bề mặt tương tác: `<Link>` được tạo dáng như nút, không phải `<Button>` lồng trong
          `<Link>`. Lồng hai phần tử tương tác vào nhau cho trình đọc màn hình hai đích cho cùng
          một thứ, và bàn phím phải Tab hai lần để đi qua một hành động.
        */}
        <Link href={href} className={styles.action}>
          {t('card.viewDetail')}
        </Link>
      </div>
    </article>
  );
}
