'use client';

import { Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  REJECT_REASON_MAX_LENGTH,
  REJECT_REASON_PRESETS,
  type RejectReasonPreset,
} from '../constants';
import type { BookingRequestDecisionTarget } from '../types';
import styles from './DecisionReasonDialog.module.css';

interface Props {
  request: BookingRequestDecisionTarget | null;
  submitting: boolean;
  /** Lỗi lần từ chối vừa rồi — hộp thoại ở lại, chữ đã gõ còn nguyên. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Từ chối một yêu cầu — Figma Partner-XePrime "Từ chối yêu cầu thuê xe" (`23919:39682`, 05/11/2026):
 * viên tóm tắt khách · xe, "Lý do từ chối" (chọn) + "Ghi chú cho khách" (bắt buộc), hai nút.
 *
 * Backend nhận MỘT câu `reason` — câu khách đọc được. Ô chọn lý do là lối gõ nhanh: chọn là điền
 * sẵn câu mẫu vào ô ghi chú để sửa tiếp; "Lý do khác" để trống cho người trực tự viết. Lý do là
 * BẮT BUỘC: một chữ "đã từ chối" trơn để khách tự đoán nên làm gì tiếp.
 */
function RejectForm({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props & { request: BookingRequestDecisionTarget }) {
  const t = useTranslations('BookingRequests.reject');

  const [preset, setPreset] = useState<RejectReasonPreset | null>(null);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = note.trim();
  const presetMissing = preset === null;
  const noteMissing = trimmed.length === 0;

  function choosePreset(value: RejectReasonPreset) {
    setPreset(value);
    // Câu mẫu thay cho câu mẫu trước — KHÔNG đè chữ người trực đã tự gõ.
    const presetTexts = REJECT_REASON_PRESETS.filter((key) => key !== 'other').map((key) =>
      t(`presets.${key}`).trim(),
    );
    if (trimmed === '' || presetTexts.includes(trimmed)) {
      setNote(value === 'other' ? '' : t(`presets.${value}`));
    }
  }

  function submit() {
    setTouched(true);
    if (submitting || presetMissing || noteMissing) return;
    onConfirm(trimmed);
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
            {t.rich('subtitle', { b: (chunks) => <strong>{chunks}</strong> })}
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
            {t('presetLabel')} <span className={styles.required}>*</span>
          </span>
          <Select<RejectReasonPreset>
            value={preset ?? undefined}
            placeholder={t('presetPlaceholder')}
            onChange={choosePreset}
            status={touched && presetMissing ? 'error' : undefined}
            options={REJECT_REASON_PRESETS.map((key) => ({
              value: key,
              label: key === 'other' ? t('presets.other') : t(`presets.${key}`),
            }))}
          />
          {touched && presetMissing ? (
            <span className={styles.error} role="alert">
              {t('presetRequired')}
            </span>
          ) : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            {t('reasonLabel')} <span className={styles.required}>*</span>
          </span>
          <Input.TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('reasonPlaceholder')}
            maxLength={REJECT_REASON_MAX_LENGTH}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            status={touched && noteMissing ? 'error' : undefined}
            aria-invalid={touched && noteMissing ? true : undefined}
          />
          {touched && noteMissing ? (
            <span className={styles.error} role="alert">
              {t('reasonRequired')}
            </span>
          ) : (
            <span className={styles.hint}>{t('reasonHint')}</span>
          )}
        </label>

        {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}
      </div>
    </ResponsiveDialog>
  );
}

/** Remount theo `request.id` để chữ đã gõ không rơi nhầm sang yêu cầu khác. */
export function RejectBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <RejectForm key={props.request.id} {...props} request={props.request} />;
}
