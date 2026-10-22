# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ TỔNG THỂ (MASTER BUSINESS SPECIFICATION)
## HỆ THỐNG GÓI THUÊ BAO, CHÍNH SÁCH PHÍ & LUỒNG TIỀN GIAO DỊCH XEPRIME

| Thông tin tài liệu | Chi tiết |
| :--- | :--- |
| **Mã tài liệu** | `SPEC-BUS-01` |
| **Dự án** | XePrime Rental Platform |
| **Phiên bản** | `v3.0.0` (Master Harmonized Release) |
| **Ngày ban hành** | 22/10/2026 |
| **Đối tượng sử dụng** | Product Owner (PO), Business Analyst (BA), Quality Control (QC/Tester), Software Engineers (Dev) |
| **Tài liệu căn cứ** | `docs/financial-system-architecture.md`, ADR 0003, ADR 0024, ADR 0044, ADR 0064, ADR 0065 |

---

## 1. TỔNG QUAN HỆ THỐNG & MỤC TIÊU NGHIỆP VỤ

Tài liệu này đóng vai trò là **Nguồn sự thật duy nhất (Single Source of Truth - SSOT)** quy định toàn bộ quy tắc nghiệp vụ, phân định dữ liệu và luồng vận hành giữa hai phân hệ cốt lõi:
1. **Phân hệ Gói dịch vụ (Shop Subscription Management):** Mô hình SaaS B2B dành cho các đối tác, gian hàng kinh doanh xe chuyên nghiệp.
2. **Phân hệ Chính sách phí & Luồng tiền giao dịch (Marketplace Transaction & Escrow Policy):** Mô hình Take-rate & Ký quỹ giao dịch từng cuốc xe (C2C/B2C).

---

## 2. BẢNG THUẬT NGỮ CHUẨN HOÁ (GLOSSARY)

Để tránh nhầm lẫn giữa BA, QC và Dev, toàn bộ hệ thống thống nhất sử dụng các thuật ngữ sau:

| Thuật ngữ tiếng Việt | Thuật ngữ tiếng Anh | Ký hiệu | Định nghĩa nghiệp vụ |
| :--- | :--- | :---: | :--- |
| **Tiền thuê xe** | Base Rental Amount | $B$ | Tổng tiền thuê sau khi trừ khuyến mãi trực tiếp của xe, **chưa gồm phụ phí giao nhận xe $G$**. |
| **Phí giao nhận xe** | Delivery Fee | $G$ | Phí thỏa thuận giữa chủ xe và khách để giao xe tận nơi. **Trả trực tiếp bằng tiền mặt khi nhận xe**, không qua sàn. |
| **Tiền thuê thuần** | Net Rental Base | $R$ | Cơ sở tính thuế và tiền giữ cọc: $R = B$ (loại trừ $G$). |
| **Phí sàn cố định** | Customer Platform Fee | $S$ | Phí đặt xe cố định mỗi đơn do **khách trả**: $50.000đ$ (ô tô) / $30.000đ$ (xe máy). Cả hai tuyến đều áp dụng. |
| **Hoa hồng chủ xe** | Owner Commission | $H$ | Phần trăm sàn thu của **chủ xe** (trừ vào doanh thu chủ xe, khách không trả). Tuyến hoa hồng tính lũy tiến; Tuyến gói $H = 0$. |
| **Thuế khấu trừ** | Withholding Tax | $T$ | Khấu trừ, nộp thay theo NĐ 117/2025 + NĐ 68/2026 (ADR 0068), mức theo loại dịch vụ giống Mioto: tự lái/dài hạn GTGT 5% + TNCN 2% = **7%**, có tài xế GTGT 3% + TNCN 1,5% = **4,5%**. Chỉ cá nhân/hộ kinh doanh — doanh nghiệp không khấu trừ. Ghi sổ khi chuyến bắt đầu. Không cộng vào tổng khách trả. Chi tiết: `05-owner-tax-withholding-spec.md`. |
| **Bảo hiểm vật chất xe** | Vehicle Protection | $IV$ | Bảo hiểm vật chất thân vỏ (tuỳ chọn, khách trả theo ngày). Hoàn 100% nếu chuyến bị huỷ. |
| **Bảo hiểm tai nạn người** | Personal Accident | $IP$ | Bảo hiểm tai nạn người ngồi trên xe (tuỳ chọn, khách trả theo ngày). Hoàn 100% nếu chuyến bị huỷ. |
| **Tiền giữ chỗ** | Booking Hold Amount | — | Khoản khách chuyển khoản online qua VietQR SePay để xác nhận đặt xe. **Tuyệt đối không gọi là "Cọc" trên UI**. |
| **Cửa sổ co giãn động** | Dynamic Window | — | Khoảng thời gian duyệt, chuyển tiền và huỷ miễn phí co giãn theo khoảng cách tới giờ nhận xe ($\Delta T$). |

---

## 3. PHÂN ĐỊNH RANH GIỚI NGHIỆP VỤ: GÓI DỊCH VỤ VS CHÍNH SÁCH PHÍ

### 3.1. Ma trận so sánh phân quyền & bản chất dữ liệu

```
┌────────────────────────────────────────────────────────────────────────┐
│                        KIẾN TRÚC TÁCH BẠCH                             │
├───────────────────────────────────┬────────────────────────────────────┤
│   TRANG GÓI DỊCH VỤ (/plans)      │   TRANG CHÍNH SÁCH PHÍ (/policies) │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Bản chất: SaaS Subscription B2B │ • Bản chất: Marketplace Take-Rate  │
│ • Đối tượng: Gian hàng, Chủ xe lớn│ • Đối tượng: Toàn bộ giao dịch sàn │
│ • Vòng đời: Linh hoạt (Mutable)   │ • Vòng đời: Bất biến (Immutable)   │
│ • Cơ chế: Bật/tắt, thêm gói mới   │ • Cơ chế: Versioning v6, v7, v8    │
│ • Quản lý: Đội Sales & Marketing  │ • Quản lý: Đội Tài chính & Pháp chế│
│ • Quy tắc: 0% hoa hồng chuyến     │ • Quy tắc: Nấc lũy tiến 10% -> 0%  │
└───────────────────────────────────┴────────────────────────────────────┘
```

| Tiêu chí | Phân hệ Gói dịch vụ (`plans`) | Phân hệ Chính sách phí (`fee_policies`) |
| :--- | :--- | :--- |
| **Mục đích** | Bán quyền hạn quản trị đội xe và hạn mức niêm yết xe trên chợ. | Quy định công thức tính tiền, giữ chỗ, chia sẻ doanh thu trên từng chuyến xe. |
| **Chế độ thu phí** | Thu trước theo chu kỳ (1, 3, 6, 12 tháng) bằng hoá đơn thuê bao. | Thu trên từng giao dịch phát sinh qua cổng thanh toán QR SePay. |
| **Kỷ luật lưu trữ** | Bảng `plans`, `tenant_subscriptions`. Cho phép cập nhật giá bán mới. | Bảng `fee_policies`. Bất biến theo phiên bản (`version`), đóng băng snapshot vào `bookings`. |
| **Xử lý Tuyến mặc định (Basic Owner)** | Chỉ hiển thị dạng **Read-only Card**: Thông báo chủ xe cá nhân tối đa 3 xe được miễn phí thuê bao. | Toàn quyền cấu hình bảng nấc hoa hồng lũy tiến `owner_commission_tiers`. |

### 3.2. Quy tắc xóa bỏ xung đột (Conflict Resolution)
1. **Gỡ bỏ triệt để Ghost Field:** Trường `commissionPercent` trong bảng `plans` bị vô hiệu hóa hoàn toàn trên UI quản trị. Không hiển thị ô nhập phần trăm hoa hồng ở modal tạo/sửa gói.
2. **Loại bỏ nhầm lẫn "Thu 10% của khách":** Toàn bộ văn bản giao diện và file bản dịch i18n (`admin-plans.json`) phải sửa đổi: Khách hàng không bị thu 10% phí dịch vụ. Khách chỉ trả phí sàn $S$ cố định.

---

## 4. NGUYÊN TẮC TOÁN HỌC & BẢO TOÀN DÒNG TIỀN (5 ĐẲNG THỨC BẢO TOÀN)

Mọi phép tính tiền tệ trong hệ thống phải thỏa mãn 5 đẳng thức sau tại mọi thời điểm:

$$\begin{aligned}
\text{(1) Tổng khách trả} &= B + S + IV + IP + G - P \\
\text{(2) Phần chủ xe trong QR (D)} &= \text{grossOnline} - S - H - IV - IP \\
\text{(3) Khách trả tay khi nhận xe} &= (B + S + IV + IP) - \text{grossOnline} + G \\
\text{(4) Thực nhận ví chủ xe khi xong chuyến} &= D - T \\
\text{(5) Chủ xe nhận cho tiền thuê thuần} &= B - H - T
\end{aligned}$$

*Quy tắc bất biến:*
* Tiền **tính ra từ tỷ lệ** (hoa hồng, phần giữ chỗ 15%, GTGT, TNCN) đúng tới **đồng** (`roundVnd`); chỉ khoản **giảm giá theo %** làm tròn LÊN 1.000đ; số **cấu hình** là bội 1.000đ (ADR 0069 — thay quy tắc `roundToThousand` cũ).
* Sàn giữ chỗ $S + H + IV + IP + T$ đảm bảo $D \ge T$, ví chủ xe không bao giờ bị ghi nhận số âm.

