'use client';

import { CarOutlined } from '@ant-design/icons';
import { App, Alert, Button, Collapse, DatePicker, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  API_ERROR_CODE,
  HANDOVER_CONDITION,
  HANDOVER_TYPE,
  type HandoverCondition,
  type HandoverType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { getErrorCode } from '@/services/api-client';
import { confirmHandover } from '../api';
import { useInvalidateHandovers } from '../hooks';
import type { HandoverBelowPickupDetails, HandoverContext } from '../types';
import styles from './ConfirmHandoverDialog.module.css';

interface ConfirmHandoverDialogProps {
  context: HandoverContext;
  type: HandoverType;
  open: boolean;
  onClose: () => void;
  /** Mở `Ghi nhận phát sinh` — tác vụ nâng cao, không phải một bước của luồng. */
  onOpenSurcharge?: () => void;
}

/** Khoá message theo chiều bàn giao (namespace `Bookings.handover`). */
const COPY_KEYS = {
  [HANDOVER_TYPE.PICKUP]: {
    dialogTitle: 'confirmDialog.readyTitlePickup',
    body: 'confirmDialog.readyBodyPickup',
    next: 'confirmDialog.nextPickup',
    success: 'confirmDialog.successPickup',
    timeLabel: 'occurredAt.labelPickup',
    advanced: 'advancedPickup',
    odoLabel: 'odometer.labelPickup',
  },
  [HANDOVER_TYPE.RETURN]: {
    dialogTitle: 'confirmDialog.readyTitleReturn',
    body: 'confirmDialog.readyBodyReturn',
    next: 'confirmDialog.nextReturn',
    success: 'confirmDialog.successReturn',
    timeLabel: 'occurredAt.labelReturn',
    advanced: 'advancedReturn',
    odoLabel: 'odometer.labelReturn',
  },
} as const;

/**
 * Mốc mặc định = **giờ đã hẹn trên đơn**, không phải `Bây giờ`: chuyến chạy đúng lịch thì đó
 * chính là giờ giao/nhận thật; trễ thì người bàn giao sửa trong vùng chi tiết. Hẹn ở tương lai
 * (giao sớm) thì lấy giờ hiện tại — server từ chối mốc tương lai.
 */
function defaultOccurredAt(scheduledIso: string): Dayjs {
  // Cả hai đầu đọc theo giờ VIỆT NAM: ô chọn hiện giờ nghiệp vụ, không phải giờ máy trực ban.
  const now = nowInAppTz();
  const scheduled = toAppTz(scheduledIso);
  return scheduled.isValid() && scheduled.isBefore(now) ? scheduled : now;
}

/**
 * "Sẵn sàng giao xe" / "Sẵn sàng nhận lại xe" — Figma Partner-XePrime `23845:54382` (03/11/2026).
 *
 * Bước CUỐI của hành động chính mỗi đầu chuyến: trang chi tiết đã soát việc còn thiếu (cảnh báo
 * + "Vẫn tiếp tục") và ảnh hiện trạng đã chụp ngay trên trang, nên hộp này chỉ còn hai lần bấm.
 * Ô Odo giữ lại ngay trong thân (chốt 03/11): đó là thứ DUY NHẤT phải đọc trên xe đúng lúc bàn
 * giao — vẫn tuỳ chọn, bỏ trống thì KM của xe giữ nguyên. Giờ thực tế, tình trạng, ghi chú nằm
 * trong vùng chi tiết đóng sẵn và không bao giờ chặn nút xác nhận.
 */
export function ConfirmHandoverDialog({
  context,
  type,
  open,
  onClose,
  onOpenSurcharge,
}: ConfirmHandoverDialogProps) {
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const tHandover = useTranslations('Bookings.handover');
  const datePattern = useDatePickerPattern();
  const keys = COPY_KEYS[type];
  const invalidate = useInvalidateHandovers(context.bookingId, context.vehicleId);

  const [occurredAt, setOccurredAt] = useState<Dayjs>(() =>
    defaultOccurredAt(
      type === HANDOVER_TYPE.PICKUP ? context.bookingPickupAt : context.bookingReturnAt,
    ),
  );
  const [odometerKm, setOdometerKm] = useState<string>('');
  const [condition, setCondition] = useState<HandoverCondition | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /*
   * KHÔNG reset bằng effect: hộp này chỉ được DỰNG khi mở (nơi gọi render có điều kiện), nên
   * mỗi lần mở đã là một instance mới với state khởi tạo sạch.
   */
  const existing = type === HANDOVER_TYPE.PICKUP ? context.pickup : context.return;

  async function submit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await confirmHandover(context.bookingId, type, {
        occurredAt: appWallClockToIso(occurredAt),
        ...(odometerKm.trim() ? { odometerKm: Number(odometerKm) } : {}),
        ...(condition ? { condition } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        // Ảnh tải trên trang làm `rowVersion` nhảy — ngữ cảnh đã được làm mới sau mỗi ảnh.
        ...(existing?.rowVersion ? { expectedRowVersion: existing.rowVersion } : {}),
      });
      invalidate();
      message.success(tHandover(keys.success));
      onClose();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP) {
        const details = (err as { details?: HandoverBelowPickupDetails }).details;
        setError(
          details
            ? tHandover('odometerBelowPickup', {
                entered: fmt.kmNumber(details.odometerKm),
                pickup: fmt.kmNumber(details.pickupKm),
              })
            : errorMessage(err),
        );
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      hideHeaderTitle
      ariaLabel={tHandover(keys.dialogTitle)}
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <div className={styles.footer}>
          <Button size="large" onClick={onClose} disabled={submitting}>
            {tHandover('confirmDialog.back')}
          </Button>
          <Button size="large" type="primary" loading={submitting} onClick={() => void submit()}>
            {tHandover('confirmDialog.confirm')}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <CarOutlined />
        </span>
        <h2 className={styles.title}>{tHandover(keys.dialogTitle)}</h2>
        <p className={styles.text}>{tHandover(keys.body)}</p>
        <p className={styles.text}>
          {tHandover.rich(keys.next, { b: (chunks) => <b>{chunks}</b> })}
        </p>

        <label className={styles.field}>
          <span className={styles.label}>{tHandover(keys.odoLabel)}</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={odometerKm}
            placeholder={tHandover('odometer.placeholder')}
            onChange={(e) => setOdometerKm(e.target.value.replace(/\D/g, ''))}
          />
          <span className={styles.hint}>
            {context.vehicleOdometerKm != null
              ? tHandover('odometer.hintWithCurrent', { km: fmt.km(context.vehicleOdometerKm) })
              : tHandover('odometer.hintPlain')}
          </span>
        </label>

        {/* Vùng chi tiết ĐÓNG SẴN: một chuyến bình thường không cần mở. */}
        <Collapse
          ghost
          className={styles.advanced}
          items={[
            {
              key: 'advanced',
              label: tHandover(keys.advanced),
              children: (
                <div className={styles.advancedBody}>
                  <label className={styles.field}>
                    <span className={styles.label}>{tHandover(keys.timeLabel)}</span>
                    <DatePicker
                      showTime={{ format: 'HH:mm' }}
                      format={datePattern.dateTime}
                      value={occurredAt}
                      onChange={(next) => next && setOccurredAt(next)}
                      allowClear={false}
                      className={styles.control}
                      // Ghi cho tương lai là vô nghĩa — server cũng từ chối, chặn sớm cho đỡ mất công.
                      disabledDate={(current) => current.isAfter(nowInAppTz().endOf('day'))}
                    />
                    <span className={styles.hint}>
                      {tHandover('occurredAt.hint', { time: fmt.rentalPoint(occurredAt) })}
                    </span>
                  </label>

                  <div className={styles.field}>
                    <span className={styles.label}>{tHandover('condition.label')}</span>
                    <Radio.Group
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as HandoverCondition)}
                    >
                      <Radio value={HANDOVER_CONDITION.NORMAL}>
                        {tHandover('condition.normalOption')}
                      </Radio>
                      <Radio value={HANDOVER_CONDITION.ATTENTION}>
                        {tHandover('condition.attentionOption')}
                      </Radio>
                    </Radio.Group>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>{tHandover('notes.label')}</span>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={tHandover('notes.placeholder')}
                    />
                  </label>

                  {type === HANDOVER_TYPE.RETURN && onOpenSurcharge ? (
                    <div className={styles.advancedLinks}>
                      <button type="button" className={styles.linkBtn} onClick={onOpenSurcharge}>
                        {tHandover('confirmDialog.openSurcharge')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ),
            },
          ]}
        />

        {type === HANDOVER_TYPE.RETURN ? (
          <Alert type="info" showIcon title={tHandover('returnDepositNotice')} />
        ) : null}

        {error ? <Alert type="error" showIcon title={error} role="alert" /> : null}
      </div>
    </ResponsiveDialog>
  );
}
