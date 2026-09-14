import { NOTIFICATION_TARGET_TYPE, NOTIFICATION_TYPE, NOTIFICATION_TYPE_VALUES } from '@xeprime/types';
import {
  NOTIFICATION_CONTEXT,
  notificationHref,
  notificationIcon,
} from './notification-display';

/**
 * Đích click-through của một thông báo — cùng bảng phân nhánh với `notificationHref` bên web.
 *
 * Lệch một dòng ở đây nghĩa là cùng một thông báo dẫn tới hai nơi khác nhau trên hai client, và
 * đó là kiểu sai không ai phát hiện cho tới khi khách hỏi "sao bấm vào không thấy gì".
 */
const BOOKING_ID = '01JB9ZK2QW3E4R5T6Y7U8I9O0P';
const CONVERSATION_ID = '01JB9ZCONV000000000000000A';

describe('notificationHref — phía KHÁCH', () => {
  it('`booking` và `booking_request` đều về ĐÚNG chuyến', () => {
    for (const targetType of [
      NOTIFICATION_TARGET_TYPE.BOOKING,
      NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
    ]) {
      expect(
        notificationHref({ targetType, targetId: BOOKING_ID }, NOTIFICATION_CONTEXT.CUSTOMER),
      ).toEqual({ pathname: '/trips/[id]', params: { id: BOOKING_ID } });
    }
  });

  it('thiếu `targetId` thì dừng ở danh sách chuyến, không dựng một đường dẫn hỏng', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: null },
        NOTIFICATION_CONTEXT.CUSTOMER,
      ),
    ).toBe('/trips');
  });

  /**
   * `review` KHÔNG đi theo `targetId`: id của nó là id ĐÁNH GIÁ, không phải id chuyến — dẫn thẳng
   * vào `/trips/<reviewId>` là một trang 404.
   */
  it('`review` dừng ở danh sách chuyến dù CÓ targetId', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.REVIEW, targetId: 'review-1' },
        NOTIFICATION_CONTEXT.CUSTOMER,
      ),
    ).toBe('/trips');
  });

  it('loại không có đích hợp lý thì trả null — chạm vào chỉ đánh dấu đã đọc', () => {
    for (const targetType of [
      NOTIFICATION_TARGET_TYPE.TENANT,
      NOTIFICATION_TARGET_TYPE.VEHICLE,
      NOTIFICATION_TARGET_TYPE.SUPPORT_CASE,
    ]) {
      expect(
        notificationHref({ targetType, targetId: 'x' }, NOTIFICATION_CONTEXT.CUSTOMER),
      ).toBeNull();
    }
    expect(notificationHref({ targetType: null }, NOTIFICATION_CONTEXT.CUSTOMER)).toBeNull();
  });
});

/**
 * Hội thoại là loại DUY NHẤT có đích ở CẢ HAI bề mặt, và hai đích đó không thay nhau được:
 * `GET /conversations/:id?side=customer` trả 403 cho một nhân viên gian hàng (`resolveAccess`
 * bỏ qua nhánh membership khi `expected === customer`). Đây cũng là luật mà `notificationDeepLink`
 * dùng cho `data.url` của thông báo đẩy — hai đường phải nói cùng một thứ.
 */
describe('notificationHref — hội thoại', () => {
  it('khách mở hộp thư khách, gian hàng mở inbox gian hàng', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: CONVERSATION_ID },
        NOTIFICATION_CONTEXT.CUSTOMER,
      ),
    ).toEqual({ pathname: '/chat/[id]', params: { id: CONVERSATION_ID } });

    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: CONVERSATION_ID },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toEqual({ pathname: '/manage/chat/[id]', params: { id: CONVERSATION_ID } });
  });

  it('thiếu id thì lùi về đúng hộp thư của bề mặt đó', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: null },
        NOTIFICATION_CONTEXT.CUSTOMER,
      ),
    ).toBe('/chat');

    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: null },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBe('/manage/chat');
  });
});

describe('notificationHref — khu QUẢN LÝ', () => {
  /**
   * `targetId` phải ĐI TỚI NƠI, không bị vứt dọc đường.
   *
   * Lỗi thật: bản trước chép tay bảng phân nhánh và trả về màn DANH SÁCH cho `booking` và
   * `vehicle`, trong khi `notificationDeepLink` của `@xeprime/domain` — hàm server dùng để đóng
   * băng `data_json.url` — trả màn CHI TIẾT. Cùng một thông báo mở ra hai nơi khác nhau tuỳ
   * người dùng bấm từ khay hệ điều hành hay từ chuông trong app.
   */
  it('booking và vehicle mở đúng màn CHI TIẾT, giữ nguyên targetId', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: BOOKING_ID },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toEqual({ pathname: '/manage/bookings/[id]', params: { id: BOOKING_ID } });

    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.VEHICLE, targetId: BOOKING_ID },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toEqual({ pathname: '/manage/vehicles/[id]', params: { id: BOOKING_ID } });
  });

  /** Hai loại KHÔNG có màn chi tiết ở app — mọi thao tác nằm ngay trong danh sách. */
  it('yêu cầu đặt xe và gian hàng dừng ở màn danh sách, kể cả khi CÓ targetId', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: BOOKING_ID },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBe('/manage/requests');

    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.TENANT, targetId: BOOKING_ID },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBe('/manage/shop');
  });

  /** Thiếu id thì lùi về danh sách, KHÔNG dựng một đường dẫn hỏng. */
  it('thiếu targetId thì lùi về danh sách tương ứng', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: null },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBe('/manage/bookings');

    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.VEHICLE, targetId: null },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBe('/manage/vehicles');
  });

  /** Khu quản lý KHÔNG mở chi tiết một chuyến của khách — đó là bề mặt của người thuê. */
  it('`review` và `support_case` chưa có màn ⇒ null', () => {
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.REVIEW, targetId: 'r1' },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBeNull();
    expect(
      notificationHref(
        { targetType: NOTIFICATION_TARGET_TYPE.SUPPORT_CASE, targetId: 's1' },
        NOTIFICATION_CONTEXT.MANAGE,
      ),
    ).toBeNull();
  });
});

describe('notificationIcon', () => {
  /** Thiếu một loại là một cái chuông trống trơn trên máy người dùng — bắt ở đây, không ở đó. */
  it('MỌI loại thông báo trong contract đều có biểu tượng riêng', () => {
    for (const type of NOTIFICATION_TYPE_VALUES) {
      expect(notificationIcon(type)).toBeTruthy();
      expect(notificationIcon(type)).not.toBe('notifications-outline');
    }
  });

  it('loại lạ (bản backend mới hơn app) rơi về biểu tượng chuông, không nổ', () => {
    expect(notificationIcon('mot_loai_chua_biet')).toBe('notifications-outline');
  });

  it('phân biệt hai chiều ngược nhau: shop TỪ CHỐI và khách RÚT lại', () => {
    expect(notificationIcon(NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED)).not.toBe(
      notificationIcon(NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED),
    );
  });
});
