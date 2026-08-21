# Tài liệu API (Swagger / OpenAPI)

Ngày viết: 21/08/2026

Dev mới vào dự án muốn biết API có gì, gọi thế nào, trả về gì → đọc file này trước.

## 1. Mở tài liệu

```bash
pnpm --filter @xeprime/api dev     # cần Postgres đang chạy (docker compose up -d db)
```

| Địa chỉ | Là gì |
| --- | --- |
| http://localhost:4000/docs | Swagger UI — đọc, thử gọi trực tiếp |
| http://localhost:4000/docs-json | Spec thô, import thẳng vào Postman / Insomnia / Scalar |
| `packages/types/openapi.json` | Bản spec đã commit — xem được mà **không cần chạy server** |

Swagger UI **tắt khi `NODE_ENV=production`** (nó phơi toàn bộ bề mặt API). Muốn đưa tài liệu cho
người ngoài mà không dựng server: gửi `packages/types/openapi.json`, mở bằng bất kỳ viewer nào.

## 2. Thử gọi API ngay trong Swagger UI

Xác thực là **httpOnly session cookie**, không phải Bearer token (ADR 0002) — nên **không có
nút "Authorize" nào để dán token vào**. Cách đăng nhập:

1. Mở `auth` → `POST /auth/session` → **Try it out** → gửi ID token Firebase.
2. Trình duyệt tự giữ cookie. Mọi endpoint sau đó dùng lại cookie đó, không cần thao tác gì thêm.

Cấu hình `withCredentials` đã bật sẵn ở [main.ts](../apps/api/src/main.ts) — không bật thì mọi
lần "Try it out" đều trả 401 dù đã đăng nhập.

Gọi bằng curl thì phải giữ cookie jar:

```bash
curl -c jar.txt -b jar.txt -X POST http://localhost:4000/auth/session \
  -H 'Content-Type: application/json' -d '{"idToken":"..."}'
curl -b jar.txt http://localhost:4000/bookings?page=1
```

## 3. Đọc gì trên mỗi endpoint

Ngoài `summary` và schema, mỗi endpoint có thêm phần sinh tự động:

- **Ổ khoá** trên đầu dòng: endpoint cần đăng nhập. Không ổ khoá = công khai.
- **Truy cập / Phạm vi / Quyền yêu cầu** trong mô tả: cần chính xác permission nào, có bị giới
  hạn theo gian hàng hay chỉ dành cho nền tảng.
- **Danh sách mã lỗi** ở từng response 4xx/5xx: nhánh code theo `error.code`, đừng nhánh theo
  `error.message`.

Trang chủ Swagger (phần mô tả đầu) nói các quy ước dùng chung: lớp bọc `{ data, meta }`, tiền là
string, thời gian ISO-8601 UTC, phân trang, và toàn bộ danh mục mã lỗi.

## 4. Sinh type cho client TypeScript

Không viết tay type API (ADR 0007):

```bash
pnpm contract
# = pnpm api:openapi  (apps/api → packages/types/openapi.json)
# + pnpm types:gen    (openapi.json → packages/types/src/api.generated.ts)
```

Dùng ở web:

```ts
import type { components } from '@xeprime/types';
type BookingDetail = components['schemas']['BookingDetailDto'];
```

**Chạy `pnpm contract` mỗi khi đổi controller/DTO** rồi commit cả `openapi.json` lẫn
`api.generated.ts` — hai file này là hợp đồng giữa BE và FE.

## 5. Tài liệu tự sinh từ đâu

Phần lớn tài liệu KHÔNG viết tay. `buildOpenApiDocument()` trong
[bootstrap.ts](../apps/api/src/bootstrap.ts) chạy hậu xử lý trên document mà Swagger quét được:

| Thứ được thêm | Suy từ | File |
| --- | --- | --- |
| Nhóm tag + mô tả + thứ tự | danh mục khai báo tập trung | [api-tags.ts](../apps/api/src/openapi/api-tags.ts) |
| Trang mô tả đầu (quy ước, mã lỗi) | `API_ERROR_CODE` của `@xeprime/types` | [api-description.ts](../apps/api/src/openapi/api-description.ts) |
| Ổ khoá + quyền + phạm vi | metadata `@Public` / `@RequirePermissions` / `@TenantScoped` / `@PlatformOnly` | [route-access.ts](../apps/api/src/openapi/route-access.ts) |
| Lớp bọc `{ data }`, nhánh lỗi 400/401/403/404/409/429/500 | `ResponseInterceptor`, guard, `AllExceptionsFilter` | [enhance-document.ts](../apps/api/src/openapi/enhance-document.ts) |

Nghĩa là: **sửa quyền của endpoint thì tài liệu tự đổi theo** — không có bản viết tay nào để trôi
lệch khỏi hành vi thật.

## 6. Thêm endpoint mới thì phải làm gì

Chỉ 3 việc, phần còn lại tự có:

1. `@ApiTags('...')` trên controller — tag phải nằm trong `API_TAGS`, chưa có thì thêm vào
   [api-tags.ts](../apps/api/src/openapi/api-tags.ts) kèm mô tả.
2. `@ApiOperation({ summary: '...' })` trên mỗi route.
3. `@ApiOkResponse({ type: XxxDto })` (hoặc `@ApiCreatedResponse` / `@ApiNoContentResponse`) —
   **khai `type`, đừng khai `schema` inline**: schema inline sinh ra kiểu ẩn danh, FE generate ra
   một đống shape trùng nhau không tên.
   - Kết quả nhỏ dùng lại DTO chung ở [api-response.dto.ts](../apps/api/src/common/dto/api-response.dto.ts):
     `OkResultDto` (`{ ok: true }`), `IdResultDto` (`{ id }`), `DeletedCountDto` (`{ deleted }`).
   - DTO phải có `@ApiProperty` trên **mọi** field, nếu không field đó biến mất khỏi spec.

Bỏ sót thì `apps/api/test/openapi-contract.spec.ts` fail, kèm danh sách đúng route thiếu:

```bash
pnpm --filter @xeprime/api test -- openapi-contract
```

Spec đó khoá lại 16 khẳng định: mọi route có summary và tag đã khai báo, mọi route nói rõ cần
đăng nhập hay không và khớp `@Public` thật, mọi response 2xx mô tả đúng lớp bọc `{ data }`, mọi
route có 429/500, route cần đăng nhập có 401, route công khai KHÔNG có 401, route đòi quyền có
403 và liệt kê đúng permission.

## 7. Ngoại lệ đã biết

`GET /health` là endpoint DUY NHẤT không có lớp bọc `{ data }`. `ResponseInterceptor` bỏ qua
payload đã có sẵn khoá `error`, mà kết quả `@nestjs/terminus` luôn có khoá đó. Giữ nguyên vì
tiện cho uptime monitor: đọc thẳng `status` không phải bóc lớp. Xem
[health.dto.ts](../apps/api/src/modules/health/dto/health.dto.ts).
