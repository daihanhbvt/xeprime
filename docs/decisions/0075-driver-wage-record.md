# ADR 0075 — Tiền công tài xế: XePrime chỉ ghi nhận số thoả thuận, không giữ hộ; giới hạn số cho giá có tài; bỏ phụ phí tài xế

Ngày: 29/10/2026 · Trạng thái: **Accepted** · Nguồn: đặc tả BA `SPEC-BUS-07` v1.0.0 (29/10/2026,
"Driver Wage Record") · Bổ sung: [0063](0063-linked-driver-accounts.md) (tài xế liên kết),
[0074](0074-driver-drop-accepted-trip.md) (tài xế rút chuyến) · Giữ nguyên: 0064 · 0066 · 0068 (tiền
giữ chỗ, huỷ muộn, thuế), 0067 điều 2 (thiếu tài xế không tự huỷ đơn), 0028 (chính sách phí là dữ
liệu có phiên bản)

## Bối cảnh

Tài xế liên kết (ADR 0063) làm việc cho bên thuê và có thể liên kết nhiều bên thuê. Tiền công nằm
hoàn toàn ngoài hệ thống: tài xế bấm Nhận mà không biết chuyến được bao nhiêu, bên thuê không có số
liệu chi phí tài xế, hai bên không có chung một con số để đối chiếu.

Phương án để XePrime thu một phần tiền công trong tiền giữ chỗ, giữ hộ rồi chi vào ví tài xế đã được
phân tích và **bị loại**: nó đặt XePrime vào giữa một quan hệ tiền công không phải của mình (nghĩa vụ
trung gian thanh toán, câu hỏi ai khấu trừ thuế TNCN cho tài xế), thêm một cột tiền vào tiền giữ chỗ,
một sổ thu nhập nhiều trạng thái, luồng xác nhận hai phía và luật bồi thường — trong khi tiền công là
chuyện hai bên tự thương lượng.

Đồng thời phụ phí tài xế cấu hình theo xe (quá giờ, chờ, đường dài, qua đêm) làm khách không thấy một
giá cố định, và giá có tài xế chỉ kiểm "không âm, bội 1.000đ" nên một xe có thể đăng 50 triệu/ngày.

## Quyết định

### 1. XePrime không giữ, không chi, không tính tiền công

Tiền công không đi vào báo giá, tiền giữ chỗ, quyết toán, Ví điểm, thuế, hoa hồng hay báo cáo doanh
thu. Bên thuê trả trực tiếp cho tài xế. Không cột tiền nào của đơn phụ thuộc vào tiền công.

### 2. Một mức chung của bên thuê, chụp lên lượt gán

`tenants.driver_daily_wage` là MỘT số/ngày cho cả bên thuê — "mức chung", không theo xe, không theo
tài xế (tài xế thường đồng giá mọi loại xe); cấu hình MỘT chỗ ở trang Tài xế
(`GET/PATCH /drivers/wage-settings`, `drivers.view` / `drivers.manage`). Trang giá của xe chỉ có giá
KHÁCH trả, kèm một dòng trỏ sang mức chung — không có ô tiền công thứ hai. Lúc gán,
`booking_driver_assignments.wage_amount` = số bên thuê nhập, hoặc `driver_daily_wage × wage_days`;
`wage_days` = `price_snapshot_json.days` của đơn (đơn không có snapshot: cùng công thức
`PricingService.chargedDays`). Hộp gán đọc số ngày, khoảng/ngày và mức chung ở
`GET /bookings/:id/driver-wage-quote` — cùng phép tính lúc ghi. Đổi mức chung không viết lại lượt gán
đã có.

**Không có mức gán cứng (29/10/2026).** Gian hàng mới (và seed demo) KHÔNG có mức chung. Nền tảng chỉ
có một **mức gợi ý** `with_driver_limits.wageDailySuggested` (mặc định 500.000đ, admin chỉnh trong
chính sách phí, nằm trong khoảng tiền công) — hiện làm lời nhắc (placeholder, câu gợi ý, nút "Dùng mức
gợi ý" trong hộp đặt mức chung) và KHÔNG bao giờ tự ghi vào gian hàng hay lượt gán.

**Hộp gán và hộp sửa nhập MỨC/NGÀY** (tự điền mức chung nếu có), thấy tổng `× số ngày`. Chỉ hộp
**gán** có lựa chọn phạm vi khi số khác mức chung: **chỉ chuyến này** (mức chung giữ nguyên — mặc
định) hoặc **chuyến này và các chuyến gán sau** (đổi mức chung qua `PATCH /drivers/wage-settings`,
cần `drivers.manage`; lượt gán đã có vẫn giữ số). **Hộp sửa** trên một đơn đã gán luôn chỉ áp cho
chính chuyến đó — đổi mức chung đi qua hộp gán hoặc trang Tài xế. Chuyến `not_run` vẫn nhập một số
thoả thuận, không theo ngày, không đụng mức chung.

Chưa có mức mặc định (hoặc mức cũ nằm ngoài giới hạn mới): gán tay bị chặn `DRIVER_WAGE_REQUIRED` /
`DRIVER_WAGE_OUT_OF_RANGE`; tự gán của "Đặt ngay" **bỏ qua lượt gán** (`assignWithinTx` trả
`{ skipped: true }`) — đơn vẫn ra đời, bên thuê nhận ngay tin `booking_driver_missing` để gán tay;
nhắc khẩn sát giờ của ADR 0067 vẫn chạy như mọi đơn.

### 3. Bên thuê sửa từng chuyến, không cần tài xế đồng ý, có lịch sử

`PATCH /bookings/:id/driver-assignments/:assignmentId/wage` (`bookings.update`) sửa `wage_amount` tới
`ended_at + 72 giờ` (`DRIVER_WAGE_EDIT_WINDOW_HOURS`); sau đó `DRIVER_WAGE_LOCKED`. Mỗi lần đổi sang
một số KHÁC: khoá dòng lượt gán (`FOR UPDATE`), ghi một dòng `booking_driver_wage_changes` (chỉ thêm,
CHECK cũ ≠ mới) + audit `booking.driver_wage_update`, báo tài xế `driver_trip_wage_changed` (số cũ →
số mới) — cùng transaction. Số giống số hiện hành là no-op. Mỗi lần sửa chụp lại `wage_days` theo đơn
HIỆN TẠI (khoảng hợp lệ cũng theo số ngày đó) — bên thuê sửa theo mức/ngày × số ngày đang thấy; cùng
tổng mà đơn đã đổi số ngày thì chỉ đồng bộ `wage_days`, không lịch sử/thông báo. Writer duy nhất:
`DriversService`.

### 4. Giai đoạn lượt gán quyết định khoảng và cách hiển thị

`driverWageStage` (`@xeprime/types`): `offer` (chờ nhận) · `running` (đã nhận) · `completed` · `not_run`
(đã nhận rồi khép mà không hoàn thành: huỷ, không đến, rút, trả lại, bị thay) · `not_applicable` (chưa
từng nhận). Khoảng hợp lệ (`driverWageRange`): chuyến chạy/đã xong `[min × N; max × N]`, `not_run`
`[0; max × N]`, `not_applicable` không có tiền công (`DRIVER_WAGE_NOT_APPLICABLE`).

Lượt khép mà KHÔNG hoàn thành ⇒ `wage_amount` về 0 ngay trong đường khép chung
(`closeOpenDriverAssignment` / `wageOnClose`, `@xeprime/prisma` — API, worker quét hạn, rút chuyến và
kết thúc liên kết cùng một luật); bên thuê ghi được số đã thoả thuận. Hoàn thành ⇒ "Đã nhận" — mặc
định coi là đã trả, không có xác nhận hai phía; khiếu nại do hai bên tự xử lý. Hệ thống không tính
bồi thường. Luật rút chuyến của ADR 0074 không đổi.

### 5. Giới hạn số là dữ liệu chính sách, không phải dòng tiền

`fee_policies.with_driver_limits = { priceDaily: {min,max}, wageDaily: {min,max}, wageDailySuggested }`
(CHECK "là object"); NULL = `WITH_DRIVER_LIMITS_DEFAULTS` (giá có tài/ngày [500.000; 5.000.000], tiền
công/ngày [200.000; 2.000.000], gợi ý 500.000). Bản thiếu `wageDailySuggested` đọc ra mức gợi ý mặc
định kẹp vào khoảng tiền công của chính bản đó. Đọc qua `FeePoliciesService.withDriverLimits()` — **không** nằm trong
`FeePolicySnapshot`, nên không phép tính tiền nào đổi. Bản nháp mới khai sẵn mặc định; cổng kích hoạt
thêm blocker `with_driver_limits_invalid`. Áp ở server cho ba giá có tài của xe
(`PricingService.assertWithDriverPrices` — tạo/sửa xe, lưu giá; `WITH_DRIVER_PRICE_OUT_OF_RANGE`), mức
mặc định và tiền công lượt gán. Giá cũ ngoài khoảng không bị sửa hay gỡ khỏi chợ; lần lưu kế tiếp mới
bị chặn.

### 6. Ai thấy tiền công

Khách: không bao giờ (API phía khách không có trường này). Tài xế: chỉ lượt gán của mình, trong thẻ
chuyến lái (`DriverTripDto.wage` — thấy TRƯỚC khi bấm Nhận) và trang chi tiết chuyến (kèm lịch sử
sửa) — không có màn hình thu nhập, không gom theo bên thuê. Bên thuê: lịch sử tài xế của đơn
(`bookings.view`); trang Tài xế có hai cột tháng (`monthCompletedTrips`, `monthWageTotal` — chuyến
hoàn thành + số thoả thuận của chuyến không chạy, theo tháng của `ended_at` giờ VN) và **ngăn chi
tiết tài xế** (29/10/2026, `?open=<id>&tab=` trên URL) với ba tab:

- **Tổng quan** — `GET /drivers/:id/overview?month=`: tiền công tháng (hoàn thành / thoả thuận /
  tổng / bình quân một ngày lái / số chuyến đã sửa), việc đang treo (chuyến đã nhận chưa xong +
  tiền công dự kiến, lượt chờ trả lời), **độ tin cậy 90 ngày** (tỉ lệ nhận = nhận ÷ (nhận + từ
  chối + quá hạn); lượt bên thuê gỡ trước khi tài xế kịp trả lời không tính; không có lượt nào ⇒
  `null`, không phải 0%; trung vị thời gian trả lời) và xu hướng 6 tháng.
- **Chuyến & tiền công** — `GET /drivers/:id/assignments` phân trang (kèm xe + biển số) và **bảng kê
  CSV** dựng ở trình duyệt theo ngôn ngữ người tải (BOM UTF-8, tiền là số thô, dòng tổng) — để
  bên thuê đối chiếu khi trả tài xế.
- **Hồ sơ** — liên kết, trạng thái bằng lái, các mốc.

Ngăn chi tiết KHÔNG so tiền thuê với tiền công ("lãi theo tài xế"): đó là báo cáo thu chi tổng hợp
mà ADR 0027 điều 1 chỉ cho gói, trong khi tài xế mở cho cả tuyến hoa hồng. Cũng không có trạng thái
"đã trả tài xế" — thêm nó là một quyết định riêng. Dòng hiển thị dùng chung web/mobile:
`driverWageLine` (`@xeprime/domain`).

### 7. Bỏ phụ phí tài xế

Không còn cấu hình, công bố hay ghi phụ phí riêng của tài xế. `vehicle_driver_surcharge_rules` không
còn được đọc/ghi; `GET /vehicles/:id/driver-surcharge-rules` trả bốn loại đều tắt và `PUT` trả 422
`DRIVER_SURCHARGE_RETIRED` — giữ hình dạng để app đã phát hành không vỡ (xoá bảng ở migration dọn dẹp
sau). Snapshot điều kiện thuê mới có `surchargeRules: []`. Quyết toán không ghi MỚI `waiting` /
`long_distance` / `overnight` (`SURCHARGE_CATEGORY_RETIRED`); đơn có tài xế không ghi `overtime` /
`excess_mileage` (`SURCHARGE_NOT_ALLOWED_WITH_DRIVER`) — luật `surchargeCategoryBlock`. Khoản cũ vẫn
đọc và tính như trước; vệ sinh, hư hại, "khác" vẫn ghi được. Trang xe công khai nói rõ: giá có tài xế
đã gồm tài xế, xăng, chi phí qua đêm của tài xế, phục vụ tại điểm đến; chưa gồm phí cầu đường (khách
trả trực tiếp). Chi phí khác là việc giữa bên thuê và tài xế.

**Lưu trú qua đêm của tài xế (29/10/2026): nền tảng không cấu hình.** Phía khách, đi xa ăn giá liên
tỉnh của xe và giá đó đã gồm chi phí qua đêm — khách không trả thêm dòng nào. Phía bên thuê ↔ tài xế,
tiền phòng/ăn ở là thoả thuận của hai bên: bên thuê hỗ trợ thêm thì sửa tiền công của CHÍNH chuyến đó
(mức/ngày cao hơn, "chỉ chuyến này", kèm lý do) — có lịch sử, tài xế được báo. Không dựng ô "phụ cấp
lưu trú" hay quy tắc theo đêm: đó là quay lại phụ phí tài xế dưới một tên khác.

## Hệ quả

- Không thêm cột tiền nào vào `booking_holds`, không thêm đích phân bổ, không đụng Ví điểm.
- Tài xế có số tiền trước khi nhận chuyến; tranh chấp tiền công có lịch sử sửa làm căn cứ, nhưng
  XePrime không phân xử.
- Phụ phí tài xế biến mất khỏi sản phẩm; khoản cũ trên đơn cũ vẫn tính đúng.
- App native cần đồng bộ: hiện `wage` ở chuyến lái, gỡ màn phụ phí tài xế, thêm loại thông báo
  `driver_trip_wage_changed` vào các bảng ánh xạ theo loại.

## Cấm

- ❌ Đưa tiền công vào tiền giữ chỗ, quyết toán, Ví điểm, thuế, hoa hồng, báo giá hay snapshot phí.
- ❌ Trả `wage` ra API phía khách, hay trả giá thuê/tiền giữ chỗ cho tài xế.
- ❌ Viết lại `wage_amount` của lượt gán đã có khi đổi mức mặc định hay đổi giới hạn.
- ❌ Ghi `wage_amount` ngoài `DriversService` / `closeOpenDriverAssignment`, hay đổi nó (bởi người)
  mà không thêm dòng `booking_driver_wage_changes`.
- ❌ Kiểm giới hạn chỉ ở giao diện.
- ❌ Dựng lại phụ phí tài xế, hay cấu hình tiền công theo xe / theo tài xế.

## Cần xem lại

- Hạn sửa 72 giờ và các giới hạn số sau 3 tháng vận hành.
- Nếu muốn bảo vệ tài xế khi bên thuê GIẢM tiền công sát giờ: miễn vi phạm ADR 0074 cho lượt rút
  trong 24 giờ sau một lần giảm.
