/**
 * Query param boolean-ish (`true`/`1`/`false`/`0`) → boolean; giá trị lạ giữ nguyên để
 * `@IsBoolean` từ chối. Dùng với `@Transform(toQueryBool)`.
 *
 * Vì sao không `@Type(() => Boolean)`: query string chỉ có CHUỖI, và `Boolean('false')` là `true`
 * — khách bỏ tích một ô sẽ được tính như vừa tích nó.
 */
export const toQueryBool = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};
