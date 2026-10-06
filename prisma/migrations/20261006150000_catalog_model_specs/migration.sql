-- Thông số mẫu xe để form đăng xe ĐIỀN SẴN + xoá mềm mẫu xe (06/10/2026).
--
-- Viết TAY: chỉ các lệnh dưới, không kéo theo drift của `prisma migrate diff` (xem header baseline
-- `20260821000000_init` về các FK tổ hợp Prisma không mô tả được).
--
-- 1. `seat_count INTEGER` → `seat_counts INTEGER[]`.
--    Một cột số đơn không nói được "dòng xe này có bản 7 chỗ và bản 8 chỗ", nên seed để trống số
--    chỗ của MỌI mẫu ô tô và form đăng xe không có gì để điền sẵn. Mảng dùng chung một luật với
--    `fuel_types` (`catalogSpecRule` ở @xeprime/types): một giá trị ⇒ điền sẵn và khoá, nhiều giá
--    trị ⇒ chủ xe chọn trong đó, rỗng ⇒ chưa xác minh. Giá trị cũ chép sang mảng một phần tử.
-- 2. `deleted_at` — xoá mẫu xe thành xoá MỀM. Xoá cứng làm mất `key`, và lần chạy seed kế tiếp
--    tạo lại đúng mẫu admin vừa gỡ. Dòng đã xoá mềm giữ `key` để seed nhận ra và bỏ qua.

-- ── 1. Số chỗ thành mảng ─────────────────────────────────────────────────────────────────
ALTER TABLE "public"."vehicle_catalog_models"
    ADD COLUMN "seat_counts" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "public"."vehicle_catalog_models"
   SET "seat_counts" = ARRAY["seat_count"]
 WHERE "seat_count" IS NOT NULL;

ALTER TABLE "public"."vehicle_catalog_models" DROP CONSTRAINT "vehicle_catalog_models_seat_count_check";
ALTER TABLE "public"."vehicle_catalog_models" DROP COLUMN "seat_count";

-- Số chỗ là chiều của Ô TÔ; mỗi giá trị trong biên 2–64 (`CATALOG_SEAT_COUNT_MIN/MAX`).
ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_seat_counts_check"
    CHECK (
        cardinality("seat_counts") = 0
        OR ("vehicle_type" = 'car'
            AND 2 <= ALL ("seat_counts")
            AND 64 >= ALL ("seat_counts")
            AND array_position("seat_counts", NULL) IS NULL)
    );

-- ── 2. Xoá mềm ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."vehicle_catalog_models" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
