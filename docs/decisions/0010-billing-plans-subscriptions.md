# ADR 0010 — Gói dịch vụ & thuê bao gian hàng: history append-only, "hết hạn" suy ra, limit tối thiểu

Ngày: 31/07/2026 · Trạng thái: Accepted · Áp dụng ở Phase 7 (Billing/plans)

> ⚠️ **Đã bị [ADR 0015](0015-vehicle-slot-billing.md) sửa (21/08/2026).** Ba điều không còn đúng:
> `duration_days` đổi sang `duration_months` (tháng lịch) · `plans` tách năng lực khỏi kỳ hạn ·
> "không gói = không giới hạn" bị đảo (nay `registerShop` tự gán gói). Phần *append-only*,
> *"hết hạn" suy ra từ `ends_at`* và *1-writer `BillingService`* vẫn giữ nguyên.

## Bối cảnh

Build plan §11 yêu cầu "Billing/plans: gói, gia hạn, invoice" với done-when "gia hạn gói cập nhật
subscription history". Trước ADR này chưa có bảng nào cho gói/thuê bao — chỉ có cột trần
`payments.subscription_id` (chờ sẵn, chưa FK) và `TENANT_STATUS.EXPIRED` ('Hết hạn gói') trong
union trạng thái tenant. Cần chốt: mô hình dữ liệu, cách "gia hạn" ghi lịch sử, ai là writer,
enforce giới hạn ở đâu, và cái gì hoãn.

## Quyết định

1. **Hai bảng: `plans` + `tenant_subscriptions`.** `plans` là danh mục gói (code unique, giá
   snapshot-able, `duration_days`, `max_vehicles` NULL = không giới hạn, `limits_json` jsonb dự
   phòng giới hạn tương lai khỏi migrate). `tenant_subscriptions` là **lịch sử append-only**: mỗi
   lần gán/gia hạn chèn MỘT dòng mới với `starts_at`/`ends_at`/`price` snapshot tại thời điểm gán
   — không update dòng cũ (trừ huỷ sớm: `active → cancelled`).

2. **"Hết hạn" SUY RA từ `ends_at`, không có job lật status.** Dòng lưu status chỉ có
   `active | cancelled` (tập con của `SUBSCRIPTION_STATUS` sẵn có); "gói hiện hành" = dòng
   `active` có `starts_at <= now() < ends_at`, lấy `ends_at` muộn nhất. Gia hạn trước hạn thì
   `starts_at = ends_at` của gói hiện hành (nối đuôi); gia hạn sau khi hết hạn thì bắt đầu từ
   `now()`. Không cần cron/worker — đổi lại, "expired" chỉ tồn tại lúc đọc (FE/BE tự suy).

3. **`BillingService` (module `billing` riêng) là ĐƯỜNG GHI DUY NHẤT của cả hai bảng** (quy tắc
   1-writer như OccupancyService/ListingsService). Đặt module riêng — không nhét vào
   `platform-admin` — vì tenant module (`vehicles`) cần import để enforce quota; đọc-only từ chỗ
   khác (vd tenant detail) thì query thẳng được.

4. **Enforce giới hạn: MỘT điểm duy nhất lúc này — `assertVehicleQuota` chặn TẠO XE MỚI** khi
   tenant có gói hiện hành mà `max_vehicles` đã chạm (lỗi `PLAN_LIMIT_REACHED`). **Không có gói
   (hoặc `max_vehicles` NULL) = không giới hạn** — grandfather toàn bộ tenant hiện có, không cần
   backfill. Enforce ở submit-public/booking: chưa làm (ghi ở "Hoãn").

5. **Quyền:** `platform.billing.manage` (mới) cho CRUD gói + gán/gia hạn/huỷ thuê bao (mặc định:
   `platform_admin`, `finance_admin`). Xem gói trong chi tiết gian hàng đi theo
   `platform.tenant.manage` (là thông tin tenant).

## Hoãn có chủ đích (làm sau, không phải quên)

- **Invoice / ghi nhận thanh toán gia hạn:** `payments.subscription_id` vẫn để trần chưa FK;
  `PaymentsService` đang booking-centric, ghi nhận tiền gói cần đường ghi riêng.
- **Tự động hoá hết hạn:** không notification/không tự khoá tenant khi gói hết hạn
  (`TENANT_STATUS.EXPIRED` chưa được flow nào set) — cần quyết định nghiệp vụ trước.
- **Self-serve:** shop tự nâng cấp/thanh toán online.
- **Enforce thêm:** chặn submit-public/booking khi hết hạn gói.

## Hệ quả

- Lịch sử gia hạn đọc thẳng từ bảng, thoả done-when §11.2; audit (`subscription.assign|renew|cancel`,
  `plan.create|update|archive`) ghi trong cùng transaction.
- Đổi giá gói không ảnh hưởng thuê bao đã gán (price snapshot trên dòng subscription).
- Trả lời "tenant này gói gì?" cần 1 query có điều kiện thời gian — index `(tenant_id, ends_at)`.
