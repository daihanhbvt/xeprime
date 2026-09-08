import { describe, expect, it } from 'vitest';
import {
  CHAT_SEND_STATE,
  compareMessages,
  groupThreadMessages,
  markThreadMessageFailed,
  mergeThreadMessages,
  removeThreadMessage,
  type ThreadMessage,
} from './chat-thread';

interface Msg {
  id: string;
  sentAt: string;
  clientMessageId?: string | null;
  text: string;
  senderUserId: string | null;
  senderName: string | null;
}

const msg = (over: Partial<Msg> & Pick<Msg, 'id' | 'sentAt'>): Msg => ({
  text: over.id,
  senderUserId: 'u1',
  senderName: 'Người gửi',
  clientMessageId: null,
  ...over,
});

const sent = (m: Msg): ThreadMessage<Msg> => ({ message: m, state: CHAT_SEND_STATE.SENT });
const ids = (entries: readonly ThreadMessage<Msg>[]) => entries.map((e) => e.message.id);

describe('compareMessages', () => {
  it('sắp theo sentAt trước', () => {
    const a = msg({ id: 'B', sentAt: '2026-01-01T10:00:00.000Z' });
    const b = msg({ id: 'A', sentAt: '2026-01-01T10:00:01.000Z' });
    expect(compareMessages(a, b)).toBeLessThan(0);
  });

  it('trùng sentAt thì id phân định — cùng quy tắc với cursor keyset ở server', () => {
    const a = msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' });
    const b = msg({ id: 'B', sentAt: '2026-01-01T10:00:00.000Z' });
    expect(compareMessages(a, b)).toBeLessThan(0);
    expect(compareMessages(b, a)).toBeGreaterThan(0);
    expect(compareMessages(a, a)).toBe(0);
  });
});

describe('mergeThreadMessages', () => {
  it('không nhân đôi khi REST trả lại tin đã có', () => {
    const first = [sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' }))];
    const merged = mergeThreadMessages(first, [
      msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' }),
      msg({ id: 'B', sentAt: '2026-01-01T10:00:01.000Z' }),
    ]);
    expect(ids(merged)).toEqual(['A', 'B']);
  });

  /** Cái bẫy chính: bản lạc quan chưa có id server, khớp theo id sẽ để cả hai cùng tồn tại. */
  it('bản server THAY bản lạc quan cùng clientMessageId, không cộng thêm', () => {
    const optimistic: ThreadMessage<Msg>[] = [
      {
        message: msg({ id: 'tmp-1', sentAt: '2026-01-01T10:00:00.000Z', clientMessageId: 'CM1' }),
        state: CHAT_SEND_STATE.PENDING,
      },
    ];

    const merged = mergeThreadMessages(optimistic, [
      msg({ id: 'REAL-1', sentAt: '2026-01-01T10:00:00.500Z', clientMessageId: 'CM1' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.message.id).toBe('REAL-1');
    expect(merged[0]!.state).toBe(CHAT_SEND_STATE.SENT);
  });

  it('gộp lại lần nữa với chính bản server không sinh thêm bản sao', () => {
    const server = msg({ id: 'REAL-1', sentAt: '2026-01-01T10:00:00.500Z', clientMessageId: 'CM1' });
    const once = mergeThreadMessages([], [server]);
    const twice = mergeThreadMessages(once, [server]);
    expect(twice).toHaveLength(1);
  });

  it('tin đến muộn hơn nhưng CŨ hơn được xếp đúng chỗ, không nối vào đuôi', () => {
    const current = [
      sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' })),
      sent(msg({ id: 'C', sentAt: '2026-01-01T10:00:02.000Z' })),
    ];
    const merged = mergeThreadMessages(current, [
      msg({ id: 'B', sentAt: '2026-01-01T10:00:01.000Z' }),
    ]);
    expect(ids(merged)).toEqual(['A', 'B', 'C']);
  });

  it('tin gửi hỏng KHÔNG bị lượt refetch xoá mất', () => {
    const failed: ThreadMessage<Msg>[] = [
      {
        message: msg({ id: 'tmp-9', sentAt: '2026-01-01T10:00:05.000Z', clientMessageId: 'CM9' }),
        state: CHAT_SEND_STATE.FAILED,
      },
    ];
    const merged = mergeThreadMessages(failed, [
      msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' }),
    ]);
    expect(ids(merged)).toEqual(['A', 'tmp-9']);
    expect(merged[1]!.state).toBe(CHAT_SEND_STATE.FAILED);
  });

  it('gộp trang tin CŨ (prepend) giữ đúng thứ tự và không trùng', () => {
    const current = [
      sent(msg({ id: 'D', sentAt: '2026-01-01T10:00:03.000Z' })),
      sent(msg({ id: 'E', sentAt: '2026-01-01T10:00:04.000Z' })),
    ];
    const older = [
      msg({ id: 'B', sentAt: '2026-01-01T10:00:01.000Z' }),
      msg({ id: 'C', sentAt: '2026-01-01T10:00:02.000Z' }),
      msg({ id: 'D', sentAt: '2026-01-01T10:00:03.000Z' }), // chồng lấn với trang hiện có
    ];
    expect(ids(mergeThreadMessages(current, older))).toEqual(['B', 'C', 'D', 'E']);
  });

  it('danh sách rỗng đi vào thì trả nguyên bản hiện tại', () => {
    const current = [sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z' }))];
    expect(ids(mergeThreadMessages(current, []))).toEqual(['A']);
  });
});

describe('markThreadMessageFailed / removeThreadMessage', () => {
  const base: ThreadMessage<Msg>[] = [
    {
      message: msg({ id: 'tmp-1', sentAt: '2026-01-01T10:00:00.000Z', clientMessageId: 'CM1' }),
      state: CHAT_SEND_STATE.PENDING,
    },
    sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:01.000Z' })),
  ];

  it('chỉ đổi trạng thái đúng tin, giữ nguyên nội dung', () => {
    const next = markThreadMessageFailed(base, 'CM1');
    expect(next[0]!.state).toBe(CHAT_SEND_STATE.FAILED);
    expect(next[0]!.message.text).toBe('tmp-1');
    expect(next[1]!.state).toBe(CHAT_SEND_STATE.SENT);
  });

  it('gỡ đúng một tin lạc quan', () => {
    expect(ids(removeThreadMessage(base, 'CM1'))).toEqual(['A']);
  });
});

describe('groupThreadMessages', () => {
  const dayOf = (iso: string) => iso.slice(0, 10);
  const options = {
    isMine: (m: Msg) => m.senderUserId === 'me',
    senderKey: (m: Msg) => m.senderUserId ?? 'system',
    senderName: (m: Msg) => m.senderName,
    dayOf,
  };

  it('gộp tin liên tiếp cùng người gửi trong cùng ngày', () => {
    const groups = groupThreadMessages(
      [
        sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z', senderUserId: 'u1' })),
        sent(msg({ id: 'B', sentAt: '2026-01-01T10:00:01.000Z', senderUserId: 'u1' })),
        sent(msg({ id: 'C', sentAt: '2026-01-01T10:00:02.000Z', senderUserId: 'me' })),
      ],
      options,
    );

    expect(groups).toHaveLength(2);
    expect(ids(groups[0]!.entries)).toEqual(['A', 'B']);
    expect(groups[0]!.mine).toBe(false);
    expect(groups[1]!.mine).toBe(true);
  });

  /** Inbox gian hàng: hai nhân viên cùng ở phía shop nhưng là hai người. */
  it('hai nhân viên KHÁC NHAU cùng phía shop vẫn là hai nhóm', () => {
    const groups = groupThreadMessages(
      [
        sent(
          msg({
            id: 'A',
            sentAt: '2026-01-01T10:00:00.000Z',
            senderUserId: 'staff-1',
            senderName: 'Minh',
          }),
        ),
        sent(
          msg({
            id: 'B',
            sentAt: '2026-01-01T10:00:01.000Z',
            senderUserId: 'staff-2',
            senderName: 'Lan',
          }),
        ),
      ],
      options,
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.senderName)).toEqual(['Minh', 'Lan']);
  });

  it('đánh dấu nhóm mở đầu mỗi ngày để vẽ đúng một dải phân cách', () => {
    const groups = groupThreadMessages(
      [
        sent(msg({ id: 'A', sentAt: '2026-01-01T10:00:00.000Z', senderUserId: 'u1' })),
        sent(msg({ id: 'B', sentAt: '2026-01-01T11:00:00.000Z', senderUserId: 'me' })),
        sent(msg({ id: 'C', sentAt: '2026-01-02T09:00:00.000Z', senderUserId: 'u1' })),
      ],
      options,
    );

    expect(groups.map((g) => g.startsDay)).toEqual([true, false, true]);
    expect(groups.map((g) => g.day)).toEqual(['2026-01-01', '2026-01-01', '2026-01-02']);
  });

  it('cùng người gửi nhưng SANG NGÀY thì tách nhóm', () => {
    const groups = groupThreadMessages(
      [
        sent(msg({ id: 'A', sentAt: '2026-01-01T23:59:00.000Z', senderUserId: 'u1' })),
        sent(msg({ id: 'B', sentAt: '2026-01-02T00:01:00.000Z', senderUserId: 'u1' })),
      ],
      options,
    );
    expect(groups).toHaveLength(2);
  });

  it('danh sách rỗng trả về không nhóm nào', () => {
    expect(groupThreadMessages([], options)).toEqual([]);
  });
});
