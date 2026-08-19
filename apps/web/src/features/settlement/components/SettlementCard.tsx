'use client';

import { Alert, Button, Card, Skeleton, Space } from 'antd';
import { useState } from 'react';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  PAYMENT_KIND,
  PERMISSION,
  REFUND_DISCLAIMER,
  REFUND_METHOD_LABEL,
  SURCHARGE_CATEGORY_LABEL,
  type DepositStatus,
  type RefundMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import { useSettlement } from '../hooks';
import { RecordRefundDialog } from './RecordRefundDialog';
import { SurchargeDialog } from './SurchargeDialog';
import styles from './SettlementCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Thẻ "Phát sinh & Tiền cọc" trên chi tiết đơn (Wave 10).
 *
 * Ranh giới quan trọng nhất ở đây: **cọc CẤU HÌNH không phải cọc ĐÃ THU**. Chưa có bằng chứng
 * thu tiền thì thẻ nói thẳng `Chưa ghi nhận đã thu cọc` và KHÔNG mời hoàn tiền — tạo một việc
 * "hoàn 5 triệu" cho khoản chưa ai thu là cách nhanh nhất để chủ xe mất tiền thật.
 *
 * Hoàn cọc là việc THEO DÕI, không chặn hoàn tất chuyến: đơn đã `Hoàn tất` từ lúc nhận xe.
 */
export function SettlementCard({ bookingId, canView }: { bookingId: string; canView: boolean }) {
  const fmt = useAppFormat();

  const { has } = usePermissions();
  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  const canCorrect = has(PERMISSION.PAYMENT_VOID);
  const { data, isLoading, isError, error, refetch } = useSettlement(bookingId, canView);

  const [surchargeOpen, setSurchargeOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  if (!canView) return null;

  if (isLoading) {
    return (
      <Card title="Phát sinh & Tiền cọc" className={styles.card}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card title="Phát sinh & Tiền cọc" className={styles.card}>
        <Alert
          type="error"
          showIcon
          message="Không tải được thông tin quyết toán"
          description={getErrorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      </Card>
    );
  }

  const status = data.depositStatus as DepositStatus;
  const hasSurcharges = data.surcharges.length > 0;
  const needsMore = Number(data.additionalDue) > 0;
  // Cọc còn THIẾU so với cấu hình trên đơn. Dùng phép trừ trên chuỗi tiền, không `Number`
  // (ADR 0007) — đây là số sẽ điền sẵn vào ô nhập tiền.
  const depositOutstanding = subtractMoney(data.depositRequired, data.depositReceived);
  // Chỉ mời thu cọc khi còn thiếu VÀ chưa bước sang giai đoạn hoàn: sau khi đã hoàn thì "thu
  // thêm" là một nghiệp vụ khác hẳn, không phải thu nốt cọc.
  const canTakeDeposit =
    !isNegativeMoney(depositOutstanding) &&
    !isZeroMoney(depositOutstanding) &&
    (status === DEPOSIT_STATUS.NOT_RECEIVED || status === DEPOSIT_STATUS.RECEIVED);

  // Dòng "hoàn lại" chỉ có nghĩa khi còn tiền để trả hoặc đã trả rồi.
  const showRefundLine =
    status === DEPOSIT_STATUS.AWAITING_REFUND ||
    status === DEPOSIT_STATUS.REFUNDED ||
    status === DEPOSIT_STATUS.PARTIALLY_REFUNDED;

  return (
    <Card
      title="Phát sinh & Tiền cọc"
      className={styles.card}
      extra={<StatusTag value={status} meta={DEPOSIT_STATUS_META} group="depositStatus" />}
    >
      <div className={styles.body}>
        {/* ── Phát sinh ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Chi phí phát sinh</span>
            {canRecord ? (
              <Button size="small" onClick={() => setSurchargeOpen(true)}>
                Ghi nhận phát sinh
              </Button>
            ) : null}
          </div>

          {hasSurcharges ? (
            <ul className={styles.list}>
              {data.surcharges.map((row) => (
                <li key={row.id} className={styles.item}>
                  <span className={styles.itemMain}>
                    <span className={styles.itemCategory}>
                      {SURCHARGE_CATEGORY_LABEL[row.category as SurchargeCategory] ?? row.category}
                    </span>
                    <span className={styles.itemReason}>{row.reason}</span>
                  </span>
                  <b className={styles.money}>{fmt.money(row.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Không có phát sinh.</p>
          )}
        </section>

        {/* ── Cọc ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>Cọc theo đơn</dt>
              <dd className={styles.money}>{fmt.money(data.depositRequired)}</dd>
            </div>
            <div className={styles.row}>
              <dt>Cọc đã nhận</dt>
              <dd className={styles.money}>
                {status === DEPOSIT_STATUS.NOT_RECEIVED ? (
                  // Nói THẲNG là chưa có bằng chứng thu tiền, không hiện một số 0 mập mờ.
                  <span className={styles.muted}>Chưa ghi nhận đã thu cọc</span>
                ) : (
                  fmt.money(data.depositReceived)
                )}
                {/*
                  Đường GHI NHẬN thu cọc — trước đây không tồn tại ở bất kỳ đâu trong sản phẩm,
                  nên `depositReceived` vĩnh viễn bằng 0 và cả khối này chạy không tải. Chỉ mở
                  khi còn thiếu so với cọc theo đơn và chưa bước sang giai đoạn hoàn.
                */}
                {canRecord && canTakeDeposit ? (
                  <Button type="link" size="small" onClick={() => setDepositOpen(true)}>
                    Thu cọc
                  </Button>
                ) : null}
              </dd>
            </div>
            {hasSurcharges ? (
              <div className={styles.row}>
                <dt>Tổng phát sinh</dt>
                <dd className={styles.moneyNegative}>−{fmt.money(data.surchargeTotal)}</dd>
              </div>
            ) : null}
            {/*
              Chỉ nói chuyện hoàn tiền khi thật sự có tiền trong tay. `RECEIVED` (đang thuê, cọc
              còn giữ) chưa tới lúc đó; `SETTLED` thì phát sinh đã ăn hết — mời "hoàn 0đ" là một
              việc không có thật.
            */}
            {showRefundLine ? (
              <div className={styles.rowTotal}>
                <dt>{data.refund ? 'Đã hoàn' : 'Đề xuất hoàn lại'}</dt>
                <dd className={styles.moneyStrong}>
                  {fmt.money(data.refund ? data.refund.refundAmount : data.proposedRefund)}
                </dd>
              </div>
            ) : null}
          </dl>

          {needsMore ? (
            <Alert
              type="warning"
              showIcon
              message={`Cần thu thêm ${fmt.money(data.additionalDue)}`}
              description="Phát sinh vượt quá tiền cọc đã nhận. Phần chênh lệch thu trực tiếp với khách."
            />
          ) : null}

          {status === DEPOSIT_STATUS.NOT_RECEIVED ? (
            <Alert
              type="info"
              showIcon
              message="Chưa có ghi nhận thu cọc cho đơn này nên không có việc hoàn cọc. Ghi nhận khoản thu cọc ở mục Thanh toán nếu đã nhận tiền."
            />
          ) : null}

          {status === DEPOSIT_STATUS.RECEIVED ? (
            <Alert
              type="info"
              showIcon
              message="Đang giữ tiền cọc của khách. Việc hoàn cọc mở ra sau khi nhận lại xe và chốt phát sinh."
            />
          ) : null}

          {status === DEPOSIT_STATUS.SETTLED ? (
            <Alert
              type="info"
              showIcon
              message="Phát sinh đã bù trọn phần cọc đã thu — không còn khoản nào phải hoàn lại cho khách."
            />
          ) : null}

          {data.refund ? (
            <div className={styles.refundBox}>
              <div className={styles.refundRow}>
                <span>Phương thức</span>
                <b>{REFUND_METHOD_LABEL[data.refund.refundMethod as RefundMethod]}</b>
              </div>
              <div className={styles.refundRow}>
                <span>Thời gian hoàn</span>
                <b>{fmt.dateTime(data.refund.refundedAt)}</b>
              </div>
              {data.refund.reference ? (
                <div className={styles.refundRow}>
                  <span>Mã giao dịch</span>
                  <b>{data.refund.reference}</b>
                </div>
              ) : null}
              {data.refund.recordedByName ? (
                <div className={styles.refundRow}>
                  <span>Người ghi nhận</span>
                  <b>{data.refund.recordedByName}</b>
                </div>
              ) : null}
            </div>
          ) : null}

          {status === DEPOSIT_STATUS.AWAITING_REFUND && canRecord ? (
            <Space direction="vertical" className={styles.actionBlock}>
              <Button type="primary" block onClick={() => setRefundOpen(true)}>
                Đánh dấu đã hoàn cọc
              </Button>
              <span className={styles.disclaimer}>{REFUND_DISCLAIMER}</span>
            </Space>
          ) : null}

          {data.refund && canCorrect ? (
            <Button
              size="small"
              onClick={() => {
                setCorrecting(true);
                setRefundOpen(true);
              }}
            >
              Điều chỉnh thông tin hoàn cọc
            </Button>
          ) : null}
        </section>
      </div>

      {/*
        Dựng CÓ ĐIỀU KIỆN: hai hộp này khởi tạo state từ số liệu quyết toán hiện tại (số đề xuất
        hoàn, khoản đã ghi). Giữ chúng luôn mounted thì lần mở thứ hai vẫn mang state của lần
        trước, và cách chữa duy nhất là reset trong effect — thứ tạo thêm một vòng render.
      */}
      {surchargeOpen ? (
        <SurchargeDialog
          bookingId={bookingId}
          settlement={data}
          open
          onClose={() => setSurchargeOpen(false)}
        />
      ) : null}
      {refundOpen ? (
        <RecordRefundDialog
          bookingId={bookingId}
          settlement={data}
          mode={correcting ? 'correct' : 'record'}
          open
          onClose={() => {
            setRefundOpen(false);
            setCorrecting(false);
          }}
        />
      ) : null}

      {/*
        Dùng LẠI đúng modal thu tiền của đơn, chỉ đổi `kind` — hai loại tiền cùng đi qua một
        đường ghi (`PaymentsService`), nên dựng một hộp thoại thứ hai là mở đường cho hai luồng
        ghi tiền lệch nhau.
      */}
      {depositOpen ? (
        <RecordPaymentModal
          bookingId={bookingId}
          debtAmount={depositOutstanding}
          kind={PAYMENT_KIND.DEPOSIT}
          open
          onClose={() => setDepositOpen(false)}
        />
      ) : null}
    </Card>
  );
}
