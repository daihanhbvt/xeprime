# BỘ KỊCH BẢN KIỂM THỬ TOÀN DIỆN: TÀI XẾ HỦY CHUYẾN ĐÃ NHẬN & ĐIỀU PHỐI 3 BÊN
## FULL QA TEST MATRIX, TEST CASES & EDGE CASES SPECIFICATION (LINKED DRIVERS ONLY)

| Thông tin tài liệu | Chi tiết |
| :--- | :--- |
| **Mã tài liệu** | `SPEC-QA-06-DRIVER-DROP` |
| **Dự án** | XePrime Rental Platform |
| **Phiên bản** | `v1.1.0` — Cập nhật ngày 26/10/2026: **Chặn hoàn toàn tài xế ngoài hệ thống; Bổ sung kiểm thử luồng hoàn tiền triệt tiêu bẫy phạt** |
| **Vai trò soạn thảo** | Senior Quality Control (QC) & QA Lead |
| **Tài liệu căn cứ** | `SPEC-BUS-06` (v1.1.0), ADR 0045, ADR 0063, ADR 0066, `SPEC-BUS-02`, `SPEC-BUS-03` |
| **File Excel đồng bộ** | `D:\Softrent\Tai lieu\03_QUALITY_CONTROL_QC\02_Driver_Trip_Cancellation\QC_TestCases_DRIVER_06_Driver_Drop_Accepted_Trip_v1.0.xlsx` |
| **Phân hệ kiểm thử** | `drivers`, `bookings`, `booking-driver-assignments`, `customer-trips`, `holds`, `wallet`, `notifications`, `audit` |

---

## 1. MA TRẬN 7 TEST SUITES KIỂM THỬ

| Mã Suite | Tên Phân Hệ / Nhóm Nghiệp Vụ | Phạm Vi Kiểm Thử | Số TC | Mức Độ | Kết Quả Mong Đợi |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `TS-DRVDROP-01` | Nghiệp vụ rút cuốc phía Tài xế | Kiểm tra điều kiện rút cuốc, validate modal lý do, giải trình text khi chọn OTHER, chặn rút khi đơn đã giao xe (`active`) | 4 | Critical | Đúng mã lỗi, đúng điều kiện chặn |
| `TS-DRVDROP-02` | Transaction Lõi & Phạt Cooldown | Xử lý atomic 1 transaction: đổi outcome `DROPPED`, clear 4 cột tài xế, nhả lịch EXCLUDE, tính hạn Cooldown 24h/48h | 3 | Critical | DB nhất quán, không sót khóa |
| `TS-DRVDROP-03` | Thông báo khẩn & SLA Bên thuê | Bắn Push + chuông đỏ cho gian hàng, hiển thị badge thiếu tài xế, kích hoạt đồng hồ SLA điều phối (15' - 120') | 3 | High | Nhận tin tức thì, đúng nội dung copy |
| `TS-DRVDROP-04` | Các kịch bản Điều phối thay thế | (a) Gán tài xế liên kết B; (b) **CHẶN NHẬP TÀI XẾ NGOÀI HỆ THỐNG**; (c) Không có người $\rightarrow$ Bấm huỷ đơn ADR 0045 | 4 | Critical | Đúng ma trận phân quyền & dữ liệu |
| `TS-DRVDROP-05` | Trải nghiệm & Quyền của Khách | UI trung tính khi xa giờ đón; hiển thị nút huỷ hoàn 100% khi sát giờ (<2h); nút "Chưa nhận được xe" mở dispute | 3 | Critical | Bảo toàn quyền lợi khách, hoàn 100% |
| `TS-DRVDROP-06` | Luồng tiền & Triệt tiêu bẫy phạt | Bảo toàn tiền cọc 15%, hoàn ví điểm ngay lập tức, **triệt tiêu bẫy phạt huỷ muộn khi lỗi do nhà xe**, rút tiền ngân hàng 0đ | 3 | Critical | Tiền đúng tới đồng, không âm ví |
| `TS-DRVDROP-07` | Đua lệnh, Concurrency & Biên | Đua lệnh tài xế bấm rút đúng lúc chủ xe đổi người, cúp mạng, rút cuốc nhiều lần (idempotency) | 2 | High | Không sinh bản ghi ma, không crash |

**Tổng số Test Case:** **22 Test Cases** (100% bao phủ toàn bộ ma trận nghiệp vụ 3 bên).

---

## 2. CHI TIẾT CÁC TEST CASES TRỌNG ĐIỂM (KEY TEST CASES)

### TC_HOST_004: CHẶN GIAN HÀNG NHẬP TÀI XẾ NGOÀI HỆ THỐNG (BỎ PHƯƠNG ÁN 2)
* **Mức độ:** Blocker | **Loại kiểm thử:** Business Rule Security Negative
* **Mục tiêu:** Đảm bảo hệ thống tuân thủ chỉ đạo của PO — không cho phép bất kỳ ai nhập tài xế ngoài hệ thống.
* **Tiền điều kiện:** Gian hàng đang quản lý đơn `DH-HN-004` bị thiếu tài xế.
* **Các bước thực hiện:**
  1. Gửi request `PATCH /bookings/bk_004/driver` với payload:
     `{ externalDriverName: "Nguyễn Văn X", externalDriverPhone: "0912345678" }`.
* **Kết quả mong đợi:**
  - Hệ thống từ chối với HTTP Status `422 UNPROCESSABLE_ENTITY` hoặc `400 BAD_REQUEST`.
  - Mã lỗi: `API_ERROR_CODE.EXTERNAL_DRIVER_NOT_SUPPORTED`.
  - Thông điệp: *"Hệ thống XePrime chỉ hỗ trợ gán tài xế liên kết đã xác thực danh tính và giấy phép lái xe"*.
  - Hai cột `external_driver_name` và `external_driver_phone` vẫn giữ giá trị `NULL`.

---

### TC_CUST_003: TRIỆT TIÊU BẪY PHẠT HUỶ MUỘN ĐỐI VỚI KHÁCH HÀNG
* **Mức độ:** Blocker | **Loại kiểm thử:** Financial Integrity Critical
* **Mục tiêu:** Xác minh khách thuê không bị phạt mất cọc 15% khi chủ động huỷ chuyến do lỗi nhà xe thiếu tài xế.
* **Tiền điều kiện:**
  - Đơn `DH-SG-003` có cọc giữ chỗ 15% là $450.000đ$.
  - Tài xế cũ vừa bấm rút cuốc lúc còn 80 phút trước giờ nhận xe ($\Delta T = 80\text{ phút} < 2\text{h}$).
  - Mốc huỷ miễn phí thông thường $T_{\text{cancel}}$ đã quá hạn từ trước.
* **Các bước thực hiện:**
  1. Khách thuê mở ứng dụng, thấy cảnh báo: *"Nhà xe đang điều phối lại tài xế"*.
  2. Khách bấm nút đỏ: **"Huỷ chuyến (Hoàn 100% cọc)"**.
  3. Bấm xác nhận huỷ.
* **Kết quả mong đợi:**
  - Hệ thống nhận diện cờ `driver_dropped_unfulfilled` $\rightarrow$ Gán kết cục huỷ do lỗi nhà xe.
  - Ví điểm của khách được **cộng đủ $450.000đ$ ngay lập tức** (hoàn 100% cọc giữ chỗ và phí bảo hiểm).
  - Khách không bị trừ bất kỳ khoản phạt huỷ muộn nào.
  - Đơn chuyển sang `cancelled`. Ghi nhận trách nhiệm thuộc về gian hàng: `responsible_party = host`.

---

### TC_CUST_004: THANH KHOẢN RÚT TIỀN HOÀN VỀ TÀI KHOẢN NGÂN HÀNG (PHÍ 0Đ)
* **Mức độ:** Major | **Loại kiểm thử:** Wallet & Payout
* **Tiền điều kiện:** Khách vừa nhận hoàn tiền $450.000đ$ vào Ví điểm từ ca huỷ `TC_CUST_003`.
* **Các bước thực hiện:**
  1. Khách vào Ví điểm $\rightarrow$ Bấm "Rút tiền về tài khoản ngân hàng".
  2. Nhập số tài khoản Vietcombank và tên người thụ hưởng.
  3. Gửi lệnh rút tiền.
* **Kết quả mong đợi:**
  - Hệ thống nhận diện nguồn tiền là `REFUND_DRIVER_INCIDENT` $\rightarrow$ Áp dụng biểu phí rút: **$0đ$**.
  - Lệnh rút tiền được gắn cờ ưu tiên cao, hoàn tất chuyển khoản về ngân hàng cho khách trong vòng 15 phút.

---

*(Toàn bộ 22 Test Cases chi tiết khác đã được xuất ra file Excel: `QC_TestCases_DRIVER_06_Driver_Drop_Accepted_Trip_v1.0.xlsx`)*
