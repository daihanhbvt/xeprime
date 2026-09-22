# ADR 0044 — Duyệt trước, thu tiền giữ chỗ sau

Ngày: 22/09/2026 · Trạng thái: Accepted · Ghi đè: **0039 (toàn bộ)** · Khôi phục: 0032 điều 2 · Liên quan: 0005, 0006, 0011, 0021, 0022, 0024, 0027, 0033

## Bối cảnh

ADR 0039 (16/09/2026) đảo thứ tự của ADR 0032: khoản giữ chỗ sinh ra **lúc khách bấm đặt**, chủ xe duyệt **sau khi tiền về**. Lý do khi đó là ba vấn đề có thật — khách bấm xong không có gì để làm, gian hàng phải quyết định trước khi biết khách có nghiêm túc không, và cửa sổ hai giờ quá dài cho một chỗ chưa có tiền.

Sáu ngày vận hành cho thấy cái giá của thứ tự đó lớn hơn ba vấn đề nó giải:

1. **Khách trả tiền cho một chuyến chưa ai đồng ý nhận.** Đó là lời hứa mà nền tảng không giữ được: chủ xe vẫn có quyền từ chối, và khi họ từ chối thì XePrime đang cầm tiền của một người không mua được gì. Mỗi lượt như vậy sinh một khoản hoàn — đường tốn kém nhất trong cả hệ thống, và là đường duy nhất ADR 0033 phải xử lý bằng tay cho khách vãng lai.
2. **Cửa sổ mười phút biến việc đặt xe thành một cuộc chạy đua.** Khách rời sang app ngân hàng, gặp OTP chậm, quay lại thì đồng hồ đã hết. Hai lần tự gia hạn vá được triệu chứng nhưng đẻ ra một đồng hồ nói dối: màn hình ghi "còn 10 phút" trong khi chiếc xe thực sự bị khoá ba mươi phút — và chủ xe là người trả giá cho khoảng chênh đó.
3. **Chuyến có tài xế mất đường tự nhận** ở thứ tự cũ thì được mở lại, nhưng đổi lại mọi chuyến có tài xế đều phải qua bước tiền trước khi có người xác nhận là có tài xế rảnh.
4. **Chiếc xe bị khoá trước khi chủ xe kịp nhìn thấy yêu cầu.** Đây là điều khó biện minh nhất với người bán: họ mất chỗ vì một người lạ bấm một cái nút.

Đồng thời, quyết định sản phẩm ngày 22/09/2026 khẳng định lại nguyên tắc nền: **không màn hình nào được nói "đặt xe thành công" trước khi backend đối soát xác nhận đã nhận đủ tiền, và không khoản tiền nào được thu trước khi chuyến có người nhận.**

## Quyết định

### 1. Gửi yêu cầu KHÔNG thu tiền và KHÔNG giữ chỗ

Khách chọn xe và gửi yêu cầu ⇒ `pending_host_approval`. Chưa có `booking_holds`, chưa có mã `XPH…`, chưa có `vehicle_occupancies`, và màn kết quả chỉ nói ngắn gọn rằng đang chờ chủ xe duyệt.

Đây là việc khôi phục nguyên tắc gốc của ADR 0006: nhiều khách được phép cùng hỏi một chiếc xe cho cùng khung giờ. Chiếm lịch ở bước này là khoá xe cho một người có thể đã đóng trình duyệt ngay sau khi bấm.

### 2. Chuyến được NHẬN ⇒ chốt lịch, chốt giá, giữ xe, phát QR

Chủ xe bấm duyệt, hoặc xe bật "Đặt ngay" và hệ thống tự nhận. **Cả hai đi qua đúng một đường** (`BookingRequestsService.commitDecision`), khác nhau đúng ở người ký (`decision_source`).

Lượt nhận đó, trong MỘT transaction:

- chốt lịch (dài hạn: gian hàng chọn ngày nhận — ADR 0011);
- tính giá và đóng băng `BookingPriceSnapshot` (ADR 0024);
- `vehicle_occupancies` giữ chỗ — `EXCLUDE USING gist` là trọng tài (ADR 0006);
- sinh `booking_holds` `pending` + mã `XPH…`, đặt `expires_at` và `free_cancel_until` từ cùng một mốc `acceptedAt`;
- đóng những yêu cầu còn chờ đã mất khung giờ (điều 6).

Yêu cầu sang `awaiting_hold`. **Trạng thái này ĐỔI NGHĨA** so với ADR 0039: nó từng là "khách chưa trả, chưa ai duyệt", nay là "đã được nhận, chờ khách trả". Bản ghi cũ phân biệt được bằng `decided_at IS NULL`, và đó là cột mà đường xử lý tiền về đọc.

**Tiền về đủ ⇒ ĐƠN THUÊ, ngay trong transaction của webhook.** Không có bước duyệt thứ hai: chuyến đã được nhận rồi. Đây là điểm DUY NHẤT trong hệ thống biến một chuyến thành đơn — không phải một cú bấm trên giao diện, không phải một lượt quét QR.

### 3. Cửa sổ 120 phút, hai mốc nhắc, không gia hạn

`hold_payment_window_minutes` 10 → **120** (chính sách phí v6), đúng con số ADR 0032 điều 2.

Hai giờ hợp lý trở lại vì chỗ đó nay thuộc về đúng một người: chủ xe đã đồng ý, và không ai khác đang chờ nó. Đồng hồ hiển thị thành **hai chặng 60 phút** (`HOLD_COUNTDOWN_SEGMENT_MINUTES`).

**Không còn tự gia hạn.** Thay vào đó, worker nhắc khách ở mốc còn **60 phút** và còn **15 phút** (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`). Nhắc trung thực hơn gia hạn: đồng hồ nói đúng thời điểm chỗ sẽ nhả, và chủ xe biết chính xác bao giờ xe của họ quay lại chợ.

Ba chi tiết đóng đinh:

- Mốc nhắc tính theo **phần CÒN LẠI**, không theo thời gian đã trôi. Hạn trả tiền bị kẹp bởi giờ nhận xe, nên cửa sổ thật của một chuyến sát giờ ngắn hơn hai tiếng.
- Hold mà cửa sổ **chưa bao giờ dài tới ngưỡng** thì bỏ qua mốc đó (so `expires_at − created_at`). Không có phép so này, một chuyến sát giờ nhận thông báo "còn 60 phút để thanh toán" trong cùng giây với thông báo "hãy thanh toán".
- Mỗi mốc có một **cột claim riêng** (`payment_reminded_at`, `final_payment_reminded_at`), không phải một bộ đếm: hai mốc có câu chữ khác nhau và phải bắn độc lập kể cả khi worker bỏ lỡ mốc đầu.

`booking_holds.extension_count` ở lại như cột LỊCH SỬ — không đường nào ghi vào nó nữa.

### 4. Chuyến không thu tiền giữ chỗ ⇒ đơn ra đời ngay khi được nhận

Chính sách không thu, hoặc báo giá còn tạm tính (`estimateNote != null`) nên không có số tiền nào chốt được ⇒ `commitDecision` tạo ĐƠN THUÊ ngay tại lượt duyệt, và `deposit_collection_mode` đóng băng `direct`/`none` theo đúng lý do.

**Không có QR giả ở bất kỳ nhánh nào.** Một mã QR chỉ tồn tại khi có một số tiền thật đã chốt.

Thuê dài hạn đi đúng đường này: khách nêu nguyện vọng ngày nhận, gian hàng chốt lịch lúc duyệt, và chỉ khi đó mới có giá để in lên QR (ADR 0011). Không thu phần trăm trên một con số chưa chốt.

### 5. Giờ nhận quá gần ⇒ nói thẳng, không phát QR chắc chắn hết hạn

Hạn thanh toán bị kẹp bởi `pickupAt`. Phần còn lại ngắn hơn `HOLD_MIN_USABLE_WINDOW_MINUTES` (**15 phút**, khôi phục từ mức 5 của ADR 0039) ⇒ lượt duyệt trả `HOLD_WINDOW_TOO_SHORT` kèm `{ pickupAt, minWindowMinutes }`.

Đây là một CÂU TRẢ LỜI, không phải lỗi dữ liệu: chuyến sát giờ phải thoả thuận trực tiếp với khách.

### 6. Một khung giờ, một người thắng — những người còn lại được trả lời NGAY

Khi một yêu cầu được nhận, mọi yêu cầu `pending_host_approval` khác trên CÙNG chiếc xe có khung giờ chồng lấn (kể cả phần đệm chuẩn bị) bị đóng bằng trạng thái mới **`slot_taken`**, kèm thông báo `BOOKING_REQUEST_SLOT_TAKEN` cho khách.

Vì sao một trạng thái riêng thay vì `rejected_by_host` hay `expired`:

- `rejected_by_host` nói "chủ xe không muốn nhận bạn" — sai, và nó đẩy khách đi hỏi lại chủ xe thay vì làm điều duy nhất còn tác dụng: chọn xe khác hoặc đổi khung giờ;
- `expired` nói "gian hàng không trả lời" — cũng sai, và nó phạt gian hàng trong tỉ lệ phản hồi vì một việc họ không gây ra.

`slot_taken` vì thế nằm ngoài **cả hai** danh sách tính tỉ lệ phản hồi, và chiếu thành chặng khách riêng (`CUSTOMER_TRIP_STAGE.SLOT_TAKEN`) với câu chữ riêng.

Việc đóng chạy TRONG transaction của lượt duyệt, có trần `SUPERSEDED_SCAN_LIMIT = 50`. Lượt duyệt hỏng (23P01) quay đầu cả transaction — không ai bị đóng oan. Yêu cầu tới SAU khi chỗ đã bị chiếm không nằm trong lô đó, và lượt duyệt của nó vẫn bị chính constraint DB chặn.

### 7. Huỷ và hoàn

- **Khách huỷ trước khi trả tiền**: nhả chỗ, đóng hold (`cancelled`). Không có gì để hoàn — và đó chính là điểm: chiếc xe quay lại chợ ngay, không phải chờ hết cửa sổ hai giờ. Phần đã chuyển dở (hold `underpaid`) đi theo đường hoàn thường.
- **Hết hạn chưa đủ tiền**: hold `expired`, yêu cầu `hold_expired`, nhả lịch, báo hai bên. Phần đã chuyển dở được hoàn (`HOLD_REFUND_REASON.HOLD_EXPIRED`) trong CÙNG transaction với lượt lật trạng thái.
- **Tiền về sau khi hold đã chết**: webhook trả `hold_closed`, giao dịch nằm lại `bank_transactions` cho admin. **Không tạo đơn từ khoản tiền của một yêu cầu đã hết hạn** — chỗ đó có thể đã thuộc về khách khác.
- **Chuyển thừa**: `HOLD_REFUND_REASON.OVERPAID`, ghi có ví điểm ngay nếu khách có tài khoản (ADR 0033 điều 5).
- **Sau khi đã thành đơn**: dùng quy tắc huỷ/hoàn của đơn đã xác nhận (ADR 0032 điều 5) theo mốc `free_cancel_until` đã đóng băng.

`booking_requests.hold_expired` nay được tính là **ĐÃ TRẢ LỜI** trong tỉ lệ phản hồi: gian hàng đã nhận chuyến, khách mới là người không chuyển tiền.

### 8. Chuyến CÓ TÀI XẾ không tự nhận khi có thu tiền giữ chỗ

`AUTO_ACCEPT_BLOCKER.HOLD_REQUIRED_WITH_DRIVER` sống lại. Tài xế phải được gán TRONG transaction tạo đơn để `bookings_driver_schedule_excl` gác được, mà đơn ra đời tới hai giờ sau. Tự nhận ở đây là hứa một chuyến có tài xế rồi hai giờ sau mới biết có ai rảnh không — và lúc đó khách đã trả tiền.

Duyệt tay vẫn đi hết đường bình thường; tài xế được gán ở màn đơn sau khi tiền về.

### 9. Chữ dùng cho khách

Khoản chuyển qua QR gọi là **"tiền giữ chỗ"** ở mọi bề mặt. Nó KHÁC **"cọc thế chấp khi nhận xe"** (`rental-policies`): tiền giữ chỗ chuyển cho XePrime để chốt chuyến và được trừ vào tiền thuê; cọc thế chấp đặt lại cho chủ xe lúc nhận xe và lấy về khi trả xe nguyên vẹn. Báo giá và giao diện gọi tên hai khoản khác nhau, và dấu "i" nói rõ khác biệt.

| Chặng | Khách thấy | Gian hàng thấy |
| --- | --- | --- |
| `pending_host_approval` | Chờ chủ xe duyệt | Cần xử lý |
| `awaiting_hold` | Đã được nhận · chờ thanh toán | Đã nhận · chờ khách thanh toán |
| `converted_to_booking` | Đặt xe thành công · chờ nhận xe | Đã tạo đơn thuê |
| `hold_expired` | Chuyến không thành | Khách không thanh toán |
| `slot_taken` | Xe đã có khách khác | Khung giờ đã có khách khác |

## Hệ quả

- **Gian hàng nhận lại thông báo "có yêu cầu mới" ở bước gửi.** ADR 0039 bỏ nó đi vì đường mặc định khi đó không cần ai duyệt; nay duyệt là việc đầu tiên phải làm.
- **Đường hoàn tiền ngắn đi rõ rệt.** Từ chối và huỷ trước thanh toán — hai lượt phổ biến nhất — không còn chạm tới đường tiền.
- **Dữ liệu LEGACY ADR 0039 vẫn đi hết đường của nó.** Yêu cầu đang ở `awaiting_hold` với `decided_at IS NULL` khi tiền về vẫn chuyển sang `hold_paid` và chờ gian hàng nhận; `hold_paid` vẫn duyệt/từ chối/hoàn được, và worker vẫn hoàn tiền khi quá hạn phản hồi. Hold đang mở giữ nguyên `expires_at` của chúng — không migration nào nới hay rút hạn của một khoản đang chờ tiền.
- **Xe bị khoá tối đa 2 giờ mỗi lượt nhận** (thay vì 30 phút mỗi lượt bấm đặt). Đổi lại, lượt khoá đó là do chính chủ xe quyết định.
- `NOTIFICATION_TYPE.HOLD_EXPIRING` quay lại đúng nghĩa gốc "sắp hết hạn", bắn hai lần thay vì mang nghĩa "đã gia hạn".

## Phương án đã cân nhắc và bỏ

- **Giữ ADR 0039, chỉ nới cửa sổ lên 30–60 phút.** Không chạm tới vấn đề lớn nhất: khách vẫn trả tiền cho một chuyến chưa ai đồng ý nhận, và xe vẫn bị khoá bởi người lạ.
- **Thu tiền trước nhưng chỉ với xe bật "Đặt ngay".** Đúng về nghiệp vụ (xe đó đã cam kết nhận), nhưng để lại hai thứ tự song song trong cùng một hệ thống — và mọi màn hình, mọi worker, mọi đường hoàn đều phải biết mình đang ở thứ tự nào.
- **Giữ tự gia hạn cho cửa sổ hai giờ.** Bốn giờ khoá xe cho một khách không trả tiền là cái giá không ai đồng ý trả, và hai lần nhắc giải quyết đúng vấn đề mà gia hạn nhắm tới.
- **Để yêu cầu thua cuộc tự hết hạn thay vì `slot_taken`.** Rẻ hơn về code, nhưng bắt khách chờ tới một giờ một câu trả lời đã có sẵn, và tính cho gian hàng một lượt "không phản hồi" cho việc họ không gây ra.
