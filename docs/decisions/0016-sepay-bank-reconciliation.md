# ADR 0016 — SePay: đối soát chuyển khoản tự động cho tiền GÓI (khe hẹp của ADR 0013)

Ngày: 21/08/2026 · Trạng thái: Accepted · **Sửa phạm vi [ADR 0013](0013-no-online-payment-mvp.md)**

> ⚠️ **[ADR 0022](0022-sepay-customer-money.md) mở rộng ĐIỀU 1 (28/08/2026):** phạm vi không còn
> là *"chỉ tiền GÓI, chỉ chiều gian hàng → nền tảng"* mà là **mọi khoản VÀO tài khoản nền tảng**,
> từ hai nguồn (hoá đơn gói và khoản giữ chỗ của khách), phân loại bằng **tiền tố mã đối soát**
> (`XPG…` / `XPH…`). **Điều 2, 3, 4, 5 giữ nguyên câu chữ** và áp cho cả hai nguồn.
> Điều 6 giữ nguyên với hoá đơn gói; riêng khoản giữ chỗ **không có "kỳ sau"** để ghi có tiền
> thừa — xem [ADR 0022 điều 5](0022-sepay-customer-money.md).

## Bối cảnh

[ADR 0015](0015-vehicle-slot-billing.md) mở bán gói theo kỳ, kể cả kỳ 1 tháng. Với đơn giá cỡ
100k/tháng (ô tô) và 35k/tháng (xe máy), **thu tiền thủ công lỗ**: mỗi kỳ phải mở app ngân hàng dò
một giao dịch vài chục nghìn, nhân với số tenant. Không scale quá vài chục người.

[ADR 0013](0013-no-online-payment-mvp.md) chốt **không làm thanh toán trực tuyến** ở giai đoạn này.
Lý do của nó là luồng tiền **khách ↔ gian hàng**: giữ tiền hộ, hoàn tiền, tranh chấp, và giấy phép
trung gian thanh toán. Luồng **nền tảng ↔ gian hàng** không có tính chất nào trong số đó.

## Quyết định

1. **Mở một khe hẹp của ADR 0013: chỉ tiền GÓI, chỉ chiều gian hàng → nền tảng.** ADR 0013 vẫn
   giữ nguyên hiệu lực cho tiền thuê xe; `payments` của booking vẫn là ghi sổ thủ công.

2. **Dùng SePay làm ĐỐI SOÁT, không phải cổng thanh toán.** SePay lắng nghe biến động tài khoản
   ngân hàng của nền tảng rồi bắn webhook. Nền tảng **không giữ tiền hộ ai** — tiền vào thẳng tài
   khoản của nền tảng, đúng bản chất một khoản phí dịch vụ.

3. **SePay KHÔNG tự động trừ tiền.** Chuyển khoản ở VN là *đẩy*: khách vẫn phải chủ động chuyển
   mỗi kỳ. Cái được tự động hoá là **nhận ra tiền đã về và khớp vào hoá đơn nào**. Hệ quả bắt
   buộc: phải có **luồng nhắc hạn** (trước hạn / đúng hạn / trong ân hạn) qua module
   `notification`, nếu không đối soát tự động chỉ giỏi ghi nhận việc khách rời đi.

4. **Webhook là bề mặt tấn công, không phải một controller thường.** Đây là endpoint **công khai,
   không session** đầu tiên trong `apps/api` có quyền ghi tiền. Bắt buộc:
   - Xác thực `Authorization: Apikey …`, **so sánh time-safe**; đứng ngoài `AuthGuard` một cách
     **tường minh**, không phải vì quên gắn decorator.
   - **Idempotent bằng CONSTRAINT DB** (unique trên mã giao dịch SePay), không bằng check ở tầng
     app — cùng kỷ luật với ADR 0006. Webhook được gửi lại khi timeout; thiếu unique là cộng tiền
     hai lần.
   - **Kích hoạt gói do webhook**, không do redirect của trình duyệt. Tiền về lúc nào không liên
     quan đến việc người dùng có quay lại trang hay không.

5. **Nội dung chuyển khoản là khoá đối soát ⇒ luôn phát VietQR có sẵn nội dung.** Không bao giờ để
   người dùng tự gõ. Mã ngắn, không dấu, tránh cặp dễ nhầm (`0/O`, `1/I`).

6. **Tiền không khớp có quy tắc rõ, không đoán:** chuyển thiếu → `partially_paid`, **không kích
   hoạt gói**, báo admin; chuyển thừa → ghi có, trừ vào kỳ sau. Không tự động hoàn tiền.

## Hoãn có chủ đích

- **Thanh toán tiền thuê xe của khách** — vẫn nằm trong lệnh cấm của ADR 0013, không đụng tới.
- **Tự động gia hạn (auto-renew)** — không khả thi bằng chuyển khoản đẩy; cần thẻ hoặc uỷ nhiệm
  chi, chưa làm.
- **Hoàn tiền gói** — xử lý tay, ghi sổ.

## Hệ quả

- Phụ thuộc bên ngoài: cần tài khoản SePay + tài khoản ngân hàng thật ⇒ phần này **chặn được**
  trong khi các phần khác của ADR 0015 vẫn làm được.
- Bí mật `SEPAY_API_KEY` vào env, validate bằng `zod` như mọi biến môi trường khác.
- Vì có khe hẹp này, **niêm yết kỳ 1 tháng là chấp nhận được** — nhưng ADR 0015 điều 4 vẫn giữ
  `terms[].discountPercent` để kỳ dài rẻ hơn, vì rào cản còn lại là trí nhớ của khách chứ không
  phải công sức của nền tảng.
