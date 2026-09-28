import { Fragment } from 'react';
import { BOOKING_STATUS_META } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import type { BookingListItem } from '@/features/bookings/api';
import { MiniListRow } from './MiniListRow';

/**
 * Vài dòng đơn trong một khối của Tổng quan — bản native của `BookingMiniList` bên web.
 *
 * **Cùng bốn mẩu thông tin với web**: tên KHÁCH ở dòng chính, xe + khoảng thuê ở dòng meta, tổng
 * tiền và trạng thái ở cột phải. Bản trước của app lấy tên XE làm dòng chính và bỏ hẳn tiền —
 * mà câu người vận hành hỏi khi liếc dải này là "đơn của ai, bao nhiêu tiền, đang ở bước nào";
 * tên xe trả lời câu thứ tư.
 *
 * Khách chưa có tên thì lùi về MÃ ĐƠN: một dòng đầu trống làm cả hàng trông như đang tải dở.
 *
 * Mỗi dòng dẫn tới ĐÚNG đơn đó, không phải danh sách chung: khối này tồn tại để người vận hành
 * thấy "xe nào sắp trả" rồi mở thẳng nó, và một cú chạm dẫn về màn danh sách là bắt họ đi tìm
 * lại chính dòng vừa bấm.
 */
export function BookingMiniList({
  items,
  onSelect,
}: {
  items: readonly BookingListItem[];
  onSelect: (booking: BookingListItem) => void;
}) {
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <>
      {items.map((booking, index) => (
        <Fragment key={booking.id}>
          {index > 0 ? <Divider /> : null}
          <MiniListRow
            title={booking.customerName || booking.code}
            meta={[booking.vehicleName, fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)]
              .filter(Boolean)
              .join(LIST_SEPARATOR)}
            amount={fmt.money(booking.totalAmount)}
            accessibilityLabel={booking.code}
            onPress={() => onSelect(booking)}
            badge={
              <StatusBadge
                label={domainLabel(
                  'bookingStatus',
                  booking.status,
                  BOOKING_STATUS_META[booking.status]?.label,
                )}
                color={BOOKING_STATUS_META[booking.status]?.color ?? 'default'}
                size="xs"
              />
            }
          />
        </Fragment>
      ))}
    </>
  );
}
