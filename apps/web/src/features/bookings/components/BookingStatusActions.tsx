'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BOOKING_NO_SHOW_GRACE_MINUTES,
  BOOKING_STATUS,
  PERMISSION,
  canTransitionBooking,
  isNoShowGracePassed,
  type BookingStatus,
} from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import {
  BookingStatusTransitionDialog,
  type BookingClosingTarget,
} from './BookingStatusTransitionDialog';
import type { BookingDetail } from '../types';
import styles from './BookingStatusActions.module.css';

/**
 * Các quyết định KHÉP ĐƠN của gian hàng: hủy đơn · ghi nhận khách không đến.
 *
 * Không phải một bộ chọn trạng thái, và cố ý KHÔNG có "Xác nhận đơn". Một đơn tồn tại được là
 * vì gian hàng đã bấm `Duyệt & giữ xe` trên yêu cầu thuê — đó CHÍNH LÀ sự xác nhận, và bắt bấm
 * xác nhận lần thứ hai trên chính thứ mình vừa tạo là một bước rỗng. Hai chặng còn lại của máy
 * trạng thái (`active`, `completed`) là HỆ QUẢ của một lần bàn giao xe có thật — giờ giao/nhận
 * thực tế, KM, ảnh hiện trạng (design 14 §1); chúng chỉ đến từ `ConfirmHandoverDialog`, không
 * bao giờ từ một nút ở đây.
 *
 * Nút nào hiện lên hỏi thẳng `canTransitionBooking` thay vì tự liệt kê theo trạng thái: thêm
 * một cạnh vào máy trạng thái ở `@xeprime/types` là thanh này tự đúng theo, không có bản sao
 * luật thứ hai nằm lại trong component (ADR 0005).
 *
 * Quyền chỉ để BỚT NHIỄU trên màn hình — guard `bookings.update` ở backend mới là lớp chặn thật.
 */
export function BookingStatusActions({
  booking,
  /**
   * Đã có biên bản GIAO XE được xác nhận chưa (đọc từ ngữ cảnh bàn giao mà thanh hành động đã
   * tải sẵn). Có rồi thì khách đã cầm chìa khoá — gọi họ là "không đến" vừa sai sự thật vừa
   * nhả lịch một chiếc xe đang chạy ngoài đường. Server cũng từ chối, đây chỉ là để không bày
   * ra một nút chắc chắn nhận 409.
   */
  pickupConfirmed = false,
}: {
  booking: BookingDetail;
  pickupConfirmed?: boolean;
}) {
  const t = useTranslations('Bookings.statusActions');
  const { has } = usePermissions();
  const [closing, setClosing] = useState<BookingClosingTarget | null>(null);

  const status = booking.status as BookingStatus;
  const canCancel = canTransitionBooking(status, BOOKING_STATUS.CANCELLED);
  /*
   * Ba điều kiện, và cả ba đều phải đúng — đúng bộ mà server kiểm:
   *   1. máy trạng thái còn cạnh `→ no_show` (chỉ `reserved` và `confirmed`);
   *   2. đã qua ân hạn `BOOKING_NO_SHOW_GRACE_MINUTES` kể từ giờ nhận theo đơn;
   *   3. chưa hề giao xe.
   */
  const canNoShow =
    canTransitionBooking(status, BOOKING_STATUS.NO_SHOW) &&
    isNoShowGracePassed(booking.pickupAt) &&
    !pickupConfirmed;

  // Đơn đang thuê hoặc đã khép: không còn quyết định nào ở đây. `active` chỉ đi tiếp bằng biên
  // bản NHẬN XE, nên thanh này biến mất hẳn thay vì để lại một nút mờ không giải thích được.
  if (!has(PERMISSION.BOOKING_UPDATE) || (!canCancel && !canNoShow)) return null;

  return (
    <>
      {canCancel ? (
        <Button danger onClick={() => setClosing(BOOKING_STATUS.CANCELLED)}>
          {t('cancel')}
        </Button>
      ) : null}

      {canNoShow ? (
        // Cấp ba (UX guidelines §3): việc hiếm, không đáng một nút viền cạnh nút hủy, nhưng
        // cũng không được giấu đi — quầy cần nó đúng lúc khách trễ hẹn quá giờ.
        <Button
          type="text"
          className={styles.tertiary}
          title={t('noShowHint', { minutes: BOOKING_NO_SHOW_GRACE_MINUTES })}
          onClick={() => setClosing(BOOKING_STATUS.NO_SHOW)}
        >
          {t('noShow')}
        </Button>
      ) : null}

      {/* Dựng có điều kiện: mỗi lần mở là một form mới, không còn lý do của lần bấm trước. */}
      {closing ? (
        <BookingStatusTransitionDialog
          booking={booking}
          target={closing}
          open
          onClose={() => setClosing(null)}
        />
      ) : null}
    </>
  );
}
