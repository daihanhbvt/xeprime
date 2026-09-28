import { buildSlots } from './Pagination';

/**
 * Dãy ô của thanh phân trang — thứ quyết định thanh này có VỠ trên màn hẹp hay không.
 *
 * Thanh chỉ đủ chỗ cho 7 ô số cạnh hai mũi tên, nên với 50 hay 500 trang thì dãy vẫn phải dài
 * đúng bấy nhiêu. Đây là bất biến duy nhất mà mắt thường không kiểm được: nó chỉ hỏng ở vài
 * trang cụ thể giữa một dãy dài, và lúc đó thanh đã tràn ra ngoài mép màn.
 */

const MAX_SLOTS = 7;
const render = (current: number, totalPages: number) => buildSlots(current, totalPages).join(' ');

describe('buildSlots', () => {
  it('ít trang thì hiện hết, không chèn dấu "…"', () => {
    // 13 bản ghi, 2 bản ghi mỗi trang → đúng 7 trang, vừa khít không cần rút gọn.
    expect(render(1, 7)).toBe('1 2 3 4 5 6 7');
    expect(render(4, 7)).toBe('1 2 3 4 5 6 7');
  });

  it('nhiều trang thì rút gọn quanh trang đang mở, luôn giữ hai đầu', () => {
    expect(render(1, 50)).toBe('1 2 3 4 5 … 50');
    expect(render(25, 50)).toBe('1 … 24 25 26 … 50');
    expect(render(50, 50)).toBe('1 … 46 47 48 49 50');
  });

  it('KHÔNG dùng "…" để thay cho đúng một trang', () => {
    /*
     * Dấu "…" chiếm một ô y như một con số. Thay cho một trang duy nhất là mất một đích bấm mà
     * không tiết kiệm được chỗ nào — lỗi này chỉ lộ ra ở trang thứ 4 kể từ mỗi đầu dãy.
     */
    expect(render(4, 50)).toBe('1 2 3 4 5 … 50');
    expect(render(47, 50)).toBe('1 … 46 47 48 49 50');
  });

  it('không bao giờ vượt quá số ô mà thanh chứa nổi', () => {
    for (const totalPages of [8, 20, 50, 100, 500]) {
      for (let page = 1; page <= totalPages; page += 1) {
        expect(buildSlots(page, totalPages)).toHaveLength(MAX_SLOTS);
      }
    }
  });

  it('luôn chứa trang đầu, trang cuối và trang đang mở', () => {
    for (const totalPages of [1, 2, 7, 8, 100]) {
      for (let page = 1; page <= totalPages; page += 1) {
        const slots = buildSlots(page, totalPages);
        expect(slots).toContain(1);
        expect(slots).toContain(totalPages);
        expect(slots).toContain(page);
      }
    }
  });

  it('các số luôn tăng dần và không lặp lại', () => {
    for (const totalPages of [9, 33, 100]) {
      for (let page = 1; page <= totalPages; page += 1) {
        const numbers = buildSlots(page, totalPages).filter(
          (slot): slot is number => typeof slot === 'number',
        );
        expect(numbers).toEqual([...new Set(numbers)]);
        expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      }
    }
  });
});
