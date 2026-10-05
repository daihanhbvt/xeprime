import { describe, expect, it } from 'vitest';
import { CHAT_INBOX, CHAT_SIDE } from '@xeprime/types';

import { resolveChatInbox } from './chat-inbox';

/**
 * Hộp thư theo BỀ MẶT (ADR 0053): site khách đọc hộp thư khách, site partner đọc hộp thư gian hàng.
 * Không bề mặt nào hợp nhất hai vai nữa — hai vai là hai tài khoản.
 */
describe('resolveChatInbox', () => {
  it('site khách → hộp thư khách', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER)).toBe(CHAT_INBOX.CUSTOMER);
  });

  it('site partner → hộp thư gian hàng', () => {
    expect(resolveChatInbox(CHAT_SIDE.SHOP)).toBe(CHAT_INBOX.SHOP);
  });

  it('không bề mặt nào trả hộp thư hợp nhất', () => {
    for (const side of [CHAT_SIDE.CUSTOMER, CHAT_SIDE.SHOP]) {
      expect(resolveChatInbox(side)).not.toBe(CHAT_INBOX.UNIFIED);
    }
  });
});
