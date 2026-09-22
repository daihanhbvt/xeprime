'use client';

import { App, Alert, DatePicker, Input, Radio } from 'antd';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { useState } from 'react';
import {
  REFUND_METHOD,
  REFUND_METHOD_LABEL,
  REFUND_METHOD_VALUES,
  type RefundMethod,
} from '@xeprime/types';
import { MoneyInput } from '@/components/form/MoneyInput';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useCorrectRefund, useRecordRefund } from '../hooks';
import type { BookingSettlement } from '../types';
import styles from './RecordRefundDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useTranslations } from 'next-intl';

/**
 * `Đánh dấu đã hoàn cọc` (Wave 10 §5.2).
 *
 * Chủ xe đã chuyển khoản/trả tiền mặt NGOÀI hệ thống rồi mới vào đây; hộp này chỉ GHI NHẬN việc
 * đó. Không OTP, không nhập tài khoản ngân hàng của khách, không cổng thanh toán, và câu
 * câu miễn trừ luôn hiện để không ai hiểu nhầm là XePrime vừa chuyển tiền.
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
  const t = useTranslations('Bookings.settlement.refund');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

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
    isCorrection && existingRefund ? toAppTz(existingRefund.refundedAt) : nowInAppTz(),
  );
  const [reference, setReference] = useState(isCorrection ? (existingRefund?.reference ?? '') : '');
  const [note, setNote] = useState(isCorrection ? (existingRefund?.note ?? '') : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (amount == null) {
      setError(t('amountRequired'));
      return;
    }
    if (isCorrection && !reason.trim()) {
      setError(t('reasonRequired'));
      return;
    }

    const body = {
      refundAmount: String(amount),
      refundMethod: method,
      refundedAt: appWallClockToIso(refundedAt),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    const onDone = {
      onSuccess: () => {
        message.success(t(isCorrection ? 'correctSuccess' : 'recordSuccess'));
        onClose();
      },
      onError: (err: unknown) => setError(errorMessage(err)),
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
      title={t(isCorrection ? 'correct' : 'record')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t(isCorrection ? 'saveCorrection' : 'confirm')}
      onOk={submit}
      confirmLoading={pending}
    >
      <div className={styles.body}>
        <div className={styles.summary}>
          <span>{t('depositReceived')}</span>
          <b>{fmt.money(settlement.depositReceived)}</b>
        </div>
        {Number(settlement.surchargeTotal) > 0 ? (
          <div className={styles.summary}>
            <span>{t('minusSurcharge')}</span>
            <b className={styles.negative}>−{fmt.money(settlement.surchargeTotal)}</b>
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>{t('amountLabel')}</span>
          <MoneyInput
            value={amount}
            onChange={(value) => setAmount(value ?? null)}
            min={0}
            className={styles.control}
          />
          <span className={styles.hint}>
            {t('amountHint', { amount: fmt.money(settlement.proposedRefund) })}
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>{t('methodLabel')}</span>
          <Radio.Group value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
            {REFUND_METHOD_VALUES.map((value) => (
              <Radio key={value} value={value}>
                {domainLabel('refundMethod', value, REFUND_METHOD_LABEL[value])}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('refundedAtLabel')}</span>
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="DD/MM/YYYY HH:mm"
            value={refundedAt}
            onChange={(next) => next && setRefundedAt(next)}
            allowClear={false}
            className={styles.control}
            disabledDate={(current) => current.isAfter(nowInAppTz().endOf('day'))}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('referenceLabel')}</span>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('referencePlaceholder')}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('noteLabel')}</span>
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {isCorrection ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('correctionReasonLabel')}</span>
            <Input.TextArea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('correctionReasonPlaceholder')}
            />
            <span className={styles.hint}>{t('correctionReasonHint')}</span>
          </label>
        ) : null}

        {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}

        <Alert type="info" showIcon title={t('disclaimer')} />
      </div>
    </ResponsiveDialog>
  );
}
