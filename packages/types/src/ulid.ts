/**
 * ULID — Crockford base32, 26 ký tự (bảng chữ không có I, L, O, U). Mọi id của hệ thống có dáng này
 * (CLAUDE.md §3), nên đây là phép chặn chung trước khi ghép một id lạ vào URL / deep link.
 *
 * `ULID_PATTERN_SOURCE` là phần thân KHÔNG neo, để ghép vào một biểu thức lớn hơn.
 */
export const ULID_PATTERN_SOURCE = '[0-9A-HJKMNP-TV-Z]{26}';

const ULID_PATTERN = new RegExp(`^${ULID_PATTERN_SOURCE}$`);

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}
