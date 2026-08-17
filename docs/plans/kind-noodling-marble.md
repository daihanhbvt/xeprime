# Nghiệp vụ đa dịch vụ: Xe có tài xế & Thuê dài hạn (manage + user)

> Trạng thái: ĐANG PHÂN TÍCH — phần kỹ thuật chờ kết quả khảo sát code.

## 1. Bối cảnh & vấn đề

Đợt 17/08 đã đưa 3 tab dịch vụ (Xe tự lái / Xe có tài xế / Thuê xe dài hạn) vào ô tìm kiếm
trang chủ, chạy trên cột `vehicles.service_type` (single string) sẵn có. Hai vấn đề lộ ra:

1. **Một xe chỉ khai được MỘT dịch vụ.** Giá trị `both` là bản vá chỉ phủ 2/3 tổ hợp
   (tự lái + có tài xế). Thực tế một xe có thể phục vụ **cả 3**: tự lái, có tài xế, VÀ dài
   hạn. Với 3 dịch vụ có 7 tổ hợp — enum đơn không mô hình hoá nổi. Yêu cầu: shop chọn
   **nhiều dịch vụ cùng lúc** cho một xe.
2. **Hai dịch vụ "có tài xế" và "dài hạn" mới chỉ có tab tìm kiếm, chưa có nghiệp vụ:**
   không có giá riêng, không có trường lộ trình, luồng gửi yêu cầu thuê chưa phân biệt
   dịch vụ, phía manage chưa quản lý gì thêm.

Đích: hoàn thiện nghiệp vụ 2 dịch vụ này **xuyên suốt user ↔ manage**, tham khảo mô hình
Mioto.vn nhưng điều chỉnh theo đặc thù XePrime.

## 2. Phân tích mô hình Mioto (từ ảnh tham khảo)

### 2.1. Xe có tài xế

| Thành phần | Mioto | Ghi chú nghiệp vụ |
| --- | --- | --- |
| Lộ trình | 3 loại: **Nội thành** (lộ trình tự do, nội thành/lân cận) · **Liên tỉnh** (khứ hồi) · **Liên tỉnh 1 chiều** | Lộ trình quyết định cách tính giá: nội thành theo gói giờ; liên tỉnh theo ngày; 1 chiều có phụ phí |
| Thời gian | Cho phép khoảng NGẮN trong ngày (08:00→10:00 cùng ngày) | Nội thành bản chất là thuê theo giờ có tài xế |
| Địa điểm | Tỉnh/TP đón khách | Xe đến đón — địa chỉ đón cụ thể nhập ở bước đặt |

### 2.2. Thuê dài hạn (car subscription)

| Thành phần | Mioto | Ghi chú nghiệp vụ |
| --- | --- | --- |
| Đơn vị giá | **X/tháng** (vd 8.000K/tháng) | Neo giá theo tháng — dễ hiểu, dễ so sánh |
| Gói thuê | 1/3/6/9/12 tháng, ưu đãi **-2% từ 3 tháng** | Giảm giá theo cam kết thời hạn |
| Nhóm xe | Trang list gộp theo **MẪU xe** ("Kia Morning — 3 xe có sẵn"), giá khác nhau theo **nhóm năm sản xuất** | Mô hình fleet lớn: bán "mẫu xe", không bán từng chiếc |
| Thời gian nhận xe | "7 ngày tới" hoặc "Thời gian khác" | Ngày nhận linh hoạt, chốt khi tư vấn |
| Giá trọn gói | Đã gồm VAT, bảo hiểm, giao nhận, bảo dưỡng định kỳ; thanh toán theo chu kỳ tháng | Dài hạn = dịch vụ trọn gói, không phải thuê ngày kéo dài |
| Chốt đơn | "CHỌN THUÊ" → tư vấn (hotline/fanpage) | Không thanh toán online — hợp đồng qua tư vấn |
| Bộ lọc list | Chỉ Sắp xếp · Truyền động · Loại xe · Hãng xe | Bộ lọc rút gọn so với thuê ngày |

### 2.3. Điều chỉnh cho XePrime (khác Mioto ở đâu, vì sao)

| Điểm | Mioto | XePrime chốt | Lý do |
| --- | --- | --- | --- |
| Thời hạn dài hạn | Gói cứng 1/3/6/9/12 tháng | **Ngày cụ thể do khách chọn, tối thiểu 7 ngày** | Yêu cầu chủ dự án 17/08; linh hoạt hơn cho thị trường shop nhỏ lẻ |
| Chốt giá | Giá niêm yết + tư vấn hotline | Giá THAM CHIẾU trên listing; **giá chốt do shop quyết khi duyệt yêu cầu** | Đúng mô hình request→approval sẵn có của XePrime (schema đã ghi chú nguyên tắc này) |
| Gộp theo mẫu xe + năm SX | Có (fleet lớn) | **Không (MVP)** — listing theo từng xe như hiện tại | XePrime là marketplace nhiều shop nhỏ; gộp mẫu là bài toán trình bày khi fleet đủ lớn, để sau |
| Giá dài hạn | Giá tháng + % ưu đãi theo gói | Giá tháng tham chiếu, ước tính theo ngày (chi tiết mục 4) | Khớp "ngày cụ thể ≥ 7 ngày" |
| Lộ trình có tài xế | Quyết định bảng giá | Là **ngữ cảnh yêu cầu thuê** gửi cho shop (chưa là chiều lọc/bảng giá riêng) | Chưa có mô hình giá theo lộ trình; đưa vào yêu cầu để shop báo giá đúng, tránh UI giả |

## 3. Mô hình dữ liệu: một xe – nhiều dịch vụ

*(chờ khảo sát inventory usage để chốt chi tiết migration)*

Hướng: `vehicles.service_type` (string đơn, có `both`) → `vehicles.service_types` (**mảng**,
tập con của `{self_drive, with_driver, long_term}`, tối thiểu 1 phần tử). `both` bị khai tử —
backfill `both → [self_drive, with_driver]`. Mirror sang `public_listings.service_types` +
GIN index (cùng pattern cột `features` sẵn có). Filter marketplace: `has(serviceType)`.

**Booking / BookingRequest vẫn mang MỘT `service_type`** — một chuyến đi cụ thể luôn thuộc
đúng một dịch vụ. (Khảo sát đang xác nhận `booking_requests` đã có cột này chưa.)

## 4. Nghiệp vụ Thuê dài hạn — XePrime

- **Định nghĩa:** thuê liên tục **≥ 7 ngày**, khách chọn ngày nhận – ngày trả cụ thể.
- **Giá:** xe khai thêm **giá tháng tham chiếu** (`monthly_price`, /30 ngày). Ước tính cho
  khách: `số ngày × (monthly_price / 30)`; chưa khai giá tháng thì rơi về giá ngày hiện có.
  Luôn kèm nhãn "giá tham chiếu — gian hàng xác nhận khi duyệt".
- **Tìm kiếm:** tab Dài hạn có chọn khoảng ngày (ràng buộc ≥ 7 ngày) + lọc lịch trống như
  thuê thường (đổi so với đợt 17/08 — trước bỏ hẳn ngày vì tưởng gói tháng cố định).
- **Chống trùng lịch:** không đổi — booking dài hạn chiếm `vehicle_occupancies` theo đúng
  ADR 0006.
- **Manage:** form xe thêm giá tháng (chỉ hiện khi tick dịch vụ Dài hạn); inbox yêu cầu thuê
  hiện nhãn dịch vụ + thời lượng; duyệt là tạo Booking `service_type = long_term`.

## 5. Nghiệp vụ Xe có tài xế — XePrime

- **Lộ trình (3 loại):** `in_city` · `inter_city` (khứ hồi) · `inter_city_one_way` — union
  type mới trong `@xeprime/types`, hằng số + nhãn, không hardcode.
- **Vai trò lộ trình ở MVP:** chọn ở tab tìm kiếm → mang trên URL → prefill vào **yêu cầu
  thuê** (shop đọc để báo giá đúng). KHÔNG lọc danh sách xe theo lộ trình (chưa có dữ liệu
  xe khai lộ trình phục vụ — tránh bộ lọc rỗng giả).
- **Giá:** xe khai **giá/ngày có tài xế** tham chiếu (`with_driver_daily_price` — đã gồm tài
  xế; phụ phí 1 chiều/lưu đêm shop báo khi duyệt). Chưa khai → hiện giá ngày thường + nhãn
  "giá chưa gồm tài xế — gian hàng báo khi duyệt". *(chờ chốt với chủ dự án)*
- **Yêu cầu thuê:** thêm lộ trình + địa chỉ đón + điểm đến (liên tỉnh); tài xế do shop tự
  phân công (khảo sát đang xác nhận module drivers hiện có gì).

## 6. Phạm vi KHÔNG làm đợt này (ghi rõ để không trôi scope)

- Gộp listing theo mẫu xe + nhóm năm sản xuất (mô hình fleet Mioto).
- Bảng giá theo gói tháng + % ưu đãi theo cam kết (1/3/6/9/12 tháng).
- Bảng giá theo lộ trình có tài xế (gói giờ nội thành, phụ phí 1 chiều tự động).
- Lọc danh sách xe theo loại lộ trình.
- Thanh toán online / chu kỳ thanh toán tháng tự động.

## 7. Kết quả khảo sát code (nền cho thiết kế)

### 7.1. Luồng booking-request & drivers (đã khảo sát)

**Luồng khách gửi yêu cầu** (`apps/web/src/features/booking-requests/RequestBookingFlow.tsx`):
3 bước Thời gian → Liên hệ (+OTP) → Xác nhận; field: thời gian, tên/SĐT/email, nhận xe
(`self | delivery` + địa chỉ), điều khoản. **Không có chọn dịch vụ, không có ô ghi chú.**

**Gap nghiệp vụ phát hiện (mức bug):**
- `booking_requests` **không có cột `service_type`**; `approve()`
  (`booking-requests.service.ts:353-440`) không map dịch vụ → **mọi Booking sinh từ yêu cầu
  đều thành `self_drive`**, kể cả khi xe là xe có tài xế.
- `StaffBookingFlow.tsx:259` hard-code `SELF_DRIVE` cho đặt hộ (luồng shop tự lập đơn thì
  ĐÃ có select serviceType — `features/bookings/schema.ts:33-36`).
- Inbox `/manage/booking-requests` (`BookingRequestTable.tsx`): 4 cột, **không hiển thị loại
  dịch vụ, không render `note`** của khách dù DTO có trả.
- Min/max thời lượng thuê: FE hard-code (1–24h giờ, ≥1 ngày); BE chỉ kiểm `end > start`;
  `RentalPolicy` chưa có min/max ngày.
- Giá lúc duyệt: `PricingService.effectivePolicy → buildQuote → buildSnapshot` (đã có sẵn
  máy tính giá theo ngày + policy — điểm cắm cho giá dài hạn/có tài xế).

**Module Tài xế: 0% code.** `/manage/drivers` là PlaceholderPage (`comingSoon`), không có
model `Driver`, `bookings` không có `driver_id`. Spec đã có sẵn trên giấy:
`docs/xeprime_database_design.md` (bảng `drivers` + `driver_documents`, màn "Gán tài xế vào
đơn"), gap S-06/P1 trong `docs/design/03_PRODUCT_GAP_ANALYSIS.md`.

*(đang chờ 2 nhánh khảo sát còn lại: inventory serviceType & form xe · quote/detail/date-range)*

## 8. Verify

*(sẽ điền cùng thiết kế kỹ thuật)*

## 8. Verify

*(sẽ điền cùng mục 7)*
