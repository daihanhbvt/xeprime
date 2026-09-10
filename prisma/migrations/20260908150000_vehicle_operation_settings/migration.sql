-- ═══════════════════════════════════════════════════════════════════════════
-- Thiết lập VẬN HÀNH theo xe (08/09/2026 — không gian "Quản lý xe" của chủ xe, Owner Lite dùng
-- chung với /manage): khung giờ giao nhận, thời gian chết giữa hai chuyến, tự động nhận chuyến,
-- giấy tờ/điều khoản theo dịch vụ, phụ phí mặc định có tài xế, ảnh theo vị trí, và snapshot điều
-- kiện thuê trên yêu cầu/đơn.
--
-- VIẾT TAY vì Prisma không mô tả được: EXCLUDE chống chồng khung giờ (btree_gist đã có từ
-- baseline), CHECK theo bộ giá trị của @xeprime/types, CHECK khoảng phút và tiền không âm.
-- `migrate dev` sẽ đề nghị DROP các FK tổ hợp `(vehicle_id, tenant_id)` — đừng nhận (xem header
-- của `20260821000000_init/migration.sql`).
--
-- Không có dòng ở các bảng mới = mặc định: buffer 0 phút, nhận mọi giờ, không tự động nhận, bộ
-- giấy tờ tối thiểu theo luật. Dữ liệu cũ KHÔNG bị backfill — hành vi hôm nay không đổi cho tới
-- khi chủ xe bấm lưu ở màn tương ứng (yêu cầu "không âm thầm áp 1–2 giờ").
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. vehicle_operation_settings — thời gian chết ──────────────────────────

CREATE TABLE "public"."vehicle_operation_settings" (
    "id"                        CHAR(26)       NOT NULL,
    "tenant_id"                 CHAR(26)       NOT NULL,
    "vehicle_id"                CHAR(26)       NOT NULL,
    "turnaround_buffer_minutes" INTEGER        NOT NULL DEFAULT 0,
    "updated_by"                CHAR(26),
    "created_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_operation_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_operation_settings_vehicle_id_key"
    ON "public"."vehicle_operation_settings"("vehicle_id");
CREATE INDEX "vehicle_operation_settings_tenant_id_idx"
    ON "public"."vehicle_operation_settings"("tenant_id");

ALTER TABLE "public"."vehicle_operation_settings"
    ADD CONSTRAINT "vehicle_operation_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK tổ hợp: thiết lập chỉ trỏ được vào xe CÙNG gian hàng — DB giữ, không phải service nhớ kiểm.
ALTER TABLE "public"."vehicle_operation_settings"
    ADD CONSTRAINT "vehicle_operation_settings_vehicle_id_tenant_id_fkey"
    FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- Thời gian chết: 0 (mặc định dữ liệu cũ) tới tối đa một ngày. Không có số âm.
ALTER TABLE "public"."vehicle_operation_settings"
    ADD CONSTRAINT "vehicle_operation_settings_buffer_check"
    CHECK ("turnaround_buffer_minutes" >= 0 AND "turnaround_buffer_minutes" <= 1440);

-- ── 2. vehicle_handover_windows — khung giờ giao / nhận trong ngày ──────────

CREATE TABLE "public"."vehicle_handover_windows" (
    "id"           CHAR(26)       NOT NULL,
    "tenant_id"    CHAR(26)       NOT NULL,
    "vehicle_id"   CHAR(26)       NOT NULL,
    "kind"         VARCHAR(20)    NOT NULL,
    "start_minute" INTEGER        NOT NULL,
    "end_minute"   INTEGER        NOT NULL,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_handover_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_handover_windows_vehicle_id_kind_start_minute_idx"
    ON "public"."vehicle_handover_windows"("vehicle_id", "kind", "start_minute");
CREATE INDEX "vehicle_handover_windows_tenant_id_idx"
    ON "public"."vehicle_handover_windows"("tenant_id");

ALTER TABLE "public"."vehicle_handover_windows"
    ADD CONSTRAINT "vehicle_handover_windows_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."vehicle_handover_windows"
    ADD CONSTRAINT "vehicle_handover_windows_vehicle_id_tenant_id_fkey"
    FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- Bộ giá trị khớp @xeprime/types HANDOVER_WINDOW_KIND.
ALTER TABLE "public"."vehicle_handover_windows"
    ADD CONSTRAINT "vehicle_handover_windows_kind_check"
    CHECK ("kind" IN ('pickup', 'return'));
-- Phút trong ngày giờ Việt Nam: 0 ≤ start < end ≤ 1440 (24:00) — không có khung qua nửa đêm.
ALTER TABLE "public"."vehicle_handover_windows"
    ADD CONSTRAINT "vehicle_handover_windows_range_check"
    CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440);
-- Hai khung cùng loại của cùng xe KHÔNG được chồng lấn — DB quyết, hai request đua nhau vẫn thua.
-- `int4range(start, end)` nửa mở: khung 06:00–12:00 và 12:00–18:00 đứng cạnh nhau hợp lệ.
ALTER TABLE "public"."vehicle_handover_windows"
    ADD CONSTRAINT "vehicle_handover_windows_no_overlap"
    EXCLUDE USING gist ("vehicle_id" WITH =, "kind" WITH =, int4range("start_minute", "end_minute") WITH &&);

-- ── 3. vehicle_service_settings — theo (xe, dịch vụ) ────────────────────────

CREATE TABLE "public"."vehicle_service_settings" (
    "id"                           CHAR(26)       NOT NULL,
    "tenant_id"                    CHAR(26)       NOT NULL,
    "vehicle_id"                   CHAR(26)       NOT NULL,
    "service_type"                 VARCHAR(50)    NOT NULL,
    "auto_accept_enabled"          BOOLEAN        NOT NULL DEFAULT false,
    "auto_accept_min_lead_minutes" INTEGER        NOT NULL DEFAULT 360,
    "auto_accept_max_lead_minutes" INTEGER        NOT NULL DEFAULT 10080,
    "min_rental_minutes"           INTEGER,
    "preferred_route_types"        VARCHAR(30)[]  NOT NULL DEFAULT ARRAY[]::VARCHAR(30)[],
    "required_documents"           VARCHAR(50)[]  NOT NULL DEFAULT ARRAY[]::VARCHAR(50)[],
    "identity_verify_method"       VARCHAR(30)    NOT NULL DEFAULT 'in_person',
    "terms_text"                   TEXT,
    "require_terms_acceptance"     BOOLEAN        NOT NULL DEFAULT false,
    "deposit_mode"                 VARCHAR(20)    NOT NULL DEFAULT 'none',
    "updated_by"                   CHAR(26),
    "created_at"                   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_service_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_service_settings_vehicle_id_service_type_key"
    ON "public"."vehicle_service_settings"("vehicle_id", "service_type");
CREATE INDEX "vehicle_service_settings_tenant_id_idx"
    ON "public"."vehicle_service_settings"("tenant_id");

ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_vehicle_id_tenant_id_fkey"
    FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- Chỉ hai dịch vụ có thiết lập riêng; dài hạn luôn do gian hàng chốt lịch tay (ADR 0011).
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_service_type_check"
    CHECK ("service_type" IN ('self_drive', 'with_driver'));
-- Khoảng đặt trước: 0 ≤ min ≤ max ≤ 90 ngày (129600 phút).
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_lead_check"
    CHECK ("auto_accept_min_lead_minutes" >= 0
       AND "auto_accept_min_lead_minutes" <= "auto_accept_max_lead_minutes"
       AND "auto_accept_max_lead_minutes" <= 129600);
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_min_rental_check"
    CHECK ("min_rental_minutes" IS NULL OR "min_rental_minutes" >= 0);
-- Lộ trình ưu tiên chỉ là các mã ROUTE_TYPE thật — không có category marketing nào khác.
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_route_types_check"
    CHECK ("preferred_route_types" <@ ARRAY['in_city', 'inter_city', 'inter_city_one_way']::VARCHAR(30)[]);
-- Giấy tờ yêu cầu thêm: CCCD / GPLX / hộ chiếu. 'other' không định danh được ai nên không nằm đây.
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_required_documents_check"
    CHECK ("required_documents" <@ ARRAY['citizen_id', 'driver_licence', 'passport']::VARCHAR(50)[]);
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_identity_verify_check"
    CHECK ("identity_verify_method" IN ('vneid', 'in_person'));
-- Đủ ba mã của DRIVER_DEPOSIT_MODE để mở 30%/50% sau này KHÔNG cần migrate; service hôm nay chỉ
-- ghi 'none' (DRIVER_DEPOSIT_MODE_SUPPORTED) vì chưa nối vào vòng đời giữ chỗ/thanh toán.
ALTER TABLE "public"."vehicle_service_settings"
    ADD CONSTRAINT "vehicle_service_settings_deposit_mode_check"
    CHECK ("deposit_mode" IN ('none', 'percent_30', 'percent_50'));

-- ── 4. vehicle_driver_surcharge_rules — phụ phí MẶC ĐỊNH có tài xế ──────────

CREATE TABLE "public"."vehicle_driver_surcharge_rules" (
    "id"              CHAR(26)       NOT NULL,
    "tenant_id"       CHAR(26)       NOT NULL,
    "vehicle_id"      CHAR(26)       NOT NULL,
    "kind"            VARCHAR(30)    NOT NULL,
    "enabled"         BOOLEAN        NOT NULL DEFAULT false,
    "amount"          DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "threshold_value" INTEGER,
    "updated_by"      CHAR(26),
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_driver_surcharge_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_driver_surcharge_rules_vehicle_id_kind_key"
    ON "public"."vehicle_driver_surcharge_rules"("vehicle_id", "kind");
CREATE INDEX "vehicle_driver_surcharge_rules_tenant_id_idx"
    ON "public"."vehicle_driver_surcharge_rules"("tenant_id");

ALTER TABLE "public"."vehicle_driver_surcharge_rules"
    ADD CONSTRAINT "vehicle_driver_surcharge_rules_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."vehicle_driver_surcharge_rules"
    ADD CONSTRAINT "vehicle_driver_surcharge_rules_vehicle_id_tenant_id_fkey"
    FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."vehicle_driver_surcharge_rules"
    ADD CONSTRAINT "vehicle_driver_surcharge_rules_kind_check"
    CHECK ("kind" IN ('overtime', 'waiting', 'long_distance', 'overnight'));
ALTER TABLE "public"."vehicle_driver_surcharge_rules"
    ADD CONSTRAINT "vehicle_driver_surcharge_rules_amount_check"
    CHECK ("amount" >= 0);
ALTER TABLE "public"."vehicle_driver_surcharge_rules"
    ADD CONSTRAINT "vehicle_driver_surcharge_rules_threshold_check"
    CHECK ("threshold_value" IS NULL OR ("threshold_value" >= 0 AND "threshold_value" <= 100000));

-- ── 5. Snapshot điều kiện thuê + nguồn quyết định ───────────────────────────

ALTER TABLE "public"."booking_requests"
    ADD COLUMN "decision_source"    VARCHAR(20),
    ADD COLUMN "rental_terms_json"  JSONB;
ALTER TABLE "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_decision_source_check"
    CHECK ("decision_source" IS NULL OR "decision_source" IN ('host', 'system'));

ALTER TABLE "public"."bookings"
    ADD COLUMN "rental_terms_json" JSONB;

-- ── 6. Danh mục phát sinh: thêm ba khoản của chuyến có tài xế ───────────────
-- Chỉ THÊM giá trị hợp lệ; hàng cũ giữ nguyên. Khớp @xeprime/types SURCHARGE_CATEGORY.

ALTER TABLE "public"."booking_surcharges"
    DROP CONSTRAINT IF EXISTS "booking_surcharges_category_check";
ALTER TABLE "public"."booking_surcharges"
    ADD CONSTRAINT "booking_surcharges_category_check"
    CHECK ("category" IN ('overtime', 'cleaning', 'damage', 'waiting', 'long_distance', 'overnight', 'other'));

-- ── 7. Giấy tờ khách: thêm hộ chiếu ─────────────────────────────────────────
-- Khớp @xeprime/types CUSTOMER_DOCUMENT_TYPE. Hộ chiếu là giấy tờ XUẤT TRÌNH/đối chiếu như CCCD.

ALTER TABLE "public"."tenant_customer_documents"
    DROP CONSTRAINT IF EXISTS "tenant_customer_documents_type_check";
ALTER TABLE "public"."tenant_customer_documents"
    ADD CONSTRAINT "tenant_customer_documents_type_check"
    CHECK ("document_type" IN ('citizen_id', 'driver_licence', 'passport', 'other'));
