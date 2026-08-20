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
import type { BookingRequestItem } from '../types';
import styles from './ApproveSuccessDialog.module.css';

/**
 * Kết quả sau khi duyệt — thay cho một dòng toast trôi qua trong ba giây.
 *
 * Vì sao là hộp thoại: duyệt yêu cầu **tạo ra một đơn thuê và giữ chỗ lịch xe**. Đó là hệ quả
 * lớn nhất trong cả hộp thư yêu cầu, và ngay sau đó người trực còn phải làm tiếp một chuỗi việc
 * trên chính đơn vừa tạo (liên hệ khách, thu cọc, giao xe). Một `message.success` báo xong rồi
 * biến mất bỏ họ lại giữa danh sách yêu cầu, phải tự đi tìm đơn mình vừa tạo.
 *
 * Cấu trúc soi gương `ApproveBookingRequestDialog`: cùng bộ dòng thông tin, cùng thứ tự — người
 * đọc thấy đúng thứ mình vừa duyệt, không phải một màn hình lạ.
 */
export function ApproveSuccessDialog({
  request,
  open,
  onClose,
}: {
  request: BookingRequestItem;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();
  const router = useRouter();

  const longTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;

  return (
    <ResponsiveDialog title={t('approved.title')} open={open} onClose={onClose} size="md" footer={null}>
      <div className={styles.body}>
        <div className={styles.head}>
          {/*
            Vòng tròn tự tô nền thay vì để glyph ăn `currentColor`: style runtime của AntD tiêm
            SAU stylesheet CSS Module nên một class đơn không chắc thắng, và dấu tích ra màu chữ.
          */}
          <span className={styles.badge} aria-hidden>
            <CheckOutlined />
          </span>
          <p className={styles.lead}>{longTerm ? t('approved.leadLongTerm') : t('approved.lead')}</p>
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

        <p className={styles.next}>{t('approved.next')}</p>

        <div className={styles.actions}>
          {/*
            Lối đi tiếp là VIỆC TIẾP THEO, không phải "đóng": mọi thao tác còn lại của chuyến
            nằm trên đơn vừa tạo. `bookingId` luôn có ở đây — đơn được tạo trong cùng transaction
            với việc duyệt, nên phản hồi thành công không thể thiếu nó.
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
          <Button size="large" block onClick={onClose}>
            {t('approved.close')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
