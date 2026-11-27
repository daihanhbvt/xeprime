# ĐẶC TẢ KHẤU TRỪ, NỘP THAY THUẾ CHO CHỦ XE & BẢNG CỘNG VÍ CHỦ XE

| Thông tin tài liệu | Chi tiết |
| :--- | :--- |
| **Mã tài liệu** | `SPEC-BUS-05` |
| **Dự án** | XePrime Rental Platform |
| **Phiên bản** | `v1.0.0` |
| **Ngày ban hành** | 22/10/2026 |
| **Căn cứ** | ADR 0068 (thuế), ADR 0069 (làm tròn), ADR 0064, ADR 0066 · NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP |
| **Module liên quan** | `fee-policies`, `pricing`, `tax`, `holds`, `wallet`, `booking-requests`, `bookings`, `seller-profiles` |

> **Trạng thái pháp lý:** mức khấu trừ làm theo thực tiễn của Mioto (chủ sản phẩm chốt 22/10/2026). Năm câu hỏi ở mục 9 vẫn cần văn bản của tư vấn thuế trước khi mở release gate ADR 0028 mục 2.

---

## 1. CĂN CỨ PHÁP LÝ

| Văn bản | Nội dung áp dụng cho XePrime |
| :--- | :--- |
| **NĐ 117/2025/NĐ-CP** (hiệu lực 01/07/2025) | Nền tảng số **có chức năng thanh toán** khấu trừ, kê khai, nộp thay thuế GTGT + TNCN cho **hộ, cá nhân** kinh doanh trên nền tảng; khấu trừ khi giao dịch thành công; giao dịch huỷ thì bù trừ; kê khai theo tháng; chứng từ khấu trừ điện tử theo năm; người bán cung cấp MST hoặc số định danh. |
| **NĐ 68/2026/NĐ-CP** (hiệu lực 05/03/2026) | Nền tảng vẫn khấu trừ theo **từng giao dịch** (Điều 11 khoản 1); số TNCN đã nộp thay được trừ khi xác định số phải nộp; người dưới ngưỡng bù trừ / hoàn số nộp thừa với cơ quan thuế (Điều 12 khoản 1). |
| **NĐ 141/2026/NĐ-CP** (29/04/2026, áp dụng từ 01/01/2026) | Sửa NĐ 68/2026: ngưỡng doanh thu năm không phải nộp GTGT, TNCN nâng từ 500 triệu lên **01 tỷ đồng** (Luật 09/2026/QH16 giao Chính phủ quy định ngưỡng). Doanh thu xét ngưỡng gộp mọi hoạt động, trước phí nền tảng. |

XePrime thu tiền giữ chỗ qua SePay ⇒ là nền tảng **có chức năng thanh toán** ⇒ thuộc diện khấu trừ, nộp thay.

---

## 2. AI BỊ KHẤU TRỪ

| Chủ thể (hồ sơ người bán) | Khấu trừ? | Ghi chú |
| :--- | :---: | :--- |
| Cá nhân | ✅ | Chủ xe tuyến hoa hồng thường thuộc nhóm này |
| Hộ kinh doanh | ✅ | |
| Doanh nghiệp **đã xác minh** | ❌ `T = 0` | Tự xuất hoá đơn, tự kê khai (ADR 0059) |
| Doanh nghiệp chưa xác minh (nháp / đã nộp / bị trả về) | ✅ (như cá nhân) | Chờ admin xác minh hồ sơ người bán |
| Chưa có hồ sơ người bán | ✅ (coi là cá nhân) | Thiếu dữ liệu **không** làm mất nghĩa vụ |

Hồ sơ đã xác minh mà đổi loại chủ thể, MST hoặc CCCD ⇒ tự về "đã nộp", chờ xác minh lại; trong lúc chờ khấu trừ như cá nhân.

**Tuyến (hoa hồng / gói) không quyết định thuế** — chỉ loại chủ thể quyết định. Gian hàng mua gói nhưng là hộ kinh doanh vẫn bị khấu trừ.

---

## 3. MỨC KHẤU TRỪ (GIỐNG MIOTO)

| Loại dịch vụ của đơn | Nhóm theo NĐ 117 | GTGT | TNCN | **Tổng** |
| :--- | :--- | :---: | :---: | :---: |
| Tự lái (`self_drive`) | Dịch vụ | 5% | 2% | **7%** |
| Thuê dài hạn (`long_term`) | Dịch vụ | 5% | 2% | **7%** |
| Có tài xế (`with_driver`) | Vận tải | 3% | 1,5% | **4,5%** |

- Là **dữ liệu chính sách phí** (phiên bản v9), admin đổi được bằng cách phát hành phiên bản mới; đơn cũ giữ mức đã chụp (ADR 0024).
- Thay mức 10% "VAT 5% + TNCN 5%" của các phiên bản v4–v8 (tỷ lệ khi cá nhân TỰ khai cho thuê tài sản — không phải tỷ lệ nền tảng khấu trừ).

---

## 4. CÁCH TÍNH

```text
  B   = tiền thuê sau khuyến mãi trực tiếp của xe (KHÔNG gồm phí giao xe G, phí đặt xe S, bảo hiểm IV/IP)
  GTGT = roundVnd(B × GTGT%)          ← làm tròn tới ĐỒNG, mỗi sắc thuế riêng (ADR 0069)
  TNCN = roundVnd(B × TNCN%)
  T    = GTGT + TNCN                   (= 0 nếu chủ thể là doanh nghiệp hoặc chính sách tắt thuế)
```

- **Thời điểm ghi sổ:** khi chuyến bắt đầu (bàn giao nhận xe ⇒ đơn `active`). Tiền thực trừ khi chuyến hoàn thành: ví chủ xe nhận `D − T`.
- **Huỷ trước chuyến:** không phát sinh thuế. Khoản đền huỷ muộn cho chủ xe (`D`) là bồi thường, không khấu trừ.
- **Điều chỉnh sau khi đã ghi sổ:** ghi dòng đảo + dòng mới (bù trừ theo NĐ 117), không sửa dòng cũ.
- **Không bao giờ cộng vào số khách trả**; luôn trừ vào phần của chủ xe.
- Sàn tiền giữ chỗ `S + H + IV + IP + T` bảo đảm ví chủ xe không âm (ADR 0101: tiền thuê trả trước `C = 30% × B` đã gồm `H`; `D = C − H ≥ T` vì 30% ≥ 10% + 7%).

---

## 5. LÀM TRÒN TIỀN (ADR 0069)

| Loại số tiền | Quy tắc | Lý do |
| :--- | :--- | :--- |
| Khoản **tính ra từ tỷ lệ**: hoa hồng `H`, tiền thuê trả trước 30%, GTGT, TNCN, phí giao xe theo km | **Đúng tới đồng** (`roundVnd`) | Số thật; thuế phải khớp tỷ lệ × doanh thu |
| Khoản **giảm giá theo %**: khuyến mãi của xe, ưu đãi dài hạn, mã khuyến mãi nền tảng | Làm tròn **LÊN** 1.000đ, rồi mới kẹp trần | Hạn chế lẻ bằng chính sách, khách không bao giờ được giảm ít hơn % đã công bố |
| Số **cấu hình**: phí đặt xe `S`, biểu phí bảo hiểm, sàn giữ chỗ, giá gói | Bội 1.000đ (validator + CHECK) | Giá niêm yết tròn ngay từ nguồn |

Hệ quả: tiền giữ chỗ trên QR có thể lẻ (ví dụ 420.200đ) — SePay đối soát theo đúng số, không cần số tròn.

---

## 6. VÍ DỤ ĐỐI SOÁT

### 6.1. Tự lái, chủ xe cá nhân (tuyến hoa hồng) — 1 ngày × 780.000đ

| Dòng | Tính | Số tiền |
| :--- | :--- | ---: |
| Doanh thu cho thuê xe (B) | 1 × 780.000 | 780.000 |
| Phí dịch vụ – Chủ xe (H) | 10% × 780.000 (ngày 1) | −78.000 |
| Thuế khấu trừ (GTGT 5% + TNCN 2%) | 39.000 + 15.600 | −54.600 |
| **Thu nhập chủ xe (a)** | B − H − T | **647.400** |
| Khách thanh toán trực tiếp (b) | B − D − H = 780.000 − 156.000 − 78.000 (= 70% × B) | 546.000 |
| **Số tiền cộng ví (a − b)** | = D − T = 156.000 − 54.600 | **101.400** |

Phía khách: phí đặt xe 50.000 + tiền thuê 780.000 = 830.000; tiền thuê trả trước C = 30% × 780.000 = 234.000 (đã gồm H 78.000 ⇒ D = 156.000); tiền giữ chỗ = 50.000 + 234.000 = **284.000**; trả chủ xe khi nhận xe 546.000.

### 6.2. Có tài xế, chủ xe cá nhân — 2 ngày × 1.200.000đ

B = 2.400.000 · H = 10% × 2.400.000 = 240.000 · GTGT 3% = 72.000 · TNCN 1,5% = 36.000 · T = 108.000 · C = 720.000 ⇒ D = C − H = 480.000
⇒ a = 2.052.000 · b = 1.680.000 · **cộng ví = 372.000** (= 480.000 − 108.000) ✓

### 6.3. Tuyến gói — 3 ngày tự lái × 1.000.000đ

| | Gian hàng là **doanh nghiệp** | Gian hàng là **hộ kinh doanh** |
| :--- | ---: | ---: |
| B | 3.000.000 | 3.000.000 |
| H (tuyến gói) | 0 | 0 |
| T | 0 (không khấu trừ) | 150.000 + 60.000 = 210.000 |
| D (= C = 30%, H = 0) | 900.000 | 900.000 |
| Tiền giữ chỗ (S + D) | 950.000 | 950.000 |
| **Cộng ví (D − T)** | **900.000** | **690.000** |

### 6.4. Số lẻ thật sau khuyến mãi — 1 ngày × 650.000đ, giảm 10%

B = 650.000 − 65.000 = 585.000 · H = 58.500 · C = 175.500 ⇒ D = 117.000 · GTGT 29.250 + TNCN 11.700 = 40.950
⇒ tiền giữ chỗ = 50.000 + 175.500 = **225.500** · trả khi nhận xe = 409.500 (70% × B) · cộng ví = 117.000 − 40.950 = **76.050** (đúng tới đồng, không làm tròn nghìn).

---

## 7. HIỂN THỊ

### 7.1. Bảng "cộng ví chủ xe" — chỉ phía đối tác (site partner) và admin

Có mặt ở **hộp duyệt yêu cầu**, **chi tiết đơn** và **sao kê ví**:

```text
  Đơn giá thuê                     780.000 /ngày
  Số ngày thuê                     1 ngày
  ───────────────────────────────────────────
  Doanh thu cho thuê xe            780.000
  Phí dịch vụ – Chủ xe  (i)        −78.000      ← chỉ tuyến hoa hồng; tuyến gói ẩn dòng
  Thuế khấu trừ (GTGT 5% + TNCN 2%) (i)  −54.600 ← doanh nghiệp: "Không khấu trừ (doanh nghiệp)"
  ───────────────────────────────────────────
  Thu nhập chủ xe (a)              647.400
  Khách thanh toán trực tiếp (b)   546.000
  Số tiền cộng ví (a − b)           101.400
```

- **(i) Phí dịch vụ – Chủ xe:** "% lũy tiến theo ngày thuê theo chính sách phí đang áp dụng (10% ngày 1–2 · 7% ngày 3–7 · 5% ngày 8–30 · 3% từ ngày 31). Gian hàng có gói: 0đ. Khoản này giúp XePrime vận hành chợ, chăm sóc khách, xử lý hoàn/huỷ, hỗ trợ tranh chấp và bảo hiểm."
- **(i) Thuế khấu trừ:** "Theo NĐ 117/2025 và NĐ 68/2026, XePrime khấu trừ, kê khai và nộp thay thuế cho chủ xe là cá nhân/hộ kinh doanh. Tự lái và dài hạn 7% (GTGT 5% + TNCN 2%), có tài xế 4,5% (GTGT 3% + TNCN 1,5%) trên tiền thuê. Doanh nghiệp không bị khấu trừ." + liên kết **Chính sách thuế**.
- Đơn giá chỉ hiện khi mọi ngày cùng giá; giá khác nhau theo ngày thì hiện "Tiền thuê N ngày".

### 7.2. Phía khách

- Không hiện hoa hồng, thuế, phần của chủ xe (ADR 0064 điều 11).
- Dòng `S` đổi tên **"Phí đặt xe"** (trước là "Phí dịch vụ XePrime") để không trùng với "Phí dịch vụ – Chủ xe".

### 7.3. Văn bản "Chính sách thuế" cho đối tác

Trang `/legal/owner-tax`: căn cứ, bảng mức, ai bị khấu trừ, cơ sở, thời điểm, bù trừ khi huỷ, quyền đề nghị hoàn của người dưới ngưỡng 01 tỷ, nghĩa vụ cung cấp MST/CCCD, chứng từ khấu trừ năm.

---

## 8. CẤU HÌNH Ở ADMIN (`/fee-policies`)

Mục **"Thuế khấu trừ"** của form chính sách phí:

| Thành phần | Mô tả |
| :--- | :--- |
| Công tắc | Bật/tắt khấu trừ |
| Căn cứ pháp lý | Bắt buộc khi bật — ví dụ "NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP" |
| Bảng mức | 3 dòng (Tự lái · Dài hạn · Có tài xế) × (GTGT %, TNCN %), cột tổng tự tính |
| Phạm vi (chỉ đọc) | "Áp dụng cho: cá nhân, hộ kinh doanh · Doanh nghiệp: không khấu trừ" |
| Blocker kích hoạt | Thiếu căn cứ; % phần giữ chỗ của chủ xe nhỏ hơn mức thuế cao nhất |

Trang **Tài chính → Thuế** (`/money`): theo kỳ tháng, tổng GTGT / TNCN, theo chủ thể, xuất CSV kê khai (họ tên, MST/CCCD, doanh thu, GTGT, TNCN), đánh dấu đã kê khai / đã nộp, đảo dòng có lý do.

---

## 9. CHƯA QUYẾT — CẦN TƯ VẤN THUẾ

1. Thuê xe tự lái / dài hạn qua nền tảng là nhóm "dịch vụ" (7%) — đang áp theo Mioto.
2. Phí giao xe `G` (khách trả tay ngoài nền tảng) có tính vào doanh thu khấu trừ không — đang KHÔNG tính.
3. Khoản đền huỷ muộn cho chủ xe có thuộc diện khấu trừ không — đang KHÔNG khấu trừ.
4. Người bán ≤ 01 tỷ/năm (NĐ 141/2026): nền tảng luôn khấu trừ rồi người bán tự đề nghị bù trừ / hoàn (Điều 11 khoản 1, Điều 12 khoản 1 NĐ 68/2026) — đang làm theo cách này; chờ luật sư xác nhận thủ tục cụ thể.
5. Số hiệu mẫu tờ khai, mẫu chứng từ khấu trừ hiện hành sau NĐ 68/2026 + TT 18/2026.

## 10. BACKLOG (CHƯA LÀM)

- Chứng từ khấu trừ thuế điện tử theo năm cho từng chủ xe (PDF, phát hành hàng loạt trước kỳ quyết toán tháng 3–4).
- Giữ yêu cầu rút tiền khi chủ xe cá nhân/hộ chưa khai MST hoặc CCCD.
- Bảng kê đúng mẫu tờ khai hiện hành (khi có số hiệu mẫu).
