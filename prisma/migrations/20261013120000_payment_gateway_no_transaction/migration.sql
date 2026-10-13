-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CỔNG XÁC NHẬN "KHÔNG CÓ GIAO DỊCH" cho một lượt còn chờ — ADR 0058 (13/10/2026)
--
-- Khách mở phiên VNPAY rồi bấm Huỷ: chưa có giao dịch nào, `querydr` trả `91` (có chữ ký). ADR 0058
-- chỉ cho lượt HẾT HẠN sau `PAYMENT_GATEWAY_NOT_FOUND_GRACE_MINUTES` — nên trước đây trang thanh toán
-- quay "đang chờ VNPAY" tới ~45 phút. Cột này ghi lại lời xác nhận đó mà KHÔNG đổi trạng thái: trang
-- thôi quay chờ và cho mở phiên mới; tiền tới muộn trên lượt cũ vẫn được ghi nhận như mọi khi.
--
-- CHECK: chỉ lượt `pending` mang dấu này — mọi đường đổi trạng thái phải xoá nó (`evidenceOf`).
-- Bảng mới (09/10/2026), cột NULL: không có dữ liệu cũ phải chuyển.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "payment_gateway_orders" ADD COLUMN "no_transaction_at" TIMESTAMPTZ(3);

ALTER TABLE "payment_gateway_orders"
    ADD CONSTRAINT "payment_gateway_orders_no_transaction_check"
    CHECK ("no_transaction_at" IS NULL OR "status" = 'pending');
