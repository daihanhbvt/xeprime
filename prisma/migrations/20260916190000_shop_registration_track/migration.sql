-- ═══════════════════════════════════════════════════════════════════════════
-- HAI TUYẾN ĐĂNG KÝ, LƯU BỀN VỮNG (16/09/2026 — ADR 0040)
--
-- Hai điểm vào của sản phẩm dùng chung một endpoint và chỉ khác nhau ở câu chữ:
--
--   "Đăng xe cho thuê"   → chủ xe tuyến hoa hồng, làm việc ở /account (Owner Lite)
--   "Đăng ký gian hàng"  → gian hàng trả phí theo gói, làm việc ở /manage
--
-- Sau `POST /tenants`, backend gán gói hoa hồng mặc định cho MỌI tenant, nên `/auth/me` trả
-- `billing_mode = 'commission'` cho cả hai — và người vừa bấm "Đăng ký gian hàng" bị điều hướng
-- vào đúng màn "Hồ sơ chủ xe" của tuyến kia. Bốn cách phân biệt đã thử đều sai vì cùng một lý
-- do: chúng không sống qua một lần F5.
--
--   prop của component · `?next=` trong URL · state của router · "đã có gói hay chưa"
--
-- Nên ý định đăng ký thành DỮ LIỆU. Cột này là trục THỨ TƯ, độc lập với ba trục đã có:
--
--   tenants.status                     — gian hàng còn được hoạt động không (khoá/mở của nền tảng)
--   tenant_subscriptions.billing_mode  — tiền chạy theo tuyến nào NGAY LÚC NÀY
--   approval_tasks (targetType tenant) — nền tảng đã xem xét pháp nhân chưa
--   tenants.onboarding_state           — người này vào bằng cửa nào, và còn nợ bước nào  ← MỚI
--
-- Vì sao KHÔNG mượn `tenants.status`: cột đó là trạng thái VẬN HÀNH và `TENANT_STATUS_PUBLISHABLE`
-- chỉ nhận `active`. Biểu diễn "chờ thanh toán gói" bằng nó nghĩa là toàn bộ xe của một gian hàng
-- đang bán biến khỏi marketplace mỗi lần họ gia hạn — đúng lỗi mà ADR 0036 đã gỡ một lần.
--
-- ─── Ba giá trị ──────────────────────────────────────────────────────────────────────────────
--
--   commission       cửa "Đăng xe cho thuê" (mặc định). Không nợ bước nào.
--   package_pending  cửa "Đăng ký gian hàng", CHƯA thanh toán ⇒ chỉ vào được màn onboarding.
--   package_active   hoá đơn gói đã `paid` và thuê bao đã bật ⇒ /manage đầy đủ.
--
-- `package_pending → package_active` ghi trong CHÍNH transaction bật thuê bao
-- (`BillingService.activateFromInvoiceWithinTx`, và đường admin gán tay). `package_active` KHÔNG
-- bao giờ lùi lại: gói hết hạn là chuyện của `billing_mode`, còn cửa vào thì không đổi — lùi nó
-- sẽ đẩy một gian hàng đang vận hành thật vào màn đăng ký lần đầu.
--
-- ─── Backfill ────────────────────────────────────────────────────────────────────────────────
--
-- Tenant nào ĐANG hoặc TỪNG mang một dòng thuê bao tuyến `package` thì đã đi qua cửa gian hàng
-- và đã trả tiền: đánh `package_active`. Hỏi cả dòng đã hết hạn/đã huỷ có chủ đích — câu hỏi là
-- "đã từng", không phải "còn hạn". Mọi tenant còn lại giữ `commission` theo DEFAULT.
--
-- KHÔNG có tenant nào được backfill thành `package_pending`: trạng thái đó chỉ sinh ra từ lượt
-- đăng ký mới, và đoán nó cho dữ liệu cũ là khoá một gian hàng đang chạy ra khỏi Manage.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "onboarding_state" VARCHAR(20) NOT NULL DEFAULT 'commission';

-- CHECK thay vì enum Postgres — ADR 0005: status là String ở Prisma, DB canh bằng CHECK.
ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_onboarding_state_check";
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_onboarding_state_check"
  CHECK ("onboarding_state" IN ('commission', 'package_pending', 'package_active'));

UPDATE "tenants" AS t
   SET "onboarding_state" = 'package_active'
 WHERE t."onboarding_state" = 'commission'
   AND EXISTS (
     SELECT 1
       FROM "tenant_subscriptions" s
      WHERE s."tenant_id" = t."id"
        AND s."billing_mode" = 'package'
   );

-- Hàng đợi onboarding của nền tảng ("ai đã tạo gian hàng mà chưa trả tiền") quét đúng một giá
-- trị trên một cột; index partial giữ nó là index-only scan mà không nặng thêm bảng `tenants`.
CREATE INDEX IF NOT EXISTS "tenants_package_onboarding_pending_idx"
  ON "tenants" ("created_at")
  WHERE "onboarding_state" = 'package_pending';
