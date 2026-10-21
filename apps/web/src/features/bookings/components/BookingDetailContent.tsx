'use client';

import { Button, Card, Skeleton } from 'antd';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  API_ERROR_CODE,
  isBookingFinal,
  PERMISSION,
  SERVICE_TYPE,
  type BookingStatus,
} from '@xeprime/types';
import { DeductedAmount } from '@/components/data-display/DeductedAmount';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { dayjs } from '@/lib/datetime';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import { getErrorCode } from '@/services/api-client';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { SettlementCard } from '@/features/settlement/components/SettlementCard';
import { useBooking } from '../hooks/use-booking';
import { BookingActionBar } from './BookingActionBar';
import { BookingCustomerDocumentsDialog } from './BookingCustomerDocumentsDialog';
import { BookingDriverSection } from './BookingDriverSection';
import { BookingOperationPanel } from './BookingOperationPanel';
import { UpdateDeliveryFeeModal } from './UpdateDeliveryFeeModal';
import styles from './BookingDetailContent.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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
  const fmt = useAppFormat();
  const t = useTranslations('Bookings');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { has } = usePermissions();
  const canView = has(PERMISSION.BOOKING_VIEW);
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const { data, isLoading, isError, error, refetch } = useBooking(canView ? bookingId : null);
  /** Sửa phí giao nhận — mở từ chính dòng phí ở khối chi phí, xem ghi chú tại chỗ đó. */
  const [feeOpen, setFeeOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('detail.forbiddenTitle')}
        description={t('detail.forbiddenBody')}
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
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant={notFound ? 'empty' : 'error'}
        title={notFound ? t('detail.notFoundTitle') : t('detail.errorTitle')}
        description={notFound ? t('detail.notFoundBody') : errorMessage(error)}
        action={
          notFound && onNotFoundAction ? (
            <Button onClick={onNotFoundAction.onClick}>{onNotFoundAction.label}</Button>
          ) : !notFound ? (
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const hasDebt = !isZeroMoney(data.debtAmount);
  const hasDeposit = !isZeroMoney(data.depositAmount);
  const hasHoldPaymentPlan = data.holdPaidAmount != null && data.payAtPickupAmount != null;
  // Thu vượt = đã thu − phải thu, chỉ khi dương. Tính trên CHUỖI tiền (ADR 0007), không Number.
  const excess = subtractMoney(data.collectedAmount, data.amountDue);
  const overCollected = isNegativeMoney(excess) || isZeroMoney(excess) ? null : excess;
  /*
   * Cùng luật với server (`isBookingFinal`): đơn đã khép thì mọi đường ghi đều bị từ chối.
   *
   * Tên `closed` phải được khai báo TƯỜNG MINH ở đây — bỏ quên thì TypeScript lặng lẽ nối vào
   * `window.closed` của DOM lib (cũng kiểu `boolean`), typecheck vẫn xanh còn lúc chạy thì luôn
   * ra `false` và nút sửa hiện cả trên đơn đã đóng.
   */
  const closed = isBookingFinal(data.status as BookingStatus);

  return (
    <div className={styles.stackGap}>
      <Card
        title={t('detail.cardTitle')}
        className={styles.card}
        extra={
          <span className={styles.createdAt}>
            {t('detail.createdAt', { value: fmt.dateTime(data.createdAt) })}
          </span>
        }
      >
        <div className={styles.detailGrid}>
          <section className={styles.block}>
            <h3 className={styles.blockTitle}>{t('detail.vehicleBlock')}</h3>
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
                <span className={styles.meta}>{dl('serviceType', data.serviceType)}</span>
                {has(PERMISSION.VEHICLE_VIEW) ? (
                  <Link href={vehiclePath.detail(data.vehicleId)} className={styles.link}>
                    {t('detail.viewVehicle')}
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.block}>
            <h3 className={styles.blockTitle}>{t('detail.customerBlock')}</h3>
            <div className={styles.stack}>
              <span className={styles.strong}>{data.customerName}</span>
              {data.customerPhone ? (
                // Vận hành gọi khách ngay từ đây — trên điện thoại là một chạm.
                <a href={`tel:${data.customerPhone}`} className={styles.link}>
                  {data.customerPhone}
                </a>
              ) : (
                <span className={styles.meta}>{t('detail.noPhone')}</span>
              )}
              {/*
                Nút đứng CẠNH dữ liệu nó thao tác, không dồn lên thanh hành động (cùng luật với
                nút "Sửa" của phí giao nhận bên dưới).

                Ẩn khi đơn cũ không khớp được khách trong sổ (`tenantCustomerId` null) — không có
                hồ sơ thì không có chỗ nào để đính giấy tờ vào.

                Quyền là quyền GIẤY TỜ, không phải quyền đơn: nhân viên xem được đơn không đương
                nhiên được mở kho giấy tờ tuỳ thân của khách.
              */}
              {data.tenantCustomerId && has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE) ? (
                <Button
                  size="small"
                  onClick={() => setDocumentsOpen(true)}
                  className={styles.inlineAction}
                >
                  {t('detail.addDocuments')}
                </Button>
              ) : null}
            </div>
          </section>

          {/* Hành trình chuyến CÓ TÀI XẾ (17/08) — copy từ yêu cầu khi duyệt / nhập khi lập tay. */}
          {data.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
            <section className={styles.panel}>
              <h3 className={styles.blockTitle}>{t('detail.routeBlock')}</h3>
              <dl className={styles.rows}>
                <div className={styles.row}>
                  <dt>{t('detail.route')}</dt>
                  <dd>{data.routeType ? dl('routeType', data.routeType) : t('detail.unknown')}</dd>
                </div>
                <div className={styles.row}>
                  <dt>{t('detail.pickupAddress')}</dt>
                  <dd>{data.pickupAddress ?? t('detail.unknown')}</dd>
                </div>
                {data.destination ? (
                  <div className={styles.row}>
                    <dt>{t('detail.destination')}</dt>
                    <dd>{data.destination}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {/* Tài xế (17/08) — gán/bỏ gán; đơn with_driver chưa phân công được nhắc rõ. */}
          <BookingDriverSection booking={data} canUpdate={has(PERMISSION.BOOKING_UPDATE)} />

          <section className={styles.panel}>
            <h3 className={styles.blockTitle}>{t('detail.scheduleBlock')}</h3>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>{t('detail.pickupAt')}</dt>
                <dd>{fmt.rentalPoint(dayjs(data.pickupAt))}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('detail.returnAt')}</dt>
                <dd>{fmt.rentalPoint(dayjs(data.returnAt))}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('detail.duration')}</dt>
                <dd>
                  {/*
                    Đơn THUÊ DÀI HẠN dài đúng bằng GÓI (tháng lịch — ADR 0011). Nói "92 ngày" cho
                    gói 3 tháng là đúng số nhưng sai đơn vị nghiệp vụ: gói mới là thứ hai bên ký.
                  */}
                  {data.longTermPackageMonths
                    ? t('detail.packageValue', {
                        label: fmt.packageLabel(data.longTermPackageMonths) ?? '',
                      })
                    : fmt.rentalDuration(dayjs(data.pickupAt), dayjs(data.returnAt))}
                </dd>
              </div>
              {/*
                Mốc THỰC TẾ chỉ hiện khi đã có — chưa giao xe mà bày một dòng trống là mời người
                đọc tự điền lấy một giả định.
              */}
              {data.actualPickupAt ? (
                <div className={styles.row}>
                  <dt>{t('detail.actualPickup')}</dt>
                  <dd>{fmt.rentalPoint(dayjs(data.actualPickupAt))}</dd>
                </div>
              ) : null}
              {data.actualReturnAt ? (
                <div className={styles.row}>
                  <dt>{t('detail.actualReturn')}</dt>
                  <dd>{fmt.rentalPoint(dayjs(data.actualReturnAt))}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className={styles.panel}>
            <h3 className={styles.blockTitle}>{t('detail.moneyBlock')}</h3>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>{t('money.baseAmount')}</dt>
                <dd>{fmt.money(data.baseAmount)}</dd>
              </div>
              {!isZeroMoney(data.discountAmount) ? (
                <div className={styles.row}>
                  <dt>{t('money.discount')}</dt>
                  <dd className={styles.negative}>−{fmt.money(data.discountAmount)}</dd>
                </div>
              ) : null}
              <div className={styles.row}>
                <dt>{t('money.deliveryFee')}</dt>
                <dd className={styles.editableValue}>
                  {isZeroMoney(data.deliveryFee) ? t('money.free') : fmt.money(data.deliveryFee)}
                  {/*
                    Nút sửa đứng CẠNH con số nó sửa, không phải một nút riêng trên thanh hành
                    động của đơn. Phí giao nhận là số hai bên thoả thuận ngoài ứng dụng rồi ghi
                    lại (Wave 9) — người dùng nghĩ tới nó khi đang NHÌN nó, và việc ghi lại kèm
                    ghi chú nội bộ vào audit nên nó không nhập được vào form Sửa đơn chung.
                  */}
                  {canUpdate && !closed ? (
                    <button
                      type="button"
                      className={styles.editValueBtn}
                      onClick={() => setFeeOpen(true)}
                    >
                      {tCommon('actions.edit')}
                    </button>
                  ) : null}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('money.totalAmount')}</dt>
                <dd>{fmt.money(data.totalAmount)}</dd>
              </div>
              {/* Phụ phí cuối chuyến (quá giờ, vệ sinh, hư hại) LÀ tiền khách phải trả thêm —
                  từ nay nó vào thẳng "phải thu", không còn nằm riêng ở khối quyết toán cọc. */}
              {!isZeroMoney(data.surchargeTotal) ? (
                <div className={styles.row}>
                  <dt>{t('money.surchargeTotal')}</dt>
                  <dd>+{fmt.money(data.surchargeTotal)}</dd>
                </div>
              ) : null}
              <div className={styles.rowTotal}>
                <dt>{t('money.amountDue')}</dt>
                <dd>{fmt.money(data.amountDue)}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('money.collectedAmount')}</dt>
                <dd>{fmt.money(data.collectedAmount)}</dd>
              </div>
              {/* Khoản thu ghi thẳng ở sổ Thu-Chi (phiếu tay gắn đơn). Tách ra vì nếu chỉ cộng
                  vào "đã thu" thì con số nhảy lên mà không ai biết nó từ đâu. */}
              {!isZeroMoney(data.otherCollected) ? (
                <div className={styles.rowSub}>
                  <dt>{t('money.otherCollected')}</dt>
                  <dd>{fmt.money(data.otherCollected)}</dd>
                </div>
              ) : null}
              {hasDebt ? (
                <div className={styles.row}>
                  <dt>{t('money.debtAmount')}</dt>
                  <dd className={styles.negative}>{fmt.money(data.debtAmount)}</dd>
                </div>
              ) : null}
              {/* Thu nhiều hơn phải thu: gần như luôn là một khoản phát sinh đã thu tiền nhưng
                  chưa ghi nhận trên đơn. Nói thẳng thay vì để hai con số lệch nhau không lời. */}
              {overCollected ? (
                <div className={styles.row}>
                  <dt>{t('money.overCollected')}</dt>
                  <dd>{fmt.money(overCollected)}</dd>
                </div>
              ) : null}
              {hasDeposit ? (
                <div className={styles.row}>
                  {/*
                    Đây là cọc THEO ĐƠN (cấu hình), không phải tiền đã cầm. Việc đã thu được
                    chưa nằm ở thẻ `Phát sinh & Tiền cọc` — hai con số khác nhau, không gộp.
                  */}
                  <dt>{t('money.depositAmount')}</dt>
                  <dd>{fmt.money(data.depositAmount)}</dd>
                </div>
              ) : null}
            </dl>

            {/*
              Khoản GIỮ CHỖ qua XePrime khác cả "Đã thu" (tiền gian hàng đã cầm) lẫn "Đặt cọc
              tài sản" (cọc hoàn trả lúc giao xe). Đặt thành một khối riêng, luôn mở, để một đơn
              đã duyệt không còn trông như khách chưa trả đồng nào.
            */}
            {hasHoldPaymentPlan ? (
              <section className={styles.paymentPlan} aria-label={t('money.holdPaymentPlan.title')}>
                <h4 className={styles.paymentPlanTitle}>{t('money.holdPaymentPlan.title')}</h4>
                <dl className={styles.paymentPlanRows}>
                  {data.customerTotalAmount != null ? (
                    <div className={styles.paymentPlanRow}>
                      <dt>{t('money.holdPaymentPlan.customerTotal')}</dt>
                      <dd>{fmt.money(data.customerTotalAmount)}</dd>
                    </div>
                  ) : null}
                  <div className={styles.paymentPlanRow}>
                    <dt>{t('money.holdPaymentPlan.holdPaid')}</dt>
                    <dd>{fmt.money(data.holdPaidAmount)}</dd>
                  </div>
                  <div className={styles.paymentPlanRowStrong}>
                    <dt>{t('money.holdPaymentPlan.payAtPickup')}</dt>
                    <dd>{fmt.money(data.payAtPickupAmount)}</dd>
                  </div>
                </dl>
                <p className={styles.paymentPlanNote}>{t('money.holdPaymentPlan.note')}</p>
              </section>
            ) : null}

            {/*
              Phần của CHỦ XE (ADR 0064) — hoa hồng `H` và thuế `T` XePrime giữ lại từ tiền giữ chỗ,
              và số thực nhận cả chuyến. Số đã đóng băng lúc đặt (ADR 0024), server đọc từ snapshot;
              đơn lập tay/đơn cũ không có thì khối không hiện.
            */}
            {data.ownerNetAmount != null ? (
              <section className={styles.paymentPlan} aria-label={t('money.ownerEconomics.title')}>
                <h4 className={styles.paymentPlanTitle}>{t('money.ownerEconomics.title')}</h4>
                <dl className={styles.paymentPlanRows}>
                  {data.ownerCommissionAmount && !isZeroMoney(data.ownerCommissionAmount) ? (
                    <div className={styles.paymentPlanRow}>
                      <dt>{t('money.ownerEconomics.commission')}</dt>
                      <dd>
                        <DeductedAmount value={data.ownerCommissionAmount} />
                      </dd>
                    </div>
                  ) : null}
                  {data.ownerTaxAmount && !isZeroMoney(data.ownerTaxAmount) ? (
                    <div className={styles.paymentPlanRow}>
                      <dt>{t('money.ownerEconomics.tax')}</dt>
                      <dd>
                        <DeductedAmount value={data.ownerTaxAmount} />
                      </dd>
                    </div>
                  ) : null}
                  <div className={styles.paymentPlanRowStrong}>
                    <dt>{t('money.ownerEconomics.ownerNet')}</dt>
                    <dd>{fmt.money(data.ownerNetAmount)}</dd>
                  </div>
                </dl>
                <p className={styles.paymentPlanNote}>{t('money.ownerEconomics.note')}</p>
              </section>
            ) : null}
          </section>

          {data.note ? (
            <section className={styles.blockWide}>
              <h3 className={styles.blockTitle}>{t('detail.noteBlock')}</h3>
              <p className={styles.note}>{data.note}</p>
            </section>
          ) : null}
        </div>

        <BookingActionBar booking={data} />
      </Card>

      {feeOpen ? (
        <UpdateDeliveryFeeModal
          bookingId={data.id}
          currentFee={data.deliveryFee}
          open
          onClose={() => setFeeOpen(false)}
        />
      ) : null}

      {documentsOpen && data.tenantCustomerId ? (
        <BookingCustomerDocumentsDialog
          customerId={data.tenantCustomerId}
          customerName={data.customerName}
          open
          onClose={() => setDocumentsOpen(false)}
        />
      ) : null}

      <div className={styles.layout}>
        <BookingOperationPanel bookingId={data.id} bookingStatus={data.status} />
        <SettlementCard bookingId={data.id} canView={canView} />
      </div>
    </div>
  );
}
