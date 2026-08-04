'use client';

import { Alert, Button, Empty, Pagination, Spin } from 'antd';
import { useState } from 'react';
import { BOOKING_STATUS_META } from '@xeprime/types';
import { Stars } from '@/components/data-display/Stars';
import { StatusTag } from '@/components/data-display/StatusTag';
import {
  useAuthModal,
  useNextFromCurrentPath,
} from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { formatDateTimeRange } from '@/lib/datetime';
import { getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { MY_TRIPS_DEFAULT_LIMIT } from '../api';
import { useMyTrips } from '../hooks/use-my-trips';
import type { MyTrip } from '../types';
import { ReviewModal } from './ReviewModal';
import styles from './MyTripsView.module.css';

/** Màn "Đơn thuê của tôi" — khách xem các chuyến và đánh giá chuyến đã hoàn thành. */
export function MyTripsView() {
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<MyTrip | null>(null);
  const trips = useMyTrips(page);
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  if (trips.isLoading) {
    return (
      <div className={styles.center}>
        <Spin />
      </div>
    );
  }

  if (trips.isError) {
    if (isUnauthenticated(trips.error)) {
      return (
        <div className={styles.center}>
          <Alert
            type="info"
            showIcon
            message="Vui lòng đăng nhập để xem các chuyến thuê của bạn."
          />
          {/* Modal ngay tại đây, `next` trỏ về chính trang này — đăng nhập xong thấy luôn
              danh sách chuyến, không bị ném sang khu quản lý. */}
          <Button
            type="primary"
            onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
          >
            Đăng nhập
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon message={getErrorMessage(trips.error)} />
      </div>
    );
  }

  const items = trips.data?.items ?? [];
  const meta = trips.data?.meta;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>Đơn thuê của tôi</h1>

      {items.length === 0 ? (
        <Empty description="Bạn chưa có chuyến thuê nào." />
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((t) => (
              <li key={t.bookingId} className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>
                    <span className={styles.vehicle}>{t.vehicleName}</span>
                    <span className={styles.shop}>
                      {t.shopName} · {t.code}
                    </span>
                  </div>
                  <StatusTag value={t.status} meta={BOOKING_STATUS_META} />
                </div>

                <div className={styles.time}>{formatDateTimeRange(t.pickupAt, t.returnAt)}</div>

                <div className={styles.footer}>
                  {t.review ? (
                    <div className={styles.reviewed}>
                      <Stars value={t.review.rating} size="sm" />
                      {t.review.comment ? (
                        <span className={styles.reviewComment}>{t.review.comment}</span>
                      ) : null}
                    </div>
                  ) : t.canReview ? (
                    <Button type="primary" size="small" onClick={() => setActive(t)}>
                      Đánh giá
                    </Button>
                  ) : (
                    <span className={styles.hint}>Đánh giá được sau khi hoàn thành chuyến</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {meta && meta.total > MY_TRIPS_DEFAULT_LIMIT ? (
            <div className={styles.pager}>
              <Pagination
                current={meta.page}
                pageSize={meta.limit}
                total={meta.total}
                onChange={setPage}
                showSizeChanger={false}
              />
            </div>
          ) : null}
        </>
      )}

      <ReviewModal trip={active} open={active !== null} onClose={() => setActive(null)} />
    </div>
  );
}
