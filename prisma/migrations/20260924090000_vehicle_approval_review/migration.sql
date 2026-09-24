-- ═══════════════════════════════════════════════════════════════════════════
-- MÀN "DUYỆT XE" CỦA NỀN TẢNG (24/09/2026)
--
-- Ba thứ mới, và cả ba đều là thứ trước đây chỉ sống trong đầu người duyệt hoặc trong React
-- state — tức là mất ngay khi tải lại trang:
--
--   1. `approval_vehicle_subjects` — HÌNH CHIẾU HÀNG ĐỢI của phiếu duyệt XE: loại xe, tên, mã,
--      biển số, ảnh đại diện, NGUỒN ĐĂNG (gian hàng/cá nhân) chụp lúc gửi. Hàng đợi lọc, tìm và
--      đếm theo tab trên các cột này ở DB, TRƯỚC phân trang. Trước đây hàng đợi không lọc được
--      theo gì ngoài trạng thái/loại phiếu, và mọi thứ khác phải đọc `snapshot_json`.
--   2. `approval_review_checks` — danh mục KIỂM TRA THỦ CÔNG, mỗi (phiếu, mục) một dòng, có người
--      và thời điểm cập nhật. Phê duyệt bị backend chặn khi còn mục chưa đạt.
--   3. `approval_tasks.internal_note*` — GHI CHÚ NỘI BỘ của người duyệt, tách khỏi `reason` (lý do
--      gửi chủ xe), kèm người/thời điểm sửa làm khoá lạc quan.
--
-- ───────────────────────────────────────────────────────────────────────────
-- BACKFILL phiếu xe CŨ vào `approval_vehicle_subjects`
--
-- Phiếu xe đã tồn tại không có dòng hình chiếu, và hàng đợi mới chỉ liệt kê phiếu CÓ dòng đó —
-- không backfill thì mọi phiếu đang chờ biến khỏi màn duyệt sau deploy.
--
--  - Tên/mã/biển số/ảnh/loại xe: ưu tiên `snapshot_json` (thứ đã gửi), thiếu thì rơi về xe sống
--    (seed cũ và phiếu rất cũ không có snapshot).
--  - NGUỒN ĐĂNG: phiếu cũ không chụp tuyến, nên suy từ tuyến HIỆN TẠI — cùng bốn pha của
--    `resolveEffectiveBilling` (@xeprime/types): dòng thuê bao `active` gần nhất đã bắt đầu, còn
--    hạn HOẶC còn trong `graceDays` của gói thì giữ `billing_mode`; hết ân hạn là hoa hồng; không
--    có dòng nào/thiếu `billing_mode` là CHƯA CẤU HÌNH ⇒ mặt tiền cá nhân (`resolveStorefrontKind`
--    chỉ trả `shop` cho đúng `package`). `graceDays` đọc như `parsePlanLimits`: số nguyên ≥ 0,
--    mọi thứ khác là 0.
--  - Phiếu trỏ tới xe không còn tồn tại (không có trong `vehicles`) bị BỎ QUA: không còn gì để
--    duyệt, và FK của bảng mới không cho một dòng như vậy tồn tại.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: `IF NOT EXISTS` ở mọi lệnh tạo, và backfill `ON CONFLICT DO NOTHING`.
-- ⚠️ `prisma migrate diff` còn sinh kèm các lệnh DROP FK tổ hợp viết tay (xem header migration
--    init) — CỐ Ý không chép vào đây.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ghi chú nội bộ trên phiếu duyệt.
ALTER TABLE "approval_tasks" ADD COLUMN IF NOT EXISTS "internal_note" TEXT;
ALTER TABLE "approval_tasks" ADD COLUMN IF NOT EXISTS "internal_note_updated_by" CHAR(26);
ALTER TABLE "approval_tasks" ADD COLUMN IF NOT EXISTS "internal_note_updated_at" TIMESTAMPTZ(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_tasks_internal_note_length_check'
  ) THEN
    -- Cùng trần `APPROVAL_INTERNAL_NOTE_MAX_LENGTH` (@xeprime/types). DTO chặn trước; đây là
    -- chốt cho mọi đường ghi khác.
    ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_internal_note_length_check"
      CHECK ("internal_note" IS NULL OR char_length("internal_note") <= 2000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_tasks_internal_note_updated_by_fkey'
  ) THEN
    ALTER TABLE "approval_tasks" ADD CONSTRAINT "approval_tasks_internal_note_updated_by_fkey"
      FOREIGN KEY ("internal_note_updated_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Hàng đợi "Duyệt xe": target_type cố định + trạng thái + cũ nhất trước.
CREATE INDEX IF NOT EXISTS "approval_tasks_target_type_status_submitted_at_idx"
  ON "approval_tasks"("target_type", "status", "submitted_at");

-- 2. Hình chiếu hàng đợi của phiếu duyệt xe.
CREATE TABLE IF NOT EXISTS "approval_vehicle_subjects" (
    "approval_task_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "vehicle_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "plate_number" VARCHAR(50),
    "main_image_url" TEXT,
    "storefront_kind" VARCHAR(20) NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_vehicle_subjects_pkey" PRIMARY KEY ("approval_task_id"),
    -- Hai giá trị của `STOREFRONT_KIND` (@xeprime/types). Bộ lọc "Nguồn đăng" dựa vào đó.
    CONSTRAINT "approval_vehicle_subjects_storefront_kind_check"
      CHECK ("storefront_kind" IN ('personal', 'shop'))
);

CREATE INDEX IF NOT EXISTS "approval_vehicle_subjects_vehicle_id_idx"
  ON "approval_vehicle_subjects"("vehicle_id");
CREATE INDEX IF NOT EXISTS "approval_vehicle_subjects_vehicle_type_storefront_kind_idx"
  ON "approval_vehicle_subjects"("vehicle_type", "storefront_kind");
-- Tìm theo tên · biển số · mã (`ILIKE '%q%'`) — cùng kiểu index với `vehicles_search_trgm_idx`.
CREATE INDEX IF NOT EXISTS "approval_vehicle_subjects_search_trgm_idx"
  ON "approval_vehicle_subjects" USING GIN (
    "name" gin_trgm_ops, "plate_number" gin_trgm_ops, "code" gin_trgm_ops
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_vehicle_subjects_approval_task_id_fkey'
  ) THEN
    ALTER TABLE "approval_vehicle_subjects" ADD CONSTRAINT "approval_vehicle_subjects_approval_task_id_fkey"
      FOREIGN KEY ("approval_task_id") REFERENCES "approval_tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_vehicle_subjects_vehicle_id_fkey'
  ) THEN
    ALTER TABLE "approval_vehicle_subjects" ADD CONSTRAINT "approval_vehicle_subjects_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Danh mục kiểm tra thủ công.
CREATE TABLE IF NOT EXISTS "approval_review_checks" (
    "id" CHAR(26) NOT NULL,
    "approval_task_id" CHAR(26) NOT NULL,
    "check_key" VARCHAR(50) NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "updated_by" CHAR(26) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_review_checks_pkey" PRIMARY KEY ("id")
);

-- Một dòng cho mỗi (phiếu, mục): hai lượt đánh dấu cùng mục đua nhau là upsert vào CÙNG dòng.
CREATE UNIQUE INDEX IF NOT EXISTS "approval_review_checks_approval_task_id_check_key_key"
  ON "approval_review_checks"("approval_task_id", "check_key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_review_checks_approval_task_id_fkey'
  ) THEN
    ALTER TABLE "approval_review_checks" ADD CONSTRAINT "approval_review_checks_approval_task_id_fkey"
      FOREIGN KEY ("approval_task_id") REFERENCES "approval_tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_review_checks_updated_by_fkey'
  ) THEN
    ALTER TABLE "approval_review_checks" ADD CONSTRAINT "approval_review_checks_updated_by_fkey"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Backfill hình chiếu cho phiếu xe đã tồn tại (xem header).
INSERT INTO "approval_vehicle_subjects" (
  "approval_task_id", "vehicle_id", "vehicle_type", "name", "code", "plate_number",
  "main_image_url", "storefront_kind", "source_name"
)
SELECT
  t."id",
  v."id",
  COALESCE(NULLIF(t."snapshot_json" ->> 'vehicleType', ''), v."vehicle_type"),
  LEFT(COALESCE(NULLIF(t."snapshot_json" ->> 'name', ''), v."name"), 255),
  LEFT(COALESCE(NULLIF(t."snapshot_json" ->> 'code', ''), v."code"), 80),
  LEFT(
    CASE WHEN t."snapshot_json" ? 'plateNumber'
      THEN NULLIF(t."snapshot_json" ->> 'plateNumber', '')
      ELSE v."plate_number"
    END,
    50
  ),
  CASE WHEN t."snapshot_json" ? 'mainImageUrl'
    THEN NULLIF(t."snapshot_json" ->> 'mainImageUrl', '')
    ELSE v."main_image_url"
  END,
  CASE
    WHEN sub."billing_mode" = 'package'
      AND sub."ends_at" + make_interval(days => sub."grace_days") > now()
    THEN 'shop'
    ELSE 'personal'
  END,
  LEFT(tn."name", 255)
FROM "approval_tasks" t
JOIN "vehicles" v ON v."id" = t."target_id"
JOIN "tenants" tn ON tn."id" = v."tenant_id"
LEFT JOIN LATERAL (
  SELECT
    s."billing_mode",
    s."ends_at",
    CASE
      WHEN jsonb_typeof(p."limits_json" -> 'graceDays') = 'number'
        AND (p."limits_json" ->> 'graceDays') ~ '^[0-9]+$'
      THEN (p."limits_json" ->> 'graceDays')::int
      ELSE 0
    END AS "grace_days"
  FROM "tenant_subscriptions" s
  JOIN "plans" p ON p."id" = s."plan_id"
  WHERE s."tenant_id" = v."tenant_id"
    AND s."status" = 'active'
    AND s."starts_at" <= now()
  ORDER BY s."ends_at" DESC
  LIMIT 1
) sub ON TRUE
WHERE t."target_type" = 'vehicle'
ON CONFLICT ("approval_task_id") DO NOTHING;
