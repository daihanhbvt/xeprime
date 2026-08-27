import type { AppMessages } from './messages';

/**
 * Nhóm từ vựng nghiệp vụ trong namespace `Domain` — `vehicleType`, `bookingStatus`,
 * `pickupPreference`…
 *
 * Kiểu suy ra thẳng từ bó message tiếng Việt, nên thêm một nhóm ở `messages/vi/domain.json`
 * là dùng được ngay, còn gõ sai tên nhóm là lỗi biên dịch.
 */
export type DomainGroup = keyof AppMessages['Domain'];

/**
 * Khoá message của MỘT giá trị nghiệp vụ: `('bookingStatus', 'active')` → `bookingStatus.active`.
 *
 * Mã đi trên dây (`active`, `self_drive`, `pending_host_approval`) KHÔNG bao giờ đổi — đó là
 * dữ liệu, không phải chữ. Đổi ngôn ngữ chỉ đổi thứ hiện lên màn hình; payload gửi lên API,
 * giá trị trong URL và giá trị trong DB giữ nguyên tuyệt đối.
 */
export function domainMessageKey(group: DomainGroup, code: string): string {
  return `${group}.${code}`;
}

/**
 * Ký hiệu hàm dịch một giá trị nghiệp vụ.
 *
 * `fallback` dùng cho dữ liệu CŨ: một status có trong DB nhưng chưa khai báo message thì hiện
 * nhãn dự phòng (hoặc chính mã đó) chứ không nổ giữa bảng, cũng không thành ô trống khó truy.
 */
export type DomainLabel = (
  group: DomainGroup,
  code: string | null | undefined,
  fallback?: string,
) => string;

/**
 * Bộ dịch namespace `Domain` → hàm tra nhãn.
 *
 * Đây là chỗ DUY NHẤT ép kiểu khoá message trong toàn app. Lý do: khoá được ghép lúc chạy từ
 * một mã lấy về từ API, nên TypeScript không thể biết trước nó nằm trong bó message — nhưng
 * `t.has()` biết, và nhánh dự phòng xử lý đúng trường hợp không có.
 *
 * Hàm THUẦN (nhận bộ dịch, không gọi hook) nên cả client (`useDomainLabel`) lẫn server
 * (`getAppFormat`) dùng chung một hiện thực.
 */
export function createDomainLabel(t: {
  (key: never): string;
  has: (key: never) => boolean;
}): DomainLabel {
  return (group, code, fallback) => {
    if (code === null || code === undefined || code === '') return fallback ?? '';
    const key = domainMessageKey(group, code) as never;
    return t.has(key) ? t(key) : (fallback ?? code);
  };
}
