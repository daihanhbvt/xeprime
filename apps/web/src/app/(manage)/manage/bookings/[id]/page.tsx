'use client';

import { Button, Card, Skeleton } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BOOKING_STATUS_META, PERMISSION, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { BookingActionBar } from '@/features/bookings/components/BookingActionBar';
import { BookingOperationPanel } from '@/features/bookings/components/BookingOperationPanel';
import { useBooking } from '@/features/bookings/hooks/use-booking';
import { serviceTypeLabel } from '@/features/bookings/constants';
import { SettlementCard } from '@/features/settlement/components/SettlementCard';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDateTime, formatRentalDuration, formatRentalPoint, dayjs } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import styles from './booking-detail-page.module.css';

/**
 * Chi tiết một đơn thuê — route THẬT (Wave 10).
 *
 * Vì sao là trang chứ không phải drawer: vận hành một chuyến kéo dài nhiều ngày, nhiều người
 * cùng nhìn, và người ta gửi link cho nhau.
 *
 * Bố cục: một thẻ chi tiết ĐẦY ĐỦ ở trên (xe · thời gian · khách · tiền) với thanh hành động ở
 * CHÂN thẻ — mọi nút nằm đúng một chỗ; bên dưới là hai khối vận hành (diễn biến chuyến, phát
 * sinh & cọc). Người mở trang thấy hết ngữ cảnh trước khi phải quyết định gì.
 */
export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params?.id ?? '';
  const router = useRouter();
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
      <div className={styles.page}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !data) {
    // Đơn bị xoá và lỗi mạng là hai chuyện khác nhau — không mời "thử lại" cho cái đã biến mất.
    const notFound = getErrorMessage(error).includes('Không tìm thấy');
    return (
      <div className={styles.page}>
        <EmptyState
          variant={notFound ? 'empty' : 'error'}
          title={notFound ? 'Không tìm thấy đơn thuê' : 'Không tải được đơn thuê'}
          description={notFound ? 'Đơn có thể đã bị xoá.' : getErrorMessage(error)}
          action={
            notFound ? (
              <Button onClick={() => router.push(ROUTES.MANAGE.BOOKINGS)}>Về danh sách đơn</Button>
            ) : (
              <Button type="primary" onClick={() => void refetch()}>
                Thử lại
              </Button>
            )
          }
        />
      </div>
    );
  }

  const status = data.status as BookingStatus;
  const hasDebt = !isZeroMoney(data.debtAmount);
  const hasDeposit = !isZeroMoney(data.depositAmount);

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={`Đơn hàng ${data.code}`}
        subtitle="Quản lý chuyến đi và quá trình cho thuê hiện tại"
        onBack={() => router.push(ROUTES.MANAGE.BOOKINGS)}
        extra={<StatusTag value={status} meta={BOOKING_STATUS_META} />}
      />

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
                // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
                <img
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
                <dd>{formatRentalDuration(dayjs(data.pickupAt), dayjs(data.returnAt))}</dd>
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
