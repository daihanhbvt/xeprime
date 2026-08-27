/**
 * TTL cache (giây) cho DỮ LIỆU CÔNG KHAI — MỘT nguồn số cho cả hai tầng:
 *
 *   - `apps/api` phát header `Cache-Control: s-maxage=N` (`common/http-cache.ts`);
 *   - `apps/web` khai `next: { revalidate: N }` cho fetch server-side (`constants/cache.ts`).
 *
 * Hai tầng lệch nhau thì tổng độ cũ tối đa là TỔNG hai con số mà không ai chủ đích chọn nó —
 * gom về một chỗ để "trang chủ chịu tải thế nào / cũ tối đa bao lâu" có đúng một câu trả lời.
 *
 * Chọn số theo mức NGƯỜI DÙNG nhận ra sự cũ, không theo mức dữ liệu đổi. Ràng buộc quan trọng:
 * mutation đi thẳng client → NestJS, KHÔNG qua server action của Next, nên hiện chưa có đường
 * `revalidateTag` nào — TTL là cơ chế vô hiệu hoá DUY NHẤT. Vì vậy dữ liệu người dùng TỰ SỬA
 * ĐƯỢC (hồ sơ gian hàng, banner) phải đủ ngắn để họ thấy thay đổi của chính mình trong vòng
 * một phút; muốn dài hơn thì phải xây webhook NestJS → Next trước.
 */
export const PUBLIC_CACHE_SECONDS = {
  /** Chi tiết xe, danh sách xe — có giá và tình trạng, giữ ngắn. */
  listing: 30,
  /** Facet Bộ lọc — khớp đúng TTL cache trong tiến trình của API để hai tầng không lệch nhau. */
  facets: 60,
  /**
   * Hồ sơ + danh sách gian hàng. Chủ shop tự sửa hồ sơ, và giai đoạn đầu gian hàng đăng ký/duyệt
   * liên tục — sửa xong phải thấy trong một phút, không phải chờ 5 phút.
   */
  shop: 60,
  /** Banner marketing: admin bật/tắt xong còn thấy kết quả trong một phiên làm việc. */
  banner: 60,
  /** Đánh giá công khai — chỉ dài thêm khi có khách viết review mới. */
  reviews: 120,
  /** Danh mục lọc, địa điểm nổi bật — admin quản, đổi vài lần một tháng. */
  catalog: 300,
  /** Danh mục tỉnh hành chính — chỉ đổi khi có nghị quyết sáp nhập, cache dài nhất. */
  provinces: 3600,
} as const;
