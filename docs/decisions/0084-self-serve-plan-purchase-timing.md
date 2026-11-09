# ADR 0084 — Gian hàng tự mua gói: server suy gia hạn / nâng ngay / đổi từ kỳ sau

Ngày: 09/11/2026 · Trạng thái: **Accepted** (09/11/2026 — người dùng chốt khi soát hộp "Mua hoặc gia hạn
gói" của site partner) · Liên quan: [0010](0010-billing-plans-subscriptions.md) (thuê bao append-only,
nối đuôi), [0041](0041-plan-tiers-by-vehicle-count.md) điều 3 + 6 (đọc trần từ `quota_json`; đổi bậc
giữa kỳ), [0065](0065-per-vehicle-type-shop-plans.md) (chuỗi kỳ theo loại xe),
[0083](0083-subscription-checkout-combined-payment.md) (phiếu gộp), [0024](0024-billing-mode-from-plan-frozen-on-booking.md) (không prorate)

## Bối cảnh

Hộp mua gói của gian hàng cho NGƯỜI MUA chọn "thời điểm áp dụng": nối tiếp sau khi hết hạn, hoặc áp dụng
ngay hôm nay. "Áp dụng ngay" đi thẳng vào nhánh `now` của `planSubscriptionChain` — huỷ MỌI kỳ còn hạn cùng
loại xe (đang chạy VÀ đã gia hạn trước) rồi mở kỳ mới từ bây giờ, không bù phần còn lại.

Hệ quả: gia hạn ĐÚNG gói đang dùng thêm một tháng mà bấm "áp dụng ngay" thì mấy tháng đã trả biến mất và
gian hàng nhận về một tháng. Lựa chọn đó không có nghĩa với gia hạn, và người mua không có cách nào biết
mình vừa chọn mất tiền. Ngoài ra web chỉ thấy kỳ ĐANG CHẠY (`currentPlans`), không thấy kỳ đã xếp lịch, nên
không tự nói trước được kỳ mới bắt đầu lúc nào.

## Quyết định

1. **Người mua không chọn thời điểm — server suy từ bậc được chọn** (`selfServePurchaseTiming`,
   `@xeprime/types`), so với các kỳ TRẢ PHÍ còn hạn ở phạm vi xung đột (ADR 0065):

   | Bậc được chọn | Loại (`PLAN_PURCHASE_KIND`) | Thời điểm |
   | --- | --- | --- |
   | Loại xe chưa có kỳ trả phí nào | `new` | bắt đầu khi tiền về |
   | Trần xe CAO HƠN mọi kỳ còn hạn (đang chạy + đã xếp lịch) | `upgrade` | ngay khi tiền về; các kỳ cũ cùng loại xe kết thúc |
   | Cùng bậc với kỳ cuối | `renew` | nối sau kỳ cuối, không huỷ gì |
   | Còn lại (hạ bậc, hoặc thấp hơn một kỳ đã xếp lịch) | `change_next` | nối sau kỳ cuối — hết gói cao mới hạ |

   Trần đọc `quota_json` trước, bậc gói sau, bằng biểu thức tường minh (ADR 0041 điều 3); `null` = không
   giới hạn, cao hơn mọi con số. So với MỌI kỳ chứ không chỉ kỳ đang chạy: đang chạy 1 xe, đã trả trước kỳ
   sau 10 xe, giờ mua 5 xe ⇒ nối tiếp — "nâng ngay" ở đó sẽ huỷ luôn kỳ 10 xe đã trả.

2. **Nâng bậc không bù phần còn lại** (người dùng chốt): gói cao hơn có hiệu lực ngay khi tiền về, gói cũ
   coi như hết hiệu lực. Không quy đổi ngày, không khấu trừ tiền, không hoàn — giữ nguyên luật không
   prorate (ADR 0024). Vì đây là mất mát của người mua, bước xác nhận PHẢI nói rõ kỳ nào sẽ kết thúc trước
   khi tạo hoá đơn.

3. **Suy hai lần, cùng một hàm**: lúc phát hành hoá đơn (kỳ dự kiến in trên hoá đơn) và lúc tiền về
   (`activateFromInvoiceWithinTx` → `planChainWithinTx({ selfServe })`, đọc SAU khoá chuỗi kỳ). Lúc tiền
   về KHÔNG đọc `lines_json.timing`: chuỗi kỳ có thể đã đổi, và hoá đơn phát hành trước ADR này còn mang
   `now` do người mua tự chọn. Trần dùng để suy là trần IN TRÊN HOÁ ĐƠN (`snapshot.quota`), không đọc lại
   bậc gói. Audit `subscription.activate_from_payment` ghi thêm `purchaseKind`.

4. **`timing` của `POST /subscription/purchase` / `/checkouts` còn nhận nhưng bị bỏ qua** (deprecated trong
   OpenAPI) — app cũ không vỡ validate, và không client nào ép được "huỷ kỳ đang chạy" nữa.

5. **Xem trước ở server**: `POST /subscription/purchase/preview` (`subscription.purchase`, không ghi gì)
   trả cho từng gói loại lượt mua, kỳ dự kiến, trần xe, số tiền và các kỳ TRẢ PHÍ sẽ kết thúc; cùng
   `preparePurchase` + `selfServePurchaseTiming` + `planSubscriptionChain` với lượt mua thật. Bước "Kỳ hạn
   và xác nhận" của hộp mua đọc ở đây và khoá nút "Tạo hoá đơn" tới khi bản xem trước khớp đúng lựa chọn.

6. **Admin gán tay (`assign`) giữ nguyên** lựa chọn `next_term` / `now` (ADR 0041 điều 6): đó là thao tác
   có giá đàm phán, bù trừ nằm trong giá admin nhập.

## Hệ quả

- Không còn đường nào để gian hàng tự huỷ kỳ đã trả bằng một lượt gia hạn.
- Hạ bậc không bao giờ cắt ngắn gói cao; số xe vượt trần mới chỉ bị chặn thêm mới (ADR 0041 điều 4) — bước
  xác nhận cảnh báo khi số xe đang có vượt trần của gói sắp tới.
- Hộp mua gói của web còn hai bước: chọn gói → kỳ hạn + xác nhận. `PurchaseModal` (một loại xe) bỏ radio
  thời điểm, hiện kết quả xem trước của server.
- App mobile vẫn gửi `timing` được; server bỏ qua. Màn mua gói của app nên chuyển sang đọc bản xem trước khi
  làm lại.

## Cần xem lại khi

- Muốn bù phần còn lại khi nâng bậc (khấu trừ hoặc quy đổi) — cần ADR mới cho doanh thu ghi nhận và hoá
  đơn 0đ.
- Bậc cùng loại xe có thể trùng trần mà khác tính năng — "cao hơn" lúc đó phải xét thêm tiêu chí ngoài trần
  xe.
