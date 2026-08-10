-- ---------------------------------------------------------------------------
-- marketplace_banners — banner hero trang chủ, platform admin quản lý
--
-- Trang chủ chỉ đọc TỐI ĐA 3 banner "đang hiển thị": active = true VÀ nằm trong khung lịch
-- (nếu có đặt). BannersService là ĐƯỜNG GHI DUY NHẤT; mọi mutation ghi audit_logs vì nội dung
-- này hiện với mọi khách truy cập (CLAUDE.md mục 6.3).
-- ---------------------------------------------------------------------------

CREATE TABLE "marketplace_banners" (
    "id"               CHAR(26) NOT NULL,
    -- Tên nội bộ cho admin — không hiển thị công khai.
    "title"            VARCHAR(150) NOT NULL,
    "image_url"        TEXT NOT NULL,
    -- NULL = public API fallback về ảnh desktop.
    "mobile_image_url" TEXT,
    -- Alt bắt buộc: banner là nội dung marketing, không phải trang trí.
    "alt_text"         VARCHAR(255) NOT NULL,
    "link_url"         TEXT,
    "sort_order"       INTEGER NOT NULL DEFAULT 0,
    "active"           BOOLEAN NOT NULL DEFAULT true,
    "starts_at"        TIMESTAMPTZ(3),
    "ends_at"          TIMESTAMPTZ(3),
    "created_by"       CHAR(26),
    "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "marketplace_banners_pkey" PRIMARY KEY ("id"),
    -- Lịch ngược (hết trước khi bắt đầu) là dữ liệu vô nghĩa — chặn ở DB, không chỉ ở DTO.
    CONSTRAINT "marketplace_banners_schedule_check" CHECK (
        "starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"
    ),
    CONSTRAINT "marketplace_banners_alt_not_blank" CHECK (btrim("alt_text") <> '')
);

-- Query duy nhất của trang chủ: banner đang bật, theo thứ tự hiển thị.
CREATE INDEX "marketplace_banners_active_sort_order_idx"
    ON "marketplace_banners"("active", "sort_order");
