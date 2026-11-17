# ADR 0092 — Tiền vào ngoại lệ: khớp tay khoản giữ chỗ còn hạn, ghi có Ví điểm cho tiền về muộn và tiền gói chuyển thừa, mã lý do thay câu chữ

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026 — người dùng chốt hai lựa chọn: tiền gói thừa
ghi có ví gian hàng; tiền giữ chỗ về muộn chỉ ghi có ví khách, không tạo đơn) · Bổ sung:
[0022](0022-sepay-customer-money.md) (đối soát SePay), [0033](0033-money-ledger-and-deposit-allocation.md)
(sổ ví), [0044](0044-approve-before-hold.md) điều 7 (không tạo đơn từ khoản đã đóng),
[0053](0053-separate-account-realms.md) điều 8 (ví của tài khoản) · Nguồn: rà soát phân hệ Admin
16/11/2026

## Bối cảnh

Hàng đợi tiền vào của admin chỉ khớp tay được vào HOÁ ĐƠN GÓI. Ba loại tiền thật rơi ra khỏi luồng:

1. **Khách chuyển sai nội dung khi khoản giữ chỗ còn hạn.** Không khớp được vào hold ⇒ hold hết hạn
   (cửa sổ chỉ 15′–120′), khách mất chuyến dù tiền đã về.
2. **Tiền giữ chỗ / phụ lục về SAU khi khoản đã đóng.** Webhook để lại `unmatched` kèm câu "khớp lại
   hoặc hoàn khách", nhưng không có nút nào làm việc đó — chỉ còn "Bỏ qua + mã hoàn", tức chuyển trả
   tay RA NGOÀI sổ, dù khách luôn có tài khoản và ví (ADR 0060).
3. **Gian hàng chuyển thừa / chuyển trùng tiền gói.** Giao dịch bị đánh `matched` + ghi chú
   `overpaid` rồi biến khỏi hàng đợi mặc định: không yêu cầu hoàn, không bộ lọc; đối soát còn tính phần
   thừa của hoá đơn lẻ là doanh thu nền tảng.

Ngoài ra server ghi câu tiếng Việt vào `match_note`, nên giao diện tiếng Anh hiện chữ Việt (lệch ADR
0012) và hàng đợi không lọc được theo lý do.

## Quyết định

1. **Khớp tay vào khoản của khách còn nhận tiền.** `POST /platform/bank-transactions/:id/match-receivable`
   (`targetType` = `booking_hold` | `booking_extension`) nhận giao dịch `unmatched` → `manual` rồi áp
   tiền bằng CHÍNH `applyBankPaymentWithinTx` của webhook, trong cùng transaction: đủ tiền thì đơn được
   tạo ngay. "Còn nhận tiền" đọc theo MỐC hạn (`isHoldPastDue`, `expires_at` của phụ lục), không theo
   cột trạng thái. Khoản đã đóng ⇒ 409 `BANK_TX_TARGET_CLOSED`. Màn chi tiết gợi ý các khoản còn hạn,
   khoản khớp đúng số tiền lên trước — chỉ gợi ý, không bao giờ tự khớp (ADR 0022 điều 4).
2. **Tiền về muộn ⇒ ghi có Ví điểm khách, không bao giờ tạo đơn.** `POST …/:id/credit-customer` cho
   khoản giữ chỗ / phụ lục ĐÃ ĐÓNG: ghi có ví của TÀI KHOẢN KHÁCH đã đặt (`resolveRefundWalletOwner`)
   qua `WalletService.creditWithinTx`, loại bút toán `late_payment_refund`, nguồn
   `bank_transaction` + id giao dịch; giao dịch thành `manual` với đích mới `wallet_credit`
   (`matched_ref_id` = dòng sổ ví); báo khách (`hold_refunded`). Khoản còn nhận tiền ⇒ 409
   `BANK_TX_TARGET_STILL_OPEN` (phải khớp để khách giữ chuyến); không có tài khoản khách ⇒ 409
   `BANK_TX_NO_CUSTOMER_ACCOUNT` (chuyển trả tay rồi "Bỏ qua" kèm mã hoàn như cũ). ADR 0044 điều 7
   giữ nguyên: lịch xe của khoản đã đóng có thể đã thuộc về khách khác.
3. **Tiền gói chuyển thừa ⇒ tự ghi có Ví điểm gian hàng.** Ngay sau lượt áp tiền gói (webhook lẫn
   khớp tay), `BillingService.creditSubscriptionOverpayWithinTx` ghi có ví TENANT phần thừa, loại
   `subscription_overpay`, nguồn = chính giao dịch (mỗi khoản thừa một dòng). Phần thừa đo bằng TIỀN
   THẬT đã khớp vào đích (hoá đơn lẻ, hoặc phiếu gộp gồm cả khoản khớp tay vào hoá đơn con):
   `thừa = max(0, trước + lượt này − tổng) − max(0, trước − tổng)` — KHÔNG bằng `paid_amount`, vì gói
   admin gán tay ("thu ngoài luồng") sinh hoá đơn `paid` không có đồng nào về; khớp khoản chuyển khoản
   thật vào đó là trả gói, không phải tiền thừa để hoàn. Gian hàng rút về ngân hàng qua đường rút sẵn có.
4. **Mã lý do thay câu chữ.** Cột `match_reason_code` (`BANK_MATCH_REASON`: `hold_not_found`,
   `hold_closed`, `extension_not_found`, `extension_closed`, `checkout_not_found`,
   `checkout_closed`, `invoice_not_found`, `invoice_closed`, `overpaid`; CHECK ở DB) +
   `match_reason_params` (`{ code, status }`). Giao diện dịch ra nhãn; `match_note` chỉ còn là ghi chú
   của NGƯỜI. Dòng cũ có `match_note = 'overpaid'` được chuyển sang cột mã; câu chữ cũ khác giữ nguyên.
   Hàng đợi lọc được theo lý do và theo số tiền chính xác; ô tìm kiếm tìm cả mã tham chiếu ngân hàng (FT…).
5. **Quyền.** Hai lượt mới đụng tiền marketplace nên đòi `platform.billing.manage` +
   `platform.money.manage`, `@PlatformOnly`; mỗi lượt ghi audit (`bank_transaction.match_receivable`,
   `bank_transaction.credit_customer`).
6. **Đối soát ngày.** Tiền vào có nhóm riêng `matchedWalletCredits`; phần gói thừa đã vào ví bị trừ khỏi
   "tiền gói chưa thành doanh thu" (nghĩa vụ nằm ở vế ví) — không đếm đôi.

## Hệ quả

- Không còn đồng tiền nào của khách/gian hàng phải chuyển trả tay ra ngoài sổ khi họ có tài khoản; mọi
  khoản hoàn đi qua sổ ví và đối soát ba vế thấy nó.
- Migration `20261116140000_bank_tx_wallet_credit_reason`: mở rộng CHECK `matched_type`
  (`wallet_credit`), `wallet_entries.kind` (`late_payment_refund`, `subscription_overpay`),
  `wallet_entries.source_type` (`bank_transaction`); thêm hai cột lý do + chỉ mục
  `(match_status, match_reason_code)`.
- `BillingModule` và `SepayModule` import `WalletModule` (không vòng phụ thuộc).
- App native không đổi; nhãn hai loại bút toán mới nằm ở `Domain.walletEntryKind` dùng chung.

## Cần xem lại khi

Có cổng chi tự động được phép (tiền về muộn có thể trả thẳng về tài khoản gốc); cổng MoMo/VNPAY mở cho
tiền gói (khoản thừa qua cổng đi đường riêng của ADR 0058); hoặc gian hàng phản ánh muốn nhận lại tiền
gói thừa bằng chuyển khoản thay vì ví.
