'use client';

import { Alert, Input, Modal, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { REJECT_REASON_MAX_LENGTH, REJECT_REASON_PRESETS } from '../constants';
import type { BookingRequestItem } from '../types';
import styles from './RejectBookingRequestDialog.module.css';

interface Props {
  request: BookingRequestItem | null;
  submitting: boolean;
  /** Lỗi của lần gửi vừa rồi — hộp thoại Ở LẠI để sửa, không đóng và nuốt mất chữ đã gõ. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Từ chối một yêu cầu thuê — có LÝ DO.

 * Trước đây nút "Từ chối" chỉ hỏi một câu xác nhận rồi gửi `reason: undefined`, dù backend nhận
 * và lưu lý do, và thông báo gửi cho khách có chỗ để hiện nó. Khách nhận được đúng một chữ "bị
 * từ chối" và không biết nên đặt lại hay đi tìm xe khác.
 *
 * DTO backend giữ `reason` TUỲ CHỌN (dữ liệu cũ và các đường gọi khác không được vỡ), nhưng
 * giao diện này bắt buộc: không có lý do thì không bấm gửi được.
 *
 * Mẫu có sẵn là để bấm-rồi-sửa, không phải để khoá: chọn xong vẫn gõ lại được, vì hoàn cảnh
 * thật luôn có chi tiết mà bốn câu mẫu không nói hết.
 */
function RejectForm({ request, submitting, error, onCancel, onConfirm }: Props & { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');

  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = reason.trim();
  const invalid = trimmed.length === 0;

  function submit() {
    setTouched(true);
    if (invalid) return;
    onConfirm(trimmed);
  }

  return (
    <Modal
      open
      title={t('reject.title')}
      okText={t('reject.confirm')}
      cancelText={tCommon('actions.cancel')}
      okButtonProps={{ danger: true }}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={submit}
      destroyOnHidden
    >
      <div className={styles.body}>
        <p className={styles.context}>
          {t('reject.context', { customer: request.customerName, vehicle: request.vehicleName })}
        </p>

        <div className={styles.field}>
          <span className={styles.label}>{t('reject.presetLabel')}</span>
          <div className={styles.presets}>
            {REJECT_REASON_PRESETS.map((preset) => {
              const text = t(`reject.presets.${preset}`);
              return (
                <Tag.CheckableTag
                  key={preset}
                  checked={trimmed === text.trim()}
                  onChange={() => {
                    setReason(text);
                    setTouched(true);
                  }}
                >
                  {text}
                </Tag.CheckableTag>
              );
            })}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('reject.reasonLabel')}</span>
          <Input.TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('reject.reasonPlaceholder')}
            maxLength={REJECT_REASON_MAX_LENGTH}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            status={touched && invalid ? 'error' : undefined}
            aria-invalid={touched && invalid ? true : undefined}
          />
          {touched && invalid ? (
            <span className={styles.error} role="alert">
              {t('reject.reasonRequired')}
            </span>
          ) : (
            <span className={styles.hint}>{t('reject.reasonHint')}</span>
          )}
        </label>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    </Modal>
  );
}

/** Remount theo `request.id` để chữ đã gõ không rơi nhầm sang yêu cầu khác. */
export function RejectBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <RejectForm key={props.request.id} {...props} request={props.request} />;
}
