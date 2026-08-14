'use client';

import { Alert } from 'antd';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  REFUND_METHOD_LABEL,
  SURCHARGE_CATEGORY_LABEL,
  hasDepositToShow,
  type DepositStatus,
  type RefundMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import type { CustomerTripFinance } from '../types';
import styles from './TripFinanceCard.module.css';

/**
 * Hoá đơn + tiền cọc, phía KHÁCH.
 *
 * Toàn bộ con số đã được server tính (`CustomerTripFinanceDto`); ở đây không có một phép cộng
 * trừ nào — đó là điều kiện để hoá đơn khách nhìn và sổ của chủ xe không bao giờ lệch.
 *
 * Khối cọc nói rõ khấu trừ phụ phí là **cách trả** cho phần phụ phí đã nằm trong tổng, không
 * phải một khoản bị trừ lần thứ hai. Không có nút nào ở đây: phụ phí do chủ xe ghi, hoàn cọc do
 * chủ xe thực hiện bên ngoài rồi đánh dấu — khách đọc, không duyệt.
 */
export function TripFinanceCard({
  finance,
  closed,
}: {
  finance: CustomerTripFinance;
  /** Chuyến đã khép: hiện hoá đơn cuối (có phụ phí) thay cho bảng giá dự kiến. */
  closed: boolean;
}) {
  const depositStatus = finance.depositStatus as DepositStatus;
  const hasSurcharge = finance.surcharges.length > 0;
  /*
   * Chỉ `NONE` (chưa từng có cọc) mới ẩn khối này. Mọi trạng thái còn lại đều dính tới một
   * khoản tiền có thật — đang chờ thu, đang giữ, đã khấu trừ, hay đã hoàn — và giấu nó đi vì
   * "chuyến chưa xong" là giấu tiền của khách.
   */
  const showDeposit = hasDepositToShow(depositStatus);

  return (
    <section className={styles.card} aria-label={closed ? 'Hóa đơn dịch vụ' : 'Chi tiết giá'}>
      <h2 className={styles.title}>{closed ? 'Hóa đơn dịch vụ' : 'Chi tiết giá'}</h2>

      {finance.legacyPricing ? (
        <Alert
          type="info"
          showIcon
          message="Chuyến cũ nên hệ thống chỉ còn lưu tổng tiền, không còn chi tiết từng khoản."
        />
      ) : null}

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Tiền thuê</dt>
          <dd>{formatMoneyVnd(finance.baseAmount)}</dd>
        </div>
        {!isZeroMoney(finance.discountAmount) ? (
          <div className={styles.row}>
            <dt>Khuyến mãi</dt>
            <dd className={styles.discount}>−{formatMoneyVnd(finance.discountAmount)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>Phí giao xe</dt>
          {/*
            Phí giao nhận mặc định miễn phí; chủ xe chốt lại sau khi thoả thuận (Wave 9). Khách
            thấy số MỚI NHẤT — không có bước chấp nhận, nên cũng không có nút nào ở đây.
          */}
          <dd className={isZeroMoney(finance.deliveryFee) ? styles.free : undefined}>
            {isZeroMoney(finance.deliveryFee) ? 'Miễn phí' : formatMoneyVnd(finance.deliveryFee)}
          </dd>
        </div>
      </dl>

      {hasSurcharge ? (
        <>
          <h3 className={styles.subTitle}>Phụ phí phát sinh</h3>
          <dl className={styles.rows}>
            {finance.surcharges.map((row, index) => (
              <div key={`${row.category}-${row.recordedAt}-${index}`} className={styles.row}>
                <dt className={styles.surchargeLabel}>
                  <span>
                    {SURCHARGE_CATEGORY_LABEL[row.category as SurchargeCategory] ?? row.category}
                  </span>
                  <span className={styles.surchargeReason}>{row.reason}</span>
                </dt>
                <dd>{formatMoneyVnd(row.amount)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <div className={styles.total}>
        <span>{closed ? 'Tổng thanh toán' : 'Tổng cộng'}</span>
        <span className={styles.totalValue}>{formatMoneyVnd(finance.finalTotal)}</span>
      </div>

      {!isZeroMoney(finance.rentalPaid) ? (
        <div className={styles.row}>
          <dt className={styles.paidLabel}>Đã thanh toán</dt>
          <dd>{formatMoneyVnd(finance.rentalPaid)}</dd>
        </div>
      ) : null}

      {showDeposit ? <DepositBlock finance={finance} status={depositStatus} /> : null}

      {!isZeroMoney(finance.additionalDue) ? (
        <Alert
          type="warning"
          showIcon
          message={`Cần thanh toán thêm ${formatMoneyVnd(finance.additionalDue)}`}
          description="Phụ phí vượt quá tiền cọc đã giữ. Vui lòng thanh toán phần chênh lệch trực tiếp với chủ xe."
        />
      ) : null}
    </section>
  );
}

/**
 * Khối cọc — mỗi trạng thái một câu chuyện khác nhau, và cái sai đắt nhất là gộp
 * `Chưa nhận cọc` với `Không yêu cầu cọc`: câu đầu nghĩa là còn một khoản tiền đang treo.
 */
function DepositBlock({
  finance,
  status,
}: {
  finance: CustomerTripFinance;
  status: DepositStatus;
}) {
  const refunded = finance.refundAmount !== null;

  return (
    <section className={styles.deposit} aria-label="Tiền đặt cọc">
      <header className={styles.depositHead}>
        <h3 className={styles.subTitle}>Đặt cọc thế chấp</h3>
        <StatusTag value={status} meta={DEPOSIT_STATUS_META} />
      </header>

      {status === DEPOSIT_STATUS.NOT_RECEIVED ? (
        <p className={styles.depositNote}>
          Chủ xe chưa ghi nhận đã thu khoản cọc {formatMoneyVnd(finance.depositRequired)} của chuyến
          này. Nếu bạn đã chuyển tiền, vui lòng liên hệ chủ xe để đối chiếu.
        </p>
      ) : (
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>Tiền cọc đã nhận giữ</dt>
            <dd>{formatMoneyVnd(finance.depositReceived)}</dd>
          </div>
          {!isZeroMoney(finance.depositDeducted) ? (
            <div className={styles.row}>
              <dt>Khấu trừ phụ phí</dt>
              <dd className={styles.discount}>−{formatMoneyVnd(finance.depositDeducted)}</dd>
            </div>
          ) : null}
          {/*
            Chuyến chưa xong thì chưa có "dự kiến hoàn": cọc đang làm đúng việc của nó, và một
            con số hoàn lại lúc này chỉ là phỏng đoán trước khi biết có phát sinh gì không.
          */}
          {status === DEPOSIT_STATUS.RECEIVED ? null : (
            <div className={styles.depositTotal}>
              <span>{refunded ? 'Số tiền thực hoàn' : 'Dự kiến hoàn lại'}</span>
              <span className={styles.totalValue}>
                {formatMoneyVnd(refunded ? finance.refundAmount! : finance.expectedRefund)}
              </span>
            </div>
          )}
        </dl>
      )}

      {!isZeroMoney(finance.depositDeducted) ? (
        <p className={styles.depositNote}>
          Phần khấu trừ nằm trong tổng thanh toán ở trên — đây là cách bạn đã trả cho khoản phụ phí
          đó, không phải một khoản bị trừ thêm.
        </p>
      ) : null}

      {refunded ? (
        <p className={styles.depositNote}>
          Đã hoàn bằng{' '}
          {REFUND_METHOD_LABEL[finance.refundMethod as RefundMethod] ?? 'phương thức khác'}
          {finance.refundedAt ? ` ngày ${formatDateTime(finance.refundedAt)}` : ''}
          {finance.refundReference ? `. Mã tham chiếu: ${finance.refundReference}` : ''}. Vui lòng
          đối chiếu với tài khoản của bạn.
        </p>
      ) : status === DEPOSIT_STATUS.AWAITING_REFUND ? (
        <p className={styles.depositNote}>
          Chủ xe sẽ chuyển lại khoản này và đánh dấu hoàn cọc trên hệ thống. XePrime ghi nhận trạng
          thái, không thực hiện chuyển tiền.
        </p>
      ) : status === DEPOSIT_STATUS.RECEIVED ? (
        <p className={styles.depositNote}>
          Chủ xe đang giữ khoản cọc này trong suốt chuyến. Số tiền hoàn lại sẽ được chốt sau khi bạn
          trả xe.
        </p>
      ) : status === DEPOSIT_STATUS.SETTLED ? (
        <p className={styles.depositNote}>
          Khoản cọc đã dùng hết cho phụ phí phát sinh ở trên nên không còn tiền hoàn lại.
        </p>
      ) : null}
    </section>
  );
}
