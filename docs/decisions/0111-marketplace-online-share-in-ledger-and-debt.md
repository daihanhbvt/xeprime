# ADR 0111 — Phần khách trả trước qua XePrime vào sổ Thu-Chi và công nợ của chủ xe

Ngày: 26/11/2026 · Trạng thái: **Accepted** (26/11/2026 — người dùng chốt khi rà tab Tài chính của hồ sơ
xe) · Bổ sung: [0064](0064-financial-flow-v2.md) điều 5 (năm cột tiền của hold),
[0068](0068-platform-tax-withholding-nd117-nd68.md) (thuế khấu trừ), [0033](0033-money-ledger-and-deposit-allocation.md)
(Ví điểm là sổ công nợ phải trả), [0110](0110-booking-source-and-direct-bookings-for-all-owners.md) (doanh
thu theo nguồn đơn) · Giữ nguyên: cách chia tiền giữ chỗ, Ví điểm, thuế, phí sàn

## Bối cảnh

Với đơn QUA SÀN, khách trả trước online cho XePrime tiền giữ chỗ; trong đó phần `D` là tiền thuê của chủ xe
(ADR 0064). Lúc quyết toán, `D − T` vào Ví điểm của chủ xe, `T` là thuế XePrime khấu trừ và nộp thay
(ADR 0068). Phần còn lại khách trả tay lúc nhận xe và được ghi bằng phiếu `payment`.

Trước ADR này, `D` không xuất hiện ở đâu trong sổ của chủ xe:

- **Doanh thu hụt.** Sổ Thu-Chi chỉ có phiếu tiền thu tay, nên doanh thu của một đơn qua sàn 720.000đ chỉ
  ghi 504.000đ; khối "Doanh thu theo nguồn" (ADR 0110) báo phần qua sàn thấp hơn thật đúng 30%.
- **Công nợ sai.** Công thức công nợ (`bookingMoney` / `SQL_DEBT`) không tính `D` là đã thu, nên mọi đơn qua
  sàn hiện "còn nợ" đúng bằng `D` ở /manage/debts, thẻ công nợ, sổ khách, hợp đồng - dù khách đã trả. Chỉ
  riêng "còn phải thu tận tay" (`counterDueAmount`) trừ `D`, nên hai con số trên cùng một đơn nói hai điều.
- **Thuế khấu trừ** không có trong chi phí của xe.

## Quyết định

1. **Lượt quyết toán ghi hai phiếu tự động**, trong CÙNG transaction chốt kết cục
   (`HoldSettlementService`), số lấy từ phân bổ đã chốt, mốc là lúc chốt:
   - phiếu THU `RECEIPT_SOURCE.XEPRIME_PAYOUT` = `settled_owner_amount + settled_tax_amount` (phần chủ xe
     TRƯỚC thuế), danh mục hệ thống `xeprime_payout` "Tiền qua XePrime";
   - phiếu CHI `RECEIPT_SOURCE.TAX_WITHHELD` = `settled_tax_amount` khi > 0, danh mục `tax_withheld`
     "Thuế khấu trừ".

   Cả hai gắn đơn, xe, khách của đơn; `source_ref_id` = `booking_holds.id`, unique `(tenant, source, ref)`
   chặn ghi đôi. Thu trừ chi = đúng số vào Ví điểm. Huỷ muộn / không đến: chủ xe nhận trọn `D`, không thuế ⇒
   chỉ phiếu thu. Huỷ miễn phí: chủ xe không nhận gì ⇒ không phiếu. Đây là phiếu tự động: không huỷ tay.
2. **`D` đã trả online là "đã thu" của đơn ngay khi tiền giữ chỗ về đủ** (`booking_holds.paid_at` có giá
   trị, số là `booking_holds.deposit_amount`): cộng vào `collectedAmount` ở `bookingMoney` và
   `SQL_COLLECTED`. Hệ quả: công nợ = số khách còn phải đưa tận tay; `counterDueAmount` trên DTO bằng
   `debtAmount` (giữ trường cho client cũ). Phiếu `xeprime_payout` KHÔNG được cộng vào "đã thu" (nó chỉ ghi
   nhận cùng khoản tiền đó vào sổ, cộng nữa là đếm đôi). Hợp đồng in "đã trả" gồm `D`.
3. **Ghi bù** bằng migration `20261126150000_xeprime_payout_receipts` cho mọi khoản giữ chỗ đã quyết toán.

## Hệ quả

- Doanh thu qua sàn ở mọi màn tiền (Tổng quan doanh thu, theo xe, theo khách, theo nguồn, tab Tài chính
  của hồ sơ xe) bằng giá trị thật của chuyến; chi phí có dòng "Thuế khấu trừ".
- Phần `D` của một chuyến chưa quyết toán CHƯA là doanh thu (tiền còn ở XePrime và có thể phải hoàn), nhưng
  đã không còn là công nợ của khách.
- "Cân đối quỹ" của sổ có thêm phần tiền nằm ở Ví điểm - đó là tiền của chủ xe, chỉ chưa rút.

## Không làm

- Không ghi hoa hồng `H` thành phiếu chi: `D` đã là phần sau `H` (ADR 0101), chủ xe chưa từng nhận `H`.
- Không gắn phiếu với dòng ví (`wallet_entries`): khoản cộng ví có thể hẹn giờ, nhưng phiếu ghi tại mốc
  quyết toán - mốc tiền thuộc về chủ xe.
