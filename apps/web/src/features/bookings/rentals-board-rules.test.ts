import { describe, expect, it } from 'vitest';
import { RENTAL_STAGE } from '@/constants/rental-stages';
import { boardDropVerdict } from './rentals-board-rules';

describe('boardDropVerdict — thẻ chỉ sang đúng bước kế', () => {
  it('Cần xử lý → Chờ khách thanh toán và Chờ giao xe → Đang thuê là hai lượt thả hợp lệ', () => {
    expect(boardDropVerdict(RENTAL_STAGE.NEEDS_ACTION, RENTAL_STAGE.AWAITING_PAYMENT)).toBe(
      'allowed',
    );
    expect(boardDropVerdict(RENTAL_STAGE.AWAITING_PICKUP, RENTAL_STAGE.RENTING)).toBe('allowed');
  });

  it('Chờ khách thanh toán → Chờ giao xe bị KHOÁ — chỉ tiền về mới tạo đơn (ADR 0044)', () => {
    expect(boardDropVerdict(RENTAL_STAGE.AWAITING_PAYMENT, RENTAL_STAGE.AWAITING_PICKUP)).toBe(
      'locked',
    );
  });

  it('nhảy cóc, đi lùi, hay kéo từ cột cuối đều không phải bước kế', () => {
    expect(boardDropVerdict(RENTAL_STAGE.NEEDS_ACTION, RENTAL_STAGE.AWAITING_PICKUP)).toBe(
      'not_next',
    );
    expect(boardDropVerdict(RENTAL_STAGE.RENTING, RENTAL_STAGE.AWAITING_PICKUP)).toBe('not_next');
    expect(boardDropVerdict(RENTAL_STAGE.AWAITING_PAYMENT, RENTAL_STAGE.NEEDS_ACTION)).toBe(
      'not_next',
    );
  });

  it('thả lại chỗ cũ', () => {
    expect(boardDropVerdict(RENTAL_STAGE.RENTING, RENTAL_STAGE.RENTING)).toBe('same');
  });
});
