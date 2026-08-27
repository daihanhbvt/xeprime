'use client';

import { Alert, Modal } from 'antd';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { toAppTz } from '@/lib/datetime';
import type { BookingRequestItem } from '../types';
import styles from './ApproveBookingRequestDialog.module.css';

interface Props {
  request: BookingRequestItem | null;
  submitting: boolean;
  /** Lỗi lần duyệt vừa rồi (vd trùng lịch 409) — hộp thoại ở lại để đọc và quyết định tiếp. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Xác nhận duyệt một yêu cầu theo NGÀY (tự lái / có tài xế).
 *
 * Là một hộp thoại thật chứ không phải `Popconfirm`, vì câu hỏi ở đây không phải "bạn chắc
 * chứ" mà là "đúng xe này, đúng khung giờ này chứ" — người trực cần ĐỌC LẠI lịch trước khi
 * một chỗ trên lịch bị giữ. Thuê dài hạn đi đường riêng (`ApproveLongTermDialog`) vì ở đó
 * gian hàng còn phải CHỐT giờ nhận (ADR 0011).
 *
 * Trùng lịch trả 409: hộp thoại KHÔNG đóng — constraint DB mới là chỗ quyết định (ADR 0006),
 * và người trực cần thấy vì sao mình vừa không duyệt được.
 */
function ApproveForm({ request, submitting, error, onCancel, onConfirm }: Props & { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;

  return (
    <Modal
      open
      title={t('approve.title')}
      okText={t('approve.confirm')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={onConfirm}
      destroyOnHidden
    >
      <div className={styles.body}>
        <dl className={styles.facts}>
          <div className={styles.row}>
            <dt>{t('approve.vehicle')}</dt>
            <dd>
              {request.vehicleName}
              {request.vehiclePlate ? ` · ${request.vehiclePlate}` : ''}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('approve.customer')}</dt>
            <dd>
              {request.customerName} · {request.customerPhone}
            </dd>
          </div>
          {pickup && dropoff ? (
            <div className={styles.row}>
              <dt>{t('approve.schedule')}</dt>
              <dd>
                {fmt.rentalPoint(pickup)} → {fmt.rentalPoint(dropoff)} ·{' '}
                {fmt.rentalDuration(pickup, dropoff)}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className={styles.effect}>{t('approve.effect')}</p>

        {request.deliveryRequested ? (
          <Alert type="info" showIcon message={t('approve.deliveryNote')} />
        ) : null}

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    </Modal>
  );
}

export function ApproveBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <ApproveForm key={props.request.id} {...props} request={props.request} />;
}
