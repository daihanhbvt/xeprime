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

### Cho máy khác cùng mạng LAN vào xem

API đã bind `0.0.0.0` sẵn, nên chỉ cần mở `http://<IP-máy-bạn>:4000/docs`. Hai thứ chặn đường:

1. **Windows Firewall.** Rule `Node.js JavaScript Runtime` cài sẵn thường chỉ áp cho profile
   *Public*, trong khi Wi-Fi ở nhà/văn phòng là *Private* → inbound bị chặn. Mở theo CỔNG (hẹp hơn
   nới rule cho cả `node.exe`), chạy PowerShell **Administrator**:

   ```powershell
   New-NetFirewallRule -DisplayName "XePrime API (4000)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "XePrime Web (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```

2. **CSP `upgrade-insecure-requests`.** Đã xử lý ở [bootstrap.ts](../apps/api/src/bootstrap.ts):
   directive này bị bỏ khi `NODE_ENV` khác `production`. Nếu còn nó, trình duyệt nâng mọi asset
   Swagger lên `https://` và trang trắng kèm `ERR_SSL_PROTOCOL_ERROR` — **chỉ xảy ra khi vào bằng
   IP**, vì `localhost` được xếp vào "trustworthy origin" nên miễn nâng cấp. Đây là lý do lỗi này
   không bao giờ lộ ra trên máy dev.

Vẫn không vào được sau hai bước trên thì nghi router bật **AP/client isolation**. Kiểm từ máy kia:
`Test-NetConnection <IP> -Port 4000` — firewall đã mở mà vẫn `TcpTestSucceeded: False` thì là router.

## 2. Thử gọi API ngay trong Swagger UI

API có **hai đường xác thực**, và Swagger UI chỉ tiện cho đường thứ nhất.

### 2.1 Web — httpOnly session cookie (ADR 0002)

**Không có nút "Authorize" nào để dán token vào** — cookie không phải thứ dán tay được.

1. Mở `auth` → `POST /auth/login` → **Try it out** → gửi email/SĐT + mật khẩu.
2. Trình duyệt tự giữ cookie. Mọi endpoint sau đó dùng lại cookie đó, không cần thao tác gì thêm.

Cấu hình `withCredentials` đã bật sẵn ở [main.ts](../apps/api/src/main.ts) — không bật thì mọi
lần "Try it out" đều trả 401 dù đã đăng nhập.

Gọi bằng curl thì phải giữ cookie jar:

```bash
curl -c jar.txt -b jar.txt -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -d '{"identifier":"owner@xeprime.test","password":"Abcd1234"}'
curl -b jar.txt http://localhost:4000/bookings?page=1
```

**Google/Facebook không thử được trong Swagger** — `GET /auth/social/{provider}` và
`/callback` là hai chặng của một lần ĐIỀU HƯỚNG TRÌNH DUYỆT và trả `302`, không trả JSON
(ADR 0019). Mở thẳng `http://localhost:4000/auth/social/google?next=/` trên thanh địa chỉ để thử.

### 2.2 App native — `Authorization: Bearer` (ADR 0017)

Ba endpoint dưới nhóm `auth`, tiền tố `/auth/mobile`:

| Endpoint | Trả về | Ghi chú |
| --- | --- | --- |
| `POST /auth/mobile/login` | `MobileSessionDto` (tokens + `MeDto`) | Email/SĐT + mật khẩu. Throttle 5 req/phút |
| `POST /auth/mobile/refresh` | `MobileTokenPairDto` | **Xoay**: trả cặp mới, token cũ chết ngay |
| `POST /auth/mobile/logout` | 204 | Thu hồi phiên của thiết bị. Luôn 204, kể cả token lạ |

```bash
# Đăng nhập → lấy access token
ACCESS=$(curl -s -X POST http://localhost:4000/auth/mobile/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"owner@xeprime.test","password":"..."}' | jq -r .data.tokens.accessToken)

# Gọi endpoint cần đăng nhập bằng Bearer — KHÔNG cần cookie jar
curl -H "Authorization: Bearer $ACCESS" 'http://localhost:4000/bookings?page=1'
```

Ba điều dễ vấp:

- **Đừng gửi cả cookie lẫn Bearer.** Guard trả 401 thay vì đoán bên nào thắng — cố ý (ADR 0017 §5).
  Trong Swagger UI, sau khi đã đăng nhập bằng cookie ở §2.1 thì mọi "Try it out" kèm header
  `Authorization` sẽ 401; mở tab ẩn danh hoặc dùng curl.
- **Access token sống 15 phút.** Hết hạn trả `SESSION_EXPIRED`; gọi `/auth/mobile/refresh`, đừng
  đăng nhập lại.
- **Refresh token dùng một lần.** Gửi lại token đã dùng ⇒ coi là bị đánh cắp ⇒ **thu hồi cả phiên**.
  Lưu token mới sau MỖI lần refresh.

Quyền và tenant scope **không** nằm trong token ở cả hai đường — `GET /auth/me` là chỗ duy nhất trả
chúng, và nó đọc DB mỗi lần gọi.

Cách app native cấu hình client: [`packages/api-client/README.md`](../packages/api-client/README.md).


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

Spec đó khoá lại 17 khẳng định: mọi route có summary và tag đã khai báo, mọi route nói rõ cần
đăng nhập hay không và khớp `@Public` thật, mọi response 2xx mô tả đúng lớp bọc `{ data }`, mọi
route có 429/500, route cần đăng nhập có 401, route công khai KHÔNG có 401, route đòi quyền có
403 và liệt kê đúng permission.

Khẳng định thứ 17 là quan trọng nhất với người sau: **`packages/types/openapi.json` đã commit phải
khớp source hiện tại**. Sửa DTO rồi quên `pnpm contract` là im lặng tuyệt đối nếu không có nó —
mọi test khác vẫn xanh vì chúng đọc document dựng tại chỗ, còn file đã commit thì đứng yên và web
tiếp tục compile theo type CŨ. Test fail sẽ chỉ đúng đường dẫn/schema nào đã lệch.

## 7. Ngoại lệ đã biết

`GET /health` là endpoint DUY NHẤT không có lớp bọc `{ data }`. `ResponseInterceptor` bỏ qua
payload đã có sẵn khoá `error`, mà kết quả `@nestjs/terminus` luôn có khoá đó. Giữ nguyên vì
tiện cho uptime monitor: đọc thẳng `status` không phải bóc lớp. Xem
[health.dto.ts](../apps/api/src/modules/health/dto/health.dto.ts).
