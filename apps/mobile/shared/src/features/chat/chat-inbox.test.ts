import { CHAT_INBOX, CHAT_SIDE } from '@xeprime/types';
import { resolveChatInbox } from './chat-inbox';

/**
 * MỘT tài khoản, MỘT hộp thư (ADR 0053): hộp thư HỢP NHẤT của ADR 0038 điều 10 đã bỏ. Bề mặt khách
 * (app XePrime) hỏi hộp thư khách; bề mặt gian hàng (app Partner — cả chủ xe tuyến hoa hồng lẫn
 * gian hàng tuyến gói) hỏi hộp thư gian hàng. Cùng bộ với `chat-inbox.test.ts` bên web.
 */
describe('resolveChatInbox', () => {
  it('bề mặt khách: hộp thư khách', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER)).toBe(CHAT_INBOX.CUSTOMER);
  });

  it('bề mặt gian hàng: hộp thư gian hàng', () => {
    expect(resolveChatInbox(CHAT_SIDE.SHOP)).toBe(CHAT_INBOX.SHOP);
  });

  it('không còn hộp thư hợp nhất ở bất kỳ bề mặt nào', () => {
    expect([CHAT_SIDE.CUSTOMER, CHAT_SIDE.SHOP].map(resolveChatInbox)).not.toContain(
      CHAT_INBOX.UNIFIED,
    );
  });
});
