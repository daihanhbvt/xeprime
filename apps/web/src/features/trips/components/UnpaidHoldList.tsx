'use client';

/* eslint-disable @next/next/no-img-element -- ảnh xe từ storage ngoài, 64×44 và trang trí (alt
 * rỗng — tên xe đứng ngay cạnh); `next/image` cần khai domain cho một ô nhỏ không cần tối ưu. */

import { CarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HOLD_COUNTDOWN_URGENT_MINUTES } from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { paymentPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import type { CustomerUnpaidHold } from '../types';
import styles from './UnpaidHoldList.module.css';

/**
 * Danh sách chuyến khách đang GIỮ mà chưa trả — mỗi dòng một lối trả thẳng sang trang thanh toán.
 *
 * Dùng ở hai nơi nói cùng một chuyện: thẻ nhắc đầu trang "Chuyến của tôi" và màn chặn trong hộp
 * thoại đặt xe khi khách đã giữ đủ trần. Một bản để hai nơi không bao giờ liệt kê khác nhau.
 *
 * Mỗi dòng trả lời đúng ba câu khách cần để quyết trả cái nào trước: xe nào (ảnh + tên + lịch), bao
 * nhiêu, và còn bao lâu. Đồng hồ đọc MỐC của server và đổi màu khi gấp — cùng ngưỡng với khối tiền
 * giữ chỗ ở trang chuyến. Server đã xếp gấp nhất trước.
 */
export function UnpaidHoldList({
  items,
  onNavigate,
}: {
  items: readonly CustomerUnpaidHold[];
  /** Gọi khi khách bấm "Thanh toán" — hộp thoại đặt xe đóng mình lại trước khi rời trang. */
  onNavigate?: () => void;
}) {
  const t = useTranslations('Trips');
  const fmt = useAppFormat();

  return (
    <ul className={styles.list} aria-label={t('unpaid.listLabel')}>
      {items.map((item) => (
        <li key={item.tripId} className={styles.item}>
          <div className={styles.vehicle}>
            {item.vehicleImageUrl ? (
              <img className={styles.thumb} src={item.vehicleImageUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.thumbFallback} aria-hidden>
                <CarOutlined />
              </span>
            )}
            <span className={styles.text}>
              <b className={styles.name}>{item.vehicleName}</b>
              {item.pickupAt && item.returnAt ? (
                <span className={styles.range}>
                  {fmt.rentalRangeSummary(dayjs(item.pickupAt), dayjs(item.returnAt))}
                </span>
              ) : null}
              <Countdown
                className={styles.countdown}
                deadline={item.expiresAt}
                // Cùng ngưỡng cam với mọi đồng hồ giữ chỗ khác — trùng lượt nhắc CUỐI của worker.
                urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
                labels={{
                  remaining: t('hold.countdownRemaining'),
                  expired: t('hold.countdownExpired'),
                }}
              />
            </span>
          </div>

          <div className={styles.pay}>
            <span className={styles.amount}>
              <span className={styles.amountLabel}>{t('unpaid.amountLabel')}</span>
              <b className={styles.amountValue}>{fmt.money(item.remainingAmount)}</b>
            </span>
            <Link
              href={paymentPath.trip(item.tripId)}
              className={styles.payLink}
              onClick={onNavigate}
              aria-label={t('unpaid.payAria', { vehicle: item.vehicleName })}
            >
              <Button type="primary">{t('unpaid.pay')}</Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
