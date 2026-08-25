-- ═══════════════════════════════════════════════════════════════════════════
-- Cache tra cứu bản đồ — geocode địa chỉ + khoảng cách đường bộ (24/08/2026)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`: baseline chứa 25 thứ mà `schema.prisma` không diễn đạt
-- được (rõ nhất là các khoá ngoại tổ hợp `(id, tenant_id)`), nên migration Prisma tự sinh sẽ
-- kèm lệnh DROP các khoá đó. Migration này chỉ THÊM hai bảng và không chạm gì đang có.
--
-- Đối chiếu với datamodel sau khi áp:
--   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
--   → vẫn đúng 25 câu chênh lệch cố ý như trước, không thêm câu nào.
--
-- Hai bảng, một mục đích: KHÔNG hỏi nhà cung cấp bản đồ hai lần cùng một câu.
--   geocode_cache   — "địa chỉ này nằm ở đâu"
--   geo_route_cache — "từ đây tới đó bao nhiêu km đường bộ"
--
-- Cả hai đều KHÔNG có `tenant_id`: đây là dữ kiện về thế giới, không phải dữ liệu của gian
-- hàng nào. Cả hai đều cho phép cột kết quả NULL để nhớ được cả câu trả lời "không tìm thấy" —
-- nếu không, một địa chỉ gõ sai sẽ đốt một request thật cho MỖI lần người dùng bấm lại.
--
-- `fetched_at` là cột nghiệp vụ, không phải cột kiểm toán: điều khoản của nhà cung cấp giới hạn
-- thời gian được lưu toạ độ, nên `GeoService` coi bản ghi quá hạn là MISS và tra lại.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Địa chỉ chữ → toạ độ ──────────────────────────────────────────────────
CREATE TABLE "public"."geocode_cache" (
    -- SHA-256 hex của provider + địa chỉ đã chuẩn hoá. Khoá chính LÀ giá trị băm: tra cache là
    -- một phép tìm khoá duy nhất, không có đường nào trả về hai hàng cho cùng một địa chỉ.
    "address_hash" CHAR(64) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "query" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "formatted_address" TEXT,
    "place_id" VARCHAR(255),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("address_hash")
);

-- Dọn bản ghi quá hạn theo lô.
CREATE INDEX "geocode_cache_fetched_at_idx" ON "public"."geocode_cache"("fetched_at");

-- Toạ độ đi theo cặp: một nửa toạ độ là dữ liệu vô nghĩa và sẽ thành một ghim sai trên bản đồ.
ALTER TABLE "public"."geocode_cache"
    ADD CONSTRAINT "geocode_cache_coords_pair_check"
    CHECK ((("latitude" IS NULL) AND ("longitude" IS NULL))
        OR (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL)));

-- Dải toạ độ hợp lệ. Chặn ở DB vì một bản ghi rác ở đây sẽ được phát tán ra mọi bản đồ đọc nó.
ALTER TABLE "public"."geocode_cache"
    ADD CONSTRAINT "geocode_cache_coords_range_check"
    CHECK (("latitude" IS NULL)
        OR (("latitude" BETWEEN -90 AND 90) AND ("longitude" BETWEEN -180 AND 180)));

-- ── Toạ độ → toạ độ: khoảng cách đường bộ một chiều ───────────────────────
CREATE TABLE "public"."geo_route_cache" (
    -- SHA-256 hex của provider + bốn toạ độ ĐÃ LÀM TRÒN về lưới ~110m (`roundCoord`).
    "route_hash" CHAR(64) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "origin_lat" DECIMAL(10,7) NOT NULL,
    "origin_lng" DECIMAL(10,7) NOT NULL,
    "dest_lat" DECIMAL(10,7) NOT NULL,
    "dest_lng" DECIMAL(10,7) NOT NULL,
    "distance_km" DECIMAL(8,2),
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_route_cache_pkey" PRIMARY KEY ("route_hash")
);

CREATE INDEX "geo_route_cache_fetched_at_idx" ON "public"."geo_route_cache"("fetched_at");

-- Khoảng cách âm là lỗi lập trình, không phải dữ liệu. Để nó lọt vào đây nghĩa là bậc phí giao
-- sẽ được tra bằng một số vô nghĩa.
ALTER TABLE "public"."geo_route_cache"
    ADD CONSTRAINT "geo_route_cache_distance_check"
    CHECK (("distance_km" IS NULL) OR ("distance_km" >= 0));

ALTER TABLE "public"."geo_route_cache"
    ADD CONSTRAINT "geo_route_cache_coords_range_check"
    CHECK (("origin_lat" BETWEEN -90 AND 90) AND ("origin_lng" BETWEEN -180 AND 180)
       AND ("dest_lat" BETWEEN -90 AND 90) AND ("dest_lng" BETWEEN -180 AND 180));
