-- Tiền đơn QUA SÀN trong sổ Thu-Chi của chủ xe.
--
-- Trước migration này, khoản khách trả trước online cho XePrime (phần `D` của chủ xe trong tiền giữ
-- chỗ - ADR 0064) KHÔNG thành phiếu nào trong sổ: tiền đi thẳng vào Ví điểm lúc quyết toán. Hệ quả:
-- doanh thu của đơn qua sàn hụt đúng phần `D`, và thuế XePrime khấu trừ (`T` - ADR 0068) không có
-- ở đâu trong chi phí.
--
-- Từ nay, lượt quyết toán (`HoldSettlementService`) ghi HAI phiếu tự động, cùng transaction:
--   - phiếu THU `xeprime_payout` = phần của chủ xe trước thuế (`settled_owner_amount + settled_tax_amount`);
--   - phiếu CHI `tax_withheld`   = `settled_tax_amount` (chỉ khi > 0).
-- Cả hai trỏ `source_ref_id` = `booking_holds.id`, nên unique `(tenant_id, source, source_ref_id)`
-- chặn ghi đôi.
--
-- Migration: (1) mở CHECK nguồn phiếu, (2) thêm hai danh mục hệ thống, (3) ghi BÙ phiếu cho mọi khoản
-- giữ chỗ đã quyết toán có phần cho chủ xe. Không đổi tiền, ví, hay trạng thái nào khác.

-- @xeprime/types → RECEIPT_SOURCE
ALTER TABLE "public"."receipts" DROP CONSTRAINT "receipts_source_check";
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_source_check"
    CHECK ("source" IN ('manual', 'payment', 'deposit', 'deposit_refund', 'maintenance',
                        'xeprime_payout', 'tax_withheld'));

-- @xeprime/types → SYSTEM_FINANCE_CATEGORY. Seed (`prisma/src/seed/system.ts`) tra theo `system_key`,
-- nên hai dòng này không bị seed tạo lại.
INSERT INTO "public"."finance_categories" ("id", "tenant_id", "type", "name", "is_system", "system_key")
VALUES
    ('01M8BE47NGDH64W2PHP1GFQT32', NULL, 'income', 'Tiền qua XePrime', true, 'xeprime_payout'),
    ('01M8BE47NHBHDWET8DXKJHKGPA', NULL, 'expense', 'Thuế khấu trừ', true, 'tax_withheld')
ON CONFLICT ("system_key") WHERE "system_key" IS NOT NULL DO NOTHING;

-- Ghi bù: mỗi khoản giữ chỗ ĐÃ quyết toán có phần cho chủ xe. Id phiếu và số phiếu dựng tất định từ id
-- hold (chữ hex là ký tự hợp lệ của ULID Crockford), nên chạy lại cũng không đẻ dòng thứ hai.
INSERT INTO "public"."receipts" (
    "id", "tenant_id", "receipt_no", "type", "category_id", "booking_id", "vehicle_id",
    "tenant_customer_id", "amount", "payment_method", "description", "source", "source_ref_id",
    "occurred_at", "status", "approved_at", "created_at", "updated_at"
)
SELECT
    '01P' || upper(substr(md5('xeprime_payout:' || h."id"), 1, 23)),
    h."tenant_id",
    'PT-' || to_char(h."released_at" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') || '-'
        || upper(substr(md5('xeprime_payout_no:' || h."id"), 1, 8)),
    'income',
    (SELECT c."id" FROM "public"."finance_categories" c WHERE c."system_key" = 'xeprime_payout'),
    b."id",
    b."vehicle_id",
    b."tenant_customer_id",
    h."settled_owner_amount" + h."settled_tax_amount",
    'other',
    'Tiền thuê khách trả trước qua XePrime - đơn ' || b."code",
    'xeprime_payout',
    h."id",
    h."released_at",
    'approved',
    h."released_at",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."booking_holds" h
JOIN "public"."bookings" b ON b."id" = h."booking_id"
WHERE h."released_at" IS NOT NULL
  AND h."settled_owner_amount" + h."settled_tax_amount" > 0
  AND NOT EXISTS (
      SELECT 1 FROM "public"."receipts" r
      WHERE r."tenant_id" = h."tenant_id" AND r."source" = 'xeprime_payout' AND r."source_ref_id" = h."id"
  );

INSERT INTO "public"."receipts" (
    "id", "tenant_id", "receipt_no", "type", "category_id", "booking_id", "vehicle_id",
    "tenant_customer_id", "amount", "payment_method", "description", "source", "source_ref_id",
    "occurred_at", "status", "approved_at", "created_at", "updated_at"
)
SELECT
    '01Q' || upper(substr(md5('tax_withheld:' || h."id"), 1, 23)),
    h."tenant_id",
    'PC-' || to_char(h."released_at" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') || '-'
        || upper(substr(md5('tax_withheld_no:' || h."id"), 1, 8)),
    'expense',
    (SELECT c."id" FROM "public"."finance_categories" c WHERE c."system_key" = 'tax_withheld'),
    b."id",
    b."vehicle_id",
    b."tenant_customer_id",
    h."settled_tax_amount",
    'other',
    'Thuế XePrime khấu trừ, nộp thay - đơn ' || b."code",
    'tax_withheld',
    h."id",
    h."released_at",
    'approved',
    h."released_at",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."booking_holds" h
JOIN "public"."bookings" b ON b."id" = h."booking_id"
WHERE h."released_at" IS NOT NULL
  AND h."settled_tax_amount" > 0
  AND NOT EXISTS (
      SELECT 1 FROM "public"."receipts" r
      WHERE r."tenant_id" = h."tenant_id" AND r."source" = 'tax_withheld' AND r."source_ref_id" = h."id"
  );
