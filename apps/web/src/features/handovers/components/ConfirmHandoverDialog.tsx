'use client';

import { App, Alert, Collapse, DatePicker, Radio } from 'antd';
import { appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from '@/lib/datetime';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  HANDOVER_CONDITION,
  HANDOVER_TYPE,
  type HandoverCondition,
  type HandoverType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { confirmHandover, saveHandoverDraft } from '../api';
import { useInvalidateHandovers } from '../hooks';
import type { Handover, HandoverBelowPickupDetails, HandoverContext } from '../types';
import { HandoverPhotoGrid } from './HandoverPhotoGrid';
import styles from './ConfirmHandoverDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface ConfirmHandoverDialogProps {
  context: HandoverContext;
  type: HandoverType;
  open: boolean;
  onClose: () => void;
  /** Mở `Ghi nhận phát sinh` — tác vụ nâng cao, không phải một bước của luồng. */
  onOpenSurcharge?: () => void;
}

const COPY = {
  [HANDOVER_TYPE.PICKUP]: {
    title: 'Xác nhận đã giao xe',
    cta: 'Xác nhận đã giao xe',
    timeLabel: 'Thời gian giao xe thực tế',
    advanced: 'Thêm thông tin bàn giao — Không bắt buộc',
    odoLabel: 'Chỉ số Odo khi giao (km)',
  },
  [HANDOVER_TYPE.RETURN]: {
    title: 'Xác nhận đã nhận lại xe',
    cta: 'Xác nhận đã nhận xe',
    timeLabel: 'Thời gian nhận xe thực tế',
    advanced: 'Thêm thông tin khi nhận xe — Không bắt buộc',
    odoLabel: 'Chỉ số Odo khi nhận (km)',
  },
} as const;

/**
 * Mốc mặc định = **giờ đã hẹn trên đơn**, không phải `Bây giờ`: chuyến chạy đúng lịch thì đó
 * mới là giờ thật, còn lúc nhân viên rảnh tay mở máy chỉ là chuyện tình cờ.
 *
 * Kẹp về hiện tại khi giờ hẹn còn ở tương lai (giao sớm) — biên bản cho một việc "sẽ xảy ra" là
 * vô nghĩa và server cũng từ chối, nên không đưa người dùng một biểu mẫu sai sẵn từ lúc mở.
 */
function defaultOccurredAt(scheduledIso: string): Dayjs {
  // Cả hai đầu đọc theo giờ VIỆT NAM: ô chọn hiện giờ nghiệp vụ, không phải giờ máy trực ban.
  const now = nowInAppTz();
  const scheduled = toAppTz(scheduledIso);
  return scheduled.isValid() && scheduled.isBefore(now) ? scheduled : now;
}

/**
 * Xác nhận giao/nhận xe — **hành động chính DUY NHẤT** của mỗi đầu chuyến (Wave 10).
 *
 * Thay cho wizard 4 bước `Odo & Nhiên liệu → Hiện trạng → Phụ phí & Cọc → Xác nhận`. Một chuyến
 * bình thường xong bằng đúng hai lần bấm: mở hộp này, bấm xác nhận. Odo, hiện trạng, ảnh và ghi
 * chú nằm trong vùng ĐÓNG SẴN và không bao giờ chặn nút chính.
 *
 * Không hỏi mức xăng/% pin — Wave 10 bỏ hẳn nhiên liệu khỏi bàn giao (docs/design/14 §2).
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
  const { has } = usePermissions();
  const tHandover = useTranslations('Bookings.handover');
  const copy = COPY[type];
  const invalidate = useInvalidateHandovers(context.bookingId, context.vehicleId);
  const canManage = has(PERMISSION.HANDOVER_MANAGE);
  const canViewFiles = has(PERMISSION.HANDOVER_FILE_VIEW);

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
   * mỗi lần mở đã là một instance mới với state khởi tạo sạch. Reset trong effect vừa thừa vừa
   * tạo một vòng render phụ — đúng thứ quy tắc `set-state-in-effect` chặn.
   */
  const existing = type === HANDOVER_TYPE.PICKUP ? context.pickup : context.return;

  /**
   * Biên bản đang cầm trong tay — `null` khi chuyến đi đường nhanh và chưa có bản nháp nào.
   *
   * Giữ ở state chứ không đọc thẳng `existing` vì ảnh làm `rowVersion` nhảy: gửi lại số cũ ở
   * bước xác nhận sẽ ăn 409 đúng lúc người dùng vừa làm mọi thứ chỉn chu.
   */
  const [draft, setDraft] = useState<Handover | null>(existing ?? null);

  /**
   * Ảnh cần một biên bản để gắn vào, mà luồng nhanh Wave 10 chưa tạo cái nào cho tới lúc bấm
   * xác nhận. Tạo TRỄ, đúng lúc người dùng chọn tấm ảnh đầu tiên — mở vùng nâng cao ra ngó rồi
   * đóng lại thì không để lại bản nháp rỗng nào trong DB.
   */
  async function ensureHandover() {
    if (draft) return;
    setDraft(await saveHandoverDraft(context.bookingId, type, {}));
  }

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
        ...(draft?.rowVersion ? { expectedRowVersion: draft.rowVersion } : {}),
      });
      invalidate();
      message.success(
        type === HANDOVER_TYPE.PICKUP ? 'Đã xác nhận giao xe' : 'Đã xác nhận nhận lại xe',
      );
      onClose();
    } catch (err) {
      const code = getErrorCode(err);
      if (code === API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP) {
        const details = (err as { details?: HandoverBelowPickupDetails }).details;
        setError(
          details
            ? `Odo khi nhận (${details.odometerKm.toLocaleString('vi-VN')} km) không được nhỏ hơn Odo lúc giao (${details.pickupKm.toLocaleString('vi-VN')} km).`
            : getErrorMessage(err),
        );
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      title={copy.title}
      open={open}
      onClose={onClose}
      size="md"
      okText={copy.cta}
      onOk={() => void submit()}
      confirmLoading={submitting}
    >
      <div className={styles.body}>
        <dl className={styles.summary}>
          <div className={styles.row}>
            <dt>Xe</dt>
            <dd>
              {context.vehicleName}
              {context.plateNumber ? ` · ${context.plateNumber}` : ''}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Đơn</dt>
            <dd>{context.bookingCode}</dd>
          </div>
        </dl>

        {/*
          Odo đứng ĐẦU vì đó là thứ DUY NHẤT phải đọc trên xe ngay lúc bàn giao — bỏ lỡ khoảnh
          khắc đó thì không lấy lại được, trong khi giờ giấc và ghi chú luôn khai bù được sau.
          Vẫn tuỳ chọn: bỏ trống thì KM của xe giữ nguyên, không dựng ra `0 km`.
        */}
        <label className={styles.field}>
          <span className={styles.label}>{copy.odoLabel}</span>
          <input
            className={styles.input}
            inputMode="numeric"
            value={odometerKm}
            placeholder="Bỏ trống nếu chưa đọc được"
            onChange={(e) => setOdometerKm(e.target.value.replace(/\D/g, ''))}
          />
          <span className={styles.hint}>
            {context.vehicleOdometerKm != null
              ? `KM hệ thống đang ghi: ${fmt.km(context.vehicleOdometerKm)}. Không nhập cũng xác nhận được.`
              : 'Không nhập cũng xác nhận được. Bỏ trống thì KM của xe giữ nguyên.'}
          </span>
        </label>

        {/*
          Vùng nâng cao ĐÓNG SẴN: một chuyến bình thường không cần mở. Mọi thứ trong đây là
          tuỳ chọn — nút xác nhận không bao giờ chờ nó.
        */}
        <Collapse
          ghost
          className={styles.advanced}
          items={[
            {
              key: 'advanced',
              label: copy.advanced,
              children: (
                <div className={styles.advancedBody}>
                  <label className={styles.field}>
                    <span className={styles.label}>{copy.timeLabel}</span>
                    {/*
                      Một MỐC duy nhất, không phải một khoảng — nên dùng DatePicker chung chứ
                      không phải lịch khoảng thuê của Wave 9.
                    */}
                    <DatePicker
                      showTime={{ format: 'HH:mm' }}
                      format="DD/MM/YYYY HH:mm"
                      value={occurredAt}
                      onChange={(next) => next && setOccurredAt(next)}
                      allowClear={false}
                      className={styles.control}
                      // Ghi cho tương lai là vô nghĩa — server cũng từ chối, chặn sớm cho đỡ mất công.
                      disabledDate={(current) => current.isAfter(nowInAppTz().endOf('day'))}
                    />
                    <span className={styles.hint}>
                      {fmt.rentalPoint(occurredAt)} — mặc định theo giờ hẹn trên đơn, chỉnh lại nếu
                      giao/nhận lệch giờ.
                    </span>
                  </label>

                  <div className={styles.field}>
                    <span className={styles.label}>{tHandover('condition.label')}</span>
                    <Radio.Group
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as HandoverCondition)}
                    >
                      <Radio value={HANDOVER_CONDITION.NORMAL}>
                        Bình thường — xe không có dấu hiệu hư hại mới
                      </Radio>
                      <Radio value={HANDOVER_CONDITION.ATTENTION}>Có điểm cần lưu ý</Radio>
                    </Radio.Group>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>{tHandover('notes.label')}</span>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ví dụ: bàn giao tại bãi, khách nhận đủ giấy tờ"
                    />
                  </label>

                  {/*
                    Ảnh hiện trạng nằm NGAY ĐÂY chứ không phải sau một link mở màn khác: đây là
                    khoảnh khắc duy nhất người bàn giao đang đứng cạnh xe. Bản trước để nó sau
                    một `onOpenCondition` mà nơi gọi không bao giờ truyền, nên cả bộ ảnh 5 góc
                    KHÔNG có đường nào bấm tới.

                    Vẫn TUỲ CHỌN hoàn toàn (design 14 §2): không ô nào bắt buộc, không chặn nút
                    xác nhận, và nếu không mở vùng nâng cao thì không ai biết nó tồn tại.
                  */}
                  {canManage ? (
                    <div className={styles.field}>
                      {/* Tiêu đề do chính lưới ảnh dựng — ở đây chỉ nói rõ nó không bắt buộc. */}
                      <span className={styles.hint}>
                        Chụp lại để có bằng chứng khi đối chiếu cuối chuyến. Không bắt buộc — bỏ qua
                        vẫn xác nhận được.
                      </span>
                      <HandoverPhotoGrid
                        bookingId={context.bookingId}
                        type={type}
                        photos={draft?.photos ?? []}
                        canViewFiles={canViewFiles}
                        disabled={submitting}
                        ensureHandover={ensureHandover}
                        /*
                          Ảnh đã nằm trên server ngay khi tải xong, kể cả khi người dùng đóng hộp
                          mà chưa xác nhận. Phải báo cho query ngữ cảnh biết, nếu không lần mở
                          sau đọc lại `context` cũ và tưởng chưa có tấm nào.
                        */
                        onChanged={(next) => {
                          setDraft(next);
                          invalidate();
                        }}
                      />
                    </div>
                  ) : null}

                  {type === HANDOVER_TYPE.RETURN && onOpenSurcharge ? (
                    <div className={styles.advancedLinks}>
                      <button type="button" className={styles.linkBtn} onClick={onOpenSurcharge}>
                        Ghi nhận phát sinh
                      </button>
                    </div>
                  ) : null}
                </div>
              ),
            },
          ]}
        />

        {type === HANDOVER_TYPE.RETURN ? (
          <Alert
            type="info"
            showIcon
            message="Nếu không có phát sinh, hệ thống đề xuất hoàn đủ tiền cọc đã nhận. Việc hoàn tiền được chủ xe thực hiện bên ngoài và đánh dấu lại sau — không chặn hoàn tất chuyến."
          />
        ) : null}

        {error ? <Alert type="error" showIcon message={error} role="alert" /> : null}
      </div>
    </ResponsiveDialog>
  );
}
