# ADR 0005 — Nguồn chốt duy nhất cho status enum

Ngày: 22/07/2026 · Trạng thái: Accepted

## Bối cảnh

Ba tài liệu định nghĩa status khác nhau cho cùng một thứ:

| Thứ | `database_design.md` | `screen_spec.md` | `overall_user_flow.md` |
| --- | --- | --- | --- |
| Vehicle public | `approved_public`, `pending_public_review` | giống DB | `published`, `pending_review` |
| Booking | `active` | giống DB | `in_progress`, có thêm `draft` |
| Booking request | `approved_by_host`, `cancelled_by_customer` | giống DB | `approved`, `customer_cancelled` |

Vì `status` được lưu là `String` (không phải DB enum), **database không chặn giúp**. Một lỗi chính tả hoặc dùng nhầm biến thể sẽ trở thành bug im lặng: xe không lên marketplace, đơn không hiện trên lịch, và không có lỗi nào được ném ra.

## Quyết định

### 1. Bộ status chốt

Lấy theo `database_design.md` (được `screen_spec.md` xác nhận — 2/3 tài liệu đồng thuận, và là bản chi tiết nhất). `overall_user_flow.md` **bị ghi đè** ở các mục status.

```text
tenant.status
  draft · pending_review · needs_revision · active · suspended · rejected · expired

vehicle.public_status
  draft · pending_public_review · approved_public · needs_revision · rejected · hidden · archived

vehicle.operation_status
  available · renting · maintenance · inactive

booking_request.status
  pending_host_approval · approved_by_host · rejected_by_host
  cancelled_by_customer · expired · converted_to_booking

booking.status
  reserved · confirmed · active · completed · cancelled · no_show

approval_task.status
  pending · approved · rejected · needs_revision · cancelled

receipt.status
  draft · pending_approval · approved · cancelled

conversation.status
  open · closed · flagged · archived

tenant_subscription.status
  trial · active · past_due · expired · cancelled
```

### 2. Nơi khai báo: `packages/types`

DB lưu `String`, nhưng TypeScript **phải** chặn. Mỗi nhóm status là một `as const` + union type, dùng chung cho cả `apps/api` và `apps/web`:

```ts
// packages/types/src/status/booking.ts
export const BOOKING_STATUS = {
  RESERVED:  'reserved',
  CONFIRMED: 'confirmed',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW:   'no_show',
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];
export const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS);
```

Ràng buộc:

- **Không viết string literal trần** ở bất kỳ đâu — luôn `BOOKING_STATUS.ACTIVE`. Đây là cụ thể hoá của điều cấm "hard code status" trong `CLAUDE.md`.
- DTO backend validate bằng `@IsIn(BOOKING_STATUS_VALUES)`.
- Prisma không sinh được union này (cột là `String`), nên **repository/service phải khai báo kiểu trả về dùng `BookingStatus`**, không để `string` rò ra ngoài tầng data.
- Nhãn tiếng Việt và màu hiển thị nằm cạnh đó (`booking.labels.ts`), không rải trong component. `StatusTag` đọc từ map này.

### 3. Vì sao vẫn giữ `String` thay vì PG enum

PostgreSQL **có** enum thật, khác với MySQL. Nhưng vẫn giữ `String` vì:

- Thêm giá trị vào PG enum phải `ALTER TYPE`, và **không xoá được giá trị** — sản phẩm còn đang định hình status, khả năng cao sẽ thêm/bớt.
- Union type ở tầng TS đã bắt được gần như toàn bộ lỗi thực tế, ngay lúc compile.
- Bù lại bằng `CHECK` constraint ở migration cho các bảng đã ổn định (`bookings`, `tenants`) — được validate ở DB mà vẫn sửa được bằng một migration đơn giản.

## Hệ quả

- Bảng mapping status cũ → mới cho script migrate Phase 8 (`cho_duyet` → `pending_host_approval`, `congKhai=true` → **không** auto `approved_public`, đưa vào `pending_public_review` và xuất report).
- Khi tài liệu trong `docs/` mâu thuẫn với file này, **file này thắng**.
