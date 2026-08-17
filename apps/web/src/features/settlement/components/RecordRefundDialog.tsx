'use client';

import { App, Alert, DatePicker, Input, Radio } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import {
  REFUND_DISCLAIMER,
  REFUND_METHOD,
  REFUND_METHOD_LABEL,
  REFUND_METHOD_VALUES,
  type RefundMethod,
} from '@xeprime/types';
import { MoneyInput } from '@/components/form/MoneyInput';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useCorrectRefund, useRecordRefund } from '../hooks';
import type { BookingSettlement } from '../types';
import styles from './RecordRefundDialog.module.css';

/**
 * `Đánh dấu đã hoàn cọc` (Wave 10 §5.2).
 *
 * Chủ xe đã chuyển khoản/trả tiền mặt NGOÀI hệ thống rồi mới vào đây; hộp này chỉ GHI NHẬN việc
 * đó. Không OTP, không nhập tài khoản ngân hàng của khách, không cổng thanh toán, và câu
 * `REFUND_DISCLAIMER` luôn hiện để không ai hiểu nhầm là XePrime vừa chuyển tiền.
 *
 * `mode="correct"` là đường sửa lại bản ghi đã có — quyền cao hơn, bắt buộc lý do, audit giữ cả
 * giá trị cũ. Nó nằm sau nút phụ, không phải một bước của mọi chuyến.
 */
export function RecordRefundDialog({
  bookingId,
  settlement,
  mode,
  open,
  onClose,
}: {
  bookingId: string;
  settlement: BookingSettlement;
  mode: 'record' | 'correct';
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const record = useRecordRefund(bookingId);
  const correct = useCorrectRefund(bookingId);
  const isCorrection = mode === 'correct';
  const pending = record.isPending || correct.isPending;
  const existingRefund = settlement.refund;

  /*
   * Khởi tạo TỪ PROPS, không reset bằng effect: hộp này chỉ được dựng khi mở, nên mỗi lần mở
   * đã là instance mới. Ghi nhận mới lấy số ĐỀ XUẤT của server làm mặc định; điều chỉnh thì
   * lấy chính số đã ghi để người sửa thấy đúng thứ mình đang sửa.
   */
  const [amount, setAmount] = useState<number | null>(() =>
    isCorrection && existingRefund
      ? Number(existingRefund.refundAmount)
      : Number(settlement.proposedRefund),
  );
  const [method, setMethod] = useState<RefundMethod>(
    ((isCorrection && existingRefund?.refundMethod) || REFUND_METHOD.BANK_TRANSFER) as RefundMethod,
  );
  const [refundedAt, setRefundedAt] = useState<Dayjs>(() =>
    isCorrection && existingRefund ? dayjs(existingRefund.refundedAt) : dayjs(),
  );
  const [reference, setReference] = useState(isCorrection ? (existingRefund?.reference ?? '') : '');
  const [note, setNote] = useState(isCorrection ? (existingRefund?.note ?? '') : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (amount == null) {
      setError('Nhập số tiền đã hoàn.');
      return;
    }
    if (isCorrection && !reason.trim()) {
      setError('Điều chỉnh một bản ghi đã chốt cần lý do.');
      return;
    }

    const body = {
      refundAmount: String(amount),
      refundMethod: method,
      refundedAt: refundedAt.toISOString(),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    const onDone = {
      onSuccess: () => {
        message.success(isCorrection ? 'Đã cập nhật thông tin hoàn cọc' : 'Đã ghi nhận hoàn cọc');
        onClose();
      },
      onError: (err: unknown) => setError(getErrorMessage(err)),
    };

    if (isCorrection) {
      correct.mutate(
        {
          ...body,
          correctionReason: reason.trim(),
          expectedRowVersion: existingRefund?.rowVersion ?? 1,
        },
        onDone,
      );
    } else {
      record.mutate(body, onDone);
    }
  }

  return (
    <ResponsiveDialog
      title={isCorrection ? 'Điều chỉnh thông tin hoàn cọc' : 'Đánh dấu đã hoàn cọc'}
      open={open}
      onClose={onClose}
      size="sm"
      okText={isCorrection ? 'Lưu điều chỉnh' : 'Xác nhận đã hoàn'}
      onOk={submit}
      confirmLoading={pending}
    >
      <div className={styles.body}>
        <div className={styles.summary}>
          <span>Cọc đã nhận</span>
          <b>{formatMoneyVnd(settlement.depositReceived)}</b>
        </div>
        {Number(settlement.surchargeTotal) > 0 ? (
          <div className={styles.summary}>
            <span>Trừ phát sinh</span>
            <b className={styles.negative}>−{formatMoneyVnd(settlement.surchargeTotal)}</b>
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Số tiền hoàn (đ)</span>
          <MoneyInput
            value={amount}
            onChange={(value) => setAmount(value ?? null)}
            min={0}
            className={styles.control}
          />
          <span className={styles.hint}>
            Đề xuất: {formatMoneyVnd(settlement.proposedRefund)}. Sửa được nếu thực tế khác.
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Phương thức hoàn</span>
          <Radio.Group value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
            {REFUND_METHOD_VALUES.map((value) => (
              <Radio key={value} value={value}>
                {REFUND_METHOD_LABEL[value]}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Thời điểm hoàn</span>
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="DD/MM/YYYY HH:mm"
            value={refundedAt}
            onChange={(next) => next && setRefundedAt(next)}
            allowClear={false}
            className={styles.control}
            disabledDate={(current) => current.isAfter(dayjs().endOf('day'))}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Mã giao dịch / tham chiếu (không bắt buộc)</span>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="TK-20260813-001"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Ghi chú (không bắt buộc)</span>
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {isCorrection ? (
          <label className={styles.field}>
            <span className={styles.label}>Lý do điều chỉnh</span>
            <Input.TextArea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: ghi nhầm số, đã đối chiếu lại sao kê"
            />
            <span className={styles.hint}>Lý do và giá trị cũ đều được lưu vào nhật ký.</span>
          </label>
        ) : null}

        {error ? <Alert type="error" showIcon message={error} role="alert" /> : null}

        <Alert type="info" showIcon message={REFUND_DISCLAIMER} />
      </div>
    </ResponsiveDialog>
  );
}
