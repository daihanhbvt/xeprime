'use client';

import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  licenceValidThrough,
} from '@xeprime/domain';
import {
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_STATUS,
  VEHICLE_TYPE,
  vnDateKey,
  type DriverLicenceRejectReason,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useDriverLicence, useRequestDriverLicenceReview } from '../hooks/use-driver-licence';
import type { DriverLicence, DriverLicenceTrip } from '../types';
import { DriverLicenceDetails } from './DriverLicenceDetails';
import { DriverLicenceUploader } from './DriverLicenceUploader';
import styles from './DriverLicenceVerifier.module.css';

const ACCEPTED_KEYS = ['vn', 'idp', 'foreign'] as const;

type TripIssue = 'expired' | 'expiredToday' | 'classMismatchCar' | 'classMismatchMotorbike';

/**
 * Xác thực bằng lái — MỘT component cho cả trang "Giấy tờ & Xác minh" lẫn bước bằng lái trong
 * luồng đặt xe (ADR 0057). Màn hình hoàn toàn do trạng thái SERVER quyết: đang đọc → hợp lệ /
 * chờ duyệt / bị từ chối; component chỉ thêm một trạng thái của riêng nó — "đang thay bằng mới".
 *
 * "Cần nộp", "đang thay bằng" và "đang đọc" dùng CHUNG một khung: chỉ ô ảnh đổi từ bộ chọn sang
 * tiến trình, nên khách không bị đẩy sang một bố cục khác giữa lúc máy đang đọc.
 *
 * Có `trip` (luồng đặt xe) thì "hợp lệ" nghĩa là hợp lệ CHO CHUYẾN ĐÓ: đúng hạng loại xe và còn
 * hạn tới hết ngày trả — cùng một hàm (`evaluateDriverLicenceForTrip`) với cổng ở server, nên giao
 * diện không bao giờ nói "được" ở chỗ server sẽ nói "không".
 */
export function DriverLicenceVerifier({
  trip,
}: {
  /** Luồng đặt xe: soát bằng cho CHÍNH chuyến này. Nút đi tiếp thuộc về luồng, không ở đây. */
  trip?: DriverLicenceTrip;
}) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const query = useDriverLicence();
  const [replacing, setReplacing] = useState(false);
  /**
   * Khách vừa chọn ảnh MỚI khi kết quả gần nhất là lượt nộp này (`latest.id`, hoặc `null` khi chưa có) —
   * lý do bị từ chối / cảnh báo của kết quả CŨ ẩn ngay, không đứng cạnh ảnh mới đang đọc. Kết quả của
   * lượt mới mang id khác nên tự hiện lại khi về.
   */
  const [pickedOver, setPickedOver] = useState<string | null | undefined>(undefined);
  // Trong hộp thoại đặt xe, hộp thoại ĐÃ là khung — thêm một thẻ viền + bóng đổ bên trong chỉ là
  // một lớp khung thừa. Trang Giấy tờ thì đứng riêng nên vẫn là một thẻ.
  const panel = cx(styles.panel, trip && styles.panelEmbedded);

  if (query.isPending) {
    return (
      <div className={panel} aria-busy="true">
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('error.load')}
        action={
          <Button
            size="small"
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={() => void query.refetch()}
          >
            {t('error.retry')}
          </Button>
        }
      />
    );
  }

  const { verified, latest } = query.data;
  const today = vnDateKey(new Date());
  const booking = Boolean(trip);

  let usable: boolean;
  let tripIssue: TripIssue | null = null;
  if (trip) {
    const gate = evaluateDriverLicenceForTrip({ verified, latest }, trip);
    usable = gate === DRIVER_LICENCE_TRIP_GATE.OK;
    if (gate === DRIVER_LICENCE_TRIP_GATE.EXPIRED) tripIssue = 'expired';
    if (gate === DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH) {
      tripIssue =
        trip.vehicleType === VEHICLE_TYPE.MOTORBIKE ? 'classMismatchMotorbike' : 'classMismatchCar';
    }
  } else {
    usable = Boolean(verified && licenceValidThrough(verified, today));
    if (verified && !usable) tripIssue = 'expiredToday';
  }

  const status = latest?.status;
  const processing = status === DRIVER_LICENCE_STATUS.PROCESSING && latest ? latest : null;
  const rejected =
    latest && status === DRIVER_LICENCE_STATUS.REJECTED && latest.id !== verified?.id
      ? latest
      : null;

  // 1. Bằng dùng được (cho chuyến này, nếu có chuyến) — trừ khi khách đang chủ động thay bằng.
  if (usable && verified && !replacing && !processing) {
    return (
      <div className={cx(panel, styles.panelSuccess)}>
        <StatusBanner
          tone="success"
          icon={<CheckCircleFilled />}
          title={booking ? t('verified.bookingTitle') : t('verified.title')}
          body={booking ? null : t('verified.body')}
        />
        {/* Bằng mới vừa nộp chưa thành — bằng đang dùng vẫn dùng được, nhưng khách phải biết. */}
        {rejected ? (
          <Alert
            type="warning"
            showIcon
            title={t('verified.replaceFailed', {
              reason: t(
                `reasons.${(rejected.rejectionReason ?? 'other') as DriverLicenceRejectReason}`,
              ),
            })}
          />
        ) : status === DRIVER_LICENCE_STATUS.PENDING_REVIEW ? (
          <Alert type="info" showIcon title={t('verified.replacePending')} />
        ) : null}
        <DriverLicenceDetails licence={verified} />
        <div className={styles.footerActions}>
          <Button onClick={() => setReplacing(true)}>{t('verified.replace')}</Button>
        </div>
      </div>
    );
  }

  // 2. Đang chờ người của XePrime xem.
  if (status === DRIVER_LICENCE_STATUS.PENDING_REVIEW && !replacing) {
    return (
      <div className={cx(panel, styles.panelWaiting)}>
        <StatusBanner
          tone="waiting"
          icon={<ClockCircleFilled />}
          title={t('pending.title')}
          body={booking ? t('pending.bookingBody') : t('pending.body')}
        />
        <div className={styles.footerActions}>
          <Button onClick={() => setReplacing(true)}>{t('pending.replace')}</Button>
        </div>
      </div>
    );
  }

  // 3. Cần nộp (lại) / đang thay bằng / máy đang đọc — CÙNG một khung.
  const heading = (
    <PanelHeading
      title={booking ? null : t('intro.title')}
      body={booking ? t('intro.bookingBody') : t('intro.body')}
    />
  );
  // Kết quả CŨ chỉ hiện khi máy không đang đọc ảnh mới và khách chưa chọn ảnh mới đè lên nó.
  const showResult =
    !processing && !(pickedOver !== undefined && pickedOver === (latest?.id ?? null));
  let notice: ReactNode = heading;
  if (showResult && rejected) {
    notice = <RejectedNotice licence={rejected} />;
  } else if (showResult && !replacing && tripIssue && verified) {
    notice = (
      <Alert
        type="warning"
        showIcon
        icon={<ExclamationCircleFilled />}
        title={t(`tripIssue.${tripIssue}`, {
          date: verified.expiresOn ? fmt.dateKey(verified.expiresOn) : '',
        })}
      />
    );
  }

  return (
    <div className={panel}>
      {notice}
      <DriverLicenceUploader
        processing={processing}
        onPick={() => setPickedOver(latest?.id ?? null)}
        onSubmitted={() => setReplacing(false)}
      />
      {replacing && !processing ? (
        <div className={styles.footerActions}>
          <Button type="text" onClick={() => setReplacing(false)}>
            {t('verified.cancelReplace')}
          </Button>
        </div>
      ) : null}
      {!verified && !rejected ? <AcceptedDocuments /> : null}
    </div>
  );
}

/** `title = null`: nơi chứa đã có tiêu đề (bước "Xác thực bằng lái" của luồng đặt xe). */
function PanelHeading({ title, body }: { title: string | null; body: string }) {
  return (
    <div className={styles.heading}>
      {title ? <h3 className={styles.headingTitle}>{title}</h3> : null}
      <p className={styles.headingBody}>{body}</p>
    </div>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'success' | 'waiting' | 'danger';
  icon: ReactNode;
  title: string;
  body?: string | null;
}) {
  return (
    <div className={cx(styles.banner, styles[`banner_${tone}`])} role="status">
      <span className={styles.bannerIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className={styles.bannerTitle}>{title}</p>
        {body ? <p className={styles.bannerBody}>{body}</p> : null}
      </div>
    </div>
  );
}

/** Vì sao chưa xác thực được + gợi ý chụp lại đúng chỗ hỏng + (nếu được) nhờ người xem lại. */
function RejectedNotice({ licence }: { licence: DriverLicence }) {
  const t = useTranslations('DriverLicence');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const review = useRequestDriverLicenceReview();
  const fmt = useAppFormat();
  const reason = (licence.rejectionReason ?? 'other') as DriverLicenceRejectReason;
  // Hết hạn: hiện NGÀY máy đọc được — khách thấy ngay nếu máy đọc lệch một chữ số, trước khi nhờ xem lại.
  const reasonText =
    reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED && licence.expiresOn
      ? t('rejected.expiredOn', { date: fmt.dateKey(licence.expiresOn) })
      : t(`reasons.${reason}`);

  return (
    <div className={cx(styles.banner, styles.banner_danger)} role="alert">
      <span className={styles.bannerIcon} aria-hidden="true">
        <CloseCircleFilled />
      </span>
      <div className={styles.rejectedBody}>
        <p className={styles.bannerTitle}>{t('rejected.title')}</p>
        <p className={styles.bannerBody}>{reasonText}</p>
        {reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED && licence.canRequestReview ? (
          <p className={styles.bannerBody}>{t('rejected.expiredMisread')}</p>
        ) : null}
        {licence.qualityIssues.length > 0 ? (
          <ul className={styles.issueList}>
            {licence.qualityIssues.map((issue) => (
              <li key={issue}>{t(`issues.${issue as 'blurry'}`)}</li>
            ))}
          </ul>
        ) : null}
        {licence.reviewNote ? (
          <p className={styles.bannerBody}>{t('rejected.note', { note: licence.reviewNote })}</p>
        ) : null}
        {licence.canRequestReview ? (
          <Button
            size="small"
            icon={<SyncOutlined aria-hidden="true" />}
            loading={review.isPending}
            className={styles.reviewButton}
            onClick={() =>
              review.mutate(licence.id, {
                onSuccess: () => void message.success(t('rejected.reviewRequested')),
                onError: (error) => void message.error(errorMessage(error)),
              })
            }
          >
            {t('rejected.requestReview')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AcceptedDocuments() {
  const t = useTranslations('DriverLicence.accepted');
  return (
    <div className={styles.accepted}>
      <p className={styles.acceptedTitle}>{t('title')}</p>
      <ul className={styles.acceptedList}>
        {ACCEPTED_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </div>
  );
}
