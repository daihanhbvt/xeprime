'use client';

import { Button, Card, Skeleton } from 'antd';
import Link from 'next/link';
import { longTermPackageLabel, PERMISSION, routeTypeLabel, SERVICE_TYPE } from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTime, formatRentalDuration, formatRentalPoint, dayjs } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { SettlementCard } from '@/features/settlement/components/SettlementCard';
import { useBooking } from '../hooks/use-booking';
import { serviceTypeLabel } from '../constants';
import { BookingActionBar } from './BookingActionBar';
import { BookingDriverSection } from './BookingDriverSection';
import { BookingOperationPanel } from './BookingOperationPanel';
import styles from './BookingDetailContent.module.css';

/**
 * Toàn bộ nội dung có thẩm quyền của MỘT đơn thuê: thẻ chi tiết (xe · khách · thời gian · tiền)
 * + thanh hành động + diễn biến chuyến + quyết toán.
 *
 * Tách khỏi route `/manage/bookings/[id]` để modal chi tiết trên LỊCH dùng CHUNG — hai bề mặt
 * một nguồn (bài học Wave 10: hai bản chi tiết là một bản bị bỏ quên). Mutation nào cũng đi qua
 * đúng các component con đã có (`BookingActionBar`, `BookingOperationPanel`, `SettlementCard`)
 * nên quyền và invalidation không nhân bản.
 *
 * PII: khách (tên/SĐT) chỉ hiện khi có `bookings.view` — thiếu quyền thì cả component chặn từ
 * ngoài, người chỉ có `calendar.view` không nhìn được gì ở đây (guard backend vẫn là lớp thật).
 */
export function BookingDetailContent({
  bookingId,
  onNotFoundAction,
}: {
  bookingId: string;
  /** Nút thoát khi đơn không còn (trang: về danh sách · modal: đóng). */
  onNotFoundAction?: { label: string; onClick: () => void };
}) {
  const { has } = usePermissions();
  const canView = has(PERMISSION.BOOKING_VIEW);
  const { data, isLoading, isError, error, refetch } = useBooking(canView ? bookingId : null);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem đơn thuê"
        description="Liên hệ quản trị viên nếu bạn cần quyền này."
        missingPermissions={[PERMISSION.BOOKING_VIEW]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className={styles.stackGap}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !data) {
    // Đơn bị xoá và lỗi mạng là hai chuyện khác nhau — không mời "thử lại" cho cái đã biến mất.
    const notFound = getErrorMessage(error).includes('Không tìm thấy');
    return (
      <EmptyState
        variant={notFound ? 'empty' : 'error'}
        title={notFound ? 'Không tìm thấy đơn thuê' : 'Không tải được đơn thuê'}
        description={notFound ? 'Đơn có thể đã bị xoá.' : getErrorMessage(error)}
        action={
          notFound && onNotFoundAction ? (
            <Button onClick={onNotFoundAction.onClick}>{onNotFoundAction.label}</Button>
          ) : !notFound ? (
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          ) : undefined
        }
      />
    );
  }

  const hasDebt = !isZeroMoney(data.debtAmount);
  const hasDeposit = !isZeroMoney(data.depositAmount);

  return (
    <div className={styles.stackGap}>
      <Card
        title="Chi tiết đơn đặt xe"
        className={styles.card}
        extra={<span className={styles.createdAt}>Lập lúc {formatDateTime(data.createdAt)}</span>}
      >
        <div className={styles.detailGrid}>
          <section className={styles.block}>
            <h3 className={styles.blockTitle}>Thông tin phương tiện</h3>
            <div className={styles.vehicle}>
              {/*
                Ảnh chỉ hiện khi xe THẬT SỰ có — không dựng khung xám giả làm chỗ trống trông
                như đang tải mãi. `next/image` cần host được khai báo, còn ảnh xe đến từ R2 theo
                cấu hình từng môi trường, nên dùng thẻ ảnh thường.
              */}
              {data.vehicleImageUrl ? (
                <PreviewImage
                  src={data.vehicleImageUrl}
                  alt={data.vehicleName}
                  className={styles.vehicleImage}
                  loading="lazy"
                />
              ) : null}
              <div className={styles.stack}>
                <span className={styles.strong}>{data.vehicleName}</span>
                {data.vehiclePlate ? (
                  <span className={styles.plate}>{data.vehiclePlate}</span>
                ) : null}
                <span className={styles.meta}>{serviceTypeLabel(data.serviceType)}</span>
                {has(PERMISSION.VEHICLE_VIEW) ? (
                  <Link href={vehiclePath.detail(data.vehicleId)} className={styles.link}>
                    Xem hồ sơ xe
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.block}>
            <h3 className={styles.blockTitle}>Khách hàng đặt xe</h3>
            <div className={styles.stack}>
              <span className={styles.strong}>{data.customerName}</span>
              {data.customerPhone ? (
                // Vận hành gọi khách ngay từ đây — trên điện thoại là một chạm.
                <a href={`tel:${data.customerPhone}`} className={styles.link}>
                  {data.customerPhone}
                </a>
              ) : (
                <span className={styles.meta}>Không có số điện thoại</span>
              )}
            </div>
          </section>

          {/* Hành trình chuyến CÓ TÀI XẾ (17/08) — copy từ yêu cầu khi duyệt / nhập khi lập tay. */}
          {data.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
            <section className={styles.panel}>
              <h3 className={styles.blockTitle}>Hành trình</h3>
              <dl className={styles.rows}>
                <div className={styles.row}>
                  <dt>Lộ trình</dt>
                  <dd>{data.routeType ? routeTypeLabel(data.routeType) : 'Chưa có thông tin'}</dd>
                </div>
                <div className={styles.row}>
                  <dt>Địa chỉ đón</dt>
                  <dd>{data.pickupAddress ?? 'Chưa có thông tin'}</dd>
                </div>
                {data.destination ? (
                  <div className={styles.row}>
                    <dt>Điểm đến</dt>
                    <dd>{data.destination}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {/* Tài xế (17/08) — gán/bỏ gán; đơn with_driver chưa phân công được nhắc rõ. */}
          <BookingDriverSection booking={data} canUpdate={has(PERMISSION.BOOKING_UPDATE)} />

          <section className={styles.panel}>
            <h3 className={styles.blockTitle}>Thời gian thuê</h3>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Nhận xe</dt>
                <dd>{formatRentalPoint(dayjs(data.pickupAt))}</dd>
              </div>
              <div className={styles.row}>
                <dt>Trả xe</dt>
                <dd>{formatRentalPoint(dayjs(data.returnAt))}</dd>
              </div>
              <div className={styles.row}>
                <dt>Thời lượng</dt>
                <dd>
                  {/*
                    Đơn THUÊ DÀI HẠN dài đúng bằng GÓI (tháng lịch — ADR 0011). Nói "92 ngày" cho
                    gói 3 tháng là đúng số nhưng sai đơn vị nghiệp vụ: gói mới là thứ hai bên ký.
                  */}
                  {data.longTermPackageMonths
                    ? `Gói ${longTermPackageLabel(data.longTermPackageMonths)}`
                    : formatRentalDuration(dayjs(data.pickupAt), dayjs(data.returnAt))}
                </dd>
              </div>
              {/*
                Mốc THỰC TẾ chỉ hiện khi đã có — chưa giao xe mà bày một dòng trống là mời người
                đọc tự điền lấy một giả định.
              */}
              {data.actualPickupAt ? (
                <div className={styles.row}>
                  <dt>Giao thực tế</dt>
                  <dd>{formatRentalPoint(dayjs(data.actualPickupAt))}</dd>
                </div>
              ) : null}
              {data.actualReturnAt ? (
                <div className={styles.row}>
                  <dt>Nhận lại thực tế</dt>
                  <dd>{formatRentalPoint(dayjs(data.actualReturnAt))}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className={styles.panel}>
            <h3 className={styles.blockTitle}>Tổng hợp chi phí &amp; đặt cọc</h3>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Tiền thuê</dt>
                <dd>{formatMoneyVnd(data.baseAmount)}</dd>
              </div>
              {!isZeroMoney(data.discountAmount) ? (
                <div className={styles.row}>
                  <dt>Khuyến mãi</dt>
                  <dd className={styles.negative}>−{formatMoneyVnd(data.discountAmount)}</dd>
                </div>
              ) : null}
              <div className={styles.row}>
                <dt>Phí giao nhận</dt>
                <dd>
                  {isZeroMoney(data.deliveryFee) ? 'Miễn phí' : formatMoneyVnd(data.deliveryFee)}
                </dd>
              </div>
              <div className={styles.rowTotal}>
                <dt>Tổng cộng</dt>
                <dd>{formatMoneyVnd(data.totalAmount)}</dd>
              </div>
              <div className={styles.row}>
                <dt>Đã thanh toán</dt>
                <dd>{formatMoneyVnd(data.paidAmount)}</dd>
              </div>
              {hasDebt ? (
                <div className={styles.row}>
                  <dt>Còn nợ</dt>
                  <dd className={styles.negative}>{formatMoneyVnd(data.debtAmount)}</dd>
                </div>
              ) : null}
              {hasDeposit ? (
                <div className={styles.row}>
                  {/*
                    Đây là cọc THEO ĐƠN (cấu hình), không phải tiền đã cầm. Việc đã thu được
                    chưa nằm ở thẻ `Phát sinh & Tiền cọc` — hai con số khác nhau, không gộp.
                  */}
                  <dt>Đặt cọc tài sản</dt>
                  <dd>{formatMoneyVnd(data.depositAmount)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {data.note ? (
            <section className={styles.blockWide}>
              <h3 className={styles.blockTitle}>Ghi chú</h3>
              <p className={styles.note}>{data.note}</p>
            </section>
          ) : null}
        </div>

        <BookingActionBar booking={data} />
      </Card>

      <div className={styles.layout}>
        <BookingOperationPanel bookingId={data.id} bookingStatus={data.status} />
        <SettlementCard bookingId={data.id} canView={canView} />
      </div>
    </div>
  );
}
