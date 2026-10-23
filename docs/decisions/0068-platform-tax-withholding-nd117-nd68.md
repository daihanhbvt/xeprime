# ADR 0068 — Khấu trừ, nộp thay thuế cho chủ xe theo Nghị định 117/2025 và 68/2026; bảng "cộng ví chủ xe" ở phía đối tác

Ngày: 22/10/2026 · Trạng thái: **Accepted** (chủ sản phẩm chốt 22/10/2026: mức khấu trừ làm giống Mioto — tự lái/dài hạn 7%, có tài xế 4,5%) — các câu hỏi ở mục "Chưa quyết" vẫn cần văn bản tư vấn thuế trước khi mở release gate ADR 0028 mục 2 · Ghi đè một phần: [0064](0064-financial-flow-v2.md) điều 4 (một mức 10% "VAT 5% + TNCN 5%" cho mọi chuyến, cả hai tuyến) · Làm tròn: [0069](0069-money-rounding-exact-vnd.md) · Liên quan: 0028 điều 3–4 + release gate, 0032 điều 3, 0033, 0036, 0059, 0066 điều 2

## Bối cảnh

Hiện trạng code (22/10/2026):

- `fee_policies` mang MỘT mức `tax_percent` (10%, nhãn "VAT 5% + TNCN 5%") áp cho mọi chuyến, mọi chủ thể, cả hai tuyến; cơ sở `R = B − G`; làm tròn 1.000đ.
- Sổ `tax_withholdings` ghi một dòng khi đơn sang `active`, kỳ theo tháng, `accrued → declared → remitted`, đảo tay; trang admin "Thuế" theo kỳ + xuất CSV; chủ xe có thẻ "Thuế đã khấu trừ" theo tháng.
- `seller_profiles` đã có `entity_type` (cá nhân / hộ kinh doanh / doanh nghiệp), `tax_id`, số CCCD — nhưng phép tính thuế không đọc chúng.
- Không có: tách GTGT/TNCN, mức theo loại dịch vụ, miễn khấu trừ cho doanh nghiệp, chứng từ khấu trừ, văn bản "Chính sách thuế" cho chủ xe, bảng "cộng ví" có giải thích ở phía đối tác.

Căn cứ pháp lý đã đọc (cần tư vấn thuế xác nhận trước khi chốt số):

1. **Nghị định 117/2025/NĐ-CP** (hiệu lực 01/07/2025): tổ chức quản lý sàn TMĐT / nền tảng số **có chức năng thanh toán** phải khấu trừ, kê khai, nộp thay thuế GTGT và TNCN cho **hộ, cá nhân** kinh doanh trên nền tảng; khấu trừ ngay khi giao dịch thành công và chấp nhận thanh toán; giao dịch huỷ/trả thì bù trừ số đã khấu trừ; kê khai theo tháng; cấp chứng từ khấu trừ điện tử theo năm; người bán phải cung cấp MST hoặc số định danh cá nhân. Tỷ lệ trên doanh thu:

   | Nhóm | GTGT | TNCN cư trú | TNCN không cư trú |
   | --- | --- | --- | --- |
   | Hàng hoá | 1% | 0,5% | 1% |
   | **Dịch vụ** | **5%** | **2%** | 5% |
   | **Vận tải**, dịch vụ gắn hàng hoá | **3%** | **1,5%** | 2% |
   | Không xác định được nhóm | mức cao nhất | mức cao nhất | mức cao nhất |

2. **Nghị định 68/2026/NĐ-CP** (hiệu lực 05/03/2026): hộ, cá nhân doanh thu ≤ **500 triệu đồng/năm** không thuộc diện nộp GTGT, TNCN; nền tảng có chức năng đặt hàng + thanh toán vẫn khấu trừ, khai thay, nộp thay **theo từng giao dịch**; số TNCN nền tảng đã nộp thay được trừ khi người bán quyết toán. Văn bản không nói nền tảng ngừng khấu trừ với người dưới ngưỡng — việc hoàn/bù là giữa người bán và cơ quan thuế.

3. Thực tiễn thị trường: Mioto áp **7%** (5% GTGT + 2% TNCN) cho thuê xe tự lái và **4,5%** cho xe có tài xế, trừ vào ví chủ xe, gửi chứng từ khấu trừ trước kỳ quyết toán tháng 4. Mức 10% đang cấu hình của XePrime là tỷ lệ Thông tư 40/2021 cho "cho thuê tài sản" khi cá nhân TỰ khai — không phải tỷ lệ khấu trừ của nền tảng.

## Quyết định đề xuất

### 1. Mức khấu trừ theo LOẠI DỊCH VỤ, tách GTGT và TNCN, là dữ liệu chính sách phí

`fee_policies` thay `tax_percent` một cột bằng một bảng mức (jsonb có schema, có phiên bản như mọi số khác):

| Loại dịch vụ của đơn | Nhóm theo NĐ 117 | GTGT | TNCN | Cộng |
| --- | --- | --- | --- | --- |
| `self_drive` (tự lái) | Dịch vụ | 5% | 2% | **7%** |
| `long_term` (thuê dài hạn) | Dịch vụ | 5% | 2% | **7%** |
| `with_driver` (có tài xế) | Vận tải | 3% | 1,5% | **4,5%** |

Kèm `tax_legal_basis` (chuỗi bắt buộc khi bật, ví dụ "NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP") thay cho `tax_label`. Đổi mức = phát hành phiên bản chính sách mới (ADR 0024). Phân loại "thuê xe tự lái = dịch vụ" là điều **tư vấn thuế phải xác nhận** trước khi bật ở production.

### 2. Chỉ khấu trừ cho HỘ và CÁ NHÂN — doanh nghiệp không bị khấu trừ

Chủ thể đọc từ `seller_profiles.entity_type`, chụp vào đơn lúc NHẬN chuyến (ADR 0024):

- `individual`, `household_business` ⇒ khấu trừ theo bảng điều 1.
- `company` ⇒ **T = 0**: doanh nghiệp tự xuất hoá đơn và tự kê khai (ADR 0059). Đây là thay đổi so với hiện trạng, vốn khấu trừ 10% cả gian hàng là doanh nghiệp.
- Chưa có hồ sơ người bán ⇒ coi là **cá nhân** (khấu trừ), không bao giờ coi là doanh nghiệp: thiếu dữ liệu không được làm mất nghĩa vụ.
- Chỉ hồ sơ `company` ở trạng thái **đã xác minh** mới được miễn. Hồ sơ nháp/đã nộp/bị trả về ⇒ khấu trừ như cá nhân (hồ sơ nháp của gian hàng mặc định là `company` — tin ngay nó là cho ai cũng tự khai để thoát thuế).
- Hồ sơ đã xác minh mà đổi loại chủ thể, MST hoặc số CCCD ⇒ tự quay về **đã nộp** (chờ xác minh lại) và ghi audit; trong lúc chờ, chuyến mới khấu trừ như cá nhân.
- Tuyến (hoa hồng / gói) **không** quyết định thuế — chủ thể mới quyết định.

### 3. Cơ sở, làm tròn, thời điểm

- Cơ sở = tiền thuê `B` (đã trừ khuyến mãi trực tiếp, không gồm `G`, `S`, `IV`, `IP`) — giữ ADR 0064 điều 4. Tư vấn thuế xác nhận việc loại `G` (khách trả tay ngoài nền tảng).
- GTGT và TNCN tính **riêng**, mỗi khoản làm tròn tới **đồng** (`roundVnd`, ADR 0069): đây là số nộp ngân sách, phải khớp tỷ lệ × doanh thu. Ví dụ 780.000đ tự lái ⇒ GTGT 39.000 + TNCN 15.600 = **54.600đ** (khớp Mioto).
- Sàn `D ≥ T` giữ nguyên (CHECK `deposit_percent ≥` mức thuế cao nhất của bảng).
- Ghi sổ khi đơn sang `active` như hiện nay; huỷ trước chuyến không phát sinh; thay đổi giá sau khi đã ghi sổ ⇒ dòng đảo + dòng mới (bù trừ theo NĐ 117), không sửa dòng cũ.
- Khoản đền huỷ muộn cho chủ xe (`D`, ADR 0066 điều 2) **không** khấu trừ — là bồi thường, không phải doanh thu dịch vụ. Tư vấn thuế xác nhận.

### 4. Sổ thuế, kê khai, chứng từ

- `tax_withholdings` thêm `vat_amount`, `pit_amount`, `vat_percent`, `pit_percent`, `service_category` (`service` | `transport`), `entity_type` và định danh chụp lúc ghi sổ (MST hoặc số CCCD, họ tên). `amount` = tổng hai cột (CHECK).
- Kê khai theo **tháng**: trang "Thuế" của admin xuất bảng kê đủ cột tờ khai (họ tên, MST/CCCD, doanh thu, GTGT, TNCN theo từng người bán) bên cạnh CSV chi tiết hiện có.
- **Chứng từ khấu trừ thuế** điện tử theo **năm** cho từng chủ xe (mẫu 01/CTKT-TMĐT): admin phát hành theo năm; chủ xe tải PDF ở trang Thuế của mình; worker phát hành hàng loạt trước kỳ quyết toán (tháng 3).
- Định danh: chủ xe là cá nhân/hộ phải có **MST hoặc số CCCD đã kê khai** trong hồ sơ người bán trước lần **rút tiền** đầu tiên (không chặn duyệt chuyến — nghĩa vụ khấu trừ vẫn chạy). Thiếu ⇒ yêu cầu rút bị giữ kèm lời nhắc bổ sung.

### 5. Bảng "cộng ví chủ xe" ở phía đối tác (chỉ đối tác + admin — ADR 0064 điều 11)

Dùng cùng một khối ở hộp duyệt yêu cầu, chi tiết đơn, và dòng sao kê ví:

| Dòng | Giá trị | Giải thích (dấu "i") |
| --- | --- | --- |
| Đơn giá thuê × Số ngày | `B / ngày` × N | — |
| Doanh thu cho thuê xe | `B` | Sau khuyến mãi của xe; không gồm phí giao xe |
| **Phí dịch vụ – Chủ xe** | `−H` | Chỉ tuyến hoa hồng: % lũy tiến theo ngày (10% ngày 1–2 · 7% ngày 3–7 · 3% ngày 8–30 · 0% từ ngày 31, theo chính sách đang áp dụng). Tuyến gói: 0đ, ẩn dòng. Liệt kê XePrime làm gì cho khoản này |
| **Thuế khấu trừ (GTGT x% + TNCN y%)** | `−T` | Căn cứ NĐ 117/2025, 68/2026; mức theo loại dịch vụ; doanh nghiệp không bị khấu trừ; dưới 500 triệu/năm thì người bán liên hệ cơ quan thuế để hoàn; link "Chính sách thuế" |
| **Thu nhập chủ xe (a)** | `B − H − T` | |
| Khách thanh toán trực tiếp (b) | phần tiền thuê khách trả tay | Không gồm phí giao xe |
| **Số tiền cộng ví (a − b)** | `D − T` | Ghi có khi chuyến hoàn thành |

- Đổi nhãn "Hoa hồng XePrime" phía đối tác thành **"Phí dịch vụ – Chủ xe"**; phía KHÁCH đổi "Phí dịch vụ XePrime" (`S`) thành **"Phí đặt xe"** để hai khoản không trùng tên.
- Sửa hai chỗ lệch hiện có của sao kê ví: "khách trả trực tiếp" đang là `B − D` (thiếu `H`) và "thu nhập chủ xe" đang dùng `B` gồm phí giao xe — cả hai phải đọc đúng các dòng snapshot.

### 6. Văn bản "Chính sách thuế" cho đối tác

Thêm văn bản pháp lý thứ năm `owner-tax` (`/legal/owner-tax`, chung ngày hiệu lực `LEGAL_EFFECTIVE_FROM`): căn cứ, bảng mức, ai bị khấu trừ, cơ sở, thời điểm, bù trừ khi huỷ, chứng từ năm, nghĩa vụ cung cấp MST/CCCD, quyền đề nghị hoàn của người dưới ngưỡng. Dấu "i" của dòng thuế dẫn tới đây.

### 7. Cấu hình ở admin (form chính sách phí)

Mục "Thuế khấu trừ" thay ô `% thuế` + nhãn bằng:
- Công tắc bật khấu trừ; ô "Căn cứ pháp lý" (bắt buộc khi bật).
- Bảng ba dòng `self_drive` / `long_term` / `with_driver` × (GTGT %, TNCN %), cột tổng tự tính.
- Dòng chỉ-đọc "Áp dụng cho: cá nhân, hộ kinh doanh · Doanh nghiệp: không khấu trừ".
- Blocker kích hoạt: thiếu căn cứ; mức vượt trần hợp lệ; `deposit_percent` < mức thuế cao nhất.

## Chưa quyết — cần tư vấn thuế trước khi bật production

1. Thuê xe tự lái / dài hạn qua nền tảng là "dịch vụ" (5% + 2%) hay áp tỷ lệ "cho thuê tài sản".
2. Có tính phí giao xe `G` (trả tay ngoài nền tảng) vào doanh thu khấu trừ không.
3. Khoản đền huỷ muộn có thuộc diện khấu trừ không.
4. Người bán ≤ 500 triệu/năm (NĐ 68/2026): nền tảng có được ngừng khấu trừ khi người bán chứng minh không thuộc diện không, hay luôn khấu trừ rồi người bán tự đề nghị hoàn.
5. Mẫu tờ khai và mẫu chứng từ đúng số hiệu hiện hành sau NĐ 68/2026 và Thông tư 18/2026/TT-BTC.

## Hệ quả

- Migration: chính sách phí v9 (bảng mức theo dịch vụ, căn cứ), cột GTGT/TNCN/chủ thể trên `tax_withholdings`, `bookings` chụp chủ thể + mức; `computeCustomerFees` nhận `serviceType` + `sellerEntityType`.
- Contract: DTO duyệt yêu cầu / chi tiết đơn / sao kê thêm `unitAmount`, `rentalDays`, `revenueAmount`, `vatAmount`, `pitAmount`, `taxRateLabel`; sửa CẢ HAI bản gọi API (web + mobile, ADR 0031).
- Màn hình: hộp duyệt yêu cầu, chi tiết đơn, sao kê ví, trang Thuế của đối tác (chứng từ năm), form + chi tiết chính sách phí, trang Thuế của admin (bảng kê tháng, phát hành chứng từ), hồ sơ người bán (nhắc MST/CCCD), văn bản `owner-tax`.
- Release gate ADR 0028 mục 2 vẫn đóng cho tới khi có văn bản tư vấn thuế; trước đó production giữ khấu trừ ở mức đã duyệt và gắn nhãn tạm.

## Phạm vi triển khai đợt 22/10/2026

**Làm ngay:** điều 1 (bảng mức theo loại dịch vụ, tách GTGT/TNCN, chính sách phí v9), điều 2 (doanh nghiệp không khấu trừ; thiếu hồ sơ ⇒ coi là cá nhân), điều 3 (cơ sở `B`, làm tròn tới đồng, ghi sổ khi `active`), điều 4 phần sổ thuế (cột GTGT/TNCN/chủ thể/định danh + CSV kê khai có hai cột thuế), điều 5 (bảng cộng ví ở hộp duyệt, chi tiết đơn, sao kê ví; đổi nhãn "Phí dịch vụ – Chủ xe" / "Phí đặt xe"; sửa hai chỗ lệch của sao kê), điều 6 (văn bản `owner-tax`), điều 7 (form admin).

**Làm sau (backlog, chưa có ngày):** chứng từ khấu trừ năm (PDF, phát hành hàng loạt), giữ yêu cầu rút tiền khi thiếu MST/CCCD, bảng kê đúng mẫu tờ khai hiện hành — cả ba chờ số hiệu mẫu sau NĐ 68/2026 + TT 18/2026.
