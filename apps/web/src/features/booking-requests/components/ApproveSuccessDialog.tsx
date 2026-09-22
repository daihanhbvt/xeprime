'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { toAppTz } from '@/lib/datetime';
import type { BookingRequestDecisionTarget } from '../types';
import styles from './ApproveSuccessDialog.module.css';

/**
 * Kết quả sau khi duyệt — thay cho một dòng toast trôi qua trong ba giây.
 *
 * Vì sao là hộp thoại: duyệt yêu cầu **giữ chỗ lịch xe**, và hệ quả tiếp theo khác hẳn nhau tuỳ
 * chuyến có thu tiền giữ chỗ hay không. Một `message.success` không nói được khác biệt đó, lại
 * bỏ người trực giữa danh sách yêu cầu mà không chỉ họ đi đâu tiếp.
 *
 * HAI kết cục, và chúng đọc như hai màn hình khác nhau (ADR 0044 điều 2):
 *
 *  - **Có thu tiền giữ chỗ** (`bookingId` rỗng) — lịch đã giữ, mã thanh toán đã gửi cho khách,
 *    đơn thuê mở TỰ ĐỘNG khi tiền về. Không có đơn để mở, nên cũng không có nút dẫn tới đơn;
 *    nói thẳng điều đó thay vì để một nút biến mất không lời giải thích.
 *  - **Không thu** (chính sách tắt, hoặc báo giá còn tạm tính) — đơn thuê đã có ngay, và việc
 *    tiếp theo nằm trên chính nó.
 *
 * Cấu trúc soi gương `ApproveBookingRequestDialog`: cùng bộ dòng thông tin, cùng thứ tự — người
 * đọc thấy đúng thứ mình vừa duyệt, không phải một màn hình lạ.
 */
export function ApproveSuccessDialog({
  request,
  open,
  onClose,
}: {
  request: BookingRequestDecisionTarget;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const router = useRouter();

  const longTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  /*
   * Chưa có đơn ⇒ chuyến này thu tiền giữ chỗ và đang chờ khách chuyển khoản. Hỏi `bookingId`
   * chứ không hỏi trạng thái: nó là thứ quyết định có nút "Xem chi tiết đơn" hay không, nên hai
   * câu hỏi đó phải có cùng một câu trả lời.
   */
  const awaitingPayment = !request.bookingId;

  return (
    <ResponsiveDialog
      title={awaitingPayment ? t('approved.holdTitle') : t('approved.title')}
      open={open}
      onClose={onClose}
      size="md"
      footer={null}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          {/*
            Vòng tròn tự tô nền thay vì để glyph ăn `currentColor`: style runtime của AntD tiêm
            SAU stylesheet CSS Module nên một class đơn không chắc thắng, và dấu tích ra màu chữ.
          */}
          <span className={styles.badge} aria-hidden>
            <CheckOutlined />
          </span>
          <p className={styles.lead}>
            {awaitingPayment
              ? t('approved.holdLead')
              : longTerm
                ? t('approved.leadLongTerm')
                : t('approved.lead')}
          </p>
        </div>

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

        <p className={styles.next}>
          {awaitingPayment ? t('approved.holdNext') : t('approved.next')}
        </p>

        <div className={styles.actions}>
          {/*
            Lối đi tiếp là VIỆC TIẾP THEO, không phải "đóng". Chuyến đang chờ tiền chưa có đơn để
            mở — việc duy nhất còn lại là chờ, nên nút chính quay về hộp thư thay vì dẫn vào một
            trang không tồn tại.
          */}
          {request.bookingId ? (
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(bookingPath.detail(request.bookingId!));
              }}
            >
              {t('approved.viewBooking')}
            </Button>
          ) : null}
          <Button type={awaitingPayment ? 'primary' : 'default'} size="large" block onClick={onClose}>
            {awaitingPayment ? t('approved.holdClose') : t('approved.close')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
