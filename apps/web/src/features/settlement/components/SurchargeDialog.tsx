'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_LABEL,
  SURCHARGE_CATEGORY_VALUES,
  type SurchargeCategory,
} from '@xeprime/types';
import { MoneyInput } from '@/components/form/MoneyInput';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAddSurcharge, useVoidSurcharge } from '../hooks';
import type { BookingSettlement } from '../types';
import styles from './SurchargeDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * `Ghi nhận phát sinh` (Wave 10 §4.2) — tác vụ NÂNG CAO, không phải một bước của luồng trả xe.
 *
 * Danh mục: quá giờ · vệ sinh · hư hại/bồi thường · chờ đợi · đường dài · lưu trú qua đêm · khác.
 * **Không có nhiên liệu** — Wave 10 bỏ hẳn mức xăng khỏi bàn giao nên cũng không có phụ phí
 * thiếu xăng để ghi.
 *
 * Ghi ở đây KHÔNG tạo giao dịch ngân hàng và KHÔNG cần khách xác nhận; nó chỉ thay đổi con số
 * đề xuất hoàn cọc — và con số đó do SERVER tính, hộp này chỉ hiển thị lại.
 *
 * 08/09/2026: đơn có tài xế mang theo bảng phụ phí chủ xe ĐÃ CÔNG BỐ lúc đặt
 * (`settlement.surchargeRules` — snapshot, không đọc lại cấu hình hiện tại). Chọn danh mục có
 * quy tắc thì số tiền/đơn vị được gợi ý sẵn; chủ xe vẫn nhập số thực tế và lý do.
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
  const t = useTranslations('Bookings.settlement');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { message } = App.useApp();
  const add = useAddSurcharge(bookingId);
  const remove = useVoidSurcharge(bookingId);

  const [category, setCategory] = useState<SurchargeCategory>(SURCHARGE_CATEGORY.OVERTIME);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categoryLabel = (value: SurchargeCategory) =>
    domainLabel('surchargeCategory', value, SURCHARGE_CATEGORY_LABEL[value]);
  const categoryOptions = SURCHARGE_CATEGORY_VALUES.map((value) => ({
    value,
    label: categoryLabel(value),
  }));

  /** Gợi ý quá giờ do server tính từ chính sách + giờ trả thực tế — chủ xe nhận, sửa hoặc bỏ. */
  const overtime = settlement.overtime;
  const canSuggestOvertime =
    category === SURCHARGE_CATEGORY.OVERTIME && overtime.available && overtime.amount != null;
  /** Quy tắc phụ phí có tài xế đã công bố cho danh mục đang chọn (nếu có). */
  const rule = settlement.surchargeRules.find((r) => r.category === category) ?? null;

  function submit() {
    setError(null);
    if (amount == null || amount <= 0) {
      setError(t('surcharges.amountRequired'));
      return;
    }
    if (!reason.trim()) {
      setError(t('surcharges.reasonRequired'));
      return;
    }
    add.mutate(
      { category, amount: String(amount), reason: reason.trim() },
      {
        onSuccess: () => {
          message.success(t('surcharges.addSuccess'));
          setAmount(null);
          setReason('');
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title={t('surcharges.add')}
      open={open}
      onClose={onClose}
      size="lg"
      footer={
        <Button type="primary" onClick={onClose}>
          {tActions('done')}
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
                    <b>{categoryLabel(row.category as SurchargeCategory)}</b>
                    <b className={styles.money}>{fmt.money(row.amount)}</b>
                  </span>
                  <span className={styles.itemReason}>{row.reason}</span>
                </span>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t('surcharges.removeAria', {
                    category: categoryLabel(row.category as SurchargeCategory),
                  })}
                  loading={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { id: row.id, reason: t('surcharges.removeReason') },
                      {
                        onSuccess: () => message.success(t('surcharges.removeSuccess')),
                        onError: (err) => message.error(errorMessage(err)),
                      },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{t('surcharges.empty')}</p>
        )}

        {/* ── Thêm khoản mới ─────────────────────────────────────────── */}
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.label}>{t('surcharges.categoryLabel')}</span>
              <Select
                value={category}
                onChange={(next) => setCategory(next)}
                options={categoryOptions}
                className={styles.control}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('surcharges.amountLabel')}</span>
              <MoneyInput
                value={amount}
                onChange={(value) => setAmount(value ?? null)}
                min={0}
                className={styles.control}
              />
            </label>
          </div>

          {canSuggestOvertime ? (
            <Alert
              type="warning"
              showIcon
              message={t('surcharges.overtimeSuggestion', { amount: fmt.money(overtime.amount!) })}
              description={overtime.formula}
              action={
                <Button size="small" onClick={() => setAmount(Number(overtime.amount))}>
                  {t('overtime.apply')}
                </Button>
              }
            />
          ) : null}

          {rule ? (
            <Alert
              type="info"
              showIcon
              message={t('surcharges.ruleSuggestion', {
                kind: domainLabel('driverSurchargeKind', rule.kind),
                amount: fmt.money(rule.amount),
                unit: domainLabel('driverSurchargeUnit', rule.unit),
              })}
              description={
                rule.thresholdValue != null
                  ? t('surcharges.ruleThreshold', { value: rule.thresholdValue })
                  : t('surcharges.ruleHint')
              }
              action={
                <Button size="small" onClick={() => setAmount(Number(rule.amount))}>
                  {t('overtime.apply')}
                </Button>
              }
            />
          ) : null}

          <label className={styles.field}>
            <span className={styles.label}>{t('surcharges.reasonLabel')}</span>
            <Input.TextArea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('surcharges.reasonPlaceholder')}
            />
          </label>

          {error ? <Alert type="error" showIcon message={error} role="alert" /> : null}

          <Button
            icon={<PlusOutlined />}
            onClick={submit}
            loading={add.isPending}
            className={styles.addBtn}
          >
            {t('surcharges.addButton')}
          </Button>
        </div>

        {/* ── Phương án hoàn cọc (server tính) ───────────────────────── */}
        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>{t('depositReceived')}</dt>
            <dd>{fmt.money(settlement.depositReceived)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>{t('surchargeTotal')}</dt>
            <dd className={styles.negative}>−{fmt.money(settlement.surchargeTotal)}</dd>
          </div>
          <div className={styles.totalRowStrong}>
            <dt>{t('proposedRefund')}</dt>
            <dd className={styles.positive}>{fmt.money(settlement.proposedRefund)}</dd>
          </div>
          {Number(settlement.additionalDue) > 0 ? (
            <div className={styles.totalRowStrong}>
              <dt>{t('additionalDue')}</dt>
              <dd className={styles.negative}>{fmt.money(settlement.additionalDue)}</dd>
            </div>
          ) : null}
        </dl>

        <p className={styles.note}>{t('surcharges.operationalNote')}</p>
      </div>
    </ResponsiveDialog>
  );
}
