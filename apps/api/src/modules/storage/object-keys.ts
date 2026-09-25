/**
 * Hình dạng object key của kho ảnh CÔNG KHAI — MỘT định nghĩa cho nơi ghi (presign ở
 * `StorageController`) và nơi kiểm (phiên hỗ trợ gian hàng, ADR 0050). Hai nơi tự ghép chuỗi là hai
 * nơi sẽ lệch nhau: upload hợp lệ bị từ chối, hoặc phép kiểm thôi khớp mà không ai biết.
 */

/** Tiền tố object ảnh xe của MỘT gian hàng (không có `/` cuối — `R2Service` tự nối `/<file>`). */
export function vehicleImageObjectPrefix(tenantId: string): string {
  return `tenants/${tenantId}/vehicles`;
}

/**
 * Tên file cuối mà `R2Service.presignUpload` sinh: `<ULID>-<tên đã làm sạch>` — `sanitize` chỉ để
 * lại `[\w.-]`, tối đa 120 ký tự.
 */
const OBJECT_FILE = /^[0-9A-HJKMNP-TV-Z]{26}-[\w.-]{1,120}$/;

/**
 * URL công khai này có ĐÚNG là một ảnh xe được presign cho gian hàng `tenantId` không.
 *
 * So trên URL đã PARSE, không `startsWith` trên chuỗi thô: `…/tenants/A/vehicles/../../B/…`,
 * dạng `%2e%2e`, dấu `\`, query hay fragment đều qua được một phép so tiền tố thô nhưng trình
 * duyệt/CDN chuẩn hoá chúng thành object của gian hàng khác. Vì vậy: cùng origin với kho, không ký
 * tự thoát/`..`/`\`, không query/hash, URL đã ở dạng chuẩn, và đường dẫn khớp ĐÚNG hình dạng key.
 */
export function isTenantVehicleImageUrl(
  url: string,
  publicBase: string | undefined,
  tenantId: string,
): boolean {
  if (!publicBase) return false;
  if (/[\\%]|\.\./.test(url)) return false;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(publicBase.replace(/\/+$/, '') + '/');
  } catch {
    return false;
  }
  if (parsed.href !== url) return false;
  if (parsed.origin !== base.origin || parsed.search !== '' || parsed.hash !== '') return false;
  if (parsed.username !== '' || parsed.password !== '') return false;

  const prefix = `${base.pathname}${vehicleImageObjectPrefix(tenantId)}/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  return OBJECT_FILE.test(parsed.pathname.slice(prefix.length));
}
