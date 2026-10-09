/**
 * Từ khoá tìm xe ở chợ — luật DUY NHẤT để so điều khách gõ với tên xe và tên chủ xe/gian hàng.
 *
 * ## Vì sao phải "gấp" chuỗi
 *
 * Ô từ khoá từng bị gỡ (17/08) vì một lý do đúng: `ILIKE '%…%'` trần coi "nguyen" và "Nguyễn"
 * là hai chữ khác nhau, "vf8" và "VF 8" cũng vậy — khách gõ đúng ý mà không ra xe. Gấp chuỗi là
 * đưa cả hai phía về cùng một dạng trước khi so:
 *
 *   1. NFC — cùng một chữ "ễ" có thể tới dưới dạng dựng sẵn hoặc tổ hợp (tuỳ bộ gõ);
 *   2. bỏ dấu tiếng Việt và hạ chữ thường — bằng BẢNG ÁNH XẠ CỐ ĐỊNH, không qua
 *      `toLowerCase()`/`lower()`: hai hàm đó phụ thuộc locale/ctype, và một chữ như "İ" sẽ ra
 *      hai kết quả khác nhau ở Node và ở Postgres;
 *   3. tách ranh giới chữ ↔ số — "VF8", "VF-8", "VF 8" đều thành `vf 8`, "CX5" thành `cx 5`;
 *   4. mọi ký tự còn lại ngoài `[a-z0-9]` thành một dấu cách.
 *
 * ## Bản SINH ĐÔI bằng SQL
 *
 * Dữ liệu đã gấp được lưu sẵn ở DB (`public_listings.search_text`, `tenants.search_name`,
 * `users.search_name`) do trigger tính bằng `xeprime_search_fold()` — migration
 * `20261009170000_marketplace_keyword_search`. Từ khoá thì gấp ở đây. Hai bản phải cho cùng một
 * chuỗi trên mọi đầu vào; `apps/api/test/marketplace-keyword-search.spec.ts` chạy cả hai trên
 * cùng một bộ mẫu và đỏ ngay khi chúng lệch nhau. Sửa một bên thì sửa bên kia.
 *
 * ## Phép khớp
 *
 * Mỗi TỪ của từ khoá phải là ĐẦU một từ trong tên xe hoặc tên công khai của chủ xe — không cần
 * đúng thứ tự, không cần cùng một trường ("mazda tuan" ra những chiếc Mazda của anh Tuấn). Khớp
 * đầu từ chứ không khớp giữa từ: "an" không được kéo theo mọi "Tuấn", "Toàn", "Lan".
 */

/** Trần độ dài từ khoá — cùng con số với `@MaxLength` của DTO. URL tự sửa dài hơn bị cắt, không 400. */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Trần số từ mang đi so — mỗi từ là một vế `LIKE` có index, không để một câu dán cả đoạn văn. */
export const SEARCH_QUERY_MAX_TOKENS = 6;

/**
 * Nhóm chữ có dấu theo chữ gốc. Chữ HOA suy bằng `toUpperCase()` của từng chữ thường — mọi chữ
 * ở đây đều có dạng hoa dựng sẵn một mã, nên phép suy là 1:1.
 *
 * ⚠️ Chuỗi `translate()` của `xeprime_search_fold()` được sinh từ đúng bảng này. Thêm một chữ ở
 * đây mà quên migration thì test đối chiếu sẽ đỏ.
 */
const VIETNAMESE_LETTER_GROUPS: ReadonlyArray<readonly [base: string, accented: string]> = [
  ['a', 'àáảãạăằắẳẵặâầấẩẫậ'],
  ['e', 'èéẻẽẹêềếểễệ'],
  ['i', 'ìíỉĩị'],
  ['o', 'òóỏõọôồốổỗộơờớởỡợ'],
  ['u', 'ùúủũụưừứửữự'],
  ['y', 'ỳýỷỹỵ'],
  ['d', 'đ'],
];

const FOLD_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (let code = 65; code <= 90; code += 1) {
    map.set(String.fromCharCode(code), String.fromCharCode(code + 32));
  }
  for (const [base, accented] of VIETNAMESE_LETTER_GROUPS) {
    for (const ch of accented) {
      map.set(ch, base);
      map.set(ch.toUpperCase(), base);
    }
  }
  return map;
})();

/** Một ký tự (đã NFC) sau khi gấp — chữ/số ASCII thường, hoặc chính nó nếu ngoài bảng. */
function foldChar(ch: string): string {
  return FOLD_MAP.get(ch) ?? ch;
}

// Nhận `undefined` để đọc thẳng `folded[i]` dưới `noUncheckedIndexedAccess` — ngoài mảng là "không phải chữ".
const isWordChar = (ch: string | undefined) => ch !== undefined && /^[a-z0-9]$/.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * Chuỗi → dạng gấp: chữ thường không dấu, các từ cách nhau đúng một dấu cách, không dấu cách
 * đầu/cuối. Chuỗi không còn chữ/số nào ⇒ `''`.
 */
export function foldSearchText(raw: string): string {
  let mapped = '';
  for (const ch of raw.normalize('NFC')) mapped += foldChar(ch);
  return mapped
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Từ khoá → danh sách từ mang đi so (đã gấp, bỏ trùng, tối đa {@link SEARCH_QUERY_MAX_TOKENS}).
 * Rỗng ⇒ không lọc theo từ khoá — một chuỗi toàn dấu câu không được biến thành bộ lọc rỗng kết quả.
 */
export function searchTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const folded = foldSearchText(raw.slice(0, SEARCH_QUERY_MAX_LENGTH));
  if (!folded) return [];
  return [...new Set(folded.split(' '))].slice(0, SEARCH_QUERY_MAX_TOKENS);
}

/** Một đoạn của chuỗi hiển thị, đánh dấu phần trùng với từ khoá. */
export interface SearchHighlightPart {
  text: string;
  match: boolean;
}

/**
 * Tách một chuỗi HIỂN THỊ (tên chủ xe, tên xe) thành các đoạn để tô phần khớp từ khoá.
 *
 * Cùng luật khớp với server — một từ được tô khi nó BẮT ĐẦU bằng một từ của từ khoá — nên khách
 * thấy đúng lý do một kết quả hiện ra. Ánh xạ gấp là 1:1 theo từng ký tự (sau NFC), nên vị trí
 * trên chuỗi gấp chính là vị trí trên chuỗi gốc. Những trận khớp chỉ có ở dạng viết liền
 * ("saigon" ↔ "Sài Gòn") không tô — không tô vẫn đúng hơn tô sai chỗ.
 */
export function highlightSearchMatch(
  text: string,
  tokens: readonly string[],
): SearchHighlightPart[] {
  const chars = [...text.normalize('NFC')];
  if (tokens.length === 0 || chars.length === 0) return [{ text: chars.join(''), match: false }];

  const folded = chars.map(foldChar);
  const marked = new Array<boolean>(chars.length).fill(false);

  let i = 0;
  while (i < chars.length) {
    if (!isWordChar(folded[i])) {
      i += 1;
      continue;
    }
    // Một từ kết thúc ở ký tự không phải chữ/số, hoặc ở ranh giới chữ ↔ số (luật bước 3).
    let end = i + 1;
    while (
      end < chars.length &&
      isWordChar(folded[end]) &&
      isDigit(folded[end]) === isDigit(folded[end - 1])
    ) {
      end += 1;
    }
    const word = folded.slice(i, end).join('');
    const longest = tokens.reduce(
      (best, token) => (token.length > best && word.startsWith(token) ? token.length : best),
      0,
    );
    for (let k = i; k < i + longest; k += 1) marked[k] = true;
    i = end;
  }

  const parts: SearchHighlightPart[] = [];
  chars.forEach((ch, index) => {
    const match = marked[index] === true;
    const last = parts[parts.length - 1];
    if (last && last.match === match) last.text += ch;
    else parts.push({ text: ch, match });
  });
  return parts;
}

/**
 * Dạng SQL của bảng ánh xạ — `[from, to]` cho `translate()`. Chỉ để migration/test dựng và đối
 * chiếu bản sinh đôi; không ai khác cần nó.
 */
export function searchFoldTranslateTable(): readonly [from: string, to: string] {
  let from = '';
  let to = '';
  for (const [ch, base] of FOLD_MAP) {
    from += ch;
    to += base;
  }
  return [from, to];
}
