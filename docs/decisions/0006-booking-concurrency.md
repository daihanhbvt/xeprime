# ADR 0006 — Cơ chế chống trùng lịch

Ngày: 22/07/2026 · Trạng thái: Accepted · Áp dụng đầy đủ ở Phase 4, schema chuẩn bị từ Phase 0

## Bối cảnh

Tài liệu nhắc "transaction check conflict" khoảng 10 lần nhưng **không chỗ nào nói bằng cơ chế gì**. Grep toàn bộ `docs/`: không có `FOR UPDATE`, không có isolation level, không có unique/exclusion constraint.

Đây là ràng buộc đúng-sai quan trọng nhất của sản phẩm. Kịch bản hỏng: hai nhân viên cùng duyệt hai booking request cho cùng một xe, cùng khung giờ, cách nhau 50ms. Cả hai đều `SELECT` thấy trống, cả hai đều `INSERT`. Xe bị đặt hai lần, khách đến nơi không có xe.

Thêm một điểm tài liệu bỏ sót: lịch một xe bị chiếm bởi **nhiều nguồn khác nhau** — `bookings`, `vehicle_blocked_ranges` (khoá xe/bảo dưỡng), và cả `booking_requests` đã duyệt nhưng chưa chuyển thành booking. Constraint trên một bảng không chặn được xung đột giữa các bảng.

## Quyết định

### 1. Một bảng chiếm dụng lịch duy nhất: `vehicle_occupancies`

Mọi thứ chiếm chỗ trên lịch của một xe đều ghi vào đây, bất kể nguồn nào:

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `char(26)` | |
| `tenant_id` | `char(26)` | |
| `vehicle_id` | `char(26)` | |
| `source_type` | `varchar(30)` | `booking` · `blocked_range` · `maintenance` |
| `source_id` | `char(26)` | ID bản ghi nghiệp vụ tương ứng |
| `period` | `tstzrange` | `[start, end)` — nửa mở, trả 10:00 và nhận 10:00 **không** tính là đụng |
| `created_at` | `timestamptz` | |

Unique: `(source_type, source_id)`.

### 2. Ràng buộc ở tầng DB — đây mới là thứ thật sự bảo vệ

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE vehicle_occupancies
  ADD CONSTRAINT vehicle_occupancies_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
```

Từ lúc này, **PostgreSQL từ chối** bất kỳ INSERT/UPDATE nào tạo ra hai khoảng chồng nhau trên cùng một xe. Không phụ thuộc code app viết đúng hay sai, không phụ thuộc isolation level, không phụ thuộc có nhớ lock hay không.

Race condition ở trên trở thành: một request thành công, request kia nhận lỗi `23P01 exclusion_violation`.

### 3. Tầng ứng dụng

- `OccupancyService` là **đường ghi lịch duy nhất**. `BookingsService`, `BookingRequestsService`, `VehiclesService` (khoá xe) đều gọi qua nó, không tự `INSERT` vào `vehicle_occupancies`.
- Ghi occupancy và ghi bản ghi nghiệp vụ nằm **trong cùng một `prisma.$transaction`**.
- Bắt `23P01` → ném `ConflictException` với error code `BOOKING_SCHEDULE_CONFLICT` theo convention lỗi ở `CLAUDE.md` mục 9. Không để lỗi Postgres thô rò ra API.
- `POST /calendar/check-conflict` chỉ để **preview cho UX** (hiện cảnh báo trước khi người dùng bấm lưu). Nó **không phải** cơ chế bảo vệ — kết quả của nó có thể cũ ngay khi trả về. Bảo vệ thật nằm ở constraint.
- Buffer time giữa 2 đơn (`tenant_settings.buffer_time`): cộng vào `period` **lúc ghi**, không xử lý lúc đọc. Nếu buffer 60 phút thì `period` = `[pickup_at - 0, return_at + 60min)`. Như vậy constraint tự động enforce luôn cả buffer.

### 4. Trạng thái nào chiếm lịch

Chỉ ghi occupancy khi booking ở `reserved` · `confirmed` · `active`.
`completed` · `cancelled` · `no_show` → **xoá** occupancy trong cùng transaction đổi status.
Booking request ở `pending_host_approval` **không** chiếm lịch (nhiều khách có thể cùng hỏi một xe); chỉ chiếm khi chuyển `approved_by_host`.

## Test bắt buộc

Không phải "nên có" — thiếu thì không được merge Phase 4:

1. **Test song song thật**: N promise cùng gọi approve cho cùng xe/khung giờ → đúng 1 thành công, N-1 nhận `BOOKING_SCHEDULE_CONFLICT`. Chạy trên Postgres thật (testcontainers hoặc container của `docker-compose`), không mock Prisma.
2. Biên nửa mở: trả 10:00 + nhận 10:00 → hợp lệ. Trả 10:00 + nhận 09:59 → xung đột.
3. Buffer time: buffer 60 phút, nhận sau khi trả 30 phút → xung đột.
4. Đổi lịch (drag/resize) sang khung đã có đơn khác → xung đột, và đơn cũ **không** bị mất chỗ.
5. Booking bị huỷ → giải phóng lịch, đặt lại được ngay.

## Hệ quả

- Phụ thuộc `EXCLUDE USING gist` → khoá chặt vào PostgreSQL. Chấp nhận, xem [ADR 0001](0001-database-postgresql.md).
- `vehicle_occupancies` là bảng thứ 12, ngoài 11 bảng lõi Phase 0. Phase 0 chỉ cần khai báo trong schema; logic đầy đủ ở Phase 4.
- Prisma không mô tả được `tstzrange` và exclusion constraint → phải viết migration SQL tay và dùng `Unsupported("tstzrange")` trong schema. Truy vấn occupancy dùng `$queryRaw` có tham số hoá.
