import { describe, expect, it } from 'vitest';

import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MAX_TOKENS,
  foldSearchText,
  highlightSearchMatch,
  searchFoldTranslateTable,
  searchTokens,
} from './search-text';

/**
 * Lý do ô từ khoá từng bị gỡ là "gõ đúng ý mà không ra xe". Những ca dưới đây chính là các cách
 * khách thật gõ: không dấu, viết hoa, tách/dính chữ và số, bộ gõ phát chữ tổ hợp.
 */
describe('foldSearchText', () => {
  it('bỏ dấu tiếng Việt và hạ chữ thường', () => {
    expect(foldSearchText('Nguyễn Văn Tuấn')).toBe('nguyen van tuan');
    expect(foldSearchText('ĐÀ NẴNG')).toBe('da nang');
    expect(foldSearchText('Ưng Ý')).toBe('ung y');
  });

  it('chữ tổ hợp (NFD) ra cùng kết quả với chữ dựng sẵn', () => {
    const decomposed = 'Nguyễn';
    expect(foldSearchText(decomposed)).toBe(foldSearchText('Nguyễn'));
  });

  it('tách ranh giới chữ ↔ số — VF8, VF-8, VF 8 là một', () => {
    expect(foldSearchText('VinFast VF8')).toBe('vinfast vf 8');
    expect(foldSearchText('VinFast VF-8')).toBe('vinfast vf 8');
    expect(foldSearchText('Mazda CX5')).toBe('mazda cx 5');
    expect(foldSearchText('Hyundai Grand i10')).toBe('hyundai grand i 10');
  });

  it('dấu câu và khoảng trắng thừa gộp thành một dấu cách', () => {
    expect(foldSearchText('  Sài Gòn -- Car!!  ')).toBe('sai gon car');
    expect(foldSearchText('%_\\')).toBe('');
  });

  it('không dựa vào locale: chữ ngoài bảng bị bỏ, không biến thành chữ ASCII', () => {
    // `'İ'.toLowerCase()` của JS ra "i̇", `lower('İ')` của Postgres tuỳ ctype — cả hai đều không
    // được lọt vào, nếu không hai bản sinh đôi sẽ lệch nhau theo cấu hình máy chủ.
    expect(foldSearchText('İ')).toBe('');
    expect(foldSearchText('Ölçü')).toBe('l');
  });

  it('bảng translate 1:1 — mỗi ký tự nguồn có đúng một ký tự đích', () => {
    const [from, to] = searchFoldTranslateTable();
    expect([...from]).toHaveLength([...to].length);
    expect(new Set(from).size).toBe([...from].length);
  });
});

describe('searchTokens', () => {
  it('rỗng / toàn dấu câu ⇒ không có từ nào (không lọc)', () => {
    expect(searchTokens(undefined)).toEqual([]);
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens('  !!! ')).toEqual([]);
  });

  it('bỏ trùng, giữ thứ tự', () => {
    expect(searchTokens('Tuấn tuan TUAN mazda')).toEqual(['tuan', 'mazda']);
  });

  it('có trần số từ và trần độ dài', () => {
    expect(searchTokens('a b c d e f g h')).toHaveLength(SEARCH_QUERY_MAX_TOKENS);
    const long = `${'x'.repeat(SEARCH_QUERY_MAX_LENGTH)}yyy`;
    expect(searchTokens(long)).toEqual(['x'.repeat(SEARCH_QUERY_MAX_LENGTH)]);
  });
});

describe('highlightSearchMatch', () => {
  const marked = (text: string, tokens: string[]) =>
    highlightSearchMatch(text, tokens)
      .filter((p) => p.match)
      .map((p) => p.text);

  it('tô phần ĐẦU từ khớp, giữ nguyên dấu của chuỗi gốc', () => {
    expect(marked('Nguyễn Văn Tuấn', ['tuan'])).toEqual(['Tuấn']);
    expect(marked('Nguyễn Văn Tuấn', ['ng'])).toEqual(['Ng']);
  });

  it('không tô giữa từ — "an" không khớp "Tuấn"', () => {
    expect(marked('Nguyễn Văn Tuấn', ['an'])).toEqual([]);
  });

  it('ranh giới chữ ↔ số là ranh giới từ, như phía server', () => {
    expect(marked('VinFast VF8', ['vf', '8'])).toEqual(['VF8']);
    expect(marked('VinFast VF8', ['8'])).toEqual(['8']);
  });

  it('ghép lại đúng chuỗi gốc', () => {
    const parts = highlightSearchMatch('Sài Gòn Car', ['sai', 'car']);
    expect(parts.map((p) => p.text).join('')).toBe('Sài Gòn Car');
  });

  it('không có từ khoá ⇒ một đoạn không tô', () => {
    expect(highlightSearchMatch('Sài Gòn', [])).toEqual([{ text: 'Sài Gòn', match: false }]);
  });
});
