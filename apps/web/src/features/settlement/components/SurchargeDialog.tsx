'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import {
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_LABEL,
  SURCHARGE_CATEGORY_VALUES,
  type SurchargeCategory,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useAddSurcharge, useVoidSurcharge } from '../hooks';
import type { BookingSettlement } from '../types';
import styles from './SurchargeDialog.module.css';

const CATEGORY_OPTIONS = SURCHARGE_CATEGORY_VALUES.map((value) => ({
  value,
  label: SURCHARGE_CATEGORY_LABEL[value],
}));

/**
 * `Ghi nhận phát sinh` (Wave 10 §4.2) — tác vụ NÂNG CAO, không phải một bước của luồng trả xe.
 *
 * Bốn danh mục: quá giờ · vệ sinh · hư hại/bồi thường · khác. **Không có nhiên liệu** — Wave 10
 * bỏ hẳn mức xăng khỏi bàn giao nên cũng không có phụ phí thiếu xăng để ghi.
 *
 * Ghi ở đây KHÔNG tạo giao dịch ngân hàng và KHÔNG cần khách xác nhận; nó chỉ thay đổi con số
 * đề xuất hoàn cọc — và con số đó do SERVER tính, hộp này chỉ hiển thị lại.
 */
export function SurchargeDialog({
  bookingId,
  settlement,
  open,
  onClose,
}: {
  bookingId: string;
  settlement: BookingSettlement;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const add = useAddSurcharge(bookingId);
  const remove = useVoidSurcharge(bookingId);

  const [category, setCategory] = useState<SurchargeCategory>(SURCHARGE_CATEGORY.OVERTIME);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Gợi ý quá giờ do server tính từ chính sách + giờ trả thực tế — chủ xe nhận, sửa hoặc bỏ. */
  const overtime = settlement.overtime;
  const canSuggest =
    category === SURCHARGE_CATEGORY.OVERTIME && overtime.available && overtime.amount != null;

  function submit() {
    setError(null);
    if (!amount.trim() || Number(amount) <= 0) {
      setError('Nhập số tiền lớn hơn 0.');
      return;
    }
    if (!reason.trim()) {
      setError('Nhập lý do — đây là khoản trừ vào tiền cọc của khách.');
      return;
    }
    add.mutate(
      { category, amount: amount.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          message.success('Đã ghi nhận khoản phát sinh');
          setAmount('');
          setReason('');
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title="Ghi nhận phát sinh"
      open={open}
      onClose={onClose}
      size="lg"
      footer={
        <Button type="primary" onClick={onClose}>
          Xong
        </Button>
      }
    >
      <div className={styles.body}>
        {/* ── Danh sách đã ghi ───────────────────────────────────────── */}
        {settlement.surcharges.length > 0 ? (
          <ul className={styles.list}>
            {settlement.surcharges.map((row) => (
              <li key={row.id} className={styles.item}>
                <span className={styles.itemBody}>
                  <span className={styles.itemHead}>
                    <b>{SURCHARGE_CATEGORY_LABEL[row.category as SurchargeCategory]}</b>
                    <b className={styles.money}>{formatMoneyVnd(row.amount)}</b>
                  </span>
                  <span className={styles.itemReason}>{row.reason}</span>
                </span>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Gỡ khoản ${SURCHARGE_CATEGORY_LABEL[row.category as SurchargeCategory]}`}
                  loading={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { id: row.id, reason: 'Gỡ khỏi quyết toán' },
                      {
                        onSuccess: () => message.success('Đã gỡ khoản phát sinh'),
                        onError: (err) => message.error(getErrorMessage(err)),
                      },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Chưa ghi nhận khoản phát sinh nào.</p>
        )}

        {/* ── Thêm khoản mới ─────────────────────────────────────────── */}
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.label}>Phân loại</span>
              <Select
                value={category}
                onChange={(next) => setCategory(next)}
                options={CATEGORY_OPTIONS}
                className={styles.control}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Số tiền (đ)</span>
              <Input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="600000"
              />
            </label>
          </div>

          {canSuggest ? (
            <Alert
              type="warning"
              showIcon
              message={`Đề xuất từ chính sách quá giờ: ${formatMoneyVnd(overtime.amount!)}`}
              description={overtime.formula}
              action={
                <Button size="small" onClick={() => setAmount(String(Number(overtime.amount)))}>
                  Dùng số này
                </Button>
              }
            />
          ) : null}

          <label className={styles.field}>
            <span className={styles.label}>Lý do chi tiết</span>
            <Input.TextArea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: khách trả muộn 6 tiếng do kẹt xe ngoài tỉnh"
            />
          </label>

          {error ? <Alert type="error" showIcon message={error} role="alert" /> : null}

          <Button
            icon={<PlusOutlined />}
            onClick={submit}
            loading={add.isPending}
            className={styles.addBtn}
          >
            Thêm phí phát sinh
          </Button>
        </div>

        {/* ── Phương án hoàn cọc (server tính) ───────────────────────── */}
        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>Tiền cọc đã nhận</dt>
            <dd>{formatMoneyVnd(settlement.depositReceived)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Tổng chi phí phát sinh</dt>
            <dd className={styles.negative}>−{formatMoneyVnd(settlement.surchargeTotal)}</dd>
          </div>
          <div className={styles.totalRowStrong}>
            <dt>Đề xuất hoàn lại cho khách</dt>
            <dd className={styles.positive}>{formatMoneyVnd(settlement.proposedRefund)}</dd>
          </div>
          {Number(settlement.additionalDue) > 0 ? (
            <div className={styles.totalRowStrong}>
              <dt>Cần thu thêm</dt>
              <dd className={styles.negative}>{formatMoneyVnd(settlement.additionalDue)}</dd>
            </div>
          ) : null}
        </dl>

        <p className={styles.note}>
          Các con số trên là ghi nhận vận hành. Hệ thống không tạo giao dịch ngân hàng và không
          yêu cầu khách xác nhận.
        </p>
      </div>
    </ResponsiveDialog>
  );
}
