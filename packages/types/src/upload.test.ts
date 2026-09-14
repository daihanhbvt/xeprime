import { describe, expect, it } from 'vitest';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MIME_TYPES,
  validateChatAttachment,
} from './upload';

/**
 * Đính kèm chat — lớp chặn SỚM ở client. Trần thật vẫn ở backend (`@IsIn` + `@Max` +
 * `Content-Length` ký trong URL presign); ở đây chỉ khoá lại rằng client không mời người dùng
 * gửi thứ server sẽ từ chối.
 */
describe('validateChatAttachment', () => {
  it('nhận mọi MIME nằm trong bộ dùng chung', () => {
    for (const type of CHAT_ATTACHMENT_MIME_TYPES) {
      expect(validateChatAttachment({ type, size: 1024 })).toBeNull();
    }
  });

  it('từ chối MIME ngoài danh sách bằng mã `type`', () => {
    expect(validateChatAttachment({ type: 'video/mp4', size: 1024 })).toBe('type');
    expect(validateChatAttachment({ type: '', size: 1024 })).toBe('type');
  });

  it('từ chối tệp vượt trần bằng mã `tooLarge`', () => {
    expect(
      validateChatAttachment({ type: 'application/pdf', size: CHAT_ATTACHMENT_MAX_BYTES + 1 }),
    ).toBe('tooLarge');
  });

  /** Đúng bằng trần vẫn hợp lệ — backend so `>` chứ không `>=`, hai bên phải khớp. */
  it('đúng bằng trần thì vẫn nhận', () => {
    expect(
      validateChatAttachment({ type: 'image/jpeg', size: CHAT_ATTACHMENT_MAX_BYTES }),
    ).toBeNull();
  });

  /** MIME sai được báo TRƯỚC dung lượng: người dùng cần biết lý do đúng, không phải lý do đầu tiên. */
  it('sai cả hai thì báo MIME trước', () => {
    expect(
      validateChatAttachment({ type: 'video/mp4', size: CHAT_ATTACHMENT_MAX_BYTES + 1 }),
    ).toBe('type');
  });
});
