'use client';

import { CarOutlined } from '@ant-design/icons';
import { Button, Empty, Result, Skeleton, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { VEHICLE_OPERATION_STATUS_META, type VehicleOperationStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { useInfiniteVehicles } from '@/features/vehicles/hooks/use-infinite-vehicles';
import type { VehicleListItem } from '@/features/vehicles/types';
import { getErrorMessage } from '@/services/api-client';
import styles from './StaffVehiclePicker.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Nạp trang kế TRƯỚC khi chạm đáy — người dùng không thấy khoảng chờ giữa hai trang. */
const PREFETCH_MARGIN = '400px 0px';

/**
 * Bước CHỌN XE của luồng "Đặt xe cho khách", chỉ xuất hiện khi lối vào chưa biết xe.
 *
 * Trên lịch, ô được bấm đã nói rõ xe nào — luồng vào thẳng bước thời gian. Từ danh sách đơn
 * hoặc từ hồ sơ khách thì chưa có xe, và một `Select` xổ xuống không đủ: người điều phối nhận
 * ra xe bằng ẢNH và BIỂN SỐ chứ không bằng tên trong danh sách thả. Nên đây là lưới thẻ, cùng
 * ngôn ngữ thị giác với chỗ khách chọn xe ngoài chợ.
 *
 * Danh sách TẢI DẦN theo cuộn (`useInfiniteVehicles`) thay vì lấy một lượt: gian hàng lớn có
 * hàng trăm xe, và một lần gọi `limit=100` vừa nặng vừa cắt mất xe thứ 101.
 */
export function StaffVehiclePicker({ onPick }: { onPick: (vehicle: VehicleListItem) => void }) {
  const fmt = useAppFormat();

  const [q, setQ] = useState('');
  const {
    vehicles,
    total,
    isInitialLoading,
    initialError,
    appendError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retryInitial,
    retryNextPage,
  } = useInfiniteVehicles(q);

  // Sentinel tải trang kế — guard trùng/hết trang nằm trong hook, ở đây chỉ việc gọi.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) fetchNextPage();
      },
      // `root: null` là đủ: vùng cuộn là lưới bên trong, nhưng rootMargin theo viewport vẫn
      // kích hoạt đúng vì sentinel chỉ lộ ra khi lưới đã cuộn tới đáy.
      { root: el.parentElement, rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, vehicles.length]);

  return (
    <div className={styles.picker}>
      <div className={styles.head}>
        <AutoSearchInput
          className={styles.search}
          size="large"
          placeholder="Tìm theo tên xe, biển số hoặc mã xe"
          aria-label="Tìm xe để đặt"
          value={q}
          onSearch={setQ}
        />
        {total > 0 ? <span className={styles.count}>{total} xe</span> : null}
      </div>

      {isInitialLoading ? (
        <div className={styles.state}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : null}

      {initialError ? (
        <Result
          className={styles.state}
          status="warning"
          title="Không tải được danh sách xe"
          subTitle={getErrorMessage(initialError)}
          extra={<Button onClick={retryInitial}>Thử lại</Button>}
        />
      ) : null}

      {!isInitialLoading && !initialError && vehicles.length === 0 ? (
        <Empty
          className={styles.state}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={q ? 'Không có xe nào khớp từ khoá' : 'Gian hàng chưa có xe nào'}
        />
      ) : null}

      {vehicles.length > 0 ? (
        <div className={styles.scroller}>
          <ul className={styles.grid}>
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <button type="button" className={styles.card} onClick={() => onPick(vehicle)}>
                  <span className={styles.thumb}>
                    {vehicle.mainImageUrl ? (
                      // Ảnh trang trí bên trong một cái nút — bấm là CHỌN XE, không phải mở ảnh,
                      // nên cố ý dùng `<img>` chứ không phải `PreviewImage`.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vehicle.mainImageUrl}
                        alt=""
                        loading="lazy"
                        className={styles.thumbImage}
                      />
                    ) : (
                      <CarOutlined className={styles.thumbIcon} />
                    )}
                  </span>
                  <span className={styles.body}>
                    <span className={styles.name}>{vehicle.name}</span>
                    <span className={styles.meta}>
                      {[vehicle.plateNumber, vehicle.code].filter(Boolean).join(' · ')}
                    </span>
                    <span className={styles.tags}>
                      <StatusTag
                        value={vehicle.operationStatus as VehicleOperationStatus}
                        meta={VEHICLE_OPERATION_STATUS_META} group="vehicleOperationStatus"
                      />
                      {vehicle.weekdayPrice ? (
                        <span className={styles.price}>
                          {fmt.money(vehicle.weekdayPrice)}/ngày
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Đáy danh sách: sentinel + trạng thái của TRANG KẾ (không đụng tới xe đã hiện). */}
          <div ref={sentinelRef} className={styles.sentinel}>
            {isFetchingNextPage ? (
              <span className={styles.loadingMore}>
                <Spin size="small" /> Đang tải thêm xe…
              </span>
            ) : appendError ? (
              <span className={styles.loadingMore}>
                Không tải được thêm xe.{' '}
                <Button type="link" size="small" onClick={retryNextPage}>
                  Thử lại
                </Button>
              </span>
            ) : !hasNextPage ? (
              <span className={styles.loadingMore}>Đã hiện hết {total} xe</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
