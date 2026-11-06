'use client';

import { Alert, Pagination, Skeleton } from 'antd';
import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { CustomerTripFilter } from '@xeprime/types';
import { staggerFastClass } from '@/components/motion/motion-classes';
import { cx } from '@/lib/cx';
import { TRIPS_DEFAULT_LIMIT, type TripsResult } from '../api';
import type { CustomerTrip } from '../types';
import styles from './TripList.module.css';

export interface TripListProps {
  /** Lượt đọc `GET /trips` hiện tại — `undefined` khi chưa có dữ liệu nào. */
  data: TripsResult | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** Ghi tab/trang lên URL — `useTripListUrl().navigate`. */
  onNavigate: (next: { filter?: CustomerTripFilter; page?: number }) => void;
  /** Một thẻ chuyến. */
  renderTrip: (trip: CustomerTrip) => ReactNode;
  /** Trạng thái TRỐNG — mỗi tab có lối thoát riêng, nên phần này do màn cha dựng. */
  empty: ReactNode;
}

/**
 * Thân danh sách chuyến ĐI THUÊ của khách (`TripsView`): thẻ, trạng thái tải / trống, phân trang.
 *
 * Bộ chuyển hai tab (`Chuyến hiện tại` / `Lịch sử chuyến`) do màn cha vẽ ở đầu thẻ "Chuyến của tôi"
 * (`TripFilterTabs`, design `19879:69348`) — không có ô lọc chặng: nhãn chặng trên từng thẻ đã nói
 * đủ. Chuyến CHO THUÊ không ở đây: site partner dùng màn "Đơn thuê xe" ở cả hai tuyến (06/11/2026).
 *
 * Lọc, phân trang và ĐẾM đều ở server. Đếm ở client chỉ đúng với đúng trang đang tải — tab sẽ
 * nói `Lịch sử chuyến (3)` khi có 30 chuyến đã khép.
 */
export function TripList({
  data,
  isLoading,
  isFetching,
  onNavigate,
  renderTrip,
  empty,
}: TripListProps) {
  const t = useTranslations('Trips');

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <>
      {isLoading ? (
        <div className={styles.list} aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.skeleton}>
              <Skeleton active avatar={{ shape: 'square', size: 64 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        empty
      ) : (
        <>
          {/* `aria-busy` khi đang nạp trang/tab mới: nội dung cũ còn đó nhưng đã lỗi thời. */}
          <div className={cx(styles.list, staggerFastClass)} aria-busy={isFetching}>
            {items.map((trip) => (
              <Fragment key={trip.id}>{renderTrip(trip)}</Fragment>
            ))}
          </div>

          {meta && meta.total > TRIPS_DEFAULT_LIMIT ? (
            <div className={styles.pager}>
              <Pagination
                current={meta.page}
                pageSize={meta.limit}
                total={meta.total}
                onChange={(next) => onNavigate({ page: next })}
                showSizeChanger={false}
              />
            </div>
          ) : null}
        </>
      )}

      {/* Dữ liệu cũ vẫn hiển thị trong lúc nạp lại; chỉ báo nhẹ thay vì chớp sang skeleton. */}
      {!isLoading && isFetching ? (
        <Alert type="info" showIcon title={t('list.refreshing')} className={styles.refreshing} />
      ) : null}
    </>
  );
}
