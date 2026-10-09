-- ════════════════════════════════════════════════════════════════════════════════════════════
-- BẰNG LÁI CỦA TÀI KHOẢN KHÁCH — ADR 0057
--
-- Khách thuê xe tự lái / dài hạn phải có bằng lái đã xác thực. Mỗi lượt nộp ảnh là một dòng;
-- máy đọc ảnh tự quyết khi đủ điều kiện, phần còn lại sang hàng đợi duyệt của nền tảng.
--
-- Những gì Prisma KHÔNG diễn đạt được, viết tay ở đây:
--   • CHECK cho từng cột mã (status / kind / rejection_reason / decision_source) — ADR 0005;
--   • CHECK liên cột: lý do ⇔ bị từ chối, bằng đã xác thực phải đủ trường, quyết định tay phải
--     có người quyết, "không thời hạn" không đi cùng ngày hết hạn;
--   • hai partial unique: một bằng ĐANG DÙNG và một lượt nộp ĐANG DỞ cho mỗi tài khoản;
--   • `licence_classes` NOT NULL (prisma migrate diff làm rơi NOT NULL của cột mảng);
--   • `realm` cố định `customer` + FK tổ hợp → chỉ tài khoản khách mang được bằng lái.
--
-- Kèm quyền `platform.driver_licences.review` cho hàng đợi duyệt (production không chạy seed —
-- cùng cách với 20260925120000_tenant_support_permissions).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "customer_driver_licences" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "realm" VARCHAR(20) NOT NULL DEFAULT 'customer',
    "status" VARCHAR(20) NOT NULL,
    "object_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3),
    "kind" VARCHAR(30),
    "licence_number" VARCHAR(40),
    "full_name" VARCHAR(160),
    "date_of_birth" DATE,
    "licence_classes" VARCHAR(8)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(8)[],
    "issued_on" DATE,
    "expires_on" DATE,
    "no_expiry" BOOLEAN NOT NULL DEFAULT false,
    "issuing_country" CHAR(2),
    "covers_car" BOOLEAN NOT NULL DEFAULT false,
    "covers_motorbike" BOOLEAN NOT NULL DEFAULT false,
    "ocr_provider" VARCHAR(50),
    "ocr_model" VARCHAR(80),
    "ocr_result_json" JSONB,
    "ocr_error_code" VARCHAR(60),
    "ocr_completed_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(30),
    "review_note" VARCHAR(500),
    "review_requested_at" TIMESTAMPTZ(3),
    "decision_source" VARCHAR(10),
    "decided_by" CHAR(26),
    "decided_at" TIMESTAMPTZ(3),
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "image_deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_driver_licences_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "customer_driver_licences_realm_check" CHECK ("realm" = 'customer'),
    CONSTRAINT "customer_driver_licences_status_check" CHECK (
        "status" IN ('uploading', 'processing', 'pending_review', 'verified', 'rejected', 'superseded', 'cancelled')
    ),
    CONSTRAINT "customer_driver_licences_kind_check" CHECK (
        "kind" IS NULL OR "kind" IN ('vn', 'international_permit', 'foreign')
    ),
    CONSTRAINT "customer_driver_licences_rejection_reason_check" CHECK (
        "rejection_reason" IS NULL OR "rejection_reason" IN (
            'not_a_licence', 'back_side', 'unreadable', 'missing_fields', 'expired', 'no_drivable_class', 'other'
        )
    ),
    CONSTRAINT "customer_driver_licences_decision_source_check" CHECK (
        "decision_source" IS NULL OR "decision_source" IN ('auto', 'manual')
    ),
    CONSTRAINT "customer_driver_licences_mime_check" CHECK (
        "mime_type" IN ('image/jpeg', 'image/png', 'image/webp')
    ),
    CONSTRAINT "customer_driver_licences_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880),
    -- Có lý do ⇔ bị từ chối. Một dòng `rejected` không lý do là một câu "không hợp lệ" khách không
    -- làm gì tiếp được; một dòng `verified` mang lý do từ chối là dữ liệu nói hai điều.
    CONSTRAINT "customer_driver_licences_rejection_pairing_check" CHECK (
        ("status" = 'rejected') = ("rejection_reason" IS NOT NULL)
    ),
    -- Lý do "khác" chỉ người duyệt dùng, và phải nói cho khách biết là gì.
    CONSTRAINT "customer_driver_licences_other_reason_note_check" CHECK (
        "rejection_reason" IS DISTINCT FROM 'other' OR "review_note" IS NOT NULL
    ),
    -- Bằng ĐÃ XÁC THỰC (kể cả đã bị thay) phải đủ những gì cổng đặt xe đọc.
    CONSTRAINT "customer_driver_licences_verified_complete_check" CHECK (
        "status" NOT IN ('verified', 'superseded') OR (
            "kind" IS NOT NULL
            AND "licence_number" IS NOT NULL
            AND "full_name" IS NOT NULL
            AND cardinality("licence_classes") >= 1
            AND ("no_expiry" OR "expires_on" IS NOT NULL)
            AND "decision_source" IS NOT NULL
            AND "decided_at" IS NOT NULL
            AND "uploaded_at" IS NOT NULL
        )
    ),
    CONSTRAINT "customer_driver_licences_expiry_pairing_check" CHECK (
        NOT ("no_expiry" AND "expires_on" IS NOT NULL)
    ),
    -- Quyết định tay phải có người quyết; máy tự quyết thì không có ai để ghi.
    CONSTRAINT "customer_driver_licences_decider_check" CHECK (
        "decision_source" IS DISTINCT FROM 'manual' OR "decided_by" IS NOT NULL
    ),
    CONSTRAINT "customer_driver_licences_decision_pairing_check" CHECK (
        ("decision_source" IS NULL) = ("decided_at" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_driver_licences_object_key_key" ON "customer_driver_licences"("object_key");

-- CreateIndex
CREATE INDEX "customer_driver_licences_user_created_idx" ON "customer_driver_licences"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customer_driver_licences_status_created_idx" ON "customer_driver_licences"("status", "created_at");

-- CreateIndex
CREATE INDEX "customer_driver_licences_full_name_trgm_idx" ON "customer_driver_licences" USING GIN ("full_name" gin_trgm_ops);

-- Một bằng ĐANG DÙNG cho mỗi tài khoản. Duyệt bằng mới = chuyển bằng cũ sang `superseded` trong
-- CÙNG transaction; hai người duyệt cùng lúc thì một người nhận vi phạm unique, không phải hai
-- bằng "đang dùng" nói hai hạn khác nhau.
CREATE UNIQUE INDEX "customer_driver_licences_one_verified_key"
    ON "customer_driver_licences"("user_id")
    WHERE "status" = 'verified';

-- Một lượt nộp ĐANG DỞ cho mỗi tài khoản. Nộp ảnh mới thì lượt dở cũ chuyển `cancelled` trước.
CREATE UNIQUE INDEX "customer_driver_licences_one_in_flight_key"
    ON "customer_driver_licences"("user_id")
    WHERE "status" IN ('uploading', 'processing', 'pending_review');

-- AddForeignKey
ALTER TABLE "customer_driver_licences" ADD CONSTRAINT "customer_driver_licences_user_realm_fkey"
    FOREIGN KEY ("user_id", "realm") REFERENCES "users"("id", "realm") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, không SET NULL: quyết định TAY bắt buộc có người quyết (CHECK `decider_check`), nên
-- xoá cứng tài khoản người duyệt phải được chặn rõ ràng thay vì nổ CHECK giữa chừng.
ALTER TABLE "customer_driver_licences" ADD CONSTRAINT "customer_driver_licences_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Quyền hàng đợi duyệt ────────────────────────────────────────────────────────────────────
-- id = seedId('permission:platform.driver_licences.review') — CÙNG id seed hệ thống sinh.
INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW200WG3N06ZJVARPF2SV', 'platform.driver_licences.review', 'platform.driver_licences.review', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('platform_admin', 'platform.driver_licences.review'),
        ('reviewer',       'platform.driver_licences.review'),
        ('support',        'platform.driver_licences.review')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'platform'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
