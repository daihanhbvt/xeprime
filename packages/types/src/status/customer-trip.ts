/**
 * Cách KHÁCH nhìn một chuyến (Wave 11) — view-model, **không phải** một bộ trạng thái mới.
 *
 * Backend vẫn giữ nguyên máy trạng thái vận hành đầy đủ (`BookingRequestStatus` +
 * `BookingStatus`): chủ xe cần phân biệt `reserved` với `confirmed`, `no_show` với `cancelled`.
 * Khách thì không — với khách chỉ có "đang chờ / sắp tới / đang thuê / xong / hỏng". Gộp hai
 * enum kia lại thành một enum mới ở DB là cách chắc chắn nhất để mất thông tin vận hành, nên ở
 * đây là một phép CHIẾU một chiều, tính tại chỗ, không lưu.
 *
 * Hệ quả quan trọng: mọi nơi hiển thị cho khách phải đi qua `customerTripStage()`. Component
 * không được tự đọc `booking.status` rồi tự đoán nhãn — đó là chỗ hai màn bắt đầu kể hai câu
 * chuyện khác nhau.
 */

import { BOOKING_STATUS, BOOKING_STATUS_VALUES, type BookingStatus } from './booking';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_VALUES,
  type BookingRequestStatus,
} from './booking-request';
import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Người đang xem đứng ở PHÍA NÀO của chuyến này.
 *
 * Cùng một con người vừa cho thuê vừa đi thuê (ADR 0014), và "Chuyến của tôi" trộn cả hai vào
 * MỘT danh sách — nên mỗi dòng phải tự nói mình thuộc phía nào. Không suy ở client bằng cách so
 * id: server đã biết chắc, còn client thì phải đoán từ dữ liệu đã bị che bớt.
 */
export const TRIP_ROLE = {
  /** Xe của tôi, khách của tôi — tôi là người duyệt và bàn giao. */
  HOST: 'host',
  /** Tôi là người đi thuê xe của người khác. */
  RENTER: 'renter',
} as const;

export type TripRole = (typeof TRIP_ROLE)[keyof typeof TRIP_ROLE];
export const TRIP_ROLE_VALUES = Object.values(TRIP_ROLE) as TripRole[];

export function isTripRole(value: unknown): value is TripRole {
  return typeof value === 'string' && (TRIP_ROLE_VALUES as string[]).includes(value);
}

export const CUSTOMER_TRIP_STAGE = {
  /** Đã gửi yêu cầu, chủ xe chưa trả lời. Chưa có đơn thuê. */
  PENDING_APPROVAL: 'pending_approval',
  /**
   * **Đã được nhận · chờ CHÍNH KHÁCH thanh toán tiền giữ chỗ** (ADR 0044 điều 2).
   *
   * Cố ý KHÔNG gộp vào `PENDING_APPROVAL`. Hai chặng nhìn giống nhau ("chưa xong") nhưng
   * **việc cần làm tiếp thuộc về hai người khác nhau**: ở đây quả bóng đang ở chân khách và
   * màn hình phải có số tiền, mã QR cùng đồng hồ đếm ngược; ở kia khách chỉ có thể chờ.
   * Gộp lại là giấu mất việc duy nhất khách phải làm để có xe.
   *
   * Cũng KHÔNG phải `READY`: chưa có đơn thuê nào, và gọi một chuyến chưa thu được tiền là
   * "sẵn sàng" chính là điều luồng mới sinh ra để chấm dứt.
   */
  AWAITING_HOLD: 'awaiting_hold',
  /**
   * **LEGACY (ADR 0039)** — khách đã trả tiền TRƯỚC khi có ai duyệt, đang chờ chủ xe xác nhận.
   *
   * Luồng hiện hành không dẫn tới chặng này nữa (tiền chỉ thu sau khi chuyến đã được nhận, nên
   * "đã trả đủ" đồng nghĩa với "có đơn"). Giữ lại để những chuyến sinh trong thời gian ADR 0039
   * còn hiệu lực đọc đúng tình trạng của chúng: XePrime đang giữ tiền và chủ xe còn phải quyết.
   */
  PENDING_APPROVAL_PAID: 'pending_approval_paid',
  /** Chủ xe đã nhận, chưa tới giờ giao xe. */
  READY: 'ready',
  /** Xe đã ở với khách. */
  ACTIVE: 'active',
  /** Đã trả xe, chuyến khép lại. */
  COMPLETED: 'completed',
  /** Khách/chủ xe huỷ trước khi chuyến bắt đầu. */
  CANCELLED: 'cancelled',
  /** Chủ xe từ chối yêu cầu, hoặc yêu cầu quá hạn phản hồi. */
  REJECTED: 'rejected',
  /**
   * Khung giờ đã thuộc về một khách khác — ADR 0044 điều 6.
   *
   * Chặng RIÊNG chứ không gộp vào `REJECTED` hay `CANCELLED`: cả hai nhãn kia đều nói sai về
   * việc vừa xảy ra ("chủ xe không muốn nhận bạn" / "chuyến của bạn bị huỷ"), trong khi sự thật
   * là chiếc xe vừa được đặt xong bởi người hỏi trước — và điều khách cần biết là **hãy chọn xe
   * khác hoặc khung giờ khác**, không phải đi hỏi lại chủ xe.
   */
  SLOT_TAKEN: 'slot_taken',
  /** Tới giờ mà khách không nhận xe. */
  NO_SHOW: 'no_show',
} as const;

export type CustomerTripStage = (typeof CUSTOMER_TRIP_STAGE)[keyof typeof CUSTOMER_TRIP_STAGE];

export const CUSTOMER_TRIP_STAGE_VALUES = Object.values(CUSTOMER_TRIP_STAGE) as CustomerTripStage[];

export const CUSTOMER_TRIP_STAGE_META: Readonly<Record<CustomerTripStage, StatusMeta>> = {
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL]: {
    label: 'Chờ xác nhận',
    color: STATUS_COLOR.WAITING,
  },
  [CUSTOMER_TRIP_STAGE.AWAITING_HOLD]: {
    label: 'Đã được nhận · chờ thanh toán',
    color: STATUS_COLOR.WARNING,
  },
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID]: {
    label: 'Đã thanh toán · chờ chủ xe xác nhận',
    color: STATUS_COLOR.WAITING,
  },
  [CUSTOMER_TRIP_STAGE.READY]: { label: 'Sẵn sàng', color: STATUS_COLOR.INFO },
  [CUSTOMER_TRIP_STAGE.ACTIVE]: { label: 'Đang thuê', color: STATUS_COLOR.PROCESSING },
  [CUSTOMER_TRIP_STAGE.COMPLETED]: { label: 'Hoàn thành', color: STATUS_COLOR.SUCCESS },
  [CUSTOMER_TRIP_STAGE.CANCELLED]: {
    label: 'Đã hủy chuyến',
    color: STATUS_COLOR.NEUTRAL,
  },
  [CUSTOMER_TRIP_STAGE.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
  [CUSTOMER_TRIP_STAGE.SLOT_TAKEN]: {
    label: 'Xe đã có khách khác',
    color: STATUS_COLOR.NEUTRAL,
  },
  [CUSTOMER_TRIP_STAGE.NO_SHOW]: { label: 'Không nhận xe', color: STATUS_COLOR.DANGER },
};

/**
 * Chiếu trạng thái vận hành → chặng của khách.
 *
 * `bookingStatus` là nguồn ưu tiên: một khi đơn thuê đã tồn tại thì trạng thái yêu cầu chỉ còn
 * là lịch sử (`converted_to_booking` đứng yên trong khi đơn chạy tiếp).
 */
export function customerTripStage(input: {
  requestStatus: BookingRequestStatus;
  bookingStatus: BookingStatus | null;
}): CustomerTripStage {
  if (input.bookingStatus) {
    switch (input.bookingStatus) {
      case BOOKING_STATUS.RESERVED:
      case BOOKING_STATUS.CONFIRMED:
        return CUSTOMER_TRIP_STAGE.READY;
      case BOOKING_STATUS.ACTIVE:
        return CUSTOMER_TRIP_STAGE.ACTIVE;
      case BOOKING_STATUS.COMPLETED:
        return CUSTOMER_TRIP_STAGE.COMPLETED;
      case BOOKING_STATUS.NO_SHOW:
        return CUSTOMER_TRIP_STAGE.NO_SHOW;
      case BOOKING_STATUS.CANCELLED:
        return CUSTOMER_TRIP_STAGE.CANCELLED;
    }
  }

  switch (input.requestStatus) {
    case BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL:
      return CUSTOMER_TRIP_STAGE.PENDING_APPROVAL;
    case BOOKING_REQUEST_STATUS.AWAITING_HOLD:
      return CUSTOMER_TRIP_STAGE.AWAITING_HOLD;
    case BOOKING_REQUEST_STATUS.HOLD_PAID:
      return CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID;
    // `hold_expired` xếp cùng `cancelled_by_customer` chứ không phải `REJECTED`: hết hạn chuyển
    // giữ chỗ là chuyến KHÔNG THÀNH, không ai từ chối khách cả — chỗ chỉ được nhả ra. Xếp vào
    // `REJECTED` là đổ lỗi cho chủ xe về một việc họ không dính vào.
    case BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER:
    case BOOKING_REQUEST_STATUS.HOLD_EXPIRED:
      return CUSTOMER_TRIP_STAGE.CANCELLED;
    case BOOKING_REQUEST_STATUS.REJECTED_BY_HOST:
    case BOOKING_REQUEST_STATUS.EXPIRED:
      return CUSTOMER_TRIP_STAGE.REJECTED;
    case BOOKING_REQUEST_STATUS.SLOT_TAKEN:
      return CUSTOMER_TRIP_STAGE.SLOT_TAKEN;
    /*
     * Gian hàng RÚT LẠI một chuyến đã nhận (ADR 0044 điều 7) — chiếu về `CANCELLED`, không về
     * `REJECTED`: với khách, 'chuyến của bạn bị huỷ' và 'yêu cầu của bạn bị từ chối' là hai
     * chuyện khác nhau, và ở đây họ ĐÃ được nhận. Ai huỷ thì đọc từ `cancellation` trên DTO
     * chuyến, không đoán từ chặng.
     */
    case BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST:
      return CUSTOMER_TRIP_STAGE.CANCELLED;
    // Đã duyệt/đã chuyển đơn mà chưa thấy đơn: dữ liệu cũ hoặc đơn bị xoá mềm. Coi như sắp tới
    // thay vì ném lỗi — khách không có gì để làm với một sự cố dữ liệu nội bộ.
    case BOOKING_REQUEST_STATUS.APPROVED_BY_HOST:
    case BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING:
      return CUSTOMER_TRIP_STAGE.READY;
  }
}

// ── Dòng thời gian hai mốc ───────────────────────────────────────────────────

/**
 * Khách chỉ thấy ĐÚNG hai mốc. `Đã giao xe` / `Đang thuê` là **trạng thái hiện tại**, không
 * phải một mốc thứ ba: thêm mốc nghĩa là dòng thời gian dài ra theo tiến trình vận hành và
 * không còn ở một hàng ngang trên màn 390px.
 */
export interface CustomerTripTimelineState {
  /** Có dựng dòng thời gian không. Yêu cầu chờ duyệt và các kết cục hỏng thì KHÔNG. */
  visible: boolean;
  confirmedDone: boolean;
  completedDone: boolean;
}

export function customerTripTimeline(stage: CustomerTripStage): CustomerTripTimelineState {
  switch (stage) {
    case CUSTOMER_TRIP_STAGE.READY:
    case CUSTOMER_TRIP_STAGE.ACTIVE:
      return { visible: true, confirmedDone: true, completedDone: false };
    case CUSTOMER_TRIP_STAGE.COMPLETED:
      return { visible: true, confirmedDone: true, completedDone: true };
    // Chờ duyệt: chưa có gì để "đã xác nhận". Huỷ/từ chối/không nhận xe: chuyến KHÔNG đi hết
    // đường, đánh dấu mốc nào cũng là nói dối — các trạng thái đó có khối riêng của chúng.
    default:
      return { visible: false, confirmedDone: false, completedDone: false };
  }
}

/** Chặng đã khép lại — không còn hành động vận hành nào của khách. */
export function isCustomerTripClosed(stage: CustomerTripStage): boolean {
  return (
    stage === CUSTOMER_TRIP_STAGE.COMPLETED ||
    stage === CUSTOMER_TRIP_STAGE.CANCELLED ||
    stage === CUSTOMER_TRIP_STAGE.REJECTED ||
    stage === CUSTOMER_TRIP_STAGE.SLOT_TAKEN ||
    stage === CUSTOMER_TRIP_STAGE.NO_SHOW
  );
}

// ── Bộ lọc danh sách ─────────────────────────────────────────────────────────

/**
 * Tab lọc trên màn `Chuyến của tôi` — **đúng hai tab**.
 *
 * Bản trước có sáu (`Tất cả` + bốn chặng + `Đã hủy`) và đó là một bản sao của máy trạng thái
 * vận hành đem dán lên mặt khách. Khách chỉ hỏi hai câu: *"chuyến nào tôi còn phải lo?"* và
 * *"chuyến cũ của tôi đâu?"*. Mọi thứ tinh vi hơn (chờ duyệt · chờ chuyển giữ chỗ · sắp tới ·
 * đang thuê) đã có **nhãn chặng trên từng thẻ** nói rồi — nói lại bằng tab chỉ khiến người dùng
 * phải mở bốn tab mới biết mình có bao nhiêu chuyến, và trên màn 390px thì dải tab bắt đầu cuộn
 * ngang.
 *
 * Hai tab này **phủ kín và không giao nhau** theo đúng `isCustomerTripClosed` — không có chuyến
 * nào rơi ra ngoài cả hai, nên `Tất cả` cũng mất luôn lý do tồn tại.
 */
export const CUSTOMER_TRIP_FILTER = {
  /** Chuyến còn đang chạy: chờ duyệt · chờ chuyển giữ chỗ · sắp tới · đang thuê. */
  CURRENT: 'current',
  /** Chuyến đã khép: hoàn thành · huỷ · bị từ chối · không nhận xe. */
  HISTORY: 'history',
} as const;

export type CustomerTripFilter = (typeof CUSTOMER_TRIP_FILTER)[keyof typeof CUSTOMER_TRIP_FILTER];

export const CUSTOMER_TRIP_FILTER_VALUES = Object.values(
  CUSTOMER_TRIP_FILTER,
) as CustomerTripFilter[];

/**
 * Tab mở sẵn khi vào màn — nguồn CHUNG cho web (giá trị ngầm định của `?filter=`), native và
 * backend (query rỗng). Ba nơi tự chọn mặc định riêng là ba nơi có thể lệch nhau.
 */
export const CUSTOMER_TRIP_FILTER_DEFAULT: CustomerTripFilter = CUSTOMER_TRIP_FILTER.CURRENT;

export const CUSTOMER_TRIP_FILTER_LABEL: Readonly<Record<CustomerTripFilter, string>> = {
  [CUSTOMER_TRIP_FILTER.CURRENT]: 'Chuyến hiện tại',
  [CUSTOMER_TRIP_FILTER.HISTORY]: 'Lịch sử chuyến',
};

/**
 * Chặng nào thuộc tab nào — dùng chung cho cả đếm ở server lẫn nhãn ở client.
 *
 * Suy ra TỪ `isCustomerTripClosed` chứ không liệt kê tay: thêm một chặng mới vào
 * `CUSTOMER_TRIP_STAGE` là nó tự rơi vào đúng một trong hai tab, không có đường nào để quên.
 */
export const CUSTOMER_TRIP_FILTER_STAGES: Readonly<
  Record<CustomerTripFilter, readonly CustomerTripStage[]>
> = {
  [CUSTOMER_TRIP_FILTER.CURRENT]: CUSTOMER_TRIP_STAGE_VALUES.filter(
    (stage) => !isCustomerTripClosed(stage),
  ),
  [CUSTOMER_TRIP_FILTER.HISTORY]: CUSTOMER_TRIP_STAGE_VALUES.filter(isCustomerTripClosed),
};

export function isCustomerTripFilter(value: unknown): value is CustomerTripFilter {
  return typeof value === 'string' && (CUSTOMER_TRIP_FILTER_VALUES as string[]).includes(value);
}

// ── Khách tự huỷ chuyến ──────────────────────────────────────────────────────

/**
 * Chặng mà KHÁCH còn tự huỷ được — mốc là **xe chưa rời bãi**.
 *
 * Trước lúc giao xe, huỷ không gây thiệt hại vận hành nào: yêu cầu chờ duyệt vốn chưa chiếm
 * lịch, còn đơn đã duyệt thì nhả lịch ra là xe lại nhận khách khác được. Sau khi đã giao xe thì
 * khác hẳn — xe đang ở ngoài đường, việc cần làm là gọi cho chủ xe chứ không phải bấm một nút.
 *
 * Đây là NGUỒN CHUNG cho cả hai phía: nút ở `/trips` ẩn/hiện theo nó, và
 * `CustomerTripsService.cancel` chặn theo nó. Backend vẫn là nơi chốt (kiểm lại trong
 * transaction, có điều kiện trạng thái trong WHERE) — hằng số này chỉ giữ cho hai bên đừng
 * nói hai luật khác nhau.
 */
export const CUSTOMER_CANCELLABLE_STAGES: readonly CustomerTripStage[] = [
  CUSTOMER_TRIP_STAGE.PENDING_APPROVAL,
  /*
   * Đã được nhận, đang chờ khách thanh toán (ADR 0044). Huỷ là nhả chỗ và đóng khoản chờ; phần
   * đã chuyển dở (hold `underpaid`) đi theo đường hoàn thường.
   */
  CUSTOMER_TRIP_STAGE.AWAITING_HOLD,
  /*
   * LEGACY ADR 0039 — đã trả đủ, đang chờ gian hàng nhận. Huỷ được, và số tiền quay về theo
   * đúng mốc `free_cancel_until` đã đóng băng trên hold; không có luật riêng cho chặng này.
   */
  CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID,
  CUSTOMER_TRIP_STAGE.READY,
];

export function canCustomerCancelTrip(stage: CustomerTripStage): boolean {
  return CUSTOMER_CANCELLABLE_STAGES.includes(stage);
}

/**
 * Chặng mà CHỦ XE còn một quyết định để bấm ở màn chi tiết chuyến (ADR 0045 điều 1).
 *
 * Tồn tại vì màn đó trước đây hỏi `respondBy != null`, và từ ADR 0044 câu hỏi ấy trả lời sai:
 * `respondBy` KHÔNG bị xoá khi chủ xe nhận chuyến, nên chính họ nhìn thấy nút "Duyệt" cho một
 * chuyến mình vừa duyệt. Chặng thì nói đúng bóng đang ở chân ai.
 *
 * Ba chặng, nhưng KHÔNG cùng một bộ nút — `canHostCancelTrip` phân biệt tiếp:
 *
 *   · `pending_approval` và `pending_approval_paid` (LEGACY ADR 0039) — chủ xe còn phải quyết:
 *     **Duyệt** hoặc **Từ chối**;
 *   · `awaiting_hold` — đã nhận, đang chờ khách trả tiền. Lối duy nhất còn lại là **Huỷ**.
 */
export const HOST_DECIDABLE_STAGES: readonly CustomerTripStage[] = [
  CUSTOMER_TRIP_STAGE.PENDING_APPROVAL,
  CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID,
  CUSTOMER_TRIP_STAGE.AWAITING_HOLD,
];

export function canHostDecideTrip(stage: CustomerTripStage): boolean {
  return HOST_DECIDABLE_STAGES.includes(stage);
}

/**
 * Chặng mà việc của chủ xe là HUỶ chứ không phải duyệt/từ chối.
 *
 * Chỉ một chặng, nhưng nó là một hàm chứ không phải một phép so viết thẳng ở component: ranh
 * giới "từ chối" ↔ "huỷ" là ranh giới TIỀN (ADR 0045 điều 1), và hai bề mặt đang hỏi nó — màn
 * chuyến và hộp thư gian hàng. Hai phép so chép tay sẽ lệch nhau vào ngày có chặng thứ hai.
 */
export function canHostCancelTrip(stage: CustomerTripStage): boolean {
  return stage === CUSTOMER_TRIP_STAGE.AWAITING_HOLD;
}

/**
 * Trạng thái THẬT ở DB ứng với mỗi tab chuyến — suy NGƯỢC từ phép chiếu `customerTripStage`.
 *
 * Trước 15/09/2026 bảng này sống trong `CustomerTripsService`. Nó chuyển lên đây vì nơi thứ hai
 * cần đúng phép suy ấy: `/auth/me` phải đếm "chuyến đi thuê CHƯA KHÉP" để biết có giữ menu
 * Chuyến cho một tài khoản gian hàng hay không (quy tắc chuyển tiếp khi nâng gói giữa chuyến).
 *
 * Chép sang một bản thứ hai thì hai nơi lệch nhau vào đúng ngày ai đó thêm một trạng thái, và
 * hậu quả là một người bị GIẤU MẤT chuyến đang chạy của chính mình.
 *
 * Không liệt kê tay: mỗi trạng thái vận hành được đem chiếu ra CHẶNG rồi hỏi chặng đó thuộc tab
 * nào — thêm trạng thái mới là nó tự vào đúng chỗ.
 */
export interface CustomerTripStatusSets {
  bookingStatuses: BookingStatus[];
  requestStatuses: BookingRequestStatus[];
}

export function customerTripStatusesFor(
  stages: readonly CustomerTripStage[],
): CustomerTripStatusSets {
  return {
    bookingStatuses: BOOKING_STATUS_VALUES.filter((status) =>
      stages.includes(
        // Yêu cầu đã sinh đơn thì trạng thái của nó chỉ còn là lịch sử — phép chiếu bỏ qua.
        customerTripStage({
          requestStatus: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
          bookingStatus: status,
        }),
      ),
    ),
    requestStatuses: BOOKING_REQUEST_STATUS_VALUES.filter((status) =>
      stages.includes(customerTripStage({ requestStatus: status, bookingStatus: null })),
    ),
  };
}

/** Trạng thái của chuyến CHƯA KHÉP — tab "đang diễn ra". */
export const OPEN_CUSTOMER_TRIP_STATUSES: CustomerTripStatusSets = customerTripStatusesFor(
  CUSTOMER_TRIP_STAGE_VALUES.filter((stage) => !isCustomerTripClosed(stage)),
);
