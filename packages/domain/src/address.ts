/**
 * Ghép và đọc ĐỊA CHỈ VẬT LÝ Việt Nam — luật dùng chung web ↔ app native ↔ API.
 *
 * Ở domain chứ không ở mỗi app vì thứ tự các thành phần là NGHIỆP VỤ, không phải trình bày:
 * server lưu chuỗi hiển thị đã ghép vào DB, web hiện nó trên thẻ xe, app native hiện nó trong
 * chi tiết đơn, và cả ba phải đọc ra một địa chỉ giống hệt nhau. Ghép lại ở từng nơi là cách
 * chắc chắn để cùng một chi nhánh có ba cách viết địa chỉ.
 *
 * Thứ tự Việt Nam là từ NHỎ tới LỚN: `số nhà, đường → xã/phường → tỉnh/thành`. Không có cấp
 * quận/huyện — mô hình hành chính hai cấp từ 01/07/2025.
 */
import {
  normalizeProvinceAlias,
  PROVINCE_ADMINISTRATIVE_TYPE,
  PROVINCE_CATALOG,
} from '@xeprime/types';

/** Dấu phân cách giữa các thành phần địa chỉ. */
const PART_SEPARATOR = ', ';

/**
 * Tên tỉnh/thành kèm TIỀN TỐ LOẠI cho bộ chọn: `"TP Hà Nội"`, `"Tỉnh Cao Bằng"`.
 *
 * Chỉ dùng ở chỗ CHỌN, không dùng ở chỗ hiển thị một địa chỉ đã lưu: cột `provinces.name` vẫn là
 * tên trần (`"Hà Nội"`) và chuỗi địa chỉ ghép từ nó, vì một địa chỉ viết "12 Nguyễn Huệ, Phường
 * Bến Nghé, TP Hồ Chí Minh" thì dài hơn mà không rõ hơn.
 *
 * Ở bộ chọn thì ngược lại: danh sách trộn 6 thành phố với 28 tỉnh, và tiền tố là thứ duy nhất
 * cho biết "Huế" trong danh sách là thành phố trực thuộc trung ương chứ không phải một tỉnh.
 * Cấp xã KHÔNG cần hàm này — tên của chúng đã mang sẵn tiền tố trong danh mục nhà nước.
 */
export function provinceSelectLabel(name: string, administrativeType: string): string {
  return administrativeType === PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY
    ? `TP ${name}`
    : `Tỉnh ${name}`;
}

export interface AddressParts {
  /** Số nhà, đường, toà nhà — chữ người dùng gõ. */
  addressLine?: string | null;
  /** Tên xã/phường/đặc khu ĐẦY ĐỦ kèm tiền tố: "Phường Ba Đình". */
  wardName?: string | null;
  /** Tên tỉnh/thành chuẩn: "Hà Nội". */
  provinceName?: string | null;
}

/**
 * Ghép các thành phần thành chuỗi hiển thị.
 *
 * Bỏ qua phần rỗng thay vì để lại dấu phẩy treo, và KHÔNG chèn phần nào không được truyền vào:
 * một địa chỉ mới có tỉnh thì hiện đúng tên tỉnh, chứ không hiện `", , Hà Nội"`.
 *
 * Trả `null` khi không có mảnh nào — người gọi phân biệt được "chưa có địa chỉ" với "địa chỉ
 * rỗng", và một ô trống hiển thị đúng hơn một chuỗi rỗng nằm giữa giao diện.
 */
export function formatAddress(parts: AddressParts): string | null {
  const pieces = [parts.addressLine, parts.wardName, parts.provinceName]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return pieces.length > 0 ? pieces.join(PART_SEPARATOR) : null;
}

/**
 * Địa chỉ dùng để HỎI BẢN ĐỒ (geocoding). Khác `formatAddress` ở chỗ luôn kèm `Việt Nam`.
 *
 * Không phải chi tiết thừa: nhà cung cấp bản đồ đọc "Phường Tân Hội, Hà Nội" là một chuỗi toàn
 * cầu và có thể trả về một nơi ở nước khác. Ràng buộc quốc gia ngay trong chuỗi hỏi rẻ hơn
 * nhiều so với việc phát hiện một cái ghim rơi sang Trung Quốc sau khi đã lưu.
 */
export function addressGeocodeQuery(parts: AddressParts): string | null {
  const base = formatAddress(parts);
  return base ? `${base}${PART_SEPARATOR}Việt Nam` : null;
}

/**
 * Tách cụm hành chính ra khỏi một chuỗi địa chỉ tự do CŨ để đoán phần "số nhà, đường".
 *
 * Dùng khi mở form sửa một bản ghi có trước danh mục cấp xã: chuỗi cũ thường là
 * `"12 Nguyễn Huệ, Phường Bến Nghé, TP.HCM"`, và bỏ nguyên cả chuỗi vào ô "số nhà, đường" sẽ
 * đẻ ra `"12 Nguyễn Huệ, Phường Bến Nghé, TP.HCM, Phường Sài Gòn, Hồ Chí Minh"` sau khi lưu.
 *
 * **Chỉ là GỢI Ý cho ô nhập, không bao giờ là dữ liệu tự lưu.** Hàm này cắt theo dấu phẩy, theo
 * tiền tố đơn vị hành chính và theo tên 34 tỉnh (xem {@link looksAdministrative}); nó không biết
 * chuỗi cũ đúng hay sai và không cố đoán mã. Người dùng vẫn phải nhìn và sửa — đó là toàn bộ lý
 * do form có bước xác nhận địa chỉ.
 */
export function guessAddressLine(legacyAddress: string | null | undefined): string {
  if (!legacyAddress) return '';
  const segments = legacyAddress
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return '';

  /*
   * Giữ các đoạn ĐẦU cho tới khi gặp đoạn đầu tiên trông như tên đơn vị hành chính. Quét từ
   * đầu chứ không cắt cứng hai đoạn cuối: địa chỉ cũ có đoạn dài ngắn khác nhau (có cái ghi cả
   * toà nhà + ngõ + hẻm), và cắt theo số lượng sẽ nuốt mất phần người ta thật sự cần giữ.
   */
  const kept: string[] = [];
  for (const segment of segments) {
    if (looksAdministrative(segment)) break;
    kept.push(segment);
  }

  // Mọi đoạn đều trông như đơn vị hành chính → không có phần chi tiết nào để giữ.
  return kept.join(PART_SEPARATOR);
}

/** Tiền tố loại đơn vị hành chính, cả mô hình hiện hành lẫn mô hình trước 01/07/2025. */
const ADMIN_PREFIX = /^(phường|xã|thị trấn|đặc khu|quận|huyện|thị xã|tp\.?|thành phố|tỉnh)\b/i;

/**
 * Một đoạn của chuỗi địa chỉ cũ có phải tên đơn vị hành chính không.
 *
 * Hai dấu hiệu, và cần cả hai vì địa chỉ tự do viết kiểu gì cũng có:
 *   1. **Tiền tố loại** — `"Phường Bến Nghé"`, `"Quận 1"`, `"TP.HCM"`.
 *   2. **Trùng tên một tỉnh/thành** — `"Hà Nội"`, `"Cần Thơ"` thường viết trần, không tiền tố,
 *      và đó là đoạn cuối của gần như mọi địa chỉ đang lưu.
 *
 * Tên quận/huyện CŨ viết trần (`"Cầu Giấy"`, `"Ninh Kiều"`) thì KHÔNG nhận ra được — không còn
 * danh mục nào chứa chúng. Giữ lại là lựa chọn đúng: đây là gợi ý cho một ô nhập mà người dùng
 * sẽ đọc và sửa, và giữ thừa một đoạn thì họ xoá được, còn cắt nhầm số nhà thì họ phải gõ lại.
 */
function looksAdministrative(segment: string): boolean {
  if (ADMIN_PREFIX.test(segment)) return true;
  return PROVINCE_NAME_KEYS.has(normalizeProvinceAlias(segment));
}

/** Khoá chuẩn hoá của 34 tên tỉnh — tính một lần, không tra lại ở mỗi đoạn. */
const PROVINCE_NAME_KEYS: ReadonlySet<string> = new Set(
  PROVINCE_CATALOG.map((p) => normalizeProvinceAlias(p.name)),
);
