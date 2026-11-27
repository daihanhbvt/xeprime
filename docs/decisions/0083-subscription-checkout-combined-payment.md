# ADR 0083 — Phiếu thanh toán gộp: mua gói ô tô + gói xe máy trong một lần chuyển khoản

Ngày: 06/11/2026 · Trạng thái: **Accepted** (06/11/2026 — người dùng chốt khi ráp design "Mua hoặc gia
hạn gói" của site partner: một hộp, một hoá đơn, một mã QR cho cả hai gói) · Liên quan:
[0065](0065-per-vehicle-type-shop-plans.md) (mỗi loại xe một gói, mỗi phạm vi một hoá đơn mở),
[0022](0022-sepay-customer-money.md) (đối soát theo tiền tố mã), [0016](0016-sepay-bank-reconciliation.md)
(chuyển thiếu/thừa), [0058](0058-momo-vnpay-payment-gateways.md) (cổng ví điện tử)

## Bối cảnh

ADR 0065 điều 6 cho mỗi (gian hàng, phạm vi loại xe) một hoá đơn mở. Gian hàng mua cả gói ô tô lẫn gói
xe máy phải tạo HAI hoá đơn, quét HAI mã QR, chuyển khoản HAI lần — và trả xong một lần là gian hàng đã
vào tuyến gói với một nửa thứ họ định mua. Design mới của site partner gom hai gói vào một hộp mua và
một trang thanh toán với một mã duy nhất.

## Quyết định

1. **Hoá đơn giữ nguyên, thêm PHIẾU THANH TOÁN GỘP.** Mỗi loại xe vẫn là MỘT hàng `subscription_invoices`
   (chuỗi kỳ, hạn mức chụp trên hoá đơn, unique "một hoá đơn trả được mỗi phạm vi" — ADR 0065 điều 6 —
   không đổi). Bảng mới `subscription_checkouts` là ĐÍCH NHẬN TIỀN của cả cụm; hoá đơn con trỏ về nó bằng
   `checkout_id` (FK tổ hợp `(checkout_id, tenant_id)` — một phiếu không gom hoá đơn của gian hàng khác).
2. **Mã `XPC…`**, cùng không gian tên với `XPG/XPH/XPE` (ADR 0022 điều 3). Tiền tố quyết định đích, nên
   `bank_transactions.matched_type` nhận thêm `subscription_checkout`; CHECK ở DB đòi mã phiếu bắt đầu bằng
   `XPC`.
3. **Tiền chỉ đi một đường: qua phiếu.** `BillingService.applyCheckoutPaymentWithinTx` khoá hàng phiếu
   (`FOR UPDATE`) rồi:
   - thiếu ⇒ phiếu VÀ mọi hoá đơn con `partially_paid`, thôi hạn void — các luật đã có (chặn mua mới cùng
     loại xe, job không void) tự áp lên từng hoá đơn con; lỗi chặn mua trả MÃ PHIẾU để khách chuyển bù;
   - đủ ⇒ phiếu `paid`, mỗi hoá đơn con `paid` với `paid_amount` = đúng tổng của nó, rồi kích hoạt LẦN
     LƯỢT trong CÙNG transaction — không bao giờ một nửa;
   - thừa / về lần nữa ⇒ cộng vào `paid_amount` của phiếu làm bằng chứng (ADR 0016 điều 6).
   Tiền về theo mã của chính một hoá đơn con (khách gõ nhầm, admin khớp tay vào hoá đơn) được CHUYỂN sang
   phiếu — `applyBankPaymentWithinTx` nhận ra `checkout_id`.
4. **Vòng đời đi cùng nhau.** Một hoá đơn con bị void (mua lại cùng loại xe, bị bậc khác thay, hết hạn)
   ⇒ phiếu và mọi hoá đơn anh em cùng void (`voidIssuedInvoicesWithinTx`; job `subscription-lifecycle`
   void PHIẾU trước rồi tới con). Phiếu đã có tiền không void — cùng luật hoá đơn đơn lẻ.
5. **Lượt mua gộp là "tất cả hoặc không".** `POST /subscription/checkouts` nhận đúng hai phần tử của hai
   phạm vi không xung đột (ô tô + xe máy; bậc `all` mua riêng), kiểm từng phần tử bằng CHÍNH luật của
   `POST /subscription/purchase`, rồi tạo phiếu + hai hoá đơn trong một transaction dưới advisory lock
   theo tenant. Một gói vẫn đi `POST /subscription/purchase` (app native giữ nguyên).
6. **Cổng ví điện tử trả CẢ PHIẾU** (sửa 27/11/2026 — bản đầu không có cổng cho phiếu gộp; QC #22 báo
   mua ô tô + xe máy chỉ còn VietQR khi staging đã bật MoMo/VNPAY). Phiếu là đích cổng thứ ba
   (`payment_gateway_orders.target_type = subscription_checkout`, cột `subscription_checkout_id`, CHECK
   đúng-một-đích): `POST /subscription/payment-gateway/checkouts/:id/checkout` gửi sang cổng phần còn
   thiếu của CẢ phiếu, quay về `/payment/checkout/:id`; tiền áp qua `applyCheckoutPaymentWithinTx` —
   đúng hàm webhook SePay dùng cho `XPC…`, nên vẫn một đường tiền (điều 3). Cùng công tắc luồng với hoá
   đơn lẻ (`PAYMENT_GATEWAY_SUBSCRIPTION`). Phiên cổng cho riêng một hoá đơn CON vẫn bị từ chối
   (`PAYMENT_TARGET_NOT_PAYABLE`) vì nó trả một nửa lượt mua.

## Hệ quả

- Trang thanh toán `/payment/checkout/:id` (site partner) đọc `GET /subscription/checkouts/:id`; hoá đơn
  trong sổ và danh sách chờ mang `checkoutId` / `checkoutCode` để mọi lối "Thanh toán" dẫn về phiếu.
- Hàng đợi đối soát gợi ý MỘT dòng cho mỗi phiếu với con số của phiếu; khớp tay vào hoá đơn con tự sang
  phiếu.
- Ghi đè ADR 0065 điều 6 CHỈ trong phạm vi "mỗi hoá đơn một lần chuyển khoản": bất biến một hoá đơn mở mỗi
  phạm vi giữ nguyên.

## Cần xem lại khi

- Có thêm phạm vi loại xe thứ ba ⇒ nới trần hai phần tử của lượt mua gộp.
