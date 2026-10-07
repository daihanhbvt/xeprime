'use client';

import { Alert, Button, Pagination, Select, Skeleton, Tabs } from 'antd';
import { Fragment, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_TRIP_FILTER_STAGES,
  CUSTOMER_TRIP_FILTER_VALUES,
  type CustomerTripFilter,
  type CustomerTripStage,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { TRIPS_DEFAULT_LIMIT, type TripsResult } from '../api';
import type { CustomerTrip } from '../types';
import styles from './TripList.module.css';

export interface TripListProps {
  filter: CustomerTripFilter;
  /** Lượt đọc `GET /trips` hiện tại — `undefined` khi chưa có dữ liệu nào. */
  data: TripsResult | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** Ghi tab/trang lên URL — `useTripListUrl().navigate`. */
  onNavigate: (next: { filter?: CustomerTripFilter; page?: number }) => void;
  /** Một thẻ chuyến — mỗi phía (khách / chủ xe) tự quyết hành động trên thẻ của mình. */
  renderTrip: (trip: CustomerTrip) => ReactNode;
  /**
   * Trạng thái TRỐNG khi chưa lọc chặng — mỗi phía có lối thoát riêng (khách đi tìm xe, chủ xe
   * xem xe của mình), nên phần này do màn cha dựng.
   */
  empty: ReactNode;
}

/**
 * Khung một danh sách chuyến — dùng chung cho chuyến ĐI THUÊ của khách (`TripsView`) và chuyến
 * CHO THUÊ của chủ xe tuyến hoa hồng (`OwnerTripsView`).
 *
 * ĐÚNG HAI TAB (`Chuyến hiện tại` / `Lịch sử chuyến`). Chi tiết chặng — chờ duyệt, chờ chuyển
 * giữ chỗ, sắp tới, đang thuê — do nhãn trên từng thẻ nói; dựng thêm tab cho mỗi chặng là bắt
 * người dùng mở bốn tab mới biết mình có bao nhiêu chuyến.
 *
 * Lọc, phân trang và ĐẾM đều ở server. Đếm ở client chỉ đúng với đúng trang đang tải — tab sẽ
 * nói `Lịch sử chuyến (3)` khi có 30 chuyến đã khép.
 */
export function TripList({
  filter,
  data,
  isLoading,
  isFetching,
  onNavigate,
  renderTrip,
  empty,
}: TripListProps) {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();

  /*
   * Lọc theo CHẶNG, chỉ ở client và chỉ trong trang đang xem — cố ý.
   *
   * Đây là một bộ lọc THU HẸP tầm nhìn của người dùng trên thứ họ đang đọc, không phải một
   * chiều truy vấn mới: hai tab đã chia sẵn theo "còn chạy / đã khép", và server chưa nhận tham
   * số chặng. Đẩy nó lên URL sẽ hứa một phạm vi (toàn bộ kết quả) mà nó không giữ được.
   */
  const [stageFilter, setStageFilter] = useState<CustomerTripStage | undefined>(undefined);

  const counts = data?.counts;
  const pageItems = data?.items ?? [];
  const items = stageFilter ? pageItems.filter((trip) => trip.stage === stageFilter) : pageItems;
  const meta = data?.meta;

  return (
    <>
      <Tabs
        activeKey={filter}
        onChange={(key) => {
          // Đổi tab là đổi tập chuyến — một chặng chỉ có ở tab kia sẽ cho ra danh sách trống
          // mà không ai giải thích được, nên bộ lọc chặng rơi lại.
          setStageFilter(undefined);
          onNavigate({ filter: key as CustomerTripFilter });
        }}
        items={CUSTOMER_TRIP_FILTER_VALUES.map((key) => ({
          key,
          label: counts
            ? t('list.tabLabel', { label: dl('customerTripFilter', key), count: counts[key] })
            : dl('customerTripFilter', key),
        }))}
        tabBarExtraContent={{
          right: (
            <Select<CustomerTripStage>
              className={styles.stageFilter}
              aria-label={t('list.stageFilterLabel')}
              placeholder={t('list.stageAll')}
              allowClear
              value={stageFilter}
              onChange={(value) => setStageFilter(value)}
              /*
               * Chỉ chặng của TAB ĐANG MỞ: "Chờ xác nhận" trong tab Lịch sử là một lựa chọn chắc
               * chắn ra danh sách trống. `CUSTOMER_TRIP_FILTER_STAGES` cũng đã loại chặng đã gỡ
               * (ADR 0055) — cùng nguồn server dùng để chia tab.
               */
              options={CUSTOMER_TRIP_FILTER_STAGES[filter].map((stage) => ({
                value: stage,
                label: dl('customerTripStage', stage),
              }))}
            />
          ),
        }}
      />

      {isLoading ? (
        <div className={styles.list} aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.skeleton}>
              <Skeleton active avatar={{ shape: 'square', size: 64 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 && stageFilter ? (
        /* Lọc chặng không khớp gì: lối ra là XOÁ bộ lọc, không phải lối thoát của danh sách trống. */
        <EmptyState
          variant="no-results"
          title={t('list.stageEmptyTitle')}
          description={t('list.stageEmptyBody')}
          action={<Button onClick={() => setStageFilter(undefined)}>{t('list.stageClear')}</Button>}
        />
      ) : items.length === 0 ? (
        empty
      ) : (
        <>
          {/* `aria-busy` khi đang nạp trang/tab mới: nội dung cũ còn đó nhưng đã lỗi thời. */}
          <div className={styles.list} aria-busy={isFetching}>
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
