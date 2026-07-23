# ADR 0007 — Hợp đồng type FE ↔ BE sinh từ OpenAPI

Ngày: 22/07/2026 · Trạng thái: Accepted

## Bối cảnh

Tài liệu chốt Swagger sinh từ decorator `class-validator`, và chốt có `packages/types`. Nhưng **không nói FE lấy type từ đâu**.

Nếu `packages/types` viết tay thì cùng một khái niệm "Booking" tồn tại ba bản: Prisma model, DTO backend, type frontend. Ba bản sao thì chắc chắn lệch — chỉ là vấn đề thời gian. Và kiểu lệch tệ nhất là im lặng: backend đổi `total_amount` thành `totalAmount`, FE vẫn typecheck xanh, UI hiện `undefined`.

## Quyết định

Sinh type FE từ OpenAPI spec, không viết tay.

```text
Prisma schema
   ↓ prisma generate
Prisma types  ──(dùng nội bộ apps/api)
   ↓ class-validator DTO + @nestjs/swagger
openapi.json  ──(sinh lúc build apps/api)
   ↓ openapi-typescript
packages/types/src/api.generated.ts  ──(apps/web import)
```

Cụ thể:

- `apps/api` có script `pnpm api:openapi` khởi động app ở chế độ chỉ sinh spec, ghi ra `packages/types/openapi.json`, không cần chạy server.
- `pnpm types:gen` chạy `openapi-typescript` → `packages/types/src/api.generated.ts`.
- File `*.generated.ts` **được commit** vào git (để `pnpm install` xong là build được ngay, không cần chạy API trước), nhưng CI phải kiểm tra nó khớp: sinh lại rồi `git diff --exit-code`. Lệch → CI đỏ.
- `packages/types` viết tay **chỉ** chứa thứ không suy ra được từ API: status union ([ADR 0005](0005-status-enums.md)), permission key, route constant, kiểu dùng chung của domain.

## Lý do

- Đổi DTO backend → FE typecheck đỏ **ngay tại chỗ dùng**, không phải chờ QA phát hiện ở runtime.
- Chỉ có một nguồn sự thật cho shape của API, và nguồn đó là code backend đang chạy thật.
- Không tốn công duy trì bản sao thứ ba.

## Hệ quả

- Thứ tự build trong `turbo.json`: `api:openapi` → `types:gen` → `web:build`.
- Response wrapper `{ data, meta }` / `{ error }` (`CLAUDE.md` mục 9) phải khai báo bằng generic DTO có `@ApiProperty`, nếu không spec sinh ra sẽ mất lớp bọc và type FE sai.
- `apiClient` bọc `fetch` với `credentials: 'include'` ([ADR 0002](0002-auth-session-cookie.md)), tự bóc `data`, tự ném lỗi có `code` đọc được.
- `Decimal` của Prisma **không** serialize thành number qua JSON. Phải có interceptor chuyển `Decimal` → string ở response, và FE parse bằng thư viện decimal khi cần tính toán. Không dùng `number` cho tiền ở bất kỳ đâu — VND vượt `Number.MAX_SAFE_INTEGER` thì hiếm, nhưng làm tròn nhị phân trong phép cộng tiền thì không hiếm.
