import { CUSTOMER_TRIP_STAGE, CUSTOMER_TRIP_STAGE_VALUES } from '@xeprime/types';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import { closedNotice, stageNotice } from './stage-notice';

/**
 * Bảng CHẶNG → khối giải thích ở màn chi tiết chuyến.
 *
 * Thiếu một nhánh ở đây không hiện thành lỗi: màn hình chỉ im lặng, và khách rơi vào chặng đó đọc
 * một câu phụ đề rồi hết. Đúng điều đã xảy ra với `slot_taken` khi ADR 0044 thêm nó vào —
 * `CUSTOMER_TRIP_STAGE` có, phụ đề có, khối giải thích không.
 */
describe('stageNotice', () => {
  it('khung giờ đã có khách khác ⇒ nói rõ và chỉ đường đi tiếp (ADR 0044 điều 6)', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.SLOT_TAKEN)).toEqual({
      tone: 'info',
      titleKey: 'slotTakenTitle',
      bodyKey: 'slotTakenBody',
    });
  });

  /*
   * Không ai từ chối khách cả — chiếc xe chỉ vừa có người đặt xong. `danger` ở đây đọc ra như một
   * sự cố của chính họ, và nó cũng làm `slot_taken` nhìn y hệt `rejected`.
   */
  it('`slot_taken` KHÔNG mang tông của `rejected`', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.SLOT_TAKEN)?.tone).not.toBe(
      stageNotice(CUSTOMER_TRIP_STAGE.REJECTED)?.tone,
    );
  });

  it('chờ duyệt là `warning` — một việc CHƯA XONG, không phải một thông báo đã ổn', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)?.tone).toBe('warning');
  });

  it('bốn kết cục còn lại giữ đúng tông của bản web', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.REJECTED)?.tone).toBe('danger');
    expect(stageNotice(CUSTOMER_TRIP_STAGE.NO_SHOW)?.tone).toBe('danger');
    expect(stageNotice(CUSTOMER_TRIP_STAGE.CANCELLED)?.tone).toBe('info');
  });

  /* Chặng đang chạy bình thường đã có dòng thời gian — thêm một khối nữa là nói lại. */
  it('chặng đang chạy không có khối giải thích', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.AWAITING_HOLD)).toBeNull();
    expect(stageNotice(CUSTOMER_TRIP_STAGE.READY)).toBeNull();
    expect(stageNotice(CUSTOMER_TRIP_STAGE.ACTIVE)).toBeNull();
    expect(stageNotice(CUSTOMER_TRIP_STAGE.COMPLETED)).toBeNull();
  });

  /*
   * Mọi khoá trả ra phải TỒN TẠI trong bó message. `use-intl` không ném khi thiếu khoá — nó in
   * thẳng đường dẫn khoá lên màn hình, nên một lỗi chính tả ở đây đi tới tận người dùng.
   */
  it('mọi khoá trả ra đều có trong `Trips.notice`', () => {
    for (const stage of CUSTOMER_TRIP_STAGE_VALUES) {
      const notice = stageNotice(stage);
      if (!notice) continue;
      expect(viTrips.notice).toHaveProperty(notice.titleKey);
      expect(viTrips.notice).toHaveProperty(notice.bodyKey);
    }
  });
});

describe('stageNotice — chủ xe không phản hồi kịp (PR #158)', () => {
  it('`expired` có khối giải thích riêng, tông `info` như web — không mượn câu của `rejected`', () => {
    expect(stageNotice(CUSTOMER_TRIP_STAGE.EXPIRED)).toEqual({
      tone: 'info',
      titleKey: 'expiredTitle',
      bodyKey: 'expiredBody',
    });
    expect(viTrips.notice.expiredTitle).toBeTruthy();
    expect(viTrips.notice.expiredBody).toBeTruthy();
  });
});

describe('closedNotice — chuyến đã khép (cùng câu chữ với TripClosedView của web)', () => {
  it('hoàn thành ⇒ xanh; hỏng do một bên ⇒ đỏ; không ai có lỗi ⇒ vàng', () => {
    expect(closedNotice(CUSTOMER_TRIP_STAGE.COMPLETED)?.tone).toBe('success');
    expect(closedNotice(CUSTOMER_TRIP_STAGE.CANCELLED)?.tone).toBe('danger');
    expect(closedNotice(CUSTOMER_TRIP_STAGE.REJECTED)?.tone).toBe('danger');
    expect(closedNotice(CUSTOMER_TRIP_STAGE.NO_SHOW)?.tone).toBe('danger');
    expect(closedNotice(CUSTOMER_TRIP_STAGE.EXPIRED)?.tone).toBe('warning');
    expect(closedNotice(CUSTOMER_TRIP_STAGE.SLOT_TAKEN)?.tone).toBe('warning');
  });

  it('chặng còn chạy không có thẻ trạng thái kết cục', () => {
    expect(closedNotice(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)).toBeNull();
    expect(closedNotice(CUSTOMER_TRIP_STAGE.ACTIVE)).toBeNull();
  });

  it('mọi khoá trả ra đều có trong `Trips.closed.status`', () => {
    for (const stage of CUSTOMER_TRIP_STAGE_VALUES) {
      const notice = closedNotice(stage);
      if (!notice) continue;
      expect(viTrips.closed.status).toHaveProperty(notice.titleKey);
      expect(viTrips.closed.status).toHaveProperty(notice.bodyKey);
    }
  });
});
