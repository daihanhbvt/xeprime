# ADR 0035 — Địa chỉ vật lý theo danh mục hành chính HAI CẤP

Ngày: 14/09/2026 · Trạng thái: Accepted

Liên quan: [ADR 0018](0018-map-delivery-distance.md) (bản đồ là ước lượng; khoá server không bao
giờ ra client), [ADR 0008](0008-public-listings-sync.md) (`ListingsService` là writer duy nhất của
snapshot công khai), [ADR 0006](0006-booking-concurrency.md) (bất biến nằm ở constraint DB, không
ở tầng app), [ADR 0012](0012-i18n-shared-url-cookie-locale.md) (mã là dữ liệu, chỉ nhãn mới dịch),
[ADR 0031](0031-split-feature-api-per-app.md) (mỗi app một tầng gọi API).

## Bối cảnh

Hệ thống đã có danh mục **cấp tỉnh**: 34 đơn vị trong `packages/types/src/province.ts`, bảng
`provinces`, endpoint `GET /provinces`, và bảng bí danh quy tên cũ về mã chuẩn. Đó là nửa trên.

Nửa dưới thì không có. Mọi ô địa chỉ còn lại — chi nhánh, đăng ký gian hàng, địa chỉ đón khách,
địa chỉ giao xe, sổ khách — là **một ô chữ tự do 500 ký tự**. Hệ quả đo được:

* **Không lọc được theo khu vực nhỏ hơn tỉnh.** "Xe ở gần tôi" dừng ở mức tỉnh, mà TP.HCM có
  168 đơn vị cấp xã.
* **Không đối chiếu được hai địa chỉ.** `"Q.1, TPHCM"`, `"Quận 1, TP. Hồ Chí Minh"` và
  `"quan 1 tphcm"` là ba chuỗi khác nhau với cùng một chỗ.
* **Địa chỉ TRÔI khỏi thực tế.** Từ 01/07/2025 Việt Nam chạy mô hình hành chính **hai cấp**:
  tỉnh/thành → xã/phường/đặc khu. Cấp huyện/quận đã bỏ. Mọi địa chỉ tự do đang lưu viết theo
  địa danh của mô hình cũ, và mỗi ngày trôi qua là thêm một bản ghi nữa viết như vậy.
* **Toạ độ do máy đoán, không ai kiểm.** `BranchesService` geocode chuỗi địa chỉ lúc lưu. Toạ độ
  đó là điểm xuất phát của **mọi phép tính phí giao xe tận nơi** (ADR 0018), nhưng người khai
  địa chỉ chưa bao giờ được nhìn thấy nó để nói "sai chỗ rồi".

Dữ liệu của Google Maps còn đầy tên đơn vị hành chính TRƯỚC sắp xếp, nên "để Google lo" không
giải được bài này — nó chỉ dời chỗ sai sang một nguồn khác.

## Quyết định

### 1. Danh mục cấp xã là **dữ liệu của nhà nước**, nạp bằng migration

Bảng `wards`: 3.321 đơn vị (13 đặc khu · 697 phường · 2.611 xã), mã 5 chữ số, mỗi dòng trỏ tới
một mã tỉnh. Nạp bằng **migration**, không phải seed demo — cùng lý do với `provinces`: mọi môi
trường phải có danh mục ngay sau deploy, không phụ thuộc ai chạy seed.

Bản soạn là `prisma/data/ward-catalog.json`, tải bằng `prisma/scripts/fetch-ward-catalog.ts` từ
cổng tra cứu đơn vị hành chính của **Bộ Nông nghiệp và Môi trường — NXB Tài nguyên Môi trường và
Bản đồ Việt Nam** (`sapnhap.bando.com.vn`), công bố đúng danh mục của **Quyết định
19/2025/QĐ-TTg** (ban hành 30/06/2025, hiệu lực 01/07/2025). SQL của migration sinh từ chính file
đó (`gen-ward-sql.ts`), nên hai bên không lệch nhau âm thầm; `wards.spec.ts` khoá lại điều đó.

**KHÔNG có cấp quận/huyện và sẽ không có.** Mô hình hành chính đã bỏ cấp đó; dựng lại nó là dựng
một danh mục không còn hiệu lực và ép người dùng khai một thứ giấy tờ của họ không còn ghi.

> Vì sao không lấy thẳng từ Tổng cục Thống kê: `danhmuchanhchinh.gso.gov.vn` đã ngừng phân giải
> tên miền sau khi Tổng cục sáp nhập về Bộ Tài chính, còn bản PDF đính kèm quyết định trên Cổng
> thông tin Chính phủ là bản SCAN (không có lớp văn bản) nên không bóc được mã bằng máy.

### 2. "Xã thuộc tỉnh" là **ràng buộc DB**, không phải một câu `if`

Mọi bảng lưu địa chỉ mang cặp `(ward_code, province_code)` với **FK tổ hợp** tới
`wards(code, province_code)`. Một cặp xã-không-thuộc-tỉnh bị Postgres từ chối, bất kể service nào
ghi và bất kể ai quên kiểm.

`WardsService.assertSelectable` vẫn kiểm ở tầng app, nhưng đúng theo tinh thần ADR 0006 nó tồn
tại để **trả một thông báo gọi được tên đơn vị**, không phải để làm lớp bảo vệ duy nhất.

### 3. Ba phần của một địa chỉ, ba cách nhập khác nhau

| Phần | Nguồn | Cách nhập |
| --- | --- | --- |
| Tỉnh/thành, xã/phường/đặc khu | Danh mục nhà nước | **CHỌN** (có ô tìm, bỏ dấu) |
| Số nhà, đường, toà nhà (`address_line`) | Không ai phát hành | **GÕ** (có gợi ý địa điểm) |
| Toạ độ + `place_id` | Bản đồ hoặc người dùng | **GHIM**, và phải được xác nhận |

Không danh mục nhà nước nào phát hành số nhà và tên đường, nên ép chọn chúng từ dropdown là bịa
ra một danh mục không tồn tại — người dùng sẽ không tìm thấy địa chỉ của mình và bỏ dở.

**Chuỗi hiển thị do SERVER ghép** (`formatAddress` ở `@xeprime/domain`: nhỏ → lớn) và lưu vào
đúng cột `address` cũ. Client không gửi chuỗi hiển thị lên: nhận nó là mở đường cho một bản ghi
ghi "Quận 1, TP.HCM" trong khi mã bên cạnh trỏ Hà Nội.

### 4. Phần hành chính và phần toạ độ là **hai đường độc lập**

Chọn một gợi ý địa điểm KHÔNG tự đổi tỉnh người dùng đã chọn — nó chỉ hiện một lời nhắc khi hai
bên không khớp, và người dùng là người chốt. Lý do: dữ liệu địa chỉ của nhà cung cấp bản đồ còn
dùng tên đơn vị hành chính CŨ, nên "tin bản đồ" nghĩa là ghi mã sai một cách có hệ thống.

`location_source` lưu ghim đến từ đâu — `google_place` / `map_pin` / `geocoded` / `manual` — và
**server quyết định giá trị đó**, không lấy nguyên lời khai của client. Client tự xưng `map_pin`
mà không gửi toạ độ nào là cách để một ghim đáng ngờ đội lốt "đã xác nhận" và thoát khỏi lời nhắc
kiểm lại. Chỉ `geocoded` (máy đoán) mới sinh ra lời nhắc đó.

### 5. Ghim chỉ có ở địa chỉ mà **toạ độ có hệ quả**

Chi nhánh, địa chỉ giao xe, điểm đón khách: CÓ ghim — toạ độ ở đó tính ra tiền và là chỗ tài xế
lái tới. Sổ khách: KHÔNG — địa chỉ ở đó để liên hệ, và mỗi lượt tra bản đồ là một request có tính
tiền.

**Điểm đến** của chuyến có tài xế chỉ có ghim, KHÔNG có mã hành chính: nó là một ĐỊA ĐIỂM ("Sân
bay Nội Bài", "Đà Lạt"), không phải một địa chỉ giao nhận. Bắt khách chọn xã/phường cho nó là hỏi
một thứ họ không biết và hệ thống không dùng tới.

### 6. Bản đồ đi qua **backend**, khoá không bao giờ ra client

`GET /places/search` · `/places/detail` · `/places/reverse` proxy qua NestJS bằng
`GOOGLE_MAPS_SERVER_KEY` (khoá theo IP). Cùng kỷ luật ADR 0018 và ba thứ miễn phí đi kèm: rate
limit thật, cache dùng chung giữa mọi người dùng, và MỘT chỗ để đổi nhà cung cấp.

Bản đồ hỏng KHÔNG phải lỗi của người đang điền form: mọi ngả trả `available: false`, ô nhập vẫn
lưu được, và không luồng nào bị chặn.

Kéo được ghim thì cần thêm **Maps JavaScript API** ở trình duyệt
(`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, khoá theo referrer, tuỳ chọn). Thiếu nó thì web lùi về bản
đồ nhúng chỉ-xem; app native luôn dùng ảnh bản đồ tĩnh (không kéo `react-native-maps` vào cho một
khối kiểm ghim) và chạm vào thì mở bản đồ thật của hệ điều hành.

### 7. Dữ liệu cũ: **giữ nguyên, đánh dấu, chờ người xác nhận**

Migration **KHÔNG đoán mã xã** cho bất kỳ bản ghi nào. Địa chỉ tự do cũ chứa tên đơn vị hành
chính TRƯỚC sắp xếp, và một tên cũ có thể đã bị chia vào nhiều đơn vị mới ("một phần diện tích tự
nhiên của..."), nên suy mã từ chuỗi chữ là **đoán**, không phải chuyển đổi. Một địa chỉ đoán sai
trông y hệt một địa chỉ đúng và sẽ đi thẳng vào phép tính phí giao xe.

Vì vậy:

* Chuỗi hiển thị và toạ độ đang có **giữ nguyên** — marketplace vẫn hoạt động bình thường.
* Mọi chi nhánh chưa có mã xã mang `needs_location_review = true` (cờ này mở rộng nghĩa: trước
  đây chỉ là "thiếu tỉnh").
* Yêu cầu thuê / đơn thuê / sổ khách **không backfill gì cả** — chúng là snapshot lịch sử.
* Form sửa GỢI Ý phần "số nhà, đường" bằng cách cắt các cụm trông như đơn vị hành chính khỏi
  chuỗi cũ (`guessAddressLine`). Là gợi ý cho ô nhập, không bao giờ là dữ liệu tự lưu.

### 8. Đơn và yêu cầu là **snapshot**

Địa chỉ trên `bookings` / `booking_requests` đóng băng lúc tạo: danh mục hành chính đổi tên về
sau KHÔNG viết lại chúng. Một đơn cũ phải đọc ra đúng địa chỉ tại thời điểm đặt.

## Hệ quả

* Lọc và thống kê theo khu vực xuống được tới cấp xã; `public_listings` vẫn lọc theo tỉnh như cũ.
* Phí giao xe tận nơi tính từ **ghim khách đã xác nhận** thay vì geocode lại chuỗi chữ — rẻ hơn
  một request có tính tiền và cho con số khớp với đúng điểm khách đang nhìn thấy.
* Sau migration, **mọi chi nhánh** hiện cờ "cần cập nhật địa chỉ". Đó là trạng thái thật, không
  phải lỗi: không bản ghi nào trong hệ thống từng khai xã/phường.
* Thêm một biến env tuỳ chọn (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`). Bỏ trống thì mất đúng thao
  tác kéo ghim trên web, không mất luồng nào.

## Xem lại khi

* Có quyết định mới thay đổi danh mục hành chính → chạy lại `fetch-ward-catalog.ts`, soát diff
  của `ward-catalog.json`, sinh migration mới. **Mã đã có dữ liệu tham chiếu là bất biến**: đơn vị
  bị giải thể thì tắt `is_enabled`, không xoá dòng.
* Tỉ lệ chi nhánh còn cờ chờ xác nhận không giảm sau một quý → cần một đợt nhắc chủ động, không
  phải một đợt backfill tự động.
* Có nhu cầu tìm "xe trong bán kính N km" → lúc đó mới cân nhắc PostGIS; hiện tại toạ độ chỉ dùng
  cho khoảng cách điểm-tới-điểm và không cần chỉ mục không gian.
