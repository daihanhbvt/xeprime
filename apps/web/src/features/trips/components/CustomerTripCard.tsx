'use client';

import Image from 'next/image';
import { Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LIST_SEPARATOR, isNegativeMoney, subtractMoney, canShowHostChatOnTrip } from '@xeprime/domain';
import {
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_META,
  SERVICE_TYPE,
  isCancellationParty,
  STOREFRONT_KIND,
  type CustomerTripStage,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { shopPath, tripPath } from '@/constants/routes';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import type { CustomerTrip } from '../types';
import styles from './CustomerTripCard.module.css';

/**
 * Một chuyến ĐI THUÊ trong "Chuyến của tôi" (site khách) — Figma "Vehicle Card" (`19879:71822`):
 *
 *  - TRÁI: ảnh xe, dưới là hai mốc nhận / trả xe.
 *  - PHẢI: tên xe · mã chuyến · nhãn chặng; biển số | dịch vụ | hình thức nhận xe; chủ xe + lối nhắn
 *    tin; ba cột tiền Tổng | Đã thanh toán ¦ Còn lại.
 *
 * Cả thẻ là MỘT lối vào chi tiết: tên xe là liên kết, lớp phủ của nó trải kín thẻ (hover viền vàng như
 * bản vẽ). Nút nhắn tin nằm trên lớp phủ — một đích riêng, không lồng trong liên kết.
 *
 * "Đã thanh toán" là `holdPaidAmount` server trả — khoản giữ chỗ đã chuyển THẬT qua XePrime, cùng số
 * với `finance.holdPaidAmount` ở chi tiết; client không tự cộng trừ. Chưa có đơn thì không có dòng.
 *
 * Bên cho thuê hiện như thẻ xe ngoài chợ (`VehicleCard`): ẢNH thật (`shop.avatarUrl` — logo gian hàng
 * hoặc ảnh chủ xe, theo tuyến), và GIAN HÀNG (tuyến gói) nổi hơn chủ xe cá nhân — viền vàng, dấu xác
 * minh, nhãn "Gian hàng", tên vàng, bấm sang mặt tiền. Chủ xe cá nhân không có mặt tiền doanh nghiệp
 * nên không có liên kết (`shopKind`, ADR 0038). Chủ xe tuyến hoa hồng (site partner) dùng thẻ riêng
 * `TripCard`, nơi có quyết định duyệt/từ chối.
 */
/** Chưa chuyển đồng nào. */
const ZERO_MONEY = '0.00';

export function CustomerTripCard({ trip }: { trip: CustomerTrip }) {
  const t = useTranslations('Trips');
  const tHost = useTranslations('Listings.card');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const isShop = trip.shop.shopKind === STOREFRONT_KIND.SHOP;
  const cancelledBy =
    stage === CUSTOMER_TRIP_STAGE.CANCELLED && isCancellationParty(trip.cancelledBy)
      ? trip.cancelledBy
      : null;
  const href = tripPath.detail(trip.id);
  const pickupMethod =
    trip.serviceType === SERVICE_TYPE.WITH_DRIVER
      ? trip.routeType
        ? dl('routeType', trip.routeType)
        : t('pickup.driverPickup')
      : trip.deliveryRequested
        ? t('pickup.delivery')
        : t('pickup.agency');
  /* Yêu cầu dài hạn chưa duyệt chưa có lịch — nói gói + nguyện vọng, không bịa ngày. */
  const wish = [fmt.packageLabel(trip.longTermPackageMonths), fmt.pickupWish(trip)]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const paid = trip.holdPaidAmount ?? ZERO_MONEY;
  const rawRemaining = trip.totalAmount ? subtractMoney(trip.totalAmount, paid) : ZERO_MONEY;
  const remaining = isNegativeMoney(rawRemaining) ? ZERO_MONEY : rawRemaining;

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        {/* Ảnh R2 theo cấu hình từng môi trường — `next/image` cần host khai sẵn nên dùng `img`. */}
        {trip.vehicle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
          <img src={trip.vehicle.imageUrl} alt="" className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.imageFallback} aria-hidden="true" />
        )}

        {/* Figma `19879:71581`: hai mốc lịch thuê nằm DƯỚI ảnh — nhãn trái, giờ phải, chữ 12. */}
        <dl className={styles.schedule}>
          {trip.pickupAt && trip.returnAt ? (
            <>
              <ScheduleRow label={t('detail.pickupAt')} value={fmt.dateTime(trip.pickupAt)} />
              <ScheduleRow label={t('detail.returnAt')} value={fmt.dateTime(trip.returnAt)} />
            </>
          ) : (
            /* Yêu cầu dài hạn chưa duyệt chưa có lịch — nói gói + nguyện vọng, không bịa ngày. */
            <ScheduleRow label={t('detail.pickupWish')} value={wish || '—'} />
          )}
        </dl>
      </div>

      <div className={styles.body}>
        <div className={styles.top}>
          <div className={styles.info}>
            <div className={styles.head}>
              <h3 className={styles.name}>
                <Link href={href} className={styles.nameLink}>
                  {trip.vehicle.name}
                </Link>
              </h3>
              <div className={styles.status}>
                {trip.code ? <span className={styles.code}>#{trip.code}</span> : null}
                {/*
                  Chuyến huỷ nói rõ AI huỷ — server suy từ sổ huỷ (ADR 0045), không ai tự khai.
                  Không rõ bên huỷ thì giữ nhãn chặng chung.
                */}
                {cancelledBy ? (
                  <Tag color={CUSTOMER_TRIP_STAGE_META[stage].color} className={styles.cancelTag}>
                    {t(`cancelledBy.${cancelledBy}`)}
                  </Tag>
                ) : (
                  <StatusTag
                    value={stage}
                    meta={CUSTOMER_TRIP_STAGE_META}
                    group="customerTripStage"
                  />
                )}
              </div>
            </div>

            <ul className={styles.facts}>
              {/* Biển số chỉ có sau khi chủ xe nhận chuyến — server quyết. */}
              {trip.vehicle.plateNumber ? (
                <li className={styles.plate}>{trip.vehicle.plateNumber}</li>
              ) : null}
              <li className={styles.fact}>{dl('serviceType', trip.serviceType)}</li>
              <li className={styles.fact}>{pickupMethod}</li>
            </ul>
          </div>

          <div className={styles.ownerRow}>
            {isShop ? (
              <Link
                href={shopPath.detail(trip.shop.slug)}
                className={cx(styles.owner, styles.ownerLink)}
                aria-label={tHost('shopVerifiedAria', { name: trip.shop.name })}
              >
                <HostIdentity
                  name={trip.shop.name}
                  avatarUrl={trip.shop.avatarUrl ?? null}
                  shop
                  label={tHost('shop')}
                />
              </Link>
            ) : (
              <div className={styles.owner}>
                <HostIdentity
                  name={trip.shop.name}
                  avatarUrl={trip.shop.avatarUrl ?? null}
                  shop={false}
                  label={tHost('owner')}
                />
              </div>
            )}
            {/*
              Kênh chat trong sàn mở cho mọi khách đã gửi yêu cầu tới gian hàng
              (`ChatService.canCustomerOpenChat`) — không theo `canContact` (cờ đó gác SĐT/biển số).
            */}
            {canShowHostChatOnTrip({ shopKind: trip.shop.shopKind, hasBooking: Boolean(trip.code) }) ? (
              <ChatWithShopButton
                vehicleId={trip.vehicle.id}
                appearance="icon"
                className={styles.chat}
                label={t('confirmed.chatOwner')}
              />
            ) : null}
          </div>
        </div>

        {/*
          Ba cột tiền (Figma `19879:71581`): Tổng | Đã thanh toán ¦ Còn lại — Đã trả + Còn lại = Tổng.
          Phép trừ trên chuỗi tiền (ADR 0007), không âm.
        */}
        <dl className={styles.money}>
          <MoneyCell label={t('card.total')}>
            {trip.totalAmount ? (
              fmt.moneyThousands(trip.totalAmount)
            ) : (
              <span className={styles.moneyPending}>{t('card.awaitingQuote')}</span>
            )}
          </MoneyCell>
          <MoneyCell label={t('card.paid')}>
            {trip.totalAmount ? fmt.moneyThousands(paid) : '—'}
          </MoneyCell>
          <span className={styles.moneyDivider} aria-hidden="true" />
          <MoneyCell label={t('card.remaining')} highlight>
            {trip.totalAmount ? fmt.moneyThousands(remaining) : '—'}
          </MoneyCell>
        </dl>
      </div>
    </article>
  );
}

/**
 * Ảnh + nhãn vai + tên của bên cho thuê — cùng dáng khối gian hàng của `VehicleCard` (trang chủ).
 * Không có ảnh thì chữ cái đầu trên nền vàng nhạt.
 */
function HostIdentity({
  name,
  avatarUrl,
  shop,
  label,
}: {
  name: string;
  avatarUrl: string | null;
  shop: boolean;
  label: string;
}) {
  return (
    <>
      <span className={cx(styles.avatar, shop && styles.avatarShop)} aria-hidden="true">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
          <img src={avatarUrl} alt="" loading="lazy" className={styles.avatarImage} />
        ) : (
          initialOf(name)
        )}
        {shop ? (
          <span className={styles.avatarMark}>
            <Image src="/home/card-verified.svg" alt="" width={10} height={10} unoptimized />
          </span>
        ) : null}
      </span>
      <span className={styles.ownerText}>
        <span className={styles.ownerLabel}>{label}</span>
        <span className={styles.ownerName}>{name}</span>
      </span>
    </>
  );
}

/** Một mốc của lịch thuê dưới ảnh — nhãn trái 12 xám, giờ phải 12 đậm vừa. */
function ScheduleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.scheduleRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Một cột tiền — nhãn 12 xám trên, số 14 đậm vừa dưới, căn giữa; `highlight` = "Còn lại" vàng. */
function MoneyCell({
  label,
  highlight = false,
  children,
}: {
  label: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.moneyCell}>
      <dt>{label}</dt>
      <dd className={cx(highlight && styles.moneyHighlight)}>{children}</dd>
    </div>
  );
}
