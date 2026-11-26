'use client';

import { Alert, Button, Skeleton, Space } from 'antd';
import { SectionCard } from '@/components/layout/SectionCard';
import { useState } from 'react';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  PERMISSION,
  REFUND_METHOD_LABEL,
  SURCHARGE_CATEGORY_LABEL,
  type DepositStatus,
  type RefundMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { cx } from '@/lib/cx';
import { useSettlement } from '../hooks';
import { ExcessMileageFacts } from './ExcessMileageFacts';
import { RecordRefundDialog } from './RecordRefundDialog';
import { SurchargeDialog } from './SurchargeDialog';
import styles from './SettlementCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

/**
 * Thẻ "Phát sinh" trên chi tiết đơn (Wave 10).
 *
 * Gom cọc về MỘT nhà (26/11/2026): trước lúc quyết toán, cọc theo đơn / cọc đã nhận / nút thu cọc
 * sống ở thẻ "Cọc & thế chấp" cột phải (`CollateralSideCard`). Thẻ này chỉ đưa cọc trở lại khi
 * tới lúc QUYẾT TOÁN (chờ hoàn, đã hoàn, đã quyết toán) - lúc đó "cọc đã nhận − phát sinh = hoàn lại"
 * là chính phép tính của thẻ.
 *
 * Ranh giới quan trọng nhất ở đây: **cọc CẤU HÌNH không phải cọc ĐÃ THU**. Chưa có bằng chứng
 * thu tiền thì thẻ nói thẳng `Chưa ghi nhận đã thu cọc` và KHÔNG mời hoàn tiền — tạo một việc
 * "hoàn 5 triệu" cho khoản chưa ai thu là cách nhanh nhất để chủ xe mất tiền thật.
 *
 * Hoàn cọc là việc THEO DÕI, không chặn hoàn tất chuyến: đơn đã `Hoàn tất` từ lúc nhận xe.
 *
 * Phiên hỗ trợ gian hàng không mở quyết toán — cọc, phụ phí, hoàn tiền là tiền của gian hàng và
 * khách (ADR 0050 §10): thẻ không dựng và không gọi endpoint.
 */
export function SettlementCard({
  bookingId,
  canView,
  serviceType = null,
  moneyClosed = false,
  className,
}: {
  bookingId: string;
  canView: boolean;
  /**
   * Đơn huỷ / khách không đến (`isBookingClosedWithoutTrip`): xe chưa lăn bánh nên không ghi phát
   * sinh hay thu cọc mới — hai link vắng hẳn, server cũng từ chối (`BOOKING_MONEY_CLOSED`). Hoàn
   * cọc đã thu vẫn mở.
   */
  moneyClosed?: boolean;
  /** Lớp của nơi đặt thẻ (vd. kéo cao bằng thẻ bên cạnh trong một hàng hai thẻ). */
  className?: string;
  /** Loại dịch vụ của đơn — hộp phụ phí bỏ danh mục không ghi được cho loại này (ADR 0075). */
  serviceType?: string | null;
}) {
  const tSettlement = useTranslations('Bookings.settlement');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const { has } = usePermissions();
  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  // Ghi tiền MỚI (phát sinh) — hoàn cọc dùng `canRecord` trần, vẫn mở trên đơn huỷ.
  const canRecordNew = canRecord && !moneyClosed;
  const canCorrect = has(PERMISSION.PAYMENT_VOID);
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.SETTLEMENT);
  const visible = canView && !inSupport;
  const { data, isLoading, isError, error, refetch } = useSettlement(bookingId, visible);

  const [surchargeOpen, setSurchargeOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  if (!visible) return null;

  if (isLoading) {
    return (
      <SectionCard title={tSettlement('cardTitle')} className={cx(styles.card, className)}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </SectionCard>
    );
  }

  if (isError || !data) {
    return (
      <SectionCard title={tSettlement('cardTitle')} className={cx(styles.card, className)}>
        <Alert
          type="error"
          showIcon
          title={tSettlement('errorTitle')}
          description={getErrorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {tActions('retry')}
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const status = data.depositStatus as DepositStatus;
  const hasSurcharges = data.surcharges.length > 0;
  const needsMore = Number(data.additionalDue) > 0;

  // Dòng "hoàn lại" chỉ có nghĩa khi còn tiền để trả hoặc đã trả rồi.
  const showRefundLine =
    status === DEPOSIT_STATUS.AWAITING_REFUND ||
    status === DEPOSIT_STATUS.REFUNDED ||
    status === DEPOSIT_STATUS.PARTIALLY_REFUNDED;
  // Chặng QUYẾT TOÁN: cọc quay lại thẻ này làm cơ sở của phép hoàn. Trước đó nó ở thẻ cọc.
  const settling = showRefundLine || status === DEPOSIT_STATUS.SETTLED;

  return (
    <SectionCard
      title={tSettlement('cardTitle')}
      className={cx(styles.card, className)}
      // Chặng cọc chỉ nêu ở lúc quyết toán - trước đó thẻ "Cọc & thế chấp" đã nói.
      extra={
        settling ? (
          <StatusTag value={status} meta={DEPOSIT_STATUS_META} group="depositStatus" />
        ) : undefined
      }
    >
      {/*
        Bảng gọn của design 03/11/2026 (Figma 23845:49956): mỗi dòng một con số, hành động là
        LINK ngay cạnh số đó. Phần chi tiết (danh sách phát sinh, vượt km, hoàn cọc) chỉ hiện khi
        có dữ liệu thật.
      */}
      <div className={styles.body}>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>{tSettlement('surchargeHeading')}</dt>
            <dd className={styles.rowValue}>
              {hasSurcharges ? (
                <b className={styles.money}>{fmt.money(data.surchargeTotal)}</b>
              ) : (
                <span>{tSettlement('surchargeNone')}</span>
              )}
              {canRecordNew ? (
                <button
                  type="button"
                  className={styles.inlineLink}
                  onClick={() => setSurchargeOpen(true)}
                >
                  {tSettlement('surchargeRecord')}
                </button>
              ) : null}
            </dd>
          </div>
        </dl>

        {hasSurcharges ? (
          <ul className={styles.list}>
            {data.surcharges.map((row) => (
              <li key={row.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemCategory}>
                    {domainLabel(
                      'surchargeCategory',
                      row.category,
                      SURCHARGE_CATEGORY_LABEL[row.category as SurchargeCategory] ?? row.category,
                    )}
                  </span>
                  {row.reason ? <span className={styles.itemReason}>{row.reason}</span> : null}
                </span>
                <b className={styles.money}>{fmt.money(row.amount)}</b>
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          Vượt hạn mức km — chỉ khi chuyến CÓ hạn mức. Thông tin ĐỌC: mọi con số do server tính từ
          hạn mức đã đóng băng trên đơn; phụ phí chỉ tồn tại sau khi chủ xe tự ghi.
        */}
        {data.excessMileage.includedKmPerDay != null ? (
          <section className={styles.section}>
            <span className={styles.sectionTitle}>{tSettlement('excessMileage.title')}</span>
            <ExcessMileageFacts suggestion={data.excessMileage} />
          </section>
        ) : null}

        {settling ? (
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>{tSettlement('depositReceivedShort')}</dt>
              <dd className={styles.money}>{fmt.money(data.depositReceived)}</dd>
            </div>
            {hasSurcharges ? (
              <div className={styles.row}>
                <dt>{tSettlement('surchargeTotalShort')}</dt>
                <dd className={styles.moneyNegative}>−{fmt.money(data.surchargeTotal)}</dd>
              </div>
            ) : null}
            {/*
              `SETTLED` thì phát sinh đã ăn hết — mời "hoàn 0đ" là một việc không có thật, nên dòng
              hoàn chỉ có ở chờ hoàn / đã hoàn.
            */}
            {showRefundLine ? (
              <div className={styles.rowTotal}>
                <dt>
                  {data.refund ? tSettlement('refunded') : tSettlement('proposedRefundShort')}
                </dt>
                <dd className={styles.moneyStrong}>
                  {fmt.money(data.refund ? data.refund.refundAmount : data.proposedRefund)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {needsMore ? (
          <Alert
            type="warning"
            showIcon
            title={tSettlement('needsMoreTitle', { amount: fmt.money(data.additionalDue) })}
            description={tSettlement('needsMoreBody')}
          />
        ) : null}

        {status === DEPOSIT_STATUS.SETTLED ? (
          <Alert type="info" showIcon title={tSettlement('noticeSettled')} />
        ) : null}

        {data.refund ? (
          <div className={styles.refundBox}>
            <div className={styles.refundRow}>
              <span>{tSettlement('refundMethod')}</span>
              <b>
                {domainLabel(
                  'refundMethod',
                  data.refund.refundMethod,
                  REFUND_METHOD_LABEL[data.refund.refundMethod as RefundMethod],
                )}
              </b>
            </div>
            <div className={styles.refundRow}>
              <span>{tSettlement('refundedAt')}</span>
              <b>{fmt.dateTime(data.refund.refundedAt)}</b>
            </div>
            {data.refund.reference ? (
              <div className={styles.refundRow}>
                <span>{tSettlement('refundReference')}</span>
                <b>{data.refund.reference}</b>
              </div>
            ) : null}
            {data.refund.recordedByName ? (
              <div className={styles.refundRow}>
                <span>{tSettlement('refundRecordedBy')}</span>
                <b>{data.refund.recordedByName}</b>
              </div>
            ) : null}
          </div>
        ) : null}

        {status === DEPOSIT_STATUS.AWAITING_REFUND && canRecord ? (
          <Space direction="vertical" className={styles.actionBlock}>
            <Button type="primary" block onClick={() => setRefundOpen(true)}>
              {tSettlement('markRefunded')}
            </Button>
            <span className={styles.disclaimer}>{tSettlement('refund.disclaimer')}</span>
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
            {tSettlement('correctRefund')}
          </Button>
        ) : null}
      </div>

      {/*
        Dựng CÓ ĐIỀU KIỆN: hai hộp này khởi tạo state từ số liệu quyết toán hiện tại (số đề xuất
        hoàn, khoản đã ghi). Giữ chúng luôn mounted thì lần mở thứ hai vẫn mang state của lần
        trước, và cách chữa duy nhất là reset trong effect — thứ tạo thêm một vòng render.
      */}
      {surchargeOpen ? (
        <SurchargeDialog
          bookingId={bookingId}
          serviceType={serviceType}
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

    </SectionCard>
  );
}
