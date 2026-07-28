# CODEMAP — cái gì nằm ở đâu

Chỉ mục để nhảy thẳng tới nơi cần, không quét mù. `navigator` agent đọc file này trước tiên. Khi thêm khái niệm cross-cutting mới, thêm một dòng vào đây.

## Nguồn sự thật (single source of truth)

| Khái niệm | File | ADR |
| --- | --- | --- |
| Status (booking/tenant/vehicle/…) — union + nhãn + màu | `packages/types/src/status/` | 0005 |
| Trạng thái nào chiếm lịch | `packages/types/src/status/booking.ts` (`BOOKING_STATUS_OCCUPYING`) | 0006 |
| Role / scope / permission key | `packages/types/src/rbac.ts` | — |
| Convention response `{data,meta}` / error code | `packages/types/src/api.ts` | 0007 |
| Type FE sinh từ OpenAPI (KHÔNG sửa tay) | `packages/types/src/api.generated.ts` | 0007 |
| Yup schema dùng chung | `packages/validators/src/` | — |

## Backend (`apps/api/src`)

| Cần gì | Ở đâu | Ghi chú |
| --- | --- | --- |
| Xác thực, session cookie | `modules/auth/` (`session.service.ts`, `token-verifier.ts`) | ADR 0002 |
| Guard: Auth / TenantScope / Permission | `common/guards/` | scope lấy từ membership |
| Decorator: `@CurrentUser` `@CurrentTenant` `@RequirePermissions` `@Public` | `common/decorators/index.ts` | — |
| Chuẩn hoá lỗi → `{error:{code}}` (gồm 23P01 → conflict) | `common/filters/all-exceptions.filter.ts` | ADR 0006 |
| Bọc `{data}` + Decimal→string | `common/interceptors/response.interceptor.ts` | ADR 0007 |
| DTO envelope + `@ApiProperty` | `common/dto/api-response.dto.ts` | ADR 0007 |
| Prisma client (adapter) | `prisma/prisma.service.ts` · factory ở `@xeprime/prisma` | ADR 0001 |
| **Ghi lịch xe — đường DUY NHẤT** | `modules/calendar/occupancy.service.ts` | ADR 0006 |
| Marketplace công khai + trang gian hàng `/public/shops/:slug` | `modules/public-listings/` (`public-listings.controller.ts`, `public-shops.controller.ts`) | ADR 0008 (đọc thẳng `vehicles`, chưa có snapshot) |
| Env validate (zod) | `config/env.schema.ts` | — |
| Module mẫu chuẩn (controller+guard+dto) | `modules/tenants/` | — |
| Sinh OpenAPI spec | `openapi.ts` (`nest build && node dist`) | ADR 0007 |

## Frontend (`apps/web/src`)

| Cần gì | Ở đâu | Ghi chú |
| --- | --- | --- |
| Format tiền / ngày giờ / classNames | `lib/money.ts` · `lib/datetime.ts` · `lib/cx.ts` | điểm extend dayjs duy nhất |
| Gọi API (`credentials:'include'`, bóc `data`) | `services/api-client.ts` | ADR 0002 |
| Query keys | `services/query-keys.ts` | — |
| Redux store + slices (chỉ client UI state) | `store/` | ADR 0004 |
| Filter/paging/range → **URL** | hook filter của feature (vd `features/calendar/hooks/use-calendar-filters.ts`) | ADR 0004 |
| Badge trạng thái (đọc meta từ types) | `components/data-display/StatusTag.tsx` | 0005 |
| Menu theo quyền · route constant | `constants/nav.ts` · `constants/routes.ts` | — |
| Provider (AntD/Redux/Query) | `app/providers.tsx` | — |
| Design token · CSS Modules · token.css↔theme.ts | `styles/theme.ts` · `styles/tokens.css` | ADR 0003 |
| Lịch (resource timeline) | `features/calendar/` | ADR 0006 |
| Marketplace + trang gian hàng `/shops/[slug]` (thẻ xe, chi tiết, hồ sơ shop) | `features/marketplace/` · `app/(public)/shops/[slug]/` | ADR 0008 |

## Database

| Cần gì | Ở đâu |
| --- | --- |
| Schema 12 bảng | `prisma/schema.prisma` |
| Migration init (trigger + `EXCLUDE USING gist`) | `prisma/migrations/*_init/migration.sql` |
| Seed (idempotent, 3 scope) | `prisma/src/seed.ts` |
| Cấu hình CLI Prisma 7 | `prisma/prisma.config.ts` |

## Tham chiếu nghiệp vụ (đọc để hiểu "cái gì đang chạy", KHÔNG copy pattern)

| Cần gì | Ở đâu |
| --- | --- |
| Host Portal cũ (dashboard/xe/đơn/khách/lịch/tài chính…) | `../Firebase-code/Vietrent/js/app.js` |
| Marketplace khách thuê cũ | `../Firebase-code/Vietrent/market/index.html` |
| Backend cũ (Cloud Functions: OTP, sync listing, notify) | `../Firebase-code/xeprime-functions/functions/index.js` |

## Vì sao (đọc khi cần lý do, đừng đoán)

`docs/decisions/` — 8 ADR. Mỗi quyết định kèm lý do và cái nó ghi đè. ADR thắng mọi tài liệu cũ khi mâu thuẫn.
