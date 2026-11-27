-- Cổng MoMo/VNPAY cho PHIẾU GỘP nhiều gói (`XPC…`) - ADR 0083 điều 6 sửa 27/11/2026.
--
-- Trước đây phiếu gộp chỉ trả được bằng chuyển khoản VietQR vì ADR 0058 còn mặc định tắt; staging đã
-- bật cổng cho luồng gói nên lượt mua ô tô + xe máy chỉ còn một phương thức. Đích thứ ba của sổ cổng
-- là chính phiếu: tiền áp qua `BillingService.applyCheckoutPaymentWithinTx` - đúng hàm webhook SePay
-- dùng cho mã `XPC…`, nên không có đường tiền mới.

-- 1. Cột đích mới. `RESTRICT` như hai FK đích đã có: đây là bằng chứng tiền đã đi qua cổng.
ALTER TABLE "payment_gateway_orders" ADD COLUMN "subscription_checkout_id" CHAR(26);

ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_subscription_checkout_id_fkey"
    FOREIGN KEY ("subscription_checkout_id") REFERENCES "subscription_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dùng lại phiên còn hạn + đọc lịch sử thanh toán của MỘT phiếu (cùng khuôn hai đích kia).
CREATE INDEX "payment_gateway_orders_subscription_checkout_id_created_at_idx"
    ON "payment_gateway_orders"("subscription_checkout_id", "created_at");

-- 2. Giá trị `target_type` mới.
ALTER TABLE "payment_gateway_orders" DROP CONSTRAINT "payment_gateway_orders_target_type_check";
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_target_type_check" CHECK (
    "target_type" IN ('subscription_invoice', 'booking_hold', 'subscription_checkout')
);

-- 3. Đích là ĐÚNG MỘT trong ba FK, và khớp `target_type`.
ALTER TABLE "payment_gateway_orders" DROP CONSTRAINT "payment_gateway_orders_target_check";
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_target_check" CHECK (
    ("target_type" = 'subscription_invoice'
        AND "subscription_invoice_id" IS NOT NULL
        AND "booking_hold_id" IS NULL
        AND "subscription_checkout_id" IS NULL)
    OR ("target_type" = 'booking_hold'
        AND "booking_hold_id" IS NOT NULL
        AND "subscription_invoice_id" IS NULL
        AND "subscription_checkout_id" IS NULL)
    OR ("target_type" = 'subscription_checkout'
        AND "subscription_checkout_id" IS NOT NULL
        AND "subscription_invoice_id" IS NULL
        AND "booking_hold_id" IS NULL)
);
