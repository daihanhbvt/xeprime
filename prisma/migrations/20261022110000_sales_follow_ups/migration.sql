-- ADR 0066 — chăm sóc khách mất đơn (tab "Cần chăm sóc" của Đơn thuê toàn hệ thống).
--
--   • `sales_follow_ups`: một dòng cho một yêu cầu thuê đã kết thúc mà không thành chuyến.
--     Writer duy nhất `PlatformFollowUpsService`; chưa có dòng = `new`.
--   • Index `(status, updated_at DESC)` trên `booking_requests` cho danh sách mới-nhất-trước.
--   • Quyền `platform.sales_followups.manage` (production không chạy seed — cùng cách với
--     20261008150000_customer_driver_licences). id = seedId('permission:<key>').

CREATE TABLE "sales_follow_ups" (
    "id" CHAR(26) NOT NULL,
    "booking_request_id" CHAR(26) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "assignee_user_id" CHAR(26),
    "last_contacted_at" TIMESTAMPTZ(3),
    "updated_by" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_follow_ups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_follow_ups_status_check" CHECK (
        "status" IN ('new', 'contacted', 'rebooked', 'not_interested')
    ),
    CONSTRAINT "sales_follow_ups_note_length_check" CHECK (char_length("note") <= 2000)
);

CREATE UNIQUE INDEX "sales_follow_ups_booking_request_id_key" ON "sales_follow_ups"("booking_request_id");
CREATE INDEX "sales_follow_ups_status_idx" ON "sales_follow_ups"("status");
CREATE INDEX "sales_follow_ups_assignee_user_id_idx" ON "sales_follow_ups"("assignee_user_id");

ALTER TABLE "sales_follow_ups" ADD CONSTRAINT "sales_follow_ups_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_follow_ups" ADD CONSTRAINT "sales_follow_ups_assignee_user_id_fkey"
    FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_follow_ups" ADD CONSTRAINT "sales_follow_ups_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "booking_requests_status_updated_at_idx" ON "booking_requests"("status", "updated_at" DESC);

-- ── Quyền ─────────────────────────────────────────────────────────────────────────────────
INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW200X6RPKEJ6N9PY545E', 'platform.sales_followups.manage', 'platform.sales_followups.manage', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('platform_admin', 'platform.sales_followups.manage'),
        ('support',        'platform.sales_followups.manage')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'platform'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
