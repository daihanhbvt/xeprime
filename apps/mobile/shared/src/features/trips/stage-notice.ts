import { CUSTOMER_TRIP_STAGE, type CustomerTripStage } from '@xeprime/types';

/** Tông của khối giải thích — ánh xạ thẳng sang `<Alert type>` mà web dùng. */
export type StageNoticeTone = 'warning' | 'danger' | 'info';

export interface StageNotice {
  tone: StageNoticeTone;
  /** Khoá trong `Trips.notice` — literal để `t()` còn giữ bảo chứng kiểu. */
  titleKey: 'pendingTitle' | 'rejectedTitle' | 'cancelledTitle' | 'slotTakenTitle' | 'noShowTitle';
  bodyKey: 'pendingBody' | 'rejectedBody' | 'cancelledBody' | 'slotTakenBody' | 'noShowBody';
}

/**
 * CHẶNG → khối giải thích ở màn chi tiết chuyến — hàm THUẦN, soi gương `TerminalNotice` của web.
 *
 * ## Vì sao tách khỏi component
 *
 * Bảng này là một danh sách năm nhánh mà thiếu một nhánh thì màn hình **im lặng** chứ không lỗi:
 * chuyến rơi vào chặng đó chỉ hiện một câu phụ đề rồi hết, và không ai biết vì sao. Đúng điều đã
 * xảy ra với `slot_taken` (ADR 0044 điều 6) khi nó được thêm vào `CUSTOMER_TRIP_STAGE`: phụ đề
 * có, khối giải thích không. Một hàm thuần thì test được từng chặng mà không phải dựng cả màn.
 *
 * ## Tông màu KHÔNG tuỳ hứng
 *
 * Lấy đúng theo bản web: chờ duyệt là `warning` (không phải `info`) vì nó là một VIỆC CHƯA XONG
 * khách cần để mắt — xe chưa được giữ chỗ, và tô xanh làm nó đọc như một thông báo đã ổn. Bị từ
 * chối và vắng mặt là `danger`. Huỷ là `info`.
 *
 * `slot_taken` cũng là `info` chứ không `danger`: không ai từ chối khách cả, chiếc xe chỉ vừa có
 * người đặt xong. Tô đỏ ở đây đọc ra như một sự cố của chính họ.
 *
 * Trả `null` ở mọi chặng đang chạy bình thường — chúng đã có dòng thời gian, không cần nói thêm.
 */
export function stageNotice(stage: CustomerTripStage): StageNotice | null {
  switch (stage) {
    case CUSTOMER_TRIP_STAGE.PENDING_APPROVAL:
      return { tone: 'warning', titleKey: 'pendingTitle', bodyKey: 'pendingBody' };
    case CUSTOMER_TRIP_STAGE.REJECTED:
      return { tone: 'danger', titleKey: 'rejectedTitle', bodyKey: 'rejectedBody' };
    case CUSTOMER_TRIP_STAGE.CANCELLED:
      return { tone: 'info', titleKey: 'cancelledTitle', bodyKey: 'cancelledBody' };
    /*
     * Khung giờ bị khách khác lấy mất (ADR 0044 điều 6) — KHÔNG phải `REJECTED`.
     *
     * Chủ xe không từ chối ai cả, nên câu "chủ xe không thể tiếp nhận yêu cầu này" sẽ đẩy khách
     * đi hỏi lại chủ xe thay vì làm điều duy nhất còn tác dụng: chọn xe khác hoặc đổi thời gian.
     */
    case CUSTOMER_TRIP_STAGE.SLOT_TAKEN:
      return { tone: 'info', titleKey: 'slotTakenTitle', bodyKey: 'slotTakenBody' };
    case CUSTOMER_TRIP_STAGE.NO_SHOW:
      return { tone: 'danger', titleKey: 'noShowTitle', bodyKey: 'noShowBody' };
    default:
      return null;
  }
}
