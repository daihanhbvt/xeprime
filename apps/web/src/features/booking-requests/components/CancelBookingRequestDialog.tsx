'use client';

import { Alert, Input, Modal, Radio } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CANCELLATION_REASON_CATEGORY_VALUES,
  cancellationReasonNeedsText,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { REJECT_REASON_MAX_LENGTH } from '../constants';
import type { BookingRequestDecisionTarget } from '../types';
import styles from './CancelBookingRequestDialog.module.css';

interface Props {
  request: BookingRequestDecisionTarget | null;
  submitting: boolean;
  /** Lỗi của lần gửi vừa rồi — hộp thoại Ở LẠI để sửa, không nuốt mất chữ đã gõ. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: { reasonCategory: CancellationReasonCategory; reason?: string }) => void;
}

/**
 * HUỶ một chuyến ĐÃ NHẬN — khác hẳn "Từ chối", và hộp thoại này phải nói rõ khác ở đâu.
 *
 * Từ chối là trả lời "không" cho một câu hỏi. Huỷ là rút lại một lời đã hứa: khách đang đếm
 * ngược để chuyển tiền, hoặc đã chuyển một phần. Nên ở đây có ba thứ mà hộp thoại từ chối
 * không có:
 *
 *  1. **Ba hệ quả nói thẳng, không nằm trong tooltip** — xe quay lại chợ, khách nhận thông báo,
 *     và tiền đã chuyển được hoàn. Đó là thứ người bấm cần biết TRƯỚC khi bấm, nên nó là chữ
 *     chính. Dấu "i" chỉ giữ phần giải thích thêm (ảnh hưởng tới chỉ số uy tín).
 *  2. **Nhóm lý do BẮT BUỘC.** Ô văn xuôi không thống kê được, và nhóm lý do là thứ vận hành
 *     đọc để biết nên sửa chỗ nào. "Lý do khác" bắt buộc kèm chữ — chọn nó mà bỏ trống là nói
 *     với khách đúng một chữ "đã huỷ".
 *  3. **Không có nhóm "bất khả kháng".** Trách nhiệm do hệ thống suy từ người thao tác, không
 *     phải do người huỷ tự khai (ADR 0045 điều 2) — cho tự chọn là xoá luôn ý nghĩa của chỉ số.
 *
 * Nhóm lý do là RADIO chứ không phải chip bấm-rồi-sửa như hộp thoại từ chối: ở đó chip chỉ là
 * gợi ý để gõ nhanh, còn ở đây lựa chọn ĐI THẲNG vào dữ liệu và chỉ có đúng một giá trị.
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
  const tCommon = useTranslations('Common');

  const [category, setCategory] = useState<CancellationReasonCategory | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = reason.trim();
  const needsText = category !== null && cancellationReasonNeedsText(category);
  const invalid = category === null || (needsText && trimmed.length === 0);

  function submit() {
    setTouched(true);
    if (invalid || category === null) return;
    onConfirm({ reasonCategory: category, reason: trimmed || undefined });
  }

  return (
    <Modal
      open
      title={t('title')}
      okText={t('confirm')}
      cancelText={tCommon('actions.cancel')}
      okButtonProps={{ danger: true }}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={submit}
      destroyOnHidden
    >
      <div className={styles.body}>
        <p className={styles.context}>
          {t('context', { customer: request.customerName, vehicle: request.vehicleName })}
        </p>

        {/*
          Ba hệ quả là chữ chính, không phải tooltip. Người bấm nút đỏ này cần biết tiền đi đâu
          trước khi bấm — giấu điều đó sau một dấu "i" là giấu đúng thứ không được giấu.
        */}
        <ul className={styles.effects}>
          <li>{t('effects.vehicle')}</li>
          <li>{t('effects.customer')}</li>
          <li>{t('effects.money')}</li>
          <li>
            {t('effects.metrics')}
            <InfoHint
              className={styles.infoHint}
              label={t('effects.metricsHintLabel')}
              content={t('effects.metricsHint')}
            />
          </li>
        </ul>

        <fieldset className={styles.field}>
          <legend className={styles.label}>{t('categoryLabel')}</legend>
          <Radio.Group
            className={styles.categories}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as CancellationReasonCategory);
              setTouched(true);
            }}
          >
            {CANCELLATION_REASON_CATEGORY_VALUES.map((value) => (
              <Radio key={value} value={value}>
                {tDomain(`cancellationReasonCategory.${value}`)}
              </Radio>
            ))}
          </Radio.Group>
          {touched && category === null ? (
            <span className={styles.error} role="alert">
              {t('categoryRequired')}
            </span>
          ) : null}
        </fieldset>

        <label className={styles.field}>
          <span className={styles.label}>
            {needsText ? t('reasonLabelRequired') : t('reasonLabel')}
          </span>
          <Input.TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('reasonPlaceholder')}
            maxLength={REJECT_REASON_MAX_LENGTH}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            status={touched && needsText && trimmed.length === 0 ? 'error' : undefined}
            aria-invalid={touched && needsText && trimmed.length === 0 ? true : undefined}
          />
          {touched && needsText && trimmed.length === 0 ? (
            <span className={styles.error} role="alert">
              {t('reasonRequired')}
            </span>
          ) : (
            <span className={styles.hint}>{t('reasonHint')}</span>
          )}
        </label>

        {error ? <Alert type="error" showIcon title={error} /> : null}
      </div>
    </Modal>
  );
}

/** Remount theo `request.id` để chữ đã gõ không rơi nhầm sang yêu cầu khác. */
export function CancelBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <CancelForm key={props.request.id} {...props} request={props.request} />;
}
