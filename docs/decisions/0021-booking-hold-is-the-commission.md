# ADR 0021 — Khoản giữ chỗ **LÀ** hoa hồng: khách chuyển online cho nền tảng, phần còn lại trả thẳng chủ xe

Ngày: 28/08/2026 · Trạng thái: Accepted · **Thu hẹp [ADR 0013](0013-no-online-payment-mvp.md) ràng buộc điều 2**

> ⚠️ **[ADR 0025](0025-shop-escrow-hold-and-payout.md) thu hẹp ĐIỀU 1 (29/08/2026):** câu *“nền
> tảng giữ luôn, không cần đường chuyển trả”* chỉ còn đúng cho khoản giữ chỗ mang
> `purpose = commission`. Gian hàng tuyến gói bật được khoản giữ chỗ `purpose = escrow` — **tiền
> của gian hàng, nền tảng giữ hộ và phải chuyển trả**. Điều 2–10 giữ nguyên cho hold hoa hồng;
> `kept` không bao giờ áp cho escrow.

## Bối cảnh

[ADR 0020](0020-two-revenue-tracks-one-marketplace.md) chốt tuyến A lấy 10% phía chủ xe. Câu hỏi
còn lại là **thu bằng cách nào**, và mọi câu trả lời hiển nhiên đều đắt:

- **Cắt % rồi chuyển trả phần còn lại cho chủ xe** (cách Mioto làm): nền tảng giữ tiền hộ ⇒ cần
  đối soát hai chiều, quy trình chuyển trả, xử lý tranh chấp, hoàn tiền một phần, và nghĩa vụ
  pháp lý của một trung gian thanh toán. Đây **chính xác** là thứ
  [ADR 0013](0013-no-online-payment-mvp.md) từ chối, và lý do từ chối vẫn đúng nguyên.
- **Đi đòi từng đơn sau chuyến**: không thu được. Chủ xe đã cầm tiền rồi.
- **Thu theo kỳ như hoá đơn cuối tháng**: công nợ với hàng nghìn cá nhân, mỗi khoản vài trăm
  nghìn. Chi phí đòi vượt số tiền đòi.

## Quyết định

1. **Khoản giữ chỗ đúng bằng hoa hồng, và nền tảng giữ luôn.**

   ```
   Chuyến 780.000đ · hoa hồng 10%
     Khách chuyển online cho NỀN TẢNG      78.000đ   ← giữ chỗ = hoa hồng, giữ luôn
     Khách trả TAY cho CHỦ XE khi nhận xe 702.000đ   ← ngoài sàn, ghi sổ như hiện tại
     ────────────────────────────────────────────
     Khách trả tổng                       780.000đ   ← ĐÚNG giá niêm yết
     Chủ xe thực nhận                     702.000đ   ← 90%
   ```

   Hai nhánh tiền **không bao giờ gặp nhau**. Ở luồng thuận lợi nền tảng **không phải chuyển
   trả cho ai đồng nào** — không đường payout, không đối soát hai chiều, không giữ tiền hộ.

2. **Đây không phải tiền của chủ xe gửi nhờ.** Nó là **phí dịch vụ của chính nền tảng**, thu
   trực tiếp — cùng bản chất với tiền gói mà [ADR 0016](0016-sepay-bank-reconciliation.md) đã
   cho phép thu online. Lý do gốc của [ADR 0013](0013-no-online-payment-mvp.md)
   (*"XePrime không giữ tiền hộ nên không phát sinh nghĩa vụ pháp lý của trung gian thanh
   toán"*) **không bị phá**: tiền thuê vẫn chảy thẳng khách → chủ xe.

3. **Thu hẹp [ADR 0013 ràng buộc điều 2](0013-no-online-payment-mvp.md).** Câu cũ:
   *"Luồng đặt xe kết thúc ở 'đã gửi yêu cầu → gian hàng duyệt'. Không thiết kế bước thanh toán,
   không thiết kế trạng thái 'chờ thanh toán'."* Câu mới:

   > Luồng đặt xe kết thúc ở "đã gửi yêu cầu → gian hàng duyệt" với **mọi listing chế độ
   > `package`**. Listing chế độ `commission` có thêm bước chuyển khoản giữ chỗ. **Trạng thái
   > "chờ tiền" nằm trên `booking_holds`, KHÔNG nằm trên `bookings`.**

   Ràng buộc 1 (đừng gọi `payments` là "thanh toán"), 3 (cọc là tài sản giữ hộ) và 4 giữ nguyên.

4. **`booking_holds` là bảng riêng, KHÔNG dùng `payments`.** Ba lý do, mỗi lý do đủ để tự nó
   quyết định:
   - `PaymentsService` tự sinh **phiếu thu đã duyệt cho tenant** trong cùng transaction. Khoản
     giữ chỗ **không phải thu nhập của gian hàng** — nó là tiền nền tảng thu *của* họ. Ghi vào
     đó là làm sai báo cáo tài chính của chính khách hàng mình.
   - `PaymentsService` là writer duy nhất của `booking.paid_amount`. Khoản giữ chỗ không được
     cộng vào đó (khách chưa trả tiền thuê).
   - Ở tuyến A khách trả tiền **trước khi booking tồn tại**. Hold neo vào `booking_requests` —
     dòng đó đã có SĐT đã xác thực OTP, `tenant_customer`, lịch trình, chống trùng và chặn khách
     bị khoá.

   Cũng **không** mở rộng `HELD_FUNDS_RECEIPT_SOURCES`: khoản giữ chỗ không hề đi qua sổ sách
   của tenant, nên không có gì để loại trừ.

5. **`BOOKING_STATUS` không thêm giá trị nào.** Trạng thái chờ tiền sống trên
   `booking_holds.status` và trên hai giá trị mới của `BOOKING_REQUEST_STATUS`:
   `awaiting_hold` và `hold_expired`. Không có `hold_paid` — webhook đánh dấu đã trả **và** tạo
   booking trong **cùng một transaction**, nên trạng thái "đã trả mà chưa có đơn" không bao giờ
   quan sát được. Một trạng thái đáng lẽ không ai thấy là một trạng thái sẽ có người thấy.

6. **Chiếm lịch lúc TẠO hold (khoá mềm 15 phút), không phải lúc tiền về.**
   `awaiting_hold` vào `BOOKING_REQUEST_STATUS_OCCUPYING`.

   Điều này **cố ý đi ngược** ghi chú ở `booking-request.ts` (*"yêu cầu chờ duyệt không chiếm
   lịch nên nhiều khách hỏi cùng lúc được"*). Ghi chú đó nói về việc **hỏi**; **trả tiền** là
   chuyện khác. Nếu chỉ chiếm khi tiền về thì hai khách cùng chuyển tiền cho một chỗ và buộc
   phải hoàn một người — phá đúng cái đơn giản hoá ở điều 1 mà cả mô hình dựa vào. Khoá mềm 15
   phút là mặt rẻ của đánh đổi đó.

   **Không cần chủ xe duyệt.** Trả tiền là có xe. Chủ xe đã bật xe lên sàn là đã đồng ý cho thuê.

7. **Quyền huỷ miễn phí đóng băng lúc tạo hold.** `free_cancel_until = pickup_at − 4 giờ`, lưu
   thành **cột `Timestamptz`, tính một lần**. Hai lý do:
   - Đổi hằng số 4 giờ sau này **không được** sửa quyền của đơn đã đặt.
   - Gian hàng dời `pickup_at` **không được** âm thầm nới hay xoá quyền khách đã có.

   Đây là số học trên mốc tuyệt đối — **không đụng máy móc múi giờ VN**. Múi giờ chỉ vào ở khâu
   hiển thị. Đếm ngược trên trình duyệt đọc mốc từ server, không tự tính.

8. **Không thu 10% của một con số đoán.** Hai cổng chặn "đặt ngay", **enforce ở server**:
   - `serviceType === 'long_term'` → không đủ điều kiện. Thuê dài hạn chưa có giờ nhận chốt
     ([ADR 0011](0011-long-term-fixed-packages.md)) nên không có mốc 4 giờ để tính.
   - Báo giá có `estimateNote` (tuyến có tài xế chưa niêm yết giá → chỉ *tạm tính*) → không đủ
     điều kiện.

   Cả hai rơi về luồng gửi yêu cầu với mã lỗi `INSTANT_BOOK_UNAVAILABLE`.

9. **Hoa hồng KHÔNG phải một dòng trong bảng kê giá của khách.** Nó là field anh em của
   `longTerm?` trên `BookingPriceSnapshot`, tên `platformFee?`. Hai lý do cứng:
   - `BookingPriceSnapshot.totalAmount` được định nghĩa là *"tổng các dòng"* và có code đọc từng
     dòng theo khoá. Thêm dòng hoa hồng thì hoặc đổi tổng khách phải trả (sai — đó là lời hứa
     của sản phẩm), hoặc phá bất biến `total = Σ rows`.
   - `rows` là **hoá đơn của KHÁCH**. Hoa hồng là chuyện phía chủ xe. Nhét vào đó là cách để sáu
     tháng nữa ai đó vô tình tái tạo đúng vấn đề 28% của Mioto.

   Kéo theo: `buildDailyQuote` và `buildLongTermPackageQuote` **không đổi một dòng** — chúng
   tính giá khách, mà giá khách không phụ thuộc chế độ thu phí của chủ xe. Hoa hồng tính ở một
   hàm thuần riêng.

10. **Kết cục của khoản giữ chỗ có đúng ba khả năng**, ghi ở cột `outcome` tách khỏi `status`
    (*tiền đã về chưa* và *cuối cùng tiền về tay ai* là hai câu hỏi khác nhau, sống ở hai thời
    điểm khác nhau):

    | Tình huống | `outcome` | Tiền |
    | --- | --- | --- |
    | Chuyến hoàn thành | `kept` | Nền tảng giữ. Không chuyển đi đâu |
    | Khách huỷ **trước** `free_cancel_until` | `refunded` | Ghi có ví khách ([ADR 0023](0023-wallet-refund-and-compensation.md)) |
    | Khách huỷ **sau** mốc đó, hoặc không đến | `forfeited` | Ghi có ví gian hàng — bồi thường |
    | **Chủ xe** huỷ | `refunded` | Nền tảng hoàn khách + ghi audit ([ADR 0020](0020-two-revenue-tracks-one-marketplace.md) mục hoãn) |

## Ràng buộc bắt buộc

1. **Đừng gọi khoản này là "cọc" ở bất kỳ đâu.** Cọc xe là tài sản giữ hộ giữa khách và gian
   hàng, hai bên tự thoả thuận, nền tảng không đụng tới
   ([ADR 0020 điều 4](0020-two-revenue-tracks-one-marketplace.md)). Khoản giữ chỗ là phí của nền
   tảng. Gọi lẫn tên là cách nhanh nhất để ai đó viết code hoàn nhầm khoản.
2. **`BookingHoldsService` chỉ ghi `booking_holds`.** Không ghi `booking_requests`, `bookings`,
   `wallets`. Điều phối nằm trong transaction của bên gọi.
3. **Số tiền giữ chỗ không làm tròn lên nghìn.** VietQR mang sẵn số tiền, khách không gõ gì, và
   số chính xác là thứ làm cho đối soát tự động rẻ. Dùng **sàn** `HOLD_MIN_AMOUNT` nếu cần chặn
   khoản quá nhỏ, và giữ cả `computed_amount` lẫn `amount` để giải thích được chênh lệch.
4. **Giới hạn số hold đang mở của một khách.** `awaiting_hold` chiếm chỗ thật mà chưa có tiền —
   đây là bề mặt phá hoại. Giới hạn số hold mở, giữ cửa sổ 15 phút, và rate-limit endpoint
   đặt-ngay **tách khỏi** endpoint gửi yêu cầu.

## Hoãn có chủ đích

- **Thu tiền thuê xe qua nền tảng.** Vẫn nằm trong lệnh cấm của
  [ADR 0013](0013-no-online-payment-mvp.md), không đụng tới. 90% còn lại trả tay.
- **Giữ chỗ online cho tuyến B.** Gian hàng đã trả tiền gói thì không đi qua sàn đồng nào.
  Mở ra sẽ buộc phải xây thu hộ + chuyển trả — đúng thứ ADR này tránh được.
- **Hoàn tiền tự động về tài khoản ngân hàng.** Chuyển khoản ở VN là *đẩy*; nền tảng không tự
  trả về được. [ADR 0023](0023-wallet-refund-and-compensation.md) giải bằng ví.

## Hệ quả

- Bảng mới `booking_holds`; hai trạng thái mới của `booking_requests`; **không** trạng thái mới
  nào của `bookings`.
- Tuyến A phải tính giá ngay ở `submitPublic` (hiện chỉ tính lúc `approve`), vì số tiền giữ chỗ
  phải tồn tại trước khi khách chuyển khoản.
- Job dọn hold hết hạn ở `apps/worker` — claim bằng điều kiện nên chạy lại ra 0 dòng.
- **`common/booking-money.ts` phải sửa trong cùng đợt.** Đơn tuyến A có `total_amount` là tổng
  chuyến nhưng chủ xe chỉ ghi nhận 90% họ thực thu ⇒ phép trừ để lại **đúng khoản hold làm nợ
  ảo treo vĩnh viễn** trên `/manage/debts`. File đó tồn tại để tránh hai con số cho một đồng;
  bỏ qua là tạo con số thứ ba.
- `BOOKING_REQUEST_STATUS_OCCUPYING` là mảng **không có kiểm tra vét cạn** — quên thêm
  `awaiting_hold` là bán trùng xe mà compiler không báo. Phải có test khoá danh sách này.

## Cần xem lại khi nào

Khi tỉ lệ hold hết hạn không trả tiền vượt ~30% (khoá mềm thành công cụ phá hoại, hoặc bước
chuyển khoản quá khó), hoặc khi có cổng thanh toán *kéo* tiền được ở VN — lúc đó cửa sổ 15 phút
và toàn bộ cơ chế đối soát trở nên thừa.
