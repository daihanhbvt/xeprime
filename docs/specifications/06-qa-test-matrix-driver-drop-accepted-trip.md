# BỘ KỊCH BẢN KIỂM THỬ TOÀN DIỆN: TÀI XẾ HỦY CHUYẾN ĐÃ NHẬN & ĐIỀU PHỐI 3 BÊN
## FULL QA TEST MATRIX, TEST CASES & EDGE CASES SPECIFICATION

| Thông tin tài liệu | Chi tiết |
| :--- | :--- |
| **Mã tài liệu** | `SPEC-QA-06-DRIVER-DROP` |
| **Dự án** | XePrime Rental Platform |
| **Phiên bản** | `v1.0.0` — Ban hành chính thức ngày 26/10/2026 |
| **Vai trò soạn thảo** | Senior Quality Control (QC) & QA Lead |
| **Tài liệu căn cứ** | `SPEC-BUS-06` (Tài xế huỷ chuyến đã nhận), ADR 0045, ADR 0063, ADR 0066, ADR 0067, `SPEC-BUS-02`, `SPEC-BUS-03` |
| **Phân hệ kiểm thử** | `drivers`, `bookings`, `booking-driver-assignments`, `customer-trips`, `holds`, `notifications`, `audit` |

---

## 1. MA TRẬN 7 TEST SUITES KIỂM THỬ

| Mã Suite | Tên Phân Hệ / Nhóm Nghiệp Vụ | Phạm Vi Kiểm Thử | Số TC | Mức Độ | Kết Quả Mong Đợi |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `TS-DRVDROP-01` | Nghiệp vụ rút cuốc phía Tài xế | Kiểm tra điều kiện rút cuốc, validate modal lý do, giải trình text khi chọn OTHER, chặn rút khi đơn đã giao xe (`active`) | 4 | Critical | Đúng mã lỗi, đúng điều kiện chặn |
| `TS-DRVDROP-02` | Transaction Lõi & Phạt Cooldown | Xử lý atomic 1 transaction: đổi outcome `DROPPED`, clear 4 cột tài xế, nhả lịch EXCLUDE, tính hạn Cooldown 24h/48h | 3 | Critical | DB nhất quán, không sót khóa |
| `TS-DRVDROP-03` | Thông báo khẩn & SLA Bên thuê | Bắn Push + chuông đỏ cho gian hàng, hiển thị badge thiếu tài xế, kích hoạt đồng hồ SLA điều phối (15' - 120') | 3 | High | Nhận tin tức thì, đúng nội dung copy |
| `TS-DRVDROP-04` | Các kịch bản Điều phối thay thế | (a) Gán tài xế liên kết B; (b) Nhập tài xế ngoài hệ thống ADR 0067; (c) Không có người $\rightarrow$ Bấm huỷ đơn ADR 0045 | 4 | Critical | Đúng ma trận phân quyền & dữ liệu |
| `TS-DRVDROP-05` | Trải nghiệm & Quyền của Khách | UI trung tính khi xa giờ đón; hiển thị nút huỷ hoàn 100% khi sát giờ (<2h); nút "Chưa nhận được xe" mở dispute | 3 | Critical | Bảo toàn quyền lợi khách, hoàn 100% |
| `TS-DRVDROP-06` | Luồng tiền & Quyết toán ví | Bảo toàn tiền cọc 15%, hoàn ví điểm ngay lập tức, thuế GTGT/TNCN = 0đ khi chuyến huỷ | 2 | Critical | Tiền đúng tới đồng, không âm ví |
| `TS-DRVDROP-07` | Đua lệnh, Concurrency & Biên | Đua lệnh tài xế bấm rút đúng lúc chủ xe đổi người, cúp mạng, rút cuốc nhiều lần (idempotency) | 3 | High | Không sinh bản ghi ma, không crash |

**Tổng số Test Case:** **22 Test Cases** (100% bao phủ toàn bộ ma trận nghiệp vụ 3 bên).

---

## 2. CHI TIẾT 22 TEST CASES TIÊU CHUẨN SENIOR QC

### SUITE 1: NGHIỆP VỤ RÚT CUỐC PHÍA TÀI XẾ (`TS-DRVDROP-01`)

#### TC-DRVDROP-01: Tài xế hợp lệ rút khỏi chuyến xe đã nhận khi còn xa giờ đón ($\Delta T \ge 12\text{h}$)
* **Mức độ ưu tiên:** Critical | **Loại kiểm thử:** Functional Positive
* **Tiền điều kiện:**
  - Đơn thuê xe có tài xế `DH-HN-001` đang ở trạng thái `reserved`.
  - Giờ nhận xe `pickupAt` là 08:00 ngày mai ($\Delta T = 16\text{ giờ} \ge 12\text{h}$).
  - Tài xế `Nguyễn Văn A` (`userId: usr_drv_101`) đã bấm nhận cuốc (`driverAssignmentStatus = ACCEPTED`).
* **Các bước thực hiện:**
  1. Đăng nhập App với tài khoản tài xế `usr_drv_101`.
  2. Vào tab *"Chuyến tôi lái"*, mở chi tiết đơn `DH-HN-001`.
  3. Bấm nút **"Báo sự cố / Rút khỏi chuyến"**.
  4. Modal hiện ra: Chọn nhóm lý do `HEALTH_ISSUE` ("Vấn đề sức khỏe đột xuất").
  5. Bấm **"Xác nhận rút khỏi chuyến"**.
* **Dữ liệu kiểm thử:** `bookingId: "bk_101"`, `reasonCategory: "HEALTH_ISSUE"`.
* **Kết quả mong đợi:**
  - API `POST /driver/trips/bk_101/drop` trả về `200 OK` (hoặc `{ ok: true }`).
  - Đơn `DH-HN-001` biến khỏi tab "Chuyến sắp tới" của tài xế A.
  - Bảng `booking_driver_assignments`: bản ghi gán của A cập nhật `outcome = 'DROPPED'`, `endedAt = now()`.
  - Bảng `bookings`: 4 cột tài xế về `NULL` (`driverId = null`, `driverUserId = null`, `driverAssignmentStatus = null`). Trạng thái đơn vẫn là `reserved`.
  - Ràng buộc chống trùng lịch DB (`EXCLUDE`) nhả hoàn toàn tài xế A.
  - Do $\Delta T \ge 12\text{h}$, tài xế A **không bị phạt Cooldown** (`autoAssignCooldownUntil = null`).
* **Hậu điều kiện:** Tài xế A có thể được gán vào chuyến xe khác nếu sau này có nhu cầu.

---

#### TC-DRVDROP-02: Validate bắt buộc nhập lý do chi tiết khi chọn lý do "Khác" (`OTHER`)
* **Mức độ ưu tiên:** High | **Loại kiểm thử:** Validation Negative
* **Tiền điều kiện:** Tài xế A đang mở Modal báo sự cố đơn `DH-HN-002`.
* **Các bước thực hiện:**
  1. Chọn nhóm lý do `OTHER`.
  2. Trường hợp (a): Để trống ô nhập giải trình $\rightarrow$ Bấm Xác nhận.
  3. Trường hợp (b): Nhập chuỗi ngắn dưới 10 ký tự: `"bận việc"` (8 ký tự) $\rightarrow$ Bấm Xác nhận.
  4. Trường hợp (c): Nhập giải trình hợp lệ: `"Bị kẹt xe tại quốc lộ 1A do sạt lở đèo"` (41 ký tự) $\rightarrow$ Bấm Xác nhận.
* **Kết quả mong đợi:**
  - Với (a) và (b): Nút Xác nhận bị vô hiệu hóa hoặc API trả lỗi `400 BAD_REQUEST`, hiển thị thông báo lỗi giao diện: *"Vui lòng nhập lý do giải trình chi tiết từ 10 đến 500 ký tự"*.
  - Với (c): Thao tác thành công, API trả về `200 OK`.

---

#### TC-DRVDROP-03: Chặn tài xế huỷ cuốc khi chuyến đi ĐÃ BẮN ĐẦU / ĐÃ GIAO XE (`ACTIVE`)
* **Mức độ ưu tiên:** Critical | **Loại kiểm thử:** Business Rule Negative
* **Tiền điều kiện:**
  - Chuyến xe `DH-HN-003` đã được chủ xe bấm xác nhận giao xe, đơn chuyển sang trạng thái `status = 'active'`.
  - Tài xế A đang lái xe chở khách.
* **Các bước thực hiện:**
  1. Tài xế A gọi API: `POST /driver/trips/bk_103/drop`.
* **Kết quả mong đợi:**
  - Hệ thống từ chối với HTTP Status `409 CONFLICT`.
  - Mã lỗi trả về: `API_ERROR_CODE.DRIVER_ASSIGNMENT_LOCKED`.
  - Thông điệp: *"Chuyến xe đang diễn ra hoặc đã kết thúc — không thể rút khỏi chuyến"*.
  - Trạng thái đơn, thông tin tài xế và hợp đồng bảo hiểm giữ nguyên tuyệt đối.

---

#### TC-DRVDROP-04: Chặn người dùng không phải tài xế của chuyến gọi lệnh rút cuốc
* **Mức độ ưu tiên:** Critical | **Loại kiểm thử:** Security & Authorization
* **Tiền điều kiện:** Chuyến xe `DH-HN-004` đang được gán cho tài xế B (`usr_drv_202`). Tài xế C (`usr_drv_303`) đăng nhập hệ thống.
* **Các bước thực hiện:**
  1. Tài xế C gửi request API `POST /driver/trips/bk_104/drop` với Token của tài xế C.
* **Kết quả mong đợi:**
  - Hệ thống trả về `404 NOT_FOUND` (đúng chuẩn bảo mật XePrime: không tiết lộ sự tồn tại của đơn hàng nếu không thuộc quyền sở hữu).
  - Không có bất kỳ thay đổi nào xảy ra trên DB.

---

### SUITE 2: TRANSACTION LÕI & CHẾ TÀI PHẠT COOLDOWN (`TS-DRVDROP-02`)

#### TC-DRVDROP-05: Tài xế huỷ chuyến trong ngày ($2\text{h} \le \Delta T < 12\text{h}$) $\rightarrow$ Bị phạt Cooldown 24h
* **Tiền điều kiện:** Đơn `DH-SG-005` có giờ đón lúc 17:00. Lúc 11:00 sáng cùng ngày, tài xế A bấm rút cuốc ($\Delta T = 6\text{ giờ}$).
* **Test Steps & Expected Result:**
  - Thực thi rút cuốc thành công.
  - Kiểm tra bảng `drivers` của tài xế A: `autoAssignCooldownUntil` được ghi nhận bằng `now() + 24 giờ` (đến 11:00 trưa ngày hôm sau).
  - Khi có đơn hàng "Đặt ngay" mới phát sinh trong 24 giờ tới: Hàm chia đơn tự động `pickForAutoAssign` loại bỏ tài xế A khỏi danh sách ứng viên tự gán.

---

#### TC-DRVDROP-06: Tài xế huỷ chuyến SÁT GIỜ ĐÓN ($\Delta T < 2\text{h}$) $\rightarrow$ Bị phạt Cooldown 48h + Gắn cờ cảnh báo
* **Tiền điều kiện:** Đơn `DH-SG-006` có giờ đón lúc 14:00. Lúc 13:10 (trước giờ đón 50 phút), tài xế A bấm rút cuốc ($\Delta T = 50\text{ phút} < 2\text{h}$).
* **Test Steps & Expected Result:**
  - Giao diện tài xế hiển thị cảnh báo đỏ: *"CẢNH BÁO: Rút cuốc sát giờ (< 2 giờ) vi phạm nghiêm trọng quy chế vận hành. Bạn sẽ bị tạm dừng nhận cuốc tự động trong 48 giờ."*
  - Bấm xác nhận $\rightarrow$ `autoAssignCooldownUntil` ghi nhận bằng `now() + 48 giờ`.
  - Tỉ lệ huỷ cuốc sau khi nhận của tài xế tăng lên.
  - Audit log ghi nhận hành động với cờ `lateDrop: true`.

---

#### TC-DRVDROP-07: Tính toàn vẹn của Transaction khi xảy ra lỗi đột ngột
* **Tiền điều kiện:** Mô phỏng lỗi ngắt kết nối DB đúng tại bước ghi Audit log sau khi đã update Booking.
* **Test Steps & Expected Result:**
  - Toàn bộ transaction bị Rollback `100%`.
  - Dữ liệu lượt gán tài xế A và trạng thái đơn thuê trở lại nguyên trạng thái `ACCEPTED`.
  - Không xảy ra tình trạng "đã nhả tài xế nhưng audit chưa ghi" hoặc ngược lại.

---

### SUITE 3: THÔNG BÁO KHẨN & ĐỒNG HỒ SLA CỦA BÊN THUÊ (`TS-DRVDROP-03`)

#### TC-DRVDROP-08: Bắn thông báo khẩn cấp cho toàn bộ thành viên Gian hàng (Tenant Members)
* **Tiền điều kiện:** Gian hàng `Shop An Gia` có 3 thành viên: 1 Owner, 1 Manager, 1 Staff.
* **Test Steps:** Tài xế A bấm rút khỏi đơn `DH-DN-008`.
* **Expected Result:**
  - Hệ thống gọi `NotificationService.emitToTenantMembers` với type `NOTIFICATION_TYPE.DRIVER_TRIP_DROPPED_URGENT`.
  - Cả 3 thành viên nhận được Push Notification trên điện thoại:
    * Tiêu đề: `🚨 KHẨN CẤP: Tài xế Nguyễn Văn A huỷ chuyến DH-DN-008`
    * Nội dung: `Chuyến xe đón lúc 09:00 ngày mai bị rút cuốc. Lý do: Sức khỏe. Vui lòng bổ sung tài xế!`
  - Trên web Portal: Chuông thông báo hiển thị chấm đỏ, mở popup cảnh báo khẩn cấp.

---

#### TC-DRVDROP-09: Kích hoạt đồng hồ đếm ngược SLA điều phối lại theo từng vùng thời gian
* **Test Steps & Expected Result:**
  - Ca 1: $\Delta T = 15\text{h} \ge 12\text{h} \rightarrow$ Đồng hồ SLA gian hàng hiển thị đếm ngược: `120 phút còn lại để điều phối`.
  - Ca 2: $\Delta T = 5\text{h} \rightarrow$ Đồng hồ SLA hiển thị: `45 phút còn lại để điều phối`.
  - Ca 3: $\Delta T = 80\text{ phút} < 2\text{h} \rightarrow$ Đồng hồ nhấp nháy đỏ: `BÁO ĐỘNG ĐỎ: 15 phút còn lại để điều phối tài xế!`.

---

### SUITE 4: CÁC KỊCH BẢN ĐIỀU PHỐI THAY THẾ CỦA BÊN THUÊ (`TS-DRVDROP-04`)

#### TC-DRVDROP-10: Gian hàng gán tài xế liên kết thay thế (Tài xế B)
* **Pre-conditions:** Đơn `DH-HP-010` vừa bị tài xế A huỷ. Trong danh sách tài xế của Shop có `Trần Văn B` đang rảnh lịch.
* **Test Steps:**
  1. Chủ shop mở đơn `DH-HP-010`, bấm "Gán tài xế".
  2. Chọn `Trần Văn B` $\rightarrow$ Bấm Xác nhận.
* **Expected Result:**
  - API `PATCH /bookings/:id/driver` thành công.
  - Tài xế B nhận được thông báo cuốc mới kèm đồng hồ SLA $T_{\text{driver}}$.
  - Mở ra một dòng mới trong `booking_driver_assignments` với `outcome = OPEN`.
  - Khi tài xế B bấm "Nhận chuyến": Đơn mang tài xế B (`ACCEPTED`). Khách thuê thấy thông tin tài xế B.

---

#### TC-DRVDROP-11: Gian hàng nhập tài xế ngoài hệ thống (ADR 0067)
* **Pre-conditions:** Đơn `DH-HP-011` bị tài xế A huỷ lúc sát giờ (<2h). Đội xe nội bộ đều bận. Chủ shop gọi tài xế ngoài quen biết `Lê Văn C` (SĐT `0912345678`).
* **Test Steps:**
  1. Chủ shop bấm "Nhập tài xế ngoài hệ thống".
  2. Nhập: Tên `Lê Văn C`, SĐT `0912345678` $\rightarrow$ Lưu.
* **Expected Result:**
  - Đơn lưu thành công 2 cột `external_driver_name = 'Lê Văn C'`, `external_driver_phone = '0912345678'`.
  - Coi là đã nhận ngay lập tức (không có thời gian chờ duyệt).
  - Khách thuê mở app thấy ngay: Tên `Lê Văn C` và SĐT gọi điện đón khách.
  - Audit log ghi nhận hành động với SĐT đã che: `0912***678`.

---

#### TC-DRVDROP-12: Gian hàng không có người thay thế $\rightarrow$ Chủ động bấm huỷ đơn (ADR 0045)
* **Pre-conditions:** Đơn `DH-HP-012` có tiền cọc giữ chỗ $150.000đ$. Gian hàng không tìm được tài xế thay thế.
* **Test Steps:** Chủ shop bấm nút "Huỷ chuyến do không có tài xế".
* **Expected Result:**
  - Đơn chuyển sang `status = 'cancelled'`.
  - Khách thuê được hoàn trả đúng $150.000đ$ vào Ví điểm XePrime ngay lập tức.
  - Bảng `booking_cancellations` ghi 1 dòng:
    `responsible_party = 'host'`, `reasonCategory = 'no_driver_available'`, `countsAgainstHost = true`.
  - Chỉ số "Tỷ lệ nhận và giữ chuyến" trong 90 ngày của gian hàng bị giảm.

---

### SUITE 5: TRẢI NGHIỆM & QUYỀN CỦA KHÁCH THUÊ (`TS-DRVDROP-05`)

#### TC-DRVDROP-13: Khách thuê mở App khi còn > 2 giờ trước giờ đón
* **Pre-conditions:** Tài xế A vừa rút cuốc cách giờ đón 5 giờ.
* **Test Steps:** Khách thuê mở tab "Chuyến của tôi".
* **Expected Result:**
  - Màn hình chuyến xe hiển thị bình thường, trạng thái: *"Đang sắp xếp tài xế"*.
  - Không có thông báo lỗi hay popup đáng sợ nào.
  - Tiền cọc giữ chỗ vẫn hiển thị đầy đủ, không thay đổi.

---

#### TC-DRVDROP-14: Khách thuê huỷ chuyến miễn phạt khi sát giờ (< 2 giờ) nhà xe chưa có tài xế
* **Pre-conditions:**
  - Đơn `DH-VT-014` có giờ đón lúc 15:00. Lúc 13:30 (còn 90 phút), đơn vẫn chưa có tài xế do tài xế cũ vừa rút.
  - Khách đã thanh toán tiền giữ chỗ: $300.000đ$.
  - Mốc huỷ miễn phí thông thường $T_{\text{cancel}}$ đã trôi qua.
* **Test Steps:**
  1. Khách mở chi tiết chuyến `DH-VT-014`.
  2. Màn hình hiển thị thẻ vàng: *"Nhà xe đang điều phối lại tài xế"*, kèm nút đỏ: **"Huỷ chuyến (Hoàn 100% cọc)"**.
  3. Khách bấm nút huỷ.
* **Expected Result:**
  - Hệ thống nhận diện đây là ca huỷ do lỗi nhà xe (miễn phạt huỷ muộn).
  - Khách nhận hoàn trả đủ $300.000đ$ vào Ví điểm ngay lập tức.
  - Đơn chuyển sang `cancelled`. Server ghi nhận `responsible_party = 'host'`.

---

#### TC-DRVDROP-15: Khách báo "Chưa nhận được xe" khi quá giờ đón (ADR 0066 Lớp 1)
* **Pre-conditions:** Đến giờ nhận xe 08:00, không có tài xế nào đến đón.
* **Test Steps:** Lúc 08:30 (trong khung 120 phút sau giờ đón), khách bấm nút **"Chưa nhận được xe"**.
* **Expected Result:**
  - Hệ thống tạo Case hỗ trợ loại `dispute`, mức ưu tiên `urgent`.
  - Khoản tiền giữ chỗ của chuyến xe bị khóa hoãn quyết toán (`hasOpenDispute = true`).
  - CSKH sàn XePrime nhận thông báo trên Dashboard hỗ trợ để xử lý đền bù cho khách.

---

### SUITE 6: LUỒNG TIỀN & QUYẾT TOÁN VÍ (`TS-DRVDROP-06`)

#### TC-DRVDROP-16: Xác minh dòng tiền giữ chỗ 15% không bị suy suyển khi tài xế huỷ cuốc
* **Pre-conditions:** Đơn thuê ô tô 4 ngày $\times$ 1.000.000đ. Tiền thuê $B = 4.000.000đ$. Cọc giữ chỗ $15\% \times B = 600.000đ$, phí sàn $S = 50.000đ$, hoa hồng $H = 340.000đ$. Tổng khách đã trả: $990.000đ$.
* **Test Steps:** Tài xế A bấm rút khỏi chuyến.
* **Expected Result:**
  - Bảng `booking_holds`: Trạng thái hold vẫn là `PAID`, `outcome = null`.
  - Không có dòng hoàn tiền nào được tạo ra tại bước này.
  - Ví chủ xe = không đổi. Ví khách = không đổi. Tài khoản SePay = không đổi.

---

#### TC-DRVDROP-17: Thuế GTGT/TNCN tự động bằng 0đ khi chuyến đi bị huỷ do thiếu tài xế
* **Pre-conditions:** Đơn xe có tài xế (mức thuế theo ADR 0068 là 4,5%). Do không có tài xế nên đơn bị huỷ.
* **Test Steps:** Kiểm tra bảng `tax_accruals`.
* **Expected Result:**
  - Không phát sinh nghĩa vụ thuế GTGT hay TNCN nào ($0đ$) vì dịch vụ vận tải chưa diễn ra thực tế.

---

### SUITE 7: KIỂM THỬ BIÊN, BẢO MẬT & ĐUA LỆNH CONCURRENCY (`TS-DRVDROP-07`)

#### TC-DRVDROP-18: Đua lệnh (Race condition) giữa Tài xế bấm rút cuốc và Chủ xe bấm đổi người
* **Pre-conditions:** Đơn `DH-RC-018` đang gán cho tài xế A.
* **Test Steps:**
  - Thread 1: Tài xế A gửi request `POST /driver/trips/bk_018/drop`.
  - Thread 2: Đúng mili-giây đó, Chủ shop gửi request `PATCH /bookings/bk_018/driver` để gán sang tài xế B.
* **Expected Result:**
  - Nhờ cơ chế `SELECT FOR UPDATE` trên dòng Booking: Đúng 1 thread giành được khóa trước.
  - Nếu Thread 1 thắng: Tài xế A rút thành công $\rightarrow$ Thread 2 thực hiện gán tài xế B bình thường.
  - Nếu Thread 2 thắng: Tài xế B được gán $\rightarrow$ Thread 1 của tài xế A nhận lỗi `409 CONFLICT` (vì tài xế A đã bị gỡ ra trước đó).
  - Dữ liệu cuối cùng luôn ở trạng thái nhất quán, không xảy ra xung đột hay bản ghi mồ côi.

---

#### TC-DRVDROP-19: Tài xế bấm rút cuốc 2 lần liên tiếp (Idempotency)
* **Test Steps:** Tài xế A double click nhanh nút "Xác nhận rút khỏi chuyến".
* **Expected Result:**
  - Lượt bấm thứ nhất: Thành công `200 OK`.
  - Lượt bấm thứ hai: Bị chặn lại với `409 CONFLICT` (`DRIVER_TRIP_NOT_ACCEPTED`).
  - Không tạo ra 2 dòng audit và không tạo 2 bản ghi lịch sử `DROPPED`.

---

#### TC-DRVDROP-20: Tài xế vừa rút cuốc xong có bấm "Nhận lại" được không?
* **Test Steps:** Tài xế A sau khi rút cuốc, cố tình gọi API `POST /driver/trips/bk_018/accept`.
* **Expected Result:**
  - API trả về `404 NOT_FOUND` hoặc `409 DRIVER_ASSIGNMENT_EXPIRED`.
  - Tài xế A không thể tự ý nhận lại chuyến xe nếu chưa được gian hàng gán lại.

---

#### TC-DRVDROP-21: Xoá hoặc kết thúc liên kết tài xế khi đang có chuyến bị DROPPED
* **Test Steps:** Sau khi tài xế A rút cuốc khỏi đơn `bk_018`, tài xế A vào mục "Nơi tôi làm tài xế" bấm nút "Ngừng làm tài xế cho gian hàng này" (`POST /driver/links/:id/leave`).
* **Expected Result:**
  - Thao tác thành công!
  - Lý do: Đơn `bk_018` đã không còn mang tài xế A (`driverId = null`), do đó tài xế A không còn bị vướng lỗi `DRIVER_HAS_ACCEPTED_TRIPS` của chuyến này nữa.

---

#### TC-DRVDROP-22: Giờ nhận xe rơi vào ban đêm (Night-time Lead Time Edge Case)
* **Pre-conditions:** Chuyến xe đón lúc 05:00 sáng. Tài xế bấm huỷ lúc 23:00 đêm hôm trước ($\Delta T = 6\text{ giờ}$).
* **Test Steps:** Kiểm tra thông báo và SLA của gian hàng.
* **Expected Result:**
  - Hệ thống gửi push notification ưu tiên cao có cờ đánh thức (High Priority Notification).
  - SLA điều phối của gian hàng vẫn tính toán chuẩn xác theo công thức động, không bị nhảy âm hay sai lệch múi giờ UTC/GMT+7.
