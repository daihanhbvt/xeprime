'use client';

import { Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CANCELLATION_REASON_CATEGORY_VALUES,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { REJECT_REASON_MAX_LENGTH } from '../constants';
import type { BookingRequestDecisionTarget, BookingRequestItem } from '../types';
import styles from './DecisionReasonDialog.module.css';

interface Props {
  request: BookingRequestDecisionTarget | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: { reasonCategory: CancellationReasonCategory; reason?: string }) => void;
}

/**
 * HUỶ một chuyến ĐÃ NHẬN (chặng chờ khách thanh toán) — Figma Partner-XePrime "Huỷ yêu cầu thuê xe"
 * (`23930:44688`, 05/11/2026). Khác hẳn "Từ chối": huỷ là rút lại một lời đã hứa — khách đang đếm
 * ngược để chuyển tiền, hoặc đã chuyển một phần.
 *
 *  1. **Hệ quả nói thẳng, không trong tooltip** — ô đỏ: tính vào uy tín, khách được hoàn phần đã
 *     chuyển. Dấu "i" chỉ giữ phần giải thích chỉ số.
 *  2. **Nhóm lý do BẮT BUỘC** (đi thẳng vào `booking_cancellations.reason_category`) và **ghi chú cho
 *     khách BẮT BUỘC** (design) — khách đọc đúng câu này trong thông báo.
 *  3. **Không có nhóm "bất khả kháng"**: trách nhiệm do hệ thống suy (ADR 0045 điều 2).
 */
function CancelForm({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props & { request: BookingRequestDecisionTarget }) {
  const t = useTranslations('BookingRequests.cancel');
  const tDomain = useTranslations('Domain');
  const fmt = useAppFormat();

  const [category, setCategory] = useState<CancellationReasonCategory | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = reason.trim();
  const categoryMissing = category === null;
  const reasonMissing = trimmed.length === 0;
  // Màn "Đơn thuê xe" truyền nguyên dòng yêu cầu; nơi gọi hẹp hơn thì không có mốc này.
  const holdExpiresAt = (request as Partial<BookingRequestItem>).holdExpiresAt ?? null;

  function submit() {
    setTouched(true);
    if (submitting || category === null || reasonMissing) return;
    onConfirm({ reasonCategory: category, reason: trimmed });
  }

  return (
    <ResponsiveDialog
      open
      onClose={onCancel}
      size="sm"
      title={
        <span className={styles.titleBlock}>
          <span>{t('title')}</span>
          <span className={styles.subtitle}>
            {holdExpiresAt
              ? t.rich('subtitleWithDeadline', {
                  b: (chunks) => <strong>{chunks}</strong>,
                  time: fmt.dateTime(holdExpiresAt),
                })
              : t.rich('subtitle', { b: (chunks) => <strong>{chunks}</strong> })}
          </span>
        </span>
      }
      footer={
        <div className={styles.footer}>
          <Button size="large" onClick={onCancel} disabled={submitting}>
            {t('back')}
          </Button>
          <Button size="large" type="primary" danger loading={submitting} onClick={submit}>
            {t('confirm')}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.summary}>
          <span className={styles.summaryName}>{request.customerName}</span>
          <span className={styles.summaryDot} aria-hidden="true" />
          <span className={styles.summaryVehicle}>{request.vehicleName}</span>
        </p>

        <label className={styles.field}>
          <span className={styles.label}>
            {t('categoryLabel')} <span className={styles.required}>*</span>
          </span>
          <Select<CancellationReasonCategory>
            value={category ?? undefined}
            placeholder={t('categoryPlaceholder')}
            onChange={(value) => {
              setCategory(value);
              setTouched(true);
            }}
            status={touched && categoryMissing ? 'error' : undefined}
            options={CANCELLATION_REASON_CATEGORY_VALUES.map((value) => ({
              value,
              label: tDomain(`cancellationReasonCategory.${value}`),
            }))}
          />
          {touched && categoryMissing ? (
            <span className={styles.error} role="alert">
              {t('categoryRequired')}
            </span>
          ) : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            {t('reasonLabel')} <span className={styles.required}>*</span>
          </span>
          <Input.TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('reasonPlaceholder')}
            maxLength={REJECT_REASON_MAX_LENGTH}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            status={touched && reasonMissing ? 'error' : undefined}
            aria-invalid={touched && reasonMissing ? true : undefined}
          />
          {touched && reasonMissing ? (
            <span className={styles.error} role="alert">
              {t('reasonRequired')}
            </span>
          ) : (
            <span className={styles.hint}>{t('reasonHint')}</span>
          )}
        </label>

        {/* Hệ quả là chữ chính — người bấm nút đỏ cần biết tiền đi đâu TRƯỚC khi bấm. */}
        <div className={styles.warning} role="note">
          <p>
            {t.rich('warning', { b: (chunks) => <strong>{chunks}</strong> })}
            <InfoHint
              className={styles.infoHint}
              label={t('effects.metricsHintLabel')}
              content={t('effects.metricsHint')}
            />
          </p>
          <p>{t('effects.money')}</p>
        </div>

        {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}
      </div>
    </ResponsiveDialog>
  );
}

/** Remount theo `request.id` để chữ đã gõ không rơi nhầm sang yêu cầu khác. */
export function CancelBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <CancelForm key={props.request.id} {...props} request={props.request} />;
}
