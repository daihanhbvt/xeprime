-- ═══════════════════════════════════════════════════════════════════════════
-- `tenants.used_features` — tenant này ĐÃ TỪNG dùng tính năng nâng cao nào
-- (30/08/2026, ADR 0027 điều 3)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Chỉ THÊM một cột + backfill.
--
-- Vì sao cần cột: ADR 0027 điều 3 có BA trạng thái, và trạng thái giữa (`read_only`) phân biệt
-- với `hidden` bằng đúng một câu hỏi — "tenant này đã có dữ liệu của tính năng đó chưa". Hỏi câu
-- đó bằng `EXISTS(...)` trên bảng nghiệp vụ ở MỖI request là 7 câu đếm trên 7 bảng cho một guard
-- chạy toàn cục. Cột này là câu trả lời đã tính sẵn; interceptor cập nhật nó khi có lượt GHI
-- thành công.
--
-- ⚠️ Cột này KHÔNG BAO GIỜ được dùng để cấp quyền. Nó chỉ chọn giữa `read_only` và `hidden` —
-- cả hai đều là "không có cờ trong gói". Quyền dùng đến từ `plans.limits_json.features`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tenants"
    ADD COLUMN "used_features" TEXT[] NOT NULL DEFAULT '{}';

-- CHECK cố ý: thêm cờ thứ 9 vào `PLAN_FEATURE` (packages/types/src/status/billing.ts) buộc phải
-- viết một migration nới constraint này ⇒ hai danh sách không trôi khỏi nhau trong im lặng.
-- KHÔNG index: cột luôn đọc theo khoá chính (một tenant mỗi request), không bao giờ lọc theo nó.
ALTER TABLE "public"."tenants"
    ADD CONSTRAINT "tenants_used_features_check"
    CHECK ("used_features" <@ ARRAY[
        'finance', 'debts', 'maintenance', 'members',
        'branches', 'drivers', 'contracts', 'escrow_hold'
    ]::text[]);

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill — MỖI CỜ MỘT CÂU LỆNH, để review được từng vị từ một
--
-- Nguyên tắc chung: vị từ trả lời "đã từng dùng", nên KHÔNG lọc `deleted_at` — một phiếu thu tay
-- đã xoá mềm vẫn chứng minh tenant đó có dùng sổ thu chi, và dữ liệu vẫn còn để họ xem lại.
--
-- Siết quá tay ở đây ⇒ tenant đang dùng thật rơi vào `hidden` và MẤT menu sổ sách của chính mình
-- ngay ngày bật cổng chặn. Nới quá tay ⇒ vài tenant thấy menu chỉ-đọc mà lẽ ra không cần thấy.
-- Hai sai lầm không cân nhau, nên mọi chỗ mập mờ đều nghiêng về NỚI.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── finance ────────────────────────────────────────────────────────────────
-- ⚠️ KHÔNG phải `EXISTS(receipts)`. `ReceiptsService.createApprovedWithinTx` sinh phiếu TỰ ĐỘNG
-- cho MỌI tenant từng nhận tiền của một đơn (settlement / payments / maintenance) — dùng EXISTS
-- thẳng là đánh dấu cả sàn "đã dùng sổ thu chi" và không bao giờ có ai ở `hidden`.
-- Dấu hiệu dùng THẬT: có phiếu do người nhập tay, hoặc đã tự tạo hạng mục thu/chi riêng
-- (`finance_categories.tenant_id IS NOT NULL` — hạng mục hệ thống có `tenant_id` NULL).
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'finance')
WHERE NOT ('finance' = ANY (t."used_features"))
  AND (
      EXISTS (SELECT 1 FROM "public"."receipts" r WHERE r."tenant_id" = t."id" AND r."source" = 'manual')
      OR EXISTS (SELECT 1 FROM "public"."finance_categories" fc WHERE fc."tenant_id" = t."id")
  );

-- ── debts ──────────────────────────────────────────────────────────────────
-- Cùng vị từ với `finance`: công nợ không có bảng riêng — `/debts` suy ra từ `bookings` +
-- `receipts`. Viết thành câu riêng (thay vì gộp) để lần sau sửa một cờ không đụng cờ kia.
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'debts')
WHERE NOT ('debts' = ANY (t."used_features"))
  AND (
      EXISTS (SELECT 1 FROM "public"."receipts" r WHERE r."tenant_id" = t."id" AND r."source" = 'manual')
      OR EXISTS (SELECT 1 FROM "public"."finance_categories" fc WHERE fc."tenant_id" = t."id")
  );

-- ── maintenance ────────────────────────────────────────────────────────────
-- Hồ sơ chu kỳ (`profiles`) tính là đã dùng ngang với phiếu (`records`): đặt chu kỳ bảo dưỡng là
-- một lần cấu hình thật, và mất nó khi hết hạn cũng khó chịu như mất lịch sử phiếu.
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'maintenance')
WHERE NOT ('maintenance' = ANY (t."used_features"))
  AND (
      EXISTS (SELECT 1 FROM "public"."vehicle_maintenance_records" m WHERE m."tenant_id" = t."id")
      OR EXISTS (SELECT 1 FROM "public"."vehicle_maintenance_profiles" p WHERE p."tenant_id" = t."id")
  );

-- ── members ────────────────────────────────────────────────────────────────
-- ⚠️ Ngưỡng là `> 1`, KHÔNG phải EXISTS: `registerShop` luôn tạo sẵn membership của chủ shop, nên
-- EXISTS đúng với 100% tenant. Người thứ hai (hoặc một lời mời đã gửi) mới là dấu hiệu dùng thật.
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'members')
WHERE NOT ('members' = ANY (t."used_features"))
  AND (
      (SELECT count(*) FROM "public"."tenant_memberships" tm WHERE tm."tenant_id" = t."id") > 1
      OR EXISTS (SELECT 1 FROM "public"."tenant_invites" ti WHERE ti."tenant_id" = t."id")
  );

-- ── branches ───────────────────────────────────────────────────────────────
-- ⚠️ Cũng `> 1` và cùng lý do: `registerShop` luôn tạo một chi nhánh mặc định. Ở đây LỌC
-- `deleted_at` (khác các vị từ trên): chi nhánh mặc định không xoá được, nên một tenant có đúng
-- một chi nhánh sống + vài chi nhánh đã xoá thì vẫn là tenant ĐÃ TỪNG dùng nhiều chi nhánh —
-- `count(*) > 1` trên bản ghi chưa xoá bắt đúng ca đang-nhiều, và ca đã-xoá-hết rơi về `hidden`
-- một cách vô hại (họ không còn gì để xem).
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'branches')
WHERE NOT ('branches' = ANY (t."used_features"))
  AND (
      SELECT count(*) FROM "public"."tenant_branches" b
      WHERE b."tenant_id" = t."id" AND b."deleted_at" IS NULL
  ) > 1;

-- ── drivers ────────────────────────────────────────────────────────────────
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'drivers')
WHERE NOT ('drivers' = ANY (t."used_features"))
  AND EXISTS (SELECT 1 FROM "public"."drivers" d WHERE d."tenant_id" = t."id");

-- ── contracts ──────────────────────────────────────────────────────────────
-- `contracts` = hợp đồng THUÊ sinh từ đơn. Không đụng `vehicle_source_details` (hợp đồng nguồn
-- gốc xe) — đó là bậc cơ bản, không phải tính năng bán.
UPDATE "public"."tenants" t
SET "used_features" = array_append(t."used_features", 'contracts')
WHERE NOT ('contracts' = ANY (t."used_features"))
  AND EXISTS (SELECT 1 FROM "public"."contracts" c WHERE c."tenant_id" = t."id");

-- ── escrow_hold ────────────────────────────────────────────────────────────
-- CỐ Ý không backfill: ADR 0025 chưa thi công, chưa endpoint nào ghi dữ liệu escrow. Đánh dấu
-- "đã dùng" một thứ chưa tồn tại là dựng sẵn một trạng thái `read_only` không có gì để đọc.
