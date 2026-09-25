import { render } from '@testing-library/react-native';
import { BOOKING_HANDOVER_PLACE, BOOKING_STATUS, HANDOVER_STATUS } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { BookingCard } from './BookingCard';
import type { BookingListItem } from '../api';

/**
 * `pickupUrgency` so với ĐỒNG HỒ THẬT (giờ Việt Nam), nên fixture phải neo vào `Date.now()` chứ
 * không vào một mốc cố định — một mốc cứng sẽ chuyển từ "sắp tới" sang "quá giờ" vào ngày test
 * chạy lại, và không ai hiểu vì sao.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function booking(over: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: '01JQZX00000000000000000B01',
    code: 'DH-0001',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    vehicleName: 'Toyota Vios 2021',
    vehiclePlate: '51H-123.45',
    status: BOOKING_STATUS.RESERVED,
    pickupAt: new Date(Date.now() + 2 * DAY).toISOString(),
    returnAt: new Date(Date.now() + 4 * DAY).toISOString(),
    totalAmount: '1500000.00',
    pickupHandoverStatus: null,
    handoverPlaceKind: null,
    handoverPlace: null,
    ...over,
  } as BookingListItem;
}

const noop = () => {};

/**
 * Hai BỘ DỮ KIỆN khác nhau trên cùng một thẻ (ADR 0047 điều 5).
 *
 * Danh sách đầy đủ trả lời "đơn này đáng bao nhiêu và đang ở trạng thái nào"; hàng đợi giao xe
 * trả lời "xe nào phải rời bãi lúc mấy giờ, đi đâu, chuẩn bị tới đâu rồi". Dựng nhầm bộ là màn
 * hình vẫn chạy và vẫn đẹp — chỉ là nó không trả lời câu người trực đang hỏi.
 */
describe('BookingCard — danh sách đầy đủ', () => {
  it('hiện TỔNG TIỀN và trạng thái đơn', async () => {
    const view = await render(withIntl(<BookingCard booking={booking()} onPress={noop} />));

    expect(view.getByText('Tổng tiền')).toBeTruthy();
    expect(view.getByText('Chờ giao xe')).toBeTruthy();
  });

  /** Nhóm việc TẮT thì không có mảnh nào của hàng đợi lọt vào thẻ. */
  it('KHÔNG hiện mức khẩn hay trạng thái bàn giao', async () => {
    const view = await render(
      withIntl(
        <BookingCard
          booking={booking({ pickupHandoverStatus: HANDOVER_STATUS.READY })}
          onPress={noop}
        />,
      ),
    );

    expect(view.queryByText('Sắp tới')).toBeNull();
    expect(view.queryByText('Sẵn sàng xác nhận')).toBeNull();
  });
});

describe('BookingCard — hàng đợi Chờ giao xe', () => {
  /**
   * Viên góc phải đổi từ TRẠNG THÁI ĐƠN sang MỨC KHẨN.
   *
   * Sau ADR 0047 mọi hàng ở đây chỉ còn đúng một giá trị trạng thái (`reserved`), nên giữ viên cũ
   * là dành chỗ đẹp nhất của thẻ cho một chữ không bao giờ đổi.
   */
  it('thay trạng thái đơn bằng mức khẩn', async () => {
    const view = await render(
      withIntl(<BookingCard booking={booking()} onPress={noop} awaitingPickup />),
    );

    expect(view.getByText('Sắp tới')).toBeTruthy();
    expect(view.queryByText('Chờ giao xe')).toBeNull();
  });

  it('quá giờ hẹn ⇒ mức khẩn "Quá giờ giao xe"', async () => {
    const view = await render(
      withIntl(
        <BookingCard
          booking={booking({ pickupAt: new Date(Date.now() - HOUR).toISOString() })}
          onPress={noop}
          awaitingPickup
        />,
      ),
    );

    expect(view.getByText('Quá giờ giao xe')).toBeTruthy();
  });

  /** Tổng tiền RỜI thẻ — chỗ đó nay là trạng thái biên bản. */
  it('thay tổng tiền bằng trạng thái bàn giao', async () => {
    const view = await render(
      withIntl(<BookingCard booking={booking()} onPress={noop} awaitingPickup />),
    );

    expect(view.queryByText('Tổng tiền')).toBeNull();
    expect(view.getByText('Bàn giao')).toBeTruthy();
    // Chưa có biên bản nào ⇒ "Chưa chuẩn bị", KHÔNG phải một khoá dịch trần.
    expect(view.getByText('Chưa chuẩn bị')).toBeTruthy();
  });

  /**
   * Việc sẽ làm phải đọc được — bằng mắt VÀ bằng trình đọc màn hình — và đọc ĐÚNG MỘT LẦN.
   *
   * Web có một mục thao tác tên hẳn hoi ("Xử lý giao xe"); bản đầu của thẻ native chỉ có một mũi
   * tên, tức là người nghe biết thẻ bấm được nhưng không biết bấm ra cái gì. Bản sau bù bằng cách
   * nối tên việc vào nhãn của CẢ THẺ — rồi khi nhãn đó thành NÚT thật (24/09/2026) thì hai nguồn
   * cùng đọc một câu. Bài này khoá cả hai đầu: có đúng một thứ mang tên việc đó.
   */
  it('nói rõ việc sẽ làm, đúng một lần', async () => {
    const view = await render(
      withIntl(<BookingCard booking={booking()} onPress={noop} awaitingPickup />),
    );

    expect(view.getByText('Xử lý giao xe')).toBeTruthy();
    expect(view.getAllByLabelText(/Xử lý giao xe/)).toHaveLength(1);
    // Nhãn của thẻ chỉ còn định danh: tên khách + mã đơn.
    expect(view.getByLabelText(/Nguyễn Văn A.*DH-0001/)).toBeTruthy();
  });

  it('danh sách đầy đủ KHÔNG mang nhãn hành động của hàng đợi', async () => {
    const view = await render(withIntl(<BookingCard booking={booking()} onPress={noop} />));

    expect(view.queryByText('Xử lý giao xe')).toBeNull();
  });

  it('có biên bản nháp / sẵn sàng thì nói đúng bậc', async () => {
    const draft = await render(
      withIntl(
        <BookingCard
          booking={booking({ pickupHandoverStatus: HANDOVER_STATUS.DRAFT })}
          onPress={noop}
          awaitingPickup
        />,
      ),
    );
    expect(draft.getByText('Đang chuẩn bị')).toBeTruthy();

    const ready = await render(
      withIntl(
        <BookingCard
          booking={booking({ pickupHandoverStatus: HANDOVER_STATUS.READY })}
          onPress={noop}
          awaitingPickup
        />,
      ),
    );
    expect(ready.getByText('Sẵn sàng xác nhận')).toBeTruthy();
  });

  /**
   * Trạng thái biên bản NGOÀI ba bậc trên không được vẽ một khoá dịch không tồn tại.
   *
   * Không đường nào hôm nay đưa `confirmed` tới đây (đơn đó đã rời danh sách), nhưng đọc dữ liệu
   * server thì không nên GIẢ ĐỊNH điều đó bằng một phép ép kiểu.
   */
  it('trạng thái biên bản lạ rơi về "Chưa chuẩn bị", không vỡ', async () => {
    const view = await render(
      withIntl(
        <BookingCard
          booking={booking({ pickupHandoverStatus: HANDOVER_STATUS.CONFIRMED })}
          onPress={noop}
          awaitingPickup
        />,
      ),
    );

    expect(view.getByText('Chưa chuẩn bị')).toBeTruthy();
  });

  /**
   * NƠI GIAO: mã → nhãn ở client (ADR 0012), chuỗi địa chỉ đi qua nguyên văn.
   *
   * Ba tình huống khác nhau về VIỆC PHẢI LÀM chứ không chỉ khác địa chỉ, nên nhãn phải phân biệt
   * được chúng.
   */
  it('dịch MÃ nơi giao và giữ nguyên văn địa chỉ', async () => {
    const view = await render(
      withIntl(
        <BookingCard
          booking={{
            ...booking(),
            handoverPlaceKind: BOOKING_HANDOVER_PLACE.DELIVERY,
            handoverPlace: '12 Nguyễn Huệ, Quận 1',
          }}
          onPress={noop}
          awaitingPickup
        />,
      ),
    );

    expect(view.getByText(/Giao tận nơi/)).toBeTruthy();
    expect(view.getByText(/12 Nguyễn Huệ, Quận 1/)).toBeTruthy();
  });

  it('chưa biết nơi giao thì nói thẳng, không để trống', async () => {
    const view = await render(
      withIntl(<BookingCard booking={booking()} onPress={noop} awaitingPickup />),
    );

    expect(view.getByText('Chưa rõ địa điểm')).toBeTruthy();
  });
});
