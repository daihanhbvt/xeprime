# ADR 0077 — Gia hạn đơn thuê dài hạn đang chạy

Ngày: 02/11/2026 · Trạng thái: **Accepted** (02/11/2026 — người dùng chốt toàn bộ câu hỏi mở) ·
Nguồn: design Partner-XePrime "All Request / Extend" (`23807:68543`) và "… / Extend / Payment"
(`23807:70054`), 02/11/2026 · Liên quan: [0011](0011-long-term-fixed-packages.md) (gói dài hạn),
[0024](0024-billing-mode-from-plan-frozen-on-booking.md) (đóng băng phí vào đơn), [0006](0006-booking-concurrency.md)
(chống trùng lịch), [0044](0044-approve-before-hold.md) (tiền về mới thành đơn),
[0064](0064-financial-flow-v2.md) · [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) (luồng tiền),
[0068](0068-platform-tax-withholding-nd117-nd68.md) (thuế), [0038](0038-owner-track-split-and-unified-wallet.md) ·
[0065](0065-per-vehicle-type-shop-plans.md) (hai tuyến)

## Bối cảnh

Design mới cho thẻ đơn **thuê dài hạn đang chạy** một nút "Gia hạn": chủ xe chọn +7 ngày · +15 ngày ·
+1 tháng · +3 tháng, hệ thống kiểm xe còn trống, tính "Phí gia hạn", rồi mở màn "Thanh toán" với mã
VietQR vào tài khoản XePrime để gửi cho khách.

Code hiện **chưa có** đường gia hạn nào: `returnAt` của đơn dài hạn do server suy từ gói và không sửa
được (ADR 0011 điều 2). Người dùng hỏi (02/11/2026):

1. Thuê dài hạn đã có cấu hình % theo từng gói tháng chưa, có giảm dần theo thời hạn không?
2. Phí khách trả và phí chủ xe trả của phần gia hạn tính thế nào; chủ xe cá nhân và gian hàng mỗi bên
   chạy luồng nào?
3. Chủ xe cá nhân lên gian hàng, hoặc gian hàng hạ về cá nhân, khi đang có đơn dài hạn thì xử lý ra sao?

### Hiện trạng (đã có, không phải làm mới)

| Lớp | Có gì | Ai đặt |
| --- | --- | --- |
| Giá thuê `B` của gói | `đơn giá tháng × số tháng − ưu đãi cam kết`; ưu đãi là % theo MỐC thời hạn, mốc cao nhất gói đạt tới, không cộng dồn, cấu hình bị chặn nếu % giảm khi thời hạn tăng (ADR 0011 điều 4) | **Chủ xe**, ở Chính sách thuê (`rental_policies.discount_tiers_json`, vd. 1 tháng 5% · 3 tháng 15% · 6 tháng 20%) |
| Gói | `LONG_TERM_PACKAGE_MONTHS = [1, 2, 3, 6, 9, 12]`, độ dài là tháng lịch (`addCalendarMonthsVn`) | Nền tảng (hằng số) |
| Phí sàn `S` (khách trả) | Cố định MỖI ĐƠN theo loại xe: 50.000đ ô tô · 30.000đ xe máy, cả hai tuyến | Nền tảng (`fee_policies`) |
| Hoa hồng `H` (chủ xe chịu) | Lũy tiến theo NGÀY thuê: 10% ngày 1–2 · 7% ngày 3–7 · 3% ngày 8–30 · **0% từ ngày 31**; tuyến gói `H = 0` | Nền tảng (`fee_policies.owner_commission_tiers`) |
| Thuế `T` (chủ xe chịu) | Tự lái/dài hạn 5% GTGT + 2% TNCN trên `B`, chỉ cá nhân/hộ; doanh nghiệp `T = 0` | Nền tảng (`fee_policies.tax_rates`) |
| Tiền giữ chỗ (online) | `S + H + IV + IP + max(15% × B, sàn)`, phần còn lại khách trả THẲNG chủ xe lúc nhận xe | Nền tảng; gian hàng có công tắc thu cọc |

Trả lời câu 1: **có**. Giá thuê đã giảm dần theo thời hạn bằng bảng mốc % do chủ xe đặt, và hoa hồng
nền tảng tự giảm về 0% từ ngày thứ 31.

**Chốt 02/11/2026: thuê dài hạn KHÔNG có bậc phí nền tảng riêng.** Đã cân nhắc một bảng % theo gói
(8% → 4% có sàn tiền mỗi tháng) và bỏ: người dùng giữ đúng công thức hiện hành — `S` cố định mỗi đơn +
`H` lũy tiến theo ngày (10% ngày đầu là đủ cho chủ xe cá nhân, sau ngày 30 về 0%). Gia hạn miễn phí
nền tảng (điều 4) — không có bảng phí nào cho nó.

## Quyết định (đề xuất)

### 1. Gia hạn là một PHỤ LỤC của đơn, không phải đơn mới, không sửa tiền của đơn gốc

Bảng mới `booking_extensions` (một đơn nhiều phụ lục, nối tiếp nhau): `months`, `from_at` (= giờ trả
hiện tại), `to_at`, snapshot giá + phí riêng (cùng khuôn `BookingPriceSnapshot`), `status`
(`awaiting_payment` · `active` · `expired` · `cancelled`), khoản thu riêng. Đơn gốc giữ nguyên snapshot
(ADR 0024). `bookings.return_at` chỉ dời khi phụ lục `active`. Writer duy nhất: `BookingExtensionsService`.

### 2. Chỉ gia hạn theo gói tháng (không +7/+15 ngày) — **chốt 02/11/2026**

Bộ gói gia hạn = `LONG_TERM_PACKAGE_MONTHS`. "+7 ngày", "+15 ngày" của design bị bỏ: thuê dài hạn
không có giá ngày, và suy giá ngày bằng `÷ 30` là đúng thứ ADR 0011 cấm.

### 3. Giá phần gia hạn — tính như một gói mới — **chốt 02/11/2026**

`B_ext` = gói N tháng bằng ĐÚNG `buildLongTermPackageQuote` của đơn mới: đơn giá tháng HIỆN HÀNH của xe
× N, % ưu đãi tra theo **chính N tháng** (mốc cao nhất N đạt tới, ADR 0011 điều 4). Phần đã trả của đơn
gốc và các phụ lục trước không tính lại.

### 4. Gia hạn MIỄN PHÍ NỀN TẢNG — **chốt 02/11/2026**

Người dùng: "gia hạn nên cho miễn phí, khuyến khích người dùng gia hạn". Phụ lục:

- **`S = 0`** — không phí sàn cố định (khách đã trả một lần cho chuyến).
- **`H = 0`** — không hoa hồng, ở CẢ HAI tuyến. (Bản trước của ADR này tính lại `H` từ ngày 1 — bỏ.)
- **`T` VẪN khấu trừ** trên `B_ext` theo hồ sơ người bán hiện hành (cá nhân/hộ 7%, doanh nghiệp 0):
  thuế là nghĩa vụ pháp luật của nền tảng (NĐ 117/2025, ADR 0068), không phải phí của XePrime nên không
  miễn được.
- Bảo hiểm `IV`/`IP`: **chưa bán cho phụ lục ở bản đầu** — production chưa có đối tác bảo hiểm
  (`INSURANCE_PARTNER = none`, ADR 0064 điều 10). Khi có hợp đồng thật, phụ lục tính theo ngày của nó.

Hệ quả cho chủ xe: phụ lục chỉ trừ thuế, toàn bộ `B_ext − T` là của chủ xe. Đây là ưu đãi CÓ CHỦ ĐÍCH
để giữ khách lâu; nó không đổi luật phí của đơn mới (dài hạn vẫn `S` + `H` theo ngày như mọi đơn —
không có bậc phí dài hạn riêng, chốt cùng ngày).

### 5. Thu tiền: cùng khuôn với đơn — không thu hộ toàn bộ

Design in QR cho **toàn bộ** phí gia hạn vào tài khoản XePrime. Điều đó biến XePrime thành người giữ hộ
toàn bộ tiền thuê — trái ADR 0064 (XePrime chỉ cầm phần không phải của chủ xe + 15% cọc). Đề xuất:

- Khoản online của phụ lục = `IV + IP + max(15% × B_ext, T)` (không `S`, không `H`) qua VietQR/SePay, mã
  đối soát tiền tố MỚI `XPE…` (đi qua `SepayService`, cùng `applyBankPaymentWithinTx`).
- Phần còn lại khách trả THẲNG chủ xe (ghi nhận như phiếu thu của đơn).
- Gian hàng tắt thu cọc: khoản online chỉ còn `IV + IP + T` (khuôn của đơn, ADR 0064 điều 5, không `S`).
- **Phụ lục chỉ có hiệu lực khi tiền về đủ** (tinh thần ADR 0044): cửa sổ thanh toán động như đơn
  (`holdWindowsFor`), hết hạn ⇒ phụ lục `expired`, nhả lịch, đơn giữ giờ trả cũ. Không có nút
  "khách đã chuyển khoản".
- Khoản online bằng 0 (không thu gì) ⇒ phụ lục `active` ngay khi chủ xe xác nhận.

### 6. Lịch xe

Lúc chủ xe tạo phụ lục: chiếm `[from_at, to_at)` qua `OccupancyService` trong cùng transaction
(ADR 0006) — trùng ⇒ 409, hộp thoại nói xe bận từ khi nào. Hết hạn thanh toán ⇒ nhả.

### 7. Ai làm, ở đâu

- Chủ xe/nhân viên có `bookings.update` tạo phụ lục trên đơn `active` dịch vụ `long_term`, ở cả hai
  tuyến (vận hành chuyến đang chạy không nằm sau cờ gói — ADR 0027 điều 3).
- Khách nhận thông báo + QR ở trang chuyến của mình; app/web khách hiện phụ lục.
- Quyết toán khi trả xe cộng dồn đơn + các phụ lục `active`.

### 8. Hai tuyến và đổi tuyến giữa chừng

| Tình huống | Đơn gốc | Phụ lục gia hạn |
| --- | --- | --- |
| Chủ xe cá nhân (hoa hồng) | Giữ snapshot | Miễn `S`/`H`, chỉ trừ `T`; luôn thu cọc 15% |
| Gian hàng (gói) | Giữ snapshot | Miễn `S`/`H` (vốn `H = 0`), chỉ trừ `T`; theo công tắc thu cọc của gian hàng |
| Cá nhân **lên** gian hàng khi đơn đang chạy | Không đổi (ADR 0024) | Chụp tuyến **tại thời điểm gia hạn** ⇒ tuyến gói (công tắc thu cọc của gian hàng); phí vẫn miễn |
| Gian hàng **hạ** về cá nhân (hết gói) | Không đổi | Chụp tuyến hoa hồng: luôn thu cọc 15%; phí vẫn miễn. Xe vượt trần Owner Lite **vẫn gia hạn được** — đây là chuyến đang chạy, không phải đăng xe mới |

Nguyên tắc: **cái đã ký không đổi, cái ký mới theo luật hiện hành** — cùng tinh thần đóng băng của
ADR 0024, chỉ là mỗi phụ lục là một lần "ký" mới.

## Câu hỏi đã chốt (02/11/2026)

1. Gia hạn theo ngày (+7/+15 ngày)? **Không** — chỉ gói tháng (điều 2).
2. Ưu đãi giá thuê của phụ lục tra theo đâu? **Theo chính N tháng gia hạn** (điều 3).
3. Phí nền tảng của phụ lục? **Miễn** — không `S`, không `H`; thuế vẫn khấu trừ (điều 4).
4. Phạm vi dịch vụ? **Chỉ thuê dài hạn.** Tự lái / có tài xế không gia hạn được.
5. Ai tạo phụ lục? **Chỉ chủ xe** (và nhân viên có `bookings.update`). Khách chưa tự xin gia hạn từ app.
6. Trả xe sớm khi đang trong phụ lục? **Hai bên tự thương lượng.** Hệ thống không tự hoàn phần chưa
   dùng; quyết toán theo luật trả xe hiện hành, khoản thoả thuận (nếu có) ghi bằng phiếu thu/chi của đơn.

## Hệ quả

- Schema: `booking_extensions` + CHECK (tháng thuộc bộ gói, `to_at > from_at`), EXCLUDE lịch vẫn ở
  `vehicle_occupancies`; tiền tố SePay `XPE`; thông báo mới cho khách; quyết toán đọc thêm phụ lục.
- Web partner: nút "Gia hạn" trên thẻ đơn dài hạn đang thuê + hộp thoại hai bước theo design (chọn gói
  → thanh toán) — chỉ dựng khi ADR này Accepted.
- Mobile: app khách cần màn thanh toán phụ lục (ADR 0031 — hai bản api).

## Hiện thực (02/11/2026)

- Migration `20261102120000_booking_extensions` (viết tay): bảng + CHECK tháng/khoảng/trạng thái/tuyến,
  `online + pay_at_pickup = rental`, `deposit = online ≥ tax`, vòng đời mốc; unique partial "một phụ lục
  chờ mỗi đơn"; `tax_withholdings.booking_extension_id` + unique "một nghĩa vụ sống mỗi phụ lục"; hai
  loại bút toán ví `extension_release` / `extension_refund` + nguồn `booking_extension`; đích đối soát
  `booking_extension`.
- API `modules/booking-extensions/` — writer DUY NHẤT `BookingExtensionsService`:
  `GET/POST /bookings/:id/extensions`, `GET …/quote?months=`, `POST …/:extensionId/cancel` (đối tác,
  `bookings.view`/`bookings.update`, KHÔNG mở cho phiên hỗ trợ); `GET /trips/:id/extensions` (khách,
  không có dòng phía chủ xe). Giá = `buildLongTermPackageQuote` + `customerFeesFor(…, { platformFeesWaived })`
  — cùng hàm của đơn, không công thức thứ hai.
- Lịch: phụ lục kéo dài CHÍNH dòng occupancy `booking` của đơn (qua `OccupancyService.reschedule`) thay vì
  thêm dòng mới — dòng thứ hai đặt sát đuôi đơn sẽ đụng buffer chuẩn bị của chính đơn ở EXCLUDE.
- Tiền: SePay mã `XPE…` → `applyBankPaymentWithinTx`; đủ ⇒ `active`, dời `bookings.return_at`, ghi nghĩa vụ
  thuế riêng, cùng transaction. Chuyển thừa ⇒ ghi có ví khách (`hold_overpay`, nguồn phụ lục). Tiền về sau
  hạn ⇒ không khớp, nằm hàng đợi đối soát. Đơn `completed` ⇒ ví chủ xe nhận `D − T` của từng phụ lục
  (`extension_release`), đúng một lần.
- Worker: `apps/worker/src/jobs/booking-extension-expiry.ts` (chung vòng giữ chỗ) — nhắc còn 60′/15′, quá hạn
  ⇒ `expired`, thu lịch về, hoàn phần đã chuyển vào ví khách.
- Phạm vi bổ sung khi code: chỉ đơn ĐẶT QUA CHỢ (có tài khoản khách — `details.reason = no_customer_account`).
  Đơn gian hàng tự lập ngoài chợ không có ai nhận QR hay tiền hoàn; kéo dài nó là sửa lịch đơn như cũ.
- Web: `features/bookings/components/ExtendBookingDialog.tsx` (thẻ "Đang thuê" + khối `BookingExtensionsPanel`
  ở trang chi tiết) · khách: `features/trips/components/TripExtensionPanel.tsx`. Mobile CHƯA làm.
- Spec: `apps/api/test/booking-extensions.spec.ts` (Postgres thật).
