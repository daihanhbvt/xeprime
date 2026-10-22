# ADR 0069 — Tiền tính ra phải ĐÚNG tới đồng; bước 1.000đ chỉ dành cho số cấu hình và khoản giảm giá

Ngày: 22/10/2026 · Trạng thái: **Accepted** · Ghi đè một phần: [0064](0064-financial-flow-v2.md) điều 1 (câu "Mọi số tiền XePrime tính ra là bội của 1.000đ qua `roundToThousand`"), điều 3 (làm tròn `H` tới 1.000đ), điều 4 (làm tròn `T`); [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 1 (`roundToThousand(15% × B)`); [0046](0046-platform-funded-promo-codes.md) (mã làm tròn XUỐNG) · Liên quan: [0068](0068-platform-tax-withholding-nd117-nd68.md)

## Bối cảnh

ADR 0064 làm tròn MỌI số tiền tỷ lệ tới 1.000đ (nửa bước lên) để mã QR "đẹp". Hệ quả là số tiền
không còn đúng với tỷ lệ đã công bố:

- Thuế: 7% × 780.000đ = 54.600đ, hệ thống ghi 55.000đ — **khấu trừ thừa** 400đ, sai với số phải nộp
  ngân sách (NĐ 117/2025 tính trên tỷ lệ × doanh thu).
- Hoa hồng 10% × 585.000đ = 58.500đ thành 59.000đ — chủ xe bị thu quá 500đ so với biểu phí.
- Phần giữ chỗ 15% × 585.000đ = 87.750đ thành 88.000đ — khách trả trước nhiều hơn chính sách.
- Khuyến mãi trực tiếp 10% × 652.000đ = 65.200đ thành 65.000đ — khách được giảm ÍT hơn % quảng cáo.

Chủ sản phẩm chốt (22/10/2026): tiền phải đúng thật; số lẻ được hạn chế bằng CHÍNH SÁCH (giá cấu
hình tròn, khoản giảm giá), không bằng làm tròn kết quả.

## Quyết định

### 1. Khoản TÍNH RA từ tỷ lệ: đúng tới đồng

`roundVnd(x)` = làm tròn tới **1 đồng** (nửa đồng lên) — VND không có đơn vị nhỏ hơn. Áp cho:

| Khoản | Trước | Nay |
| --- | --- | --- |
| Hoa hồng lũy tiến `H` | tròn 1.000đ | `roundVnd(Σ giá ngày × % nấc)` — làm tròn MỘT lần trên tổng |
| Phần giữ chỗ của chủ xe `D_target` | tròn 1.000đ | `roundVnd(depositPercent% × B)` |
| Thuế `T` | tròn 1.000đ, một mức | `roundVnd(GTGT% × B) + roundVnd(TNCN% × B)` — mỗi sắc thuế làm tròn riêng (ADR 0068) |
| Phí giao xe theo km (ước tính) | tròn 1.000đ | `roundVnd(perKm × km)` |

Tiền giữ chỗ, phần trả khi nhận xe, tiền vào ví và các phép chia khi huỷ là phép cộng/trừ của các
khoản trên nên tự đúng tới đồng. Mã QR có thể mang số lẻ (ví dụ 196.750đ) — SePay đối soát theo đúng
số tiền, không cần số tròn.

### 2. Khoản GIẢM GIÁ theo %: làm tròn LÊN tới 1.000đ, rồi mới kẹp trần

Giảm giá là chính sách thương mại, được phép "hạn chế lẻ" — nhưng theo hướng có lợi cho khách:

- Khuyến mãi trực tiếp của xe (`discountPercent`), ưu đãi cam kết thời hạn của thuê dài hạn và mã
  khuyến mãi nền tảng theo %: `ceilToThousand(% × cơ sở)` — khách **không bao giờ** được giảm ít hơn %
  đã công bố.
- Sau đó kẹp bởi các trần sẵn có (trần của mã, trần tài trợ `D + S + H`, `grossOnline − holdMinAmount`,
  không vượt chính cơ sở). Trần thấp hơn thì lấy đúng trần — có thể lẻ, nhưng đúng.
- Mã giảm số tiền cố định giữ nguyên số admin nhập.

### 3. Số CẤU HÌNH vẫn là bội 1.000đ

Phí sàn `S`, biểu phí bảo hiểm theo ngày, `holdMinAmount`, `depositMinAmount`, giá gói, danh mục sản
phẩm bảo hiểm: giữ CHECK/validator bội 1.000đ. Đây là nơi chính sách hạn chế lẻ, và nó không làm sai
một con số nào vì không có phép chia.

### 4. Không tính lại đơn cũ

Hold/đơn tạo trước thay đổi giữ snapshot cũ (ADR 0024). Chỉ báo giá mới và lượt duyệt mới tính theo
quy tắc này.

## Hệ quả

- `packages/types`: thêm `roundVnd`, `ceilToThousand`; bỏ `roundToThousand` khỏi mọi phép tính tiền
  (giữ hàm cho dữ liệu cũ nếu cần đọc); `floorToThousand` của mã khuyến mãi đổi thành làm tròn lên
  rồi kẹp trần.
- `apps/api` pricing: `roundDecimalToThousand` của khuyến mãi trực tiếp/ưu đãi dài hạn đổi sang làm
  tròn LÊN.
- Test, ví dụ trong tài liệu (`financial-system-architecture.md`, đặc tả 01–04) cập nhật số.
