-- ═══════════════════════════════════════════════════════════════════════════
-- Bảo hiểm chuyến `IV`/`IP` — `booking_insurance_policies`
-- (14/09/2026 — Phase 7, ADR 0032 điều 4, ADR 0028 điều 5)
--
-- ## Vì sao một BẢNG chứ không phải hai cờ trên `bookings`
--
-- Một hợp đồng bảo hiểm có vòng đời RIÊNG, không trùng vòng đời chuyến: nó được thu phí lúc đặt,
-- phát hành ở mốc bàn giao, có thể hỏng rồi thử lại nhiều lần, có thể bị thu hồi sau khi đã cấp,
-- và có thể đang bồi thường trong lúc chuyến đã kết thúc từ lâu. Nhét vào `bookings` nghĩa là
-- mỗi bước đó thành một cột, và "đã phát hành chưa" thành một boolean không trả lời được câu
-- "đối tác từ chối hay ta chưa gọi".
--
-- Một chuyến có TỐI ĐA hai dòng (`IV` và `IP`) — unique `(booking_id, product_kind)`.
--
-- ## `idempotency_key` là chốt chống mua đôi
--
-- Worker có thể chạy hai bản (deploy chồng, job treo rồi tỉnh lại). Khoá duy nhất này đi kèm mỗi
-- lần gọi đối tác, nên hai lần gọi cùng một hợp đồng là MỘT giao dịch ở phía họ. Không có nó thì
-- một lần retry vụng về là một hợp đồng mua hai lần bằng tiền của khách.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."booking_insurance_policies" (
    "id"                CHAR(26)       NOT NULL,
    "booking_id"        CHAR(26)       NOT NULL,
    "tenant_id"         CHAR(26)       NOT NULL,
    -- Hold đã thu phí. NULL với đơn không đi qua khoản giữ chỗ của XePrime.
    "hold_id"           CHAR(26),

    -- @xeprime/types → InsuranceProductKind
    "product_kind"      VARCHAR(30)    NOT NULL,
    -- @xeprime/types → InsurancePolicyStatus
    "status"            VARCHAR(20)    NOT NULL DEFAULT 'reserved',
    -- Phí đã thu của khách cho ĐÚNG sản phẩm này. Snapshot, không join lại lúc đọc.
    "premium_amount"    NUMERIC(14, 2) NOT NULL,

    -- Đối tác và sản phẩm — SNAPSHOT lúc thu phí. Đổi đối tác về sau không viết lại hợp đồng cũ.
    "partner_name"      VARCHAR(255)   NOT NULL,
    "partner_product_code" VARCHAR(100),
    "certificate_number" VARCHAR(100),
    "certificate_url"   TEXT,
    "coverage_from"     TIMESTAMPTZ(3),
    "coverage_to"       TIMESTAMPTZ(3),

    -- Thử lại: số lần đã gọi, lần cuối lúc nào, hỏng vì gì, lần tới khi nào.
    "issue_attempts"    INTEGER        NOT NULL DEFAULT 0,
    "last_attempt_at"   TIMESTAMPTZ(3),
    "last_error_code"   VARCHAR(50),
    "last_error_message" TEXT,
    -- Worker chỉ nhặt dòng có mốc này ĐÃ TỚI. NULL = chưa tới lúc phát hành (chuyến chưa bắt đầu).
    "next_attempt_at"   TIMESTAMPTZ(3),

    "issued_at"         TIMESTAMPTZ(3),
    "cancelled_at"      TIMESTAMPTZ(3),
    "voided_at"         TIMESTAMPTZ(3),

    -- Bằng chứng hai chiều với đối tác — nguyên trạng, không bao giờ sửa.
    "request_payload_json"  JSONB,
    "response_payload_json" JSONB,

    -- Bằng chứng khách CHỌN `IP` (ADR 0028 điều 5). NULL với `IV` vì nó bắt buộc, không phải chọn.
    "consent_at"        TIMESTAMPTZ(3),
    -- @xeprime/types → InsuranceConsentSource
    "consent_source"    VARCHAR(50),

    -- Khoá chống mua đôi ở phía ĐỐI TÁC. Sinh một lần lúc tạo dòng, không đổi qua các lần retry.
    "idempotency_key"   VARCHAR(100)   NOT NULL,

    "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_insurance_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_insurance_policies_product_kind_check"
        CHECK ("product_kind" IN ('vehicle_trip', 'personal_accident')),
    CONSTRAINT "booking_insurance_policies_status_check"
        CHECK ("status" IN ('reserved', 'issuing', 'issued', 'failed', 'cancelled', 'voided', 'claim')),
    -- Phí 0đ là một dòng không có nghĩa: cổng bảo hiểm tắt thì KHÔNG sinh dòng, không sinh dòng rỗng.
    CONSTRAINT "booking_insurance_policies_premium_check" CHECK ("premium_amount" > 0),
    /*
     * `issued` BẮT BUỘC có số chứng nhận. Đây là ràng buộc quan trọng nhất của bảng: không có
     * đường nào đánh dấu "đã phát hành" mà không cầm bằng chứng phát hành. Một adapter giả trả
     * OK rỗng sẽ nổ ở đây thay vì tạo ra một hợp đồng không tồn tại.
     */
    CONSTRAINT "booking_insurance_policies_issued_needs_certificate_check"
        CHECK ("status" <> 'issued' OR ("certificate_number" IS NOT NULL AND "issued_at" IS NOT NULL))
);

-- Một chuyến, một sản phẩm, MỘT hợp đồng. Chống mua đôi ở phía mình.
CREATE UNIQUE INDEX "booking_insurance_policies_booking_product_key"
    ON "public"."booking_insurance_policies" ("booking_id", "product_kind");

-- Chống mua đôi ở phía ĐỐI TÁC.
CREATE UNIQUE INDEX "booking_insurance_policies_idempotency_key"
    ON "public"."booking_insurance_policies" ("idempotency_key");

-- Worker quét "tới lúc phát hành" mỗi 60 giây. Partial index giữ phép quét đó chạm đúng số dòng
-- đang chờ thay vì cả lịch sử hợp đồng.
CREATE INDEX "booking_insurance_policies_due_idx"
    ON "public"."booking_insurance_policies" ("next_attempt_at")
    WHERE "status" IN ('reserved', 'failed') AND "next_attempt_at" IS NOT NULL;

-- Hàng đợi admin + đối soát phần phí giữ hộ.
CREATE INDEX "booking_insurance_policies_status_created_idx"
    ON "public"."booking_insurance_policies" ("status", "created_at");
CREATE INDEX "booking_insurance_policies_tenant_idx"
    ON "public"."booking_insurance_policies" ("tenant_id", "created_at");

ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Hold bị xoá không được kéo theo hợp đồng bảo hiểm: hợp đồng là bằng chứng với đối tác,
-- nó sống lâu hơn khoản giữ chỗ đã sinh ra nó.
ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_hold_id_fkey"
    FOREIGN KEY ("hold_id") REFERENCES "public"."booking_holds"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
