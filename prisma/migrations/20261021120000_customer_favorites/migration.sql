-- ════════════════════════════════════════════════════════════════════════════════════════════
-- XE YÊU THÍCH CỦA TÀI KHOẢN KHÁCH (21/10/2026) — `docs/decisions/BRD-customer-favorites.md`
--
-- Khách lưu một chiếc xe để quay lại xem/đặt sau. Một dòng là một cặp (tài khoản khách, xe):
-- KHÔNG giữ giá, KHÔNG giữ lịch, KHÔNG phải yêu cầu đặt xe, KHÔNG nuôi `rank_score`. Thẻ trong
-- danh sách đọc ảnh/giá/dịch vụ HIỆN HÀNH từ `public_listings` lúc tải — không chép xuống đây.
--
-- Viết tay (không để `prisma migrate dev` sinh) vì:
--   • `realm` cố định `customer` bằng CHECK + FK tổ hợp `(user_id, realm)` → `users(id, realm)`:
--     tài khoản partner/platform KHÔNG mang được dòng yêu thích nào, kể cả khi một đường code nào
--     đó quên `@Realms(customer)` (cùng cách `customer_driver_licences`, ADR 0053/0057);
--   • migrate dev sẽ sinh thêm lệnh DROP các FK tổ hợp `(id, tenant_id)` mà schema.prisma không mô
--     tả được — xem header của `20260821000000_init`.
--
-- Xoá:
--   • xe bị XOÁ CỨNG ⇒ CASCADE dọn mục yêu thích. Mục đó không còn mở được gì, và nó không phải
--     nghĩa vụ tiền nào cần giữ (khác `wallets`/`promo_redemptions` là RESTRICT). Xe bị ẩn/gỡ/
--     đình chỉ thì KHÔNG đụng tới bảng này: danh sách lọc theo scope công khai lúc ĐỌC, nên xe mở
--     bán lại là hiện lại (BRD §5.4);
--   • tài khoản bị xoá cứng ⇒ CASCADE, cùng lý do.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "customer_favorites" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "realm" VARCHAR(20) NOT NULL DEFAULT 'customer',
    "vehicle_id" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_favorites_realm_check" CHECK ("realm" = 'customer')
);

-- Một mục cho một xe — thích lại là `ON CONFLICT DO NOTHING`, không phải dòng thứ hai. Cũng phục
-- vụ câu "trong các xe này, xe nào tôi đã thích" của trái tim ở kết quả tìm kiếm.
CREATE UNIQUE INDEX "customer_favorites_user_vehicle_key" ON "customer_favorites"("user_id", "vehicle_id");

-- Danh sách "Xe yêu thích": mới lưu lên trước, `id` là khoá phụ cho thứ tự xác định khi phân trang.
CREATE INDEX "customer_favorites_user_created_idx" ON "customer_favorites"("user_id", "created_at" DESC, "id" DESC);

-- FK `vehicle_id` — xoá cứng một xe không phải quét cả bảng để dọn mục yêu thích.
CREATE INDEX "customer_favorites_vehicle_idx" ON "customer_favorites"("vehicle_id");

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_user_realm_fkey"
    FOREIGN KEY ("user_id", "realm") REFERENCES "users"("id", "realm") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
