'use client';

import { LIST_SEPARATOR } from '@xeprime/domain';
import { useQuery } from '@tanstack/react-query';
import { Alert, Modal } from 'antd';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { toAppTz } from '@/lib/datetime';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequest } from '../api';
import type { BookingRequestDecisionTarget } from '../types';
import { ApprovalPreviewSummary } from './ApprovalPreviewSummary';
import styles from './ApproveBookingRequestDialog.module.css';

interface Props {
  request: BookingRequestDecisionTarget | null;
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
function ApproveForm({
  request,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props & { request: BookingRequestDecisionTarget }) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  /*
   * Đọc LẠI yêu cầu mỗi lần mở hộp thoại: hai cửa sổ của khách (`approvalPreview.windows`) được
   * server ước theo "duyệt NGAY" lúc trả dòng hộp thư — một dòng tải từ 20 phút trước sẽ hứa với
   * người trực một cửa sổ thanh toán dài hơn thật, hoặc giấu cảnh báo `tooShort`. Cùng khoá với
   * panel chi tiết chuyến, nên mọi quyết định (invalidate tiền tố) làm mới luôn bản này. Trong lúc
   * chờ thì hiện bản của dòng đang có — không chặn người trực đọc lịch.
   */
  const fresh = useQuery({
    queryKey: queryKeys.bookingRequests.detail(request.id),
    queryFn: () => fetchBookingRequest(request.id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const approvalPreview =
    fresh.data?.id === request.id ? fresh.data.approvalPreview : request.approvalPreview;

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
              {[request.customerName, request.customerPhone].filter(Boolean).join(LIST_SEPARATOR)}
              {request.customerAccountPhone
                ? ` (${t('customer.accountPhone', { phone: request.customerAccountPhone })})`
                : ''}
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
          {request.pricing ? (
            <>
              <div className={styles.row}>
                <dt>{t('approve.rentalTotal')}</dt>
                <dd>{fmt.money(request.pricing.rentalTotal)}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('approve.customerTotal')}</dt>
                <dd>
                  <strong>{fmt.money(request.pricing.customerTotalAmount)}</strong>
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        {/*
          Xem trước lượt duyệt (ADR 0064): khách chuyển bao nhiêu qua QR, trả bạn bao nhiêu lúc nhận
          xe, hoa hồng/thuế, ví điểm nhận gì — và khách có bao lâu để trả / huỷ miễn phí nếu duyệt
          NGAY. Ước tính của server; số chốt đóng băng lúc duyệt.
        */}
        {approvalPreview ? <ApprovalPreviewSummary preview={approvalPreview} /> : null}

        <p className={styles.effect}>{t('approve.effect')}</p>

        {request.deliveryRequested ? (
          <Alert type="info" showIcon title={t('approve.deliveryNote')} />
        ) : null}

        {error ? <Alert type="error" showIcon title={error} /> : null}
      </div>
    </Modal>
  );
}

export function ApproveBookingRequestDialog(props: Props) {
  if (!props.request) return null;
  return <ApproveForm key={props.request.id} {...props} request={props.request} />;
}
