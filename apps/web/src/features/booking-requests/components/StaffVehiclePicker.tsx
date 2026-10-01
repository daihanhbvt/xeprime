'use client';

import { CarOutlined } from '@ant-design/icons';
import { Button, Empty, Result, Skeleton, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { VEHICLE_OPERATION_STATUS_META, type VehicleOperationStatus } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { StatusTag } from '@/components/data-display/StatusTag';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { BranchFilterSelect } from '@/features/branches/components/BranchFilterSelect';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
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
 *
 * **Chi nhánh là GỢI Ý, không phải rào chắn** (ADR 0052). `defaultBranchId` đến từ màn đang mở
 * hộp thoại, nên người điều phối đang lọc Ninh Kiều thấy ngay xe của Ninh Kiều. Nhưng ô chọn vẫn
 * đổi được tại chỗ: điều một chiếc xe từ chi nhánh khác sang cho khách là việc bình thường, và
 * khoá cứng chỉ khiến họ đóng hộp thoại, đổi bộ lọc của trang, rồi mở lại.
 */
export function StaffVehiclePicker({
  onPick,
  defaultBranchId,
}: {
  onPick: (vehicle: VehicleListItem) => void;
  defaultBranchId?: string;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('BookingRequests.vehiclePicker');
  const [q, setQ] = useState('');
  // State cục bộ, KHÔNG lên URL: hộp thoại này không phải một màn hình chia sẻ link được, và ghi
  // vào URL sẽ đụng chính `?branchId=` của trang đứng sau nó.
  const [branchId, setBranchId] = useState<string | undefined>(defaultBranchId);
  /*
   * Nối state cục bộ vào hook (`local: true`) chứ không để hook chỉ-đọc rồi tự dựng ô: ô này phải
   * khoá lại cho người chỉ phụ trách một chi nhánh, và phải tự nhả một `defaultBranchId` không
   * còn dùng được. Cờ `local` giữ đúng một điều: hộp thoại không ghi vào bộ nhớ chi nhánh của menu.
   */
  const branch = useBranchFilter({ value: branchId, onChange: setBranchId, local: true });
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
  } = useInfiniteVehicles(q, branchId);

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
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAriaLabel')}
          value={q}
          onSearch={setQ}
        />
        <BranchFilterSelect
          branch={branch}
          value={branchId}
          className={styles.branch}
          size="large"
        />
        {total > 0 ? <span className={styles.count}>{t('count', { count: total })}</span> : null}
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
          title={t('loadFailed')}
          subTitle={getErrorMessage(initialError)}
          extra={<Button onClick={retryInitial}>{t('retry')}</Button>}
        />
      ) : null}

      {!isInitialLoading && !initialError && vehicles.length === 0 ? (
        <Empty
          className={styles.state}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          /*
           * Ba câu khác nhau cho ba lý do khác nhau. "Gian hàng chưa có xe nào" nói ra khi thật
           * ra chỉ là chi nhánh đang lọc chưa có xe sẽ khiến người dùng đi tìm một lỗi không tồn
           * tại — trong khi việc cần làm chỉ là đổi ô chi nhánh ngay phía trên.
           */
          description={
            q ? t('emptySearch') : branchId ? t('emptyBranch') : t('empty')
          }
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
                      {[vehicle.plateNumber, vehicle.code].filter(Boolean).join(LIST_SEPARATOR)}
                    </span>
                    <span className={styles.tags}>
                      <StatusTag
                        value={vehicle.operationStatus as VehicleOperationStatus}
                        meta={VEHICLE_OPERATION_STATUS_META} group="vehicleOperationStatus"
                      />
                      {vehicle.weekdayPrice ? (
                        <span className={styles.price}>
                          {t('perDay', { amount: fmt.money(vehicle.weekdayPrice) })}
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
                <Spin size="small" /> {t('loadingMore')}
              </span>
            ) : appendError ? (
              <span className={styles.loadingMore}>
                {t('appendFailed')}{' '}
                <Button type="link" size="small" onClick={retryNextPage}>
                  {t('retry')}
                </Button>
              </span>
            ) : !hasNextPage ? (
              <span className={styles.loadingMore}>{t('allShown', { count: total })}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
