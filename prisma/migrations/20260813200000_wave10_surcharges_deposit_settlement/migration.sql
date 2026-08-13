-- Wave 10 — Phát sinh cuối chuyến, hoàn cọc thủ công, và ranh giới "cọc đã thu".
--
-- Toàn bộ migration này là THÊM: không xoá cột nào, không đụng dữ liệu cũ. Biên bản bàn giao cũ
-- vẫn giữ nguyên mức nhiên liệu/% pin (Wave 10 chỉ ngừng THU THẬP, xem docs/design/14 §8).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. payments.kind — phân biệt tiền THUÊ với tiền CỌC
-- ─────────────────────────────────────────────────────────────────────────────
-- Trước Wave 10 không có cách nào chứng minh đã thu cọc, nên `bookings.deposit_amount` (số cấu
-- hình) từng bị đọc thành "tiền đã cầm". Mọi khoản cũ mặc định là tiền thuê — đúng với thực tế
-- vì luồng thu cọc chưa từng tồn tại.
ALTER TABLE "payments" ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'rental';

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_kind_check" CHECK ("kind" IN ('rental', 'deposit'));

-- Truy vấn nóng: "đơn này đã thu cọc bao nhiêu".
CREATE INDEX "payments_booking_kind_idx" ON "payments" ("booking_id", "kind");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vehicle_handovers.occurred_at — mốc việc THỰC SỰ xảy ra
-- ─────────────────────────────────────────────────────────────────────────────
-- Tách khỏi `confirmed_at`: nhân viên giao xe lúc 9h rồi 9h20 mới vào ghi. Client chọn được mốc
-- này nhưng KHÔNG chọn được `confirmed_at`, nên vẫn còn một mốc bất biến để đối soát nếu ai đó
-- khai lùi giờ. NULL = bản ghi trước Wave 10 → đọc `confirmed_at`.
ALTER TABLE "vehicle_handovers" ADD COLUMN "occurred_at" TIMESTAMPTZ(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. booking_surcharges — khoản phát sinh cuối chuyến
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "booking_surcharges" (
  "id"          CHAR(26)      PRIMARY KEY,
  "tenant_id"   CHAR(26)      NOT NULL,
  "booking_id"  CHAR(26)      NOT NULL,
  "category"    VARCHAR(30)   NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "reason"      TEXT          NOT NULL,
  "voided_at"   TIMESTAMPTZ(3),
  "voided_by"   CHAR(26),
  "void_reason" TEXT,
  "created_by"  CHAR(26),
  "updated_by"  CHAR(26),
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  CONSTRAINT "booking_surcharges_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "booking_surcharges_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,

  -- Bốn danh mục, KHÔNG có nhiên liệu (docs/design/14 §4.2 + §8). Ràng buộc ở DB chứ không chỉ
  -- ở DTO: thêm lại `fuel` phải là một quyết định có migration, không phải một dòng code lọt qua.
  CONSTRAINT "booking_surcharges_category_check"
    CHECK ("category" IN ('overtime', 'cleaning', 'damage', 'other')),
  CONSTRAINT "booking_surcharges_amount_check" CHECK ("amount" >= 0),
  -- Huỷ là một hành động có người và có lý do — không cho phép nửa vời.
  CONSTRAINT "booking_surcharges_void_check" CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL)
    OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL)
  )
);

CREATE INDEX "booking_surcharges_tenant_booking_idx"
  ON "booking_surcharges" ("tenant_id", "booking_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. booking_deposit_settlements — ghi nhận đã hoàn cọc (thủ công)
-- ─────────────────────────────────────────────────────────────────────────────
-- MỘT bản ghi cho mỗi đơn: sửa lại thì cập nhật tại chỗ kèm audit before/after, không đẻ bản
-- mới. `deposit_received`/`surcharge_total` được CHỤP LẠI tại thời điểm ghi nhận — thêm một
-- khoản phát sinh sau khi đã hoàn tiền không được sửa lịch sử đã hoàn bao nhiêu.
CREATE TABLE "booking_deposit_settlements" (
  "id"               CHAR(26)      PRIMARY KEY,
  "tenant_id"        CHAR(26)      NOT NULL,
  "booking_id"       CHAR(26)      NOT NULL UNIQUE,
  "deposit_received" DECIMAL(14,2) NOT NULL,
  "surcharge_total"  DECIMAL(14,2) NOT NULL,
  "refund_amount"    DECIMAL(14,2) NOT NULL,
  "refund_method"    VARCHAR(30)   NOT NULL,
  "refunded_at"      TIMESTAMPTZ(3) NOT NULL,
  "reference"        VARCHAR(255),
  "note"             TEXT,
  "recorded_by"      CHAR(26),
  "row_version"      INTEGER       NOT NULL DEFAULT 1,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  CONSTRAINT "booking_deposit_settlements_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "booking_deposit_settlements_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,

  CONSTRAINT "booking_deposit_settlements_method_check"
    CHECK ("refund_method" IN ('bank_transfer', 'cash', 'other')),
  CONSTRAINT "booking_deposit_settlements_amounts_check" CHECK (
    "deposit_received" >= 0 AND "surcharge_total" >= 0 AND "refund_amount" >= 0
  ),
  -- Không hoàn nhiều hơn số đã thu: đây là trả lại cọc, không phải một khoản chi mới.
  CONSTRAINT "booking_deposit_settlements_not_over_refund_check"
    CHECK ("refund_amount" <= "deposit_received")
);

CREATE INDEX "booking_deposit_settlements_tenant_booking_idx"
  ON "booking_deposit_settlements" ("tenant_id", "booking_id");
