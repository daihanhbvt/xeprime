# ADR 0029 — Giá gói phẳng theo chỗ xe; phụ phí chuyến cộng vào giá KHÁCH trả

Ngày: 04/09/2026 · Trạng thái: **Accepted** · Ghi đè [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) điều 2 và phép kiểm điểm giao · Cụ thể hoá giá pilot của [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md) điều 2

## Bối cảnh

Giá pilot của ADR 0028 ("100.000đ/ô tô/tháng, 40.000đ/xe máy/tháng, tối thiểu 3 tháng") không
tồn tại được cùng mô hình cũ: ADR 0020 buộc phí nền của bậc gói đủ lớn để gói chỉ rẻ hơn tuyến
hoa hồng từ một quy mô đội xe trở lên (kiểm điểm giao `PLAN_INCENTIVE_INVALID`), vì ở mô hình
cũ **chủ xe** là người trả hoa hồng — phí nền thấp nghĩa là mọi chủ xe đều nên mua gói và phễu
"vào cửa miễn phí" chết.

Chủ dự án chốt lại (04/09/2026) một mô hình khác, làm giả định trên hết hiệu lực: **phí theo
chuyến do KHÁCH gánh**, cộng thẳng vào chi phí thuê khi đặt xe, không khấu trừ vào tiền của
chủ xe.

## Quyết định

### 1. Phí theo chuyến nằm ở PHÍA KHÁCH — ghi đè ADR 0020 điều 2

Với booking đi qua nền tảng, báo giá cho khách = giá thuê của chủ xe **+ các dòng phụ phí
chuyến**. Nền tảng ĐƯỢC cộng phụ phí lên giá khách thấy; câu cấm ở ADR 0020 điều 2 hết hiệu lực.

Ràng buộc giữ nguyên từ ADR 0028: breakdown trước khi xác nhận phải đầy đủ, mỗi dòng đúng tên
theo người hưởng, và mọi dòng snapshot vào booking lúc tạo (ADR 0024) — không tính lại theo
policy mới.

### 2. Ba dòng phụ phí, mỗi dòng một cổng bật riêng

| Dòng | Tuyến hoa hồng | Tuyến gói | Điều kiện bật |
| --- | --- | --- | --- |
| Phí dịch vụ XePrime | 10% (policy, admin cấu hình) | **0%** | Bật được ngay |
| Thuế khấu trừ/nộp thay | theo số THẬT | như nhau | Tư vấn thuế chốt phân loại + tỷ lệ |
| Phí bảo hiểm | theo biểu phí THẬT | như nhau | Hợp đồng đối tác + policy + chứng nhận (ADR 0028 điều 5) |

Tổng phụ phí pilot khởi đầu là **10%** (chỉ dòng phí dịch vụ). Con số "khoảng 20%" là ĐÍCH khi
hai cổng còn lại mở — không được đạt tới bằng cách đặt trước một tỷ lệ "thuế + bảo hiểm" chưa
có căn cứ (ADR 0028 điều 2 giữ nguyên hiệu lực). `commissionPercent` của gói tuyến hoa hồng từ
nay đọc là "phí dịch vụ cộng vào giá khách", không phải khoản khấu trừ của chủ xe.

Việc CỘNG các dòng này vào báo giá khách thuộc phạm vi R3 (luồng tiền booking); ADR này chỉ
chốt mô hình để R2 chốt được giá gói.

### 3. Giá gói PHẲNG theo chỗ xe — không phí nền

- **100.000đ/chỗ ô tô/tháng · 40.000đ/chỗ xe máy/tháng** (giá pilot, là DỮ LIỆU của plan —
  admin đổi được, có audit; đổi không hồi tố hoá đơn/gói đã tạo).
- `basePriceMonthly = 0`, không chỗ gồm sẵn: 1 xe = 100k, 2 xe = 200k — đúng nghĩa đen.
- **Kỳ hạn tối thiểu 3 tháng.** Danh sách `limits.terms` của plan từ nay là danh sách kỳ hạn
  ĐƯỢC BÁN của plan đó, không chỉ là bảng giảm giá: mua với kỳ hạn ngoài danh sách bị từ chối.

### 4. Gỡ phép kiểm điểm giao — ghi đè phần "quy tắc trong code" của ADR 0020

Phép kiểm `PLAN_INCENTIVE_INVALID` (phí nền ≥ includedCars × c% × GMV giả định) mô hình hoá
động lực cũ "chủ xe trả hoa hồng nên gói phải đắt hơn ở đội nhỏ". Ở mô hình mới, động lực nâng
cấp là **giá cạnh tranh trên chợ**: xe tuyến hoa hồng gánh phí dịch vụ vào giá khách nên kém
cạnh tranh hơn ~10%; xe tuyến gói thì không. Phễu không còn cần phí nền để sống, nên phép kiểm
bị gỡ khỏi `BillingService`; mã lỗi `PLAN_INCENTIVE_INVALID` nghỉ hưu (giữ khoá cho audit cũ,
không endpoint nào còn ném). `assumedMonthlyGmvJson` thành dữ liệu tham khảo, không bắt buộc.

## Hệ quả

- Seed gói: thêm plan giá phẳng theo chỗ (kỳ hạn 3/6/12); `standard`/`pro` chuyển `archived`
  (giữ hàng cho subscription cũ); gian hàng demo tuyến gói chuyển sang plan mới.
- Purchase (tenant tự mua) kiểm kỳ hạn theo `limits.terms`; admin gán tay vẫn linh hoạt (có audit).
- Hoá đơn CHÀO gói khi hết lượt miễn phí (worker) phải dựng theo giá chỗ × đội xe hiện có và
  kỳ hạn nhỏ nhất được bán — bản cũ chỉ nhân phí nền × 1 tháng, ra hoá đơn 0đ vô nghĩa.
- R3 phải dựng: policy phụ phí có phiên bản + ngày hiệu lực, snapshot vào booking, breakdown
  cho khách và net-earning cho chủ xe.

## Xem lại khi nào

- Sau pilot giá 100k/40k (đo conversion và tỷ lệ nâng cấp) — như ADR 0028 đã hẹn.
- Khi tư vấn thuế hoặc hợp đồng bảo hiểm chốt số thật (mở dòng 2/3, tổng phụ phí đổi).
- Nếu phụ phí phía khách làm lệch giá chợ tới mức chủ xe tuyến hoa hồng mất hẳn đơn — dấu hiệu
  phải cân lại tỷ lệ phí dịch vụ.
