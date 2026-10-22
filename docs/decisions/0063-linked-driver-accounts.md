# ADR 0063 — Tài xế là TÀI KHOẢN KHÁCH được bên thuê mời liên kết; gán chuyến chờ tài xế nhận; chống trùng lịch theo NGƯỜI

Ngày: 16/10/2026 · Trạng thái: Accepted (câu "Lượt chờ KHÔNG hết hạn" bị [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 4 thay; điều 2 "Bỏ hồ sơ không tài khoản" nới bởi [0067](0067-external-driver-on-booking-no-auto-cancel.md) — đơn được ghi tên + SĐT tài xế ngoài hệ thống) · Ghi đè: ADR 0032 điều 6 (gạch "Tài xế không có tài khoản/app…"
và cụm "tài xế dạng bản ghi" ở gạch Manage), ADR 0027 điều 1 + `PLAN_FEATURE.DRIVERS` trong phạm vi
module tài xế (không còn sau cờ gói, mở cho cả hai tuyến), ADR 0038 điều 4 trong phạm vi module tài xế
(không còn `@SubscriptionTrackOnly`), ADR 0052 dòng "tài xế không có chi nhánh" giữ nguyên ·
Mở rộng: ADR 0053 (realm `customer` nay có thêm vai tài xế), ADR 0057 (bằng lái của tài khoản khách
được bên thuê ĐỌC ở mức trạng thái) · Giữ nguyên: ADR 0006 (chống trùng bằng EXCLUDE), ADR 0044 điều 8
(chuyến có tài xế + có giữ chỗ không tự nhận), ADR 0045 (trách nhiệm huỷ), ADR 0056 (liên hệ khách
phía chủ xe)

## Bối cảnh

Trước bản này `drivers` là HỒ SƠ do gian hàng tự nhập (tên, SĐT, số/hạn GPLX, CCCD) và chỉ dùng để gán
vào đơn. Tài xế thật không biết mình được gán chuyến nào trừ khi gian hàng gọi điện; chủ xe tuyến hoa
hồng không có module tài xế; trùng lịch chỉ chặn theo HỒ SƠ (một người làm cho hai nơi là hai hồ sơ,
không ai thấy lịch của nhau).

## Quyết định

1. **Tài xế là một tài khoản KHÁCH** (realm `customer`, ADR 0053). Không có tài khoản/realm/app riêng
   cho tài xế, không đăng nhập ở site partner. Vai tài xế hiện trong app/web khách: mục tài khoản
   "Nơi tôi làm tài xế" và tab "Chuyến tôi lái" ở Chuyến của tôi.
2. **`drivers` là LIÊN KẾT** bên thuê ↔ tài khoản: `user_id` + `user_realm = 'customer'` (FK tổ hợp tới
   `users(id, realm)`, CHECK realm), `link_status` `invited → active ⇄ suspended`, `declined`, `ended`.
   Dòng kết thúc là lịch sử; mời lại sinh dòng mới. Unique partial: một liên kết MỞ cho mỗi
   (bên thuê, tài khoản). Bỏ hồ sơ không tài khoản — dữ liệu cũ bị xoá ở migration
   `20261016120000_driver_accounts` (chưa có production).
3. **Mời bằng SĐT.** SĐT phải thuộc một tài khoản khách đang hoạt động, ĐÃ XÁC MINH số; không có thì
   chặn (`DRIVER_ACCOUNT_NOT_FOUND`), không sinh lời mời treo. Tài xế nhận thông báo và chấp nhận /
   từ chối. Cùng người có thể liên kết với nhiều bên thuê, và có thể đồng thời là chủ xe / gian hàng
   bằng tài khoản partner riêng của họ (ADR 0053 — hai tài khoản, không gộp).
4. **Bên thuê là cả hai tuyến.** Module tài xế mở cho chủ xe tuyến hoa hồng; không còn
   `@SubscriptionTrackOnly` / `@RequiresFeature(DRIVERS)` trên `/drivers`. Quyền vẫn là
   `drivers.view` / `drivers.manage`.
5. **Chỉ đơn `with_driver` mang tài xế** (CHECK `bookings_driver_service_check`). Đơn rời dịch vụ có
   tài xế thì tài xế bị gỡ và được báo.
6. **Lượt gán chờ tài xế nhận.** `bookings.driver_assignment_status` `pending → accepted`; từ chối thì
   bốn cột tài xế về NULL (đơn chưa có tài xế) và bên thuê được báo. Lượt chờ KHÔNG hết hạn; bên thuê
   đổi người / bỏ gán bất cứ lúc nào. Tài xế chỉ nhận/từ chối LƯỢT GÁN của mình — không đổi trạng
   thái đơn, không bàn giao, không huỷ.
7. **Chống trùng lịch theo NGƯỜI, xuyên mọi bên thuê**: `bookings.driver_user_id` (chép từ liên kết,
   FK tổ hợp `(driver_id, driver_user_id) → drivers(id, user_id)`) + EXCLUDE
   `bookings_driver_user_schedule_excl` trên đơn `reserved`/`active`. Lượt `pending` giữ chỗ. Bộ chọn
   gán hiện người bận ở trạng thái disabled kèm nhãn "Bận" — không nói bận việc gì, cho ai.
8. **"Đặt ngay" với chuyến có tài xế** (sửa 19/10/2026) tự nhận khi bên thuê có ít nhất một tài xế
   liên kết rảnh, và **tự gán** người đó ngay trong transaction tạo đơn ở trạng thái `pending` — tài xế
   vẫn phải tự Nhận/Từ chối; từ chối thì đơn về chưa có tài xế và bên thuê được báo. Người được chọn:
   rảnh khung giờ, không phải chính khách của chuyến, **ít chuyến nhất trong ±7 ngày** quanh giờ nhận
   (`DriversService.pickForAutoAssign`). Chuyến có tài xế + có tiền giữ chỗ vẫn KHÔNG tự nhận (ADR 0044
   điều 8).
9. **Không tự lái đơn mình thuê**: tài khoản tài xế trùng `customer_user_id` của yêu cầu sinh ra đơn ⇒
   `DRIVER_IS_TRIP_CUSTOMER`. Tài xế vẫn đặt xe của bên mình lái cho như khách thường.
10. **Dữ liệu tài xế thấy** (DTO hẹp `/driver/trips`): mã đơn, giờ, tuyến, điểm đón/đến, xe, bên thuê
    (danh tính công khai ADR 0054), tên + SĐT khách — hiện NGAY từ lúc được gán (sửa 19/10/2026: bỏ
    cửa sổ 24h; tài xế cần gọi xác nhận trước khi nhận chuyến). Không tiền, không giấy tờ khách,
    không ghi chú nội bộ.
11. **Bên thuê thấy bằng lái của tài xế ở mức trạng thái**: đã xác thực (+ hạng, hạn, HỌ TÊN trên bằng,
    loại bằng) / đang chờ / chưa có — đọc `customer_driver_licences` (writer vẫn là
    `DriverLicencesService`). Họ tên lệch tên bên thuê nhập khi mời thì giao diện CẢNH BÁO (so bỏ
    dấu, `holderNameDiffers`), không chặn. Không ảnh, không số bằng; nền tảng không thêm điều kiện
    bằng lái riêng cho tài xế.
12. **Kết thúc liên kết** (bên thuê gỡ hoặc tài xế rời): chặn khi còn chuyến `active`
    (`DRIVER_HAS_ACTIVE_TRIP`); phía kia được báo. Tài xế tự rời bị chặn thêm khi còn chuyến
    `reserved` ĐÃ NHẬN (`DRIVER_HAS_ACCEPTED_TRIPS` — phải nhờ bên thuê đổi người); chuyến còn chờ
    nhận thì tự gỡ. Bên thuê kết thúc được nhưng giao diện xác nhận kèm số chuyến bị gỡ. Liên kết đã
    từ chối/kết thúc được MỜI LẠI bằng một liên kết mới; `ended_by_party` cho biết ai kết thúc.
13. **Một writer**: `DriversService` là nơi duy nhất ghi `drivers` và bốn cột tài xế trên `bookings`.
    Thông báo đi đường `notifications` + push sẵn có (không kênh Firebase mới); tin cho tài xế dùng
    bề mặt khách, tin cho bên thuê dùng khu quản lý.

## Hệ quả

- Xoá tài khoản khách hiện là yêu cầu hỗ trợ xử lý tay: người xử lý phải kết thúc các liên kết tài xế
  trước (FK `drivers_user_realm_fkey` là RESTRICT).
- `PLAN_FEATURE.DRIVERS` còn trong danh sách cờ gói nhưng không còn gác module tài xế; gỡ hẳn khỏi
  cấu hình gói là việc dọn riêng.
- Cần xem lại khi: tài xế cần thao tác vận hành (bàn giao, báo khách không đến), cần lượt giao/nhận xe
  cho đơn tự lái, hoặc cần chợ tài xế dùng chung giữa các bên thuê.
