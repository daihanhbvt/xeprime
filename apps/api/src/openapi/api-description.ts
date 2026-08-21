import { API_ERROR_CODE } from '@xeprime/types';

/**
 * Trang đầu của Swagger UI — thứ một dev mới đọc trước khi bấm vào endpoint nào.
 *
 * Chỗ này chỉ nói những quy ước ĐÚNG CHO MỌI ENDPOINT (lớp bọc response, xác thực, phân trang,
 * kiểu tiền/thời gian, mã lỗi). Chi tiết riêng của từng route nằm ở `summary`/`description` của
 * chính route đó, sinh tự động từ metadata guard.
 */

/** Danh mục mã lỗi lấy thẳng từ hằng dùng chung — không chép tay nên không thể liệt kê sai. */
const ALL_ERROR_CODES = Object.values(API_ERROR_CODE)
  .slice()
  .sort()
  .map((code) => `\`${code}\``)
  .join(' · ');

export const API_DESCRIPTION = `
API của XePrime — nền tảng cho thuê xe nhiều gian hàng (multi-tenant).

## Lớp bọc response

Mọi response thành công đều được bọc một lớp \`data\`; endpoint phân trang có thêm \`meta\`:

\`\`\`jsonc
// GET /bookings/{id}
{ "data": { "id": "01J...", "code": "BK-000123", "status": "active" } }

// GET /bookings?page=1&limit=20
{ "data": [ /* ... */ ], "meta": { "page": 1, "limit": 20, "total": 137, "hasNext": true } }
\`\`\`

Schema trong tài liệu này đã bao gồm lớp bọc đó, nên copy thẳng ra client là đúng shape thật.

Lỗi luôn cùng một hình dạng, ở mọi mã HTTP:

\`\`\`jsonc
{ "error": { "code": "MISSING_PERMISSION", "message": "...", "details": [ /* tuỳ mã */ ] } }
\`\`\`

**Nhánh theo \`error.code\`, đừng nhánh theo \`error.message\`.** \`message\` là tiếng Việt dành cho
log và có thể đổi câu chữ bất cứ lúc nào; giao diện tiếng Anh phải tự ánh xạ từ mã (ADR 0012).

## Xác thực

Đăng nhập bằng Firebase Auth ở client → gửi ID token lên \`POST /auth/session\` → API trả về
**httpOnly session cookie** (ADR 0002). Không có Bearer token, không có gì đọc được từ
JavaScript.

Hệ quả khi gọi API:

- Từ trình duyệt: đặt \`credentials: 'include'\`, và origin phải nằm trong \`CORS_ORIGINS\`.
- Từ curl/Postman: giữ cookie jar (\`curl -c jar.txt -b jar.txt\`).
- Ngay trong trang này: cứ gọi \`POST /auth/session\` một lần, các endpoint sau dùng lại cookie đó.

Quyền **không** nằm trong token — mỗi request đọc lại vai trò/quyền từ DB. Ổ khoá trên mỗi
endpoint cho biết endpoint đó có cần đăng nhập không; phần **Truy cập / Phạm vi / Quyền yêu cầu**
trong mô tả endpoint cho biết cần chính xác quyền nào.

Endpoint có phạm vi gian hàng lấy \`tenantId\` từ membership của phiên đăng nhập. **Không endpoint
nào nhận \`tenantId\` từ body hoặc query** — gửi lên cũng bị bỏ qua hoặc bị từ chối.

## Phân trang, lọc, sắp xếp

Query dùng chung: \`page\` (từ 1), \`limit\`, \`sort\`. Kết quả trả \`meta.total\` và \`meta.hasNext\`.
Bộ lọc riêng của từng endpoint mô tả tại chính endpoint đó.

## Kiểu dữ liệu

| Loại | Trên dây | Ghi chú |
| --- | --- | --- |
| Tiền | \`string\` | Ví dụ \`"1250000.00"\`. **Không bao giờ là \`number\`** — tránh sai số dấu phẩy động (ADR 0007). Đơn vị luôn là VND. |
| Thời điểm | \`string\` ISO-8601 UTC | Ví dụ \`"2026-08-21T03:00:00.000Z"\`. Hiển thị thì đổi sang \`Asia/Ho_Chi_Minh\`. |
| Ngày (không giờ) | \`string\` \`YYYY-MM-DD\` | Dùng cho ngày nhận/trả theo lịch. |
| ID | \`string\` 26 ký tự | ULID. |
| Trạng thái, vai trò, quyền | \`string\` mã ổn định | Mã là DỮ LIỆU, chỉ nhãn hiển thị mới dịch. |

Thuê dài hạn là gói cố định 1/2/3/6/9/12 **tháng lịch**; server tự tính ngày trả từ ngày nhận —
client không gửi lên và không được suy bằng \`số tháng × 30\` (ADR 0011).

Giai đoạn này **không có thanh toán trực tuyến**: mọi thu/chi là ghi sổ thủ công (ADR 0013).

## Mã lỗi

Mã dùng chung ở mọi endpoint:

| HTTP | Mã | Khi nào |
| --- | --- | --- |
| 400 | \`${API_ERROR_CODE.VALIDATION_FAILED}\` | Sai schema. \`error.details\` liệt kê từng field và ràng buộc hỏng. |
| 401 | \`${API_ERROR_CODE.UNAUTHENTICATED}\` | Thiếu cookie phiên hoặc phiên đã hết hạn. |
| 403 | \`${API_ERROR_CODE.MISSING_PERMISSION}\` | Đã đăng nhập nhưng thiếu quyền endpoint đòi. |
| 403 | \`${API_ERROR_CODE.NO_TENANT_SCOPE}\` | Tài khoản không thuộc gian hàng nào. |
| 404 | \`${API_ERROR_CODE.NOT_FOUND}\` | Không có bản ghi, hoặc có nhưng thuộc gian hàng khác. |
| 409 | \`${API_ERROR_CODE.CONFLICT}\` | Trùng bản ghi đã tồn tại. |
| 409 | \`${API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT}\` | Xe đã có lịch trùng khoảng thời gian. Chặn bằng ràng buộc \`EXCLUDE USING gist\` ở DB (ADR 0006) — kiểm tra phía client chỉ là gợi ý UX, luôn phải xử lý mã này. |
| 429 | \`${API_ERROR_CODE.RATE_LIMITED}\` | Vượt 120 request / 60 giây. |
| 500 | \`${API_ERROR_CODE.INTERNAL_ERROR}\` | Lỗi server. Ở production \`message\` được che, tra log theo request-id. |

Toàn bộ mã (gồm cả mã nghiệp vụ riêng của từng luồng):

${ALL_ERROR_CODES}

Định nghĩa gốc: \`packages/types/src/api.ts\` → \`API_ERROR_CODE\`.

## Sinh type cho client TypeScript

\`\`\`bash
pnpm contract   # apps/api → packages/types/openapi.json → packages/types/src/api.generated.ts
\`\`\`

Type client **không viết tay** (ADR 0007): import từ \`@xeprime/types\`.
`.trim();
