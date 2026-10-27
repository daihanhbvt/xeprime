# ADR 0072 — Huỷ miễn phí tính từ lúc tiền giữ chỗ về ĐỦ; hết hạn thanh toán là tự huỷ

Ngày: 27/10/2026 · Trạng thái: **Accepted** · Ghi đè: [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 3 (mốc BẮT ĐẦU và ΔT của `T_cancel`), [0064](0064-financial-flow-v2.md) điều 7 (câu "cả hai mốc tính xuôi từ `acceptedAt`"), [0032](0032-booking-deposit-insurance-and-owner-lite.md) điều 5 (câu "mốc chốt một lần khi nhận chuyến") · Giữ nguyên: 0066 điều 2 (chia tiền huỷ muộn), 0044 điều 3 (không gia hạn, hai mốc nhắc), 0032 điều 5 (mốc LƯU một lần, không tính lại, gian hàng dời giờ không đổi mốc)

## Bối cảnh

ADR 0066 điều 3 cho hai cửa sổ của một khoản giữ chỗ cùng đếm XUÔI từ `acceptedAt` (lúc chủ xe nhận
chuyến), cùng ΔT = `pickupAt − acceptedAt`:

| Cửa sổ | Độ dài |
| --- | --- |
| Thanh toán `T_pay` | clamp(30% ΔT, 15′, 120′) |
| Huỷ miễn phí `T_cancel` | clamp(20% ΔT, 15′, 2h) |

Với chuyến có ΔT dưới ~10 giờ, `T_cancel` hết TRƯỚC `T_pay`. Màn thanh toán phải dựng thêm một đồng
hồ huỷ miễn phí chạy song song với đồng hồ thanh toán và một câu cảnh báo "huỷ miễn phí kết thúc
TRƯỚC hạn thanh toán". Ảnh thật ngày 27/10/2026: khách thấy "Thời gian thanh toán còn lại 15:45"
(thật ra 1:15:45 — đồng hồ chia chặng 60′, xem Hệ quả) cạnh "Còn lại để huỷ miễn phí 38:45", và hỏi
vì sao huỷ miễn phí lại chạy khi mình chưa trả đồng nào.

Câu hỏi đó đúng. Trước khi tiền về đủ:

- chưa có đơn thuê nào để huỷ (đơn chỉ ra đời khi đối soát đủ tiền — ADR 0044 điều 2);
- khách chưa mất đồng nào: không trả thì hết hạn là khoản giữ chỗ tự đóng, lịch được nhả, phần đã
  chuyển (nếu có) hoàn đủ vào Ví điểm (worker `booking-hold-expiry`).

Một đồng hồ "huỷ miễn phí" chạy trong giai đoạn đó đo một quyền khách không cần dùng, và tiêu hết
quyền khách SẼ cần sau khi trả. Khách trả ở phút cuối hạn thanh toán của một chuyến cận ngày nhận
một đơn mà quyền huỷ miễn phí đã hết từ trước lúc trả.

Chủ sản phẩm chốt (27/10/2026): huỷ miễn phí phải tính từ lúc cọc (tiền giữ chỗ) thành công mới áp
công thức; không cọc trong hạn thì tự động huỷ.

## Quyết định

### 1. Hai cửa sổ, hai mốc bắt đầu

| Cửa sổ | Bắt đầu | ΔT | Độ dài | Lưu lúc |
| --- | --- | --- | --- | --- |
| Thanh toán `T_pay` | `acceptedAt` | `pickupAt − acceptedAt` | clamp(round(30% ΔT), 15′, `holdPaymentWindowMinutes`) | tạo khoản giữ chỗ |
| Huỷ miễn phí `T_cancel` | `paidAt` (tiền về ĐỦ) | `pickupAt − paidAt` | clamp(round(20% ΔT), 15′, `freeCancelHours` × 60) | lượt tiền về đủ |

- Cả hai đều kẹp bởi `pickupAt`. Sàn 15′ nhường trần khi chính sách tắt huỷ miễn phí
  (`freeCancelHours = 0` ⇒ 0) như ADR 0066.
- Trần `freeCancelHours` đọc từ chính sách ĐÃ ĐÓNG BĂNG trong hold (`price_snapshot_json.fees.policy`),
  giờ nhận từ `schedule_json` — không từ chính sách hôm nay (ADR 0024).
- Hàm dùng chung: `freeCancelWindowFromPayment({ paidAt, pickupAt, freeCancelHours })` ở
  `@xeprime/types`. `holdWindowsFor` vẫn tính cả hai độ dài cho bản XEM TRƯỚC (màn duyệt, cảnh báo
  đặt sát giờ: "nếu nhận và trả ngay"), nhưng lượt tạo hold chỉ LƯU `expiresAt`.

### 2. Mốc huỷ miễn phí được ghi đúng một lần, trong lượt tiền về đủ

- `booking_holds.free_cancel_until` thành NULLABLE: NULL cho tới khi tiền về đủ.
- `BookingHoldsService.applyBankPaymentWithinTx` — điểm DUY NHẤT biến chuyến thành đơn, chung cho
  SePay và cổng MoMo/VNPAY — tính mốc từ `paidAt` và ghi nó trong CHÍNH câu `UPDATE` lật hold sang
  `paid` (cùng `paid_at`).
- CHECK `booking_holds_paid_has_free_cancel`: `paid_at IS NULL OR free_cancel_until IS NOT NULL`. Lượt
  chốt kết cục huỷ (`decideOutcome`) đọc mốc này để chia tiền; DB không cho tồn tại một hold đã trả mà
  thiếu nó.
- Mốc vẫn LƯU một lần và không tính lại (ADR 0032 điều 5): gian hàng dời giờ nhận xe sau đó không nới
  hay rút ngắn quyền của khách.

### 3. Trước khi tiền về đủ: không có huỷ miễn phí, chỉ có hạn thanh toán

- Khách huỷ một chuyến `awaiting_hold`: không mất gì; phần đã chuyển (trả thiếu) hoàn đủ — không đổi.
- Hết hạn thanh toán mà chưa đủ tiền ⇒ **tự động huỷ**: hold `expired`, yêu cầu `hold_expired`, nhả
  lịch, nhả lượt mã khuyến mãi, hoàn phần đã chuyển vào Ví điểm, báo hai bên, mời đặt lại khách từng
  bị `slot_taken` — không đổi (ADR 0044 điều 3, ADR 0045 điều 6). Tiền về sau hạn không tạo đơn
  (ADR 0044 điều 7).

### 4. Hiển thị

- API khách (`CustomerHoldDto`) thêm `freeCancelStarted` (đã trả đủ chưa) và `freeCancelMinutes`
  (đã trả: độ dài thật; chưa trả: độ dài NẾU trả ngay bây giờ — server tính bằng chính hàm ở điều 1).
  `freeCancelUntil` vẫn luôn có giá trị — chưa trả thì là mốc dự kiến nếu trả ngay — để app di động đã
  phát hành, vốn đọc trường này như mốc đã lưu, không vỡ. Client mới đọc kèm `freeCancelStarted`.
- Màn thanh toán / chờ giữ chỗ: chưa trả ⇒ một dòng "Huỷ miễn phí: {N} kể từ lúc thanh toán thành
  công", KHÔNG có đồng hồ huỷ miễn phí; đã trả ⇒ đồng hồ đếm ngược tới mốc đã lưu.
- Bỏ câu "huỷ miễn phí kết thúc TRƯỚC hạn thanh toán" và hàm `isFreeCancelWindowShort`: ca đó không
  còn tồn tại.
- Chính sách huỷ công bố (`/legal/cancellation` mục 3–4) và câu chính sách ở trang chi tiết xe nói
  "kể từ lúc thanh toán tiền giữ chỗ thành công"; `LEGAL_EFFECTIVE_FROM` dời sang 27/10/2026.

## Hệ quả

- Khách luôn có trọn cửa sổ huỷ miễn phí SAU khi trả (tối thiểu 15′, trừ khi giờ nhận xe kẹp lại hoặc
  chính sách tắt). Chủ xe giữ chỗ lâu hơn một chút trước khi chắc chuyến thành (tối đa `T_pay` +
  `T_cancel`); phần đền huỷ muộn (ADR 0066 điều 2) không đổi.
- Thanh toán càng sát giờ nhận, `T_cancel` càng ngắn — khách chần chừ tự rút ngắn quyền huỷ của mình,
  không phải của chủ xe.
- Hold đã trả TRƯỚC ADR 0072 giữ mốc cũ (tính từ `acceptedAt`). `freeCancelAvailable` so mốc với
  `paid_at`: hold cũ mà mốc đã qua lúc trả được nói đúng là "không có thời gian huỷ miễn phí". Hold
  còn chờ tiền lúc triển khai được ghi đè bằng mốc mới khi tiền về.
- App di động chưa đọc `freeCancelStarted`: trước khi trả nó hiện mốc dự kiến (nếu trả ngay) như một
  mốc thật; câu `freeCancelSoon` dùng chung đã viết lại để vẫn đúng. Cập nhật app theo điều 4.
- Cùng đợt: đồng hồ đếm ngược trên web bỏ kiểu chia chặng 60′ ("15:45 · giờ 2/2" đọc thành "còn 15
  phút" trong khi còn 1:15:45) — hiện một con số `h:mm:ss`. App di động vẫn chia chặng.

## Cần xem lại khi

- Tỉ lệ chuyến bị huỷ trong `T_cancel` sau khi trả tăng mạnh ở nhóm đặt cận ngày — dấu hiệu khách dùng
  cửa sổ mới để "giữ chỗ miễn phí rồi huỷ"; cân nhắc trần riêng cho ΔT ngắn.
- Có kênh thanh toán trả tiền theo nhiều lượt dài ngày (trả góp) — "tiền về đủ" khi đó cần định nghĩa
  lại.
