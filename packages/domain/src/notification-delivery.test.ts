import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PUSH_DATA_KEY,
  PUSH_PRIORITY,
  ANDROID_NOTIFICATION_CHANNEL,
} from '@xeprime/types';
import {
  NOTIFICATION_AUDIENCE,
  androidChannelFor,
  chatNotificationCopy,
  notificationDeepLink,
  pushCollapseKey,
  pushDataPayload,
  pushPriority,
} from './notification-delivery';

describe('notificationDeepLink', () => {
  it('khách đi thẳng tới chuyến, cả khi thông báo còn ở giai đoạn yêu cầu', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/trips/BK1');
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: 'RQ1' },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/trips/RQ1');
  });

  it('gian hàng đi tới đúng đơn, còn yêu cầu thì dừng ở hộp thư', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
    ).toBe('/manage/bookings/BK1');
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST, targetId: 'RQ1' },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
    ).toBe('/manage/requests');
  });

  /**
   * Hội thoại có HAI địa chỉ, và đó là chuyện sống còn chứ không phải thẩm mỹ:
   * `resolveAccess(userId, id, 'customer')` từ chối thẳng một nhân viên gian hàng, nên một đích
   * dùng chung sẽ mở ra màn "không có quyền" cho đúng nửa số người nhận.
   */
  it('hội thoại dẫn về ĐÚNG hộp thư của từng bề mặt', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: 'CV1' },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/chat/CV1');

    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: 'CV1' },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
    ).toBe('/manage/chat/CV1');
  });

  it('hội thoại thiếu id thì lùi về đúng hộp thư của bề mặt đó', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: null },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/chat');

    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: null },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
    ).toBe('/manage/chat');
  });

  it('thiếu targetId thì lùi về danh sách, không dựng "/trips/undefined"', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: null },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/trips');
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION, targetId: undefined },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBe('/chat');
  });

  it('targetId không phải id thì bị bỏ, không ghép vào đường dẫn', () => {
    // Một `targetId` bẩn không được biến thành một đường dẫn khác — kể cả khi nó tới từ dữ liệu
    // cũ chứ không phải từ kẻ tấn công.
    for (const dirty of ['../../manage/shop', 'a/b', 'x?y=1', 'has space', '']) {
      expect(
        notificationDeepLink(
          { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: dirty },
          NOTIFICATION_AUDIENCE.CUSTOMER,
        ),
      ).toBe('/trips');
    }
  });

  it('loại không thuộc bề mặt đó thì không có đích', () => {
    expect(
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.TENANT, targetId: 'T1' },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ).toBeNull();
    expect(
      notificationDeepLink({ targetType: null, targetId: null }, NOTIFICATION_AUDIENCE.MANAGE),
    ).toBeNull();
  });

  it('mọi đường dẫn trả về đều là đường dẫn NỘI BỘ', () => {
    const all = [
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.VEHICLE, targetId: 'V1' },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.TENANT, targetId: 'T1' },
        NOTIFICATION_AUDIENCE.MANAGE,
      ),
      notificationDeepLink(
        { targetType: NOTIFICATION_TARGET_TYPE.REVIEW, targetId: 'RV1' },
        NOTIFICATION_AUDIENCE.CUSTOMER,
      ),
    ];
    for (const path of all) {
      expect(path).toMatch(/^\/[^/\\]/);
    }
  });
});

describe('pushCollapseKey', () => {
  it('gộp theo hội thoại — mười tin là MỘT dòng trên khay', () => {
    expect(
      pushCollapseKey(NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED, {
        targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION,
        targetId: 'CV1',
      }),
    ).toBe('conversation:CV1');
  });

  it('đơn thuê MỚI không gộp, nhưng cập nhật trạng thái thì có', () => {
    const target = { targetType: NOTIFICATION_TARGET_TYPE.BOOKING, targetId: 'BK1' };
    expect(pushCollapseKey(NOTIFICATION_TYPE.BOOKING_CREATED, target)).toBeNull();
    expect(pushCollapseKey(NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED, target)).toBe('booking:BK1');
  });

  it('hai lần nhắc sắp hết hạn của cùng một yêu cầu gộp làm một', () => {
    expect(
      pushCollapseKey(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING, {
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: 'RQ1',
      }),
    ).toBe('request:RQ1');
    expect(
      pushCollapseKey(NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED, {
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: 'RQ1',
      }),
    ).toBeNull();
  });

  it('thiếu id thì không gộp — gộp theo một khoá rỗng là gộp mọi thứ vào nhau', () => {
    expect(
      pushCollapseKey(NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED, {
        targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION,
        targetId: null,
      }),
    ).toBeNull();
  });
});

describe('pushPriority + androidChannelFor', () => {
  it('tin cần trả lời ngay mới được đánh thức máy', () => {
    expect(pushPriority(NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED)).toBe(PUSH_PRIORITY.HIGH);
    expect(pushPriority(NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED)).toBe(PUSH_PRIORITY.HIGH);
    expect(pushPriority(NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING)).toBe(PUSH_PRIORITY.NORMAL);
    expect(pushPriority(NOTIFICATION_TYPE.REVIEW_RECEIVED)).toBe(PUSH_PRIORITY.NORMAL);
  });

  it('chat có kênh Android riêng để tắt được mà không tắt tin về đơn', () => {
    expect(androidChannelFor(NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED)).toBe(
      ANDROID_NOTIFICATION_CHANNEL.MESSAGES,
    );
    expect(androidChannelFor(NOTIFICATION_TYPE.BOOKING_CREATED)).toBe(
      ANDROID_NOTIFICATION_CHANNEL.OPERATIONS,
    );
  });
});

describe('pushDataPayload', () => {
  it('chỉ ba trường, toàn bộ là string', () => {
    const data = pushDataPayload({
      notificationId: 'N1',
      type: NOTIFICATION_TYPE.BOOKING_CREATED,
      url: '/manage/bookings/BK1',
    });
    expect(data).toEqual({
      [PUSH_DATA_KEY.NOTIFICATION_ID]: 'N1',
      [PUSH_DATA_KEY.TYPE]: NOTIFICATION_TYPE.BOOKING_CREATED,
      [PUSH_DATA_KEY.URL]: '/manage/bookings/BK1',
    });
    for (const value of Object.values(data)) expect(typeof value).toBe('string');
  });

  it('không có đích thì bỏ hẳn khoá url — FCM không nhận giá trị null', () => {
    const data = pushDataPayload({
      notificationId: 'N1',
      type: NOTIFICATION_TYPE.REVIEW_RECEIVED,
      url: null,
    });
    expect(PUSH_DATA_KEY.URL in data).toBe(false);
  });
});

describe('chatNotificationCopy', () => {
  const base = { senderName: 'Đà Nẵng Prime', text: 'Giá 30k 1 ngày', attachmentCount: 0, messageType: 'text' };

  it('tiêu đề là TÊN phía gửi, nội dung là chính câu tin', () => {
    expect(chatNotificationCopy(base)).toEqual({
      title: 'Đà Nẵng Prime',
      body: 'Giá 30k 1 ngày',
    });
  });

  /**
   * Tên rỗng KHÔNG được biến thành một tiêu đề trống hay `undefined` trên khay — lùi về câu
   * chung, thứ vẫn nói đúng việc đã xảy ra.
   */
  it('không có tên thì lùi về câu chung, nội dung vẫn giữ', () => {
    expect(chatNotificationCopy({ ...base, senderName: '   ' })).toEqual({
      title: 'Bạn có tin nhắn mới',
      body: 'Giá 30k 1 ngày',
    });
  });

  it('tin dài bị cắt ở ranh giới từ, có dấu lược', () => {
    const long = 'xe '.repeat(80).trim();
    const { body } = chatNotificationCopy({ ...base, text: long });
    expect(body.length).toBeLessThanOrEqual(141);
    expect(body.endsWith('…')).toBe(true);
    // Cắt giữa từ đọc như lỗi hiển thị: ký tự trước dấu lược không được là một từ dở dang.
    expect(body).not.toMatch(/x…$/);
  });

  it('tin chỉ có đính kèm mô tả theo LOẠI và SỐ LƯỢNG', () => {
    expect(chatNotificationCopy({ ...base, text: null, attachmentCount: 1, messageType: 'image' }).body).toBe(
      'Đã gửi một ảnh',
    );
    expect(chatNotificationCopy({ ...base, text: null, attachmentCount: 3, messageType: 'image' }).body).toBe(
      'Đã gửi 3 ảnh',
    );
    expect(chatNotificationCopy({ ...base, text: null, attachmentCount: 1, messageType: 'file' }).body).toBe(
      'Đã gửi một tệp',
    );
  });

  /** Khoảng trắng thừa ở hai đầu là chuyện thường của ô nhập — không để nó thành nội dung. */
  it('bỏ khoảng trắng thừa; chuỗi toàn khoảng trắng tính là KHÔNG có chữ', () => {
    expect(chatNotificationCopy({ ...base, text: '  ok bạn  ' }).body).toBe('ok bạn');
    expect(
      chatNotificationCopy({ ...base, text: '   ', attachmentCount: 1, messageType: 'image' }).body,
    ).toBe('Đã gửi một ảnh');
  });
});
