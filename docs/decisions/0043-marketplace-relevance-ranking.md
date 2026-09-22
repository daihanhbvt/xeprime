# ADR 0043 — Xếp hạng "phù hợp" cho chợ xe: điểm denormalize + ưu tiên địa lý ở trang chủ

Ngày: 22/09/2026 · Trạng thái: **Accepted** · Mở rộng [ADR 0008](0008-public-listing-snapshot.md)
(thêm một cột dẫn xuất trên `public_listings`), không ghi đè ADR nào

> ⚠️ **Cập nhật 22/09/2026 — [ADR 0045](0045-host-cancellation-and-reputation.md) điều 5** thêm
> HAI thành phần vào công thức (uy tín chủ xe · cửa sổ khám phá) và cân lại bốn trọng số cũ. Bảng
> ở điều 2 dưới đây đã được cập nhật theo. ADR 0045 cũng chuyển sort MẶC ĐỊNH của trang kết quả
> sang chính `rank_score` này — trước đó chỉ trang chủ dùng nó.

## Bối cảnh

Thứ tự mặc định của chợ (`sort=recommended`) từ đầu tới nay là:

```sql
ORDER BY rating_avg DESC NULLS LAST, rating_count DESC, created_at DESC
```

Ba vấn đề, và cả ba đều quan sát được trên dữ liệu thật chứ không phải lo xa:

1. **Trung bình trần không phân biệt "tốt" với "chưa ai chấm".** Một xe 5,0 sao có ĐÚNG MỘT đánh
   giá đứng trên một xe 4,8 sao có hai trăm đánh giá. Trên dữ liệu demo, nơi gần như xe nào cũng
   5,0, "gợi ý" trên thực tế đã suy biến thành "mới đăng nhất".
2. **Không có yếu tố ĐỊA LÝ nào trong xếp hạng.** Khách đứng ở Hà Nội và khách đứng ở Cà Mau thấy
   đúng một danh sách, trong khi việc họ sắp làm là ra tận nơi nhận xe. Báo cáo mở đầu cho ADR
   này là một ảnh chụp trang chủ: viên địa điểm ghi "Hà Nội", còn khối xe bên dưới mở đầu bằng
   An Giang, Bắc Ninh, Đồng Nai, Quảng Ninh.
3. **Hồ sơ đầy hay rỗng không ảnh hưởng gì.** Một xe một ảnh, không tiện ích xếp ngang một xe
   khai đủ — trong khi cái sau là thứ khách đặt được còn cái trước thì không.

Vế địa lý còn có một nguyên nhân riêng ở tầng web: tỉnh khách chọn lượt trước được khôi phục vào
thẻ tìm kiếm nhưng **cố ý** không ghi vào URL (nếu ghi thì nó thành một bộ lọc cứng mà khách chưa
hề bấm, và xe biến mất). Khối "Xe khả dụng" chỉ đọc URL, nên nó không bao giờ nhìn thấy "Hà Nội".

## Quyết định

### 1. Điểm xếp hạng là một cột DẪN XUẤT trên `public_listings`

`rank_score DOUBLE PRECISION NOT NULL DEFAULT 0`, giá trị trong `[0,1]`, giữ phần điểm **không phụ
thuộc truy vấn**. Nguồn ghi DUY NHẤT là `refreshListingRankScore` ở `@xeprime/prisma` — cùng kỷ
luật một-writer của ADR 0008 §1, và ở package dùng chung vì có HAI tiến trình phải nói cùng một
công thức (API cập nhật theo sự kiện, worker quét lại theo đồng hồ).

Denormalize chứ không tính trong `ORDER BY`: công thức cần đếm chuyến đã hoàn thành và đếm ảnh của
từng xe, tức hai phép gộp cho MỖI dòng của MỖI lượt mở trang chủ.

### 2. Sáu thành phần, trọng số cộng lại bằng 1

| Thành phần | Trọng số | Công thức |
| --- | --- | --- |
| Chất lượng | 0,40 | Trung bình **Bayes** `(v·R + m·C)/(v + m)` với `C = 4,6` (mặt bằng sàn), `m = 5`, rồi đưa thang 1–5 về `[0,1]` |
| Số chuyến đã chạy | 0,22 | `ln(1 + chuyến) / ln(51)`, kẹp 1 |
| Độ đầy hồ sơ | 0,16 | Tỉ lệ thoả của 4 điều kiện đếm được: có ảnh chính · có giá ngày · ≥ 4 ảnh · ≥ 3 tiện ích |
| Độ mới | 0,10 | `exp(−ngày/30)` |
| **Uy tín chủ xe** (0045) | 0,07 | `(giữ + w·p)/(mẫu + w)` với `p = 0,8`, `w = 5` trên cửa sổ chỉ số 90 ngày |
| **Khám phá** (0045) | 0,05 | `exp(−ngày/30)` — CHỈ khi chưa có chuyến nào VÀ hồ sơ đủ cả 4 điều kiện |

Bayes là vế chữa vấn đề (1): xe ít đánh giá bị kéo về mặt bằng chung thay vì được coi là hoàn hảo.
Độ mới có mặt để xe vừa lên sàn còn cơ hội có đánh giá đầu tiên — thiếu nó thì "chưa ai thuê" là
một cái bẫy tự khoá.

Hai vế thêm ở ADR 0045 đều có trần nhỏ có chủ đích. **Uy tín** là tín hiệu ĐIỀU CHỈNH: chênh lệch
tối đa giữa một chủ xe hoàn hảo và một chủ xe huỷ mọi chuyến là 0,07 điểm — đủ đổi thứ tự trong
một nhóm ngang tài, không đủ chôn ai vì vài mẫu. **Khám phá** chỉ cộng cho xe đã khai đủ hồ sơ,
chưa từng chạy chuyến nào, và còn trong cửa sổ 30 ngày; nó không phải quà cho mọi xe mới, và nó
đóng lại sau một tháng dù có đơn hay không.

Phép phân loại mẫu của vế uy tín **trùng khít** `HostMetricsService` (ADR 0045 điều 3): con số
khách nhìn thấy và con số quyết định thứ hạng phải nói cùng một điều về cùng một người bán.

### 3. Địa lý là BẬC lúc ĐỌC, không nằm trong cột

Nó khác nhau theo từng người xem nên không lưu được. Lúc đọc:

```
geo_tier = 2 nếu đúng tỉnh · 1 nếu cùng vùng · 0 nếu còn lại
ORDER BY geo_tier DESC, rank_score DESC, created_at DESC
```

Bậc chứ không phải điểm cộng: một chiếc xe xuất sắc cách 1.500km không phải là một gợi ý tốt hơn
một chiếc xe khá ở cùng thành phố. Vùng đọc từ bản đồ ba miền ở `@xeprime/types`
(`provinceRegion`), không phải khoảng cách thật — `public_listings` không snapshot toạ độ, và ba
bậc thô đã mua được phần lớn lợi ích với chi phí bằng không.

### 4. Ở TRANG CHỦ, tỉnh là ƯU TIÊN; ở trang kết quả, tỉnh là BỘ LỌC

Hai câu hỏi khác nhau nên đi hai endpoint khác nhau:

- `GET /public/listings` giữ nguyên: `provinceCode` lọc cứng, rỗng là câu trả lời hợp lệ.
- `GET /public/listings/recommended` (mới): `nearProvinceCode` **chỉ đổi thứ tự**, không loại ai.

Tên tham số khác nhau là có chủ đích — đó là thứ ngăn người đọc sau này hiểu nhầm một cái thành
cái kia. Trang chủ lấy `nearProvinceCode` từ URL, và khi URL không nói gì thì lấy từ lựa chọn lượt
trước (`localStorage`). Dùng bộ nhớ ở đây an toàn đúng vì nó không lọc: không xe nào biến mất.

Khi khối phải bù xe ngoài tỉnh được ưu tiên, `meta.mixedProvinces = true` và giao diện **nói ra**
("Ưu tiên xe ở Hà Nội — chưa đủ nên có thêm xe tỉnh khác"). Hứa một điều mà danh sách không giữ
là cách nhanh nhất để mất lòng tin vào cả trang.

### 5. Trần 2 xe mỗi gian hàng là khoá SẮP XẾP, không phải bộ lọc

Không có trần thì một gian hàng 40 xe chiếm trọn tám ô và trang chủ thành mặt tiền của đúng một
người bán. Nhưng lọc thẳng sẽ trả về ít hơn số ô cần lấp ở một sàn mới có vài gian hàng — đúng lúc
trang chủ cần trông có hàng nhất. Nên phần vượt trần bị đẩy xuống CUỐI thay vì bị loại.

### 6. Xe của gian hàng trả gói KHÔNG được cộng điểm — chưa phải bây giờ

ADR 0028 cho phép ưu tiên xe thuê bao trong nhóm kết quả tương đương, **kèm điều kiện gắn nhãn vị
trí tài trợ**. Chừng nào giao diện chưa có nhãn đó, thêm vế này vào công thức là bán một vị trí
quảng cáo mà không nói với người xem. Nó vắng mặt có chủ đích, không phải bị quên.

## Hệ quả

- **Migration** `20260922120000_listing_rank_score`: cột + hai index `(status, province_code,
  rank_score)` / `(status, rank_score)` + một lượt nạp giá trị ban đầu (bản sao ĐÔNG LẠNH của công
  thức — nó là lịch sử, không sửa theo công thức tương lai).
- **Đường cập nhật theo sự kiện**: `ListingsService.syncFromVehicle` và `refreshRating` gọi
  `refreshListingRankScore({ vehicleId })` trong chính transaction của chúng.
- **Nhịp đồng hồ**: worker `listing-rank-refresh` chạy 6 giờ một lần. Cần vì hai thành phần không
  có sự kiện nào báo: độ mới phai theo thời gian thật, và số chuyến hoàn thành đổi ở module
  booking — nối thêm lời gọi ở đó sẽ là writer thứ hai cho cùng một cột.
- **Seed** gọi hàm này ở cuối, nếu không một database vừa seed xong sẽ xếp trang chủ theo thứ tự
  ngẫu nhiên của `created_at` và mọi lần kiểm thử xếp hạng đều nói dối.
- Chi phí mỗi lượt đọc trang chủ: một truy vấn xếp hạng có trần 200 ứng viên + một truy vấn
  hydrate theo id + một `count`. Không phép gộp nào chạy lúc đọc.

## Điều kiện xem lại

1. **Khi sàn có đủ đánh giá thật**: đặt lại `C` (`RANK_SCORE_BAYES.priorRating`) bằng trung bình
   ĐO ĐƯỢC thay vì con số ước lượng 4,6, và cân lại `m`.
2. **Khi giao diện có nhãn vị trí tài trợ**: mở lại điều 6.
3. **Khi `public_listings` có toạ độ**: thay ba bậc vùng bằng khoảng cách thật, ít nhất cho các
   thành phố lớn nơi "cùng tỉnh" vẫn là hai chục cây số.
4. **Khi có số liệu hành vi** (lượt xem → lượt gửi yêu cầu): cân lại SÁU trọng số bằng dữ liệu
   thay vì bằng phán đoán. Sáu con số ở điều 2 là điểm xuất phát có lý do, không phải kết quả đo.
5. **Khi có dữ liệu impression thật**: thay cửa sổ khám phá 30 ngày bằng một trần SỐ LƯỢT HIỂN
   THỊ (ADR 0045). Cửa sổ thời gian là một xấp xỉ được chọn vì chưa đo được lượt nhìn — nó là một
   giả định được ghi ra, không phải một sự thật.
