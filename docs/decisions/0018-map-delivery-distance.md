# ADR 0018 — Bản đồ tính khoảng cách giao xe tận nơi

Ngày: 24/08/2026 · Trạng thái: Accepted

Liên quan: [ADR 0014](0014-owner-and-shop-single-role.md) (nền tảng không đứng giữa quan hệ khách ↔
gian hàng), [ADR 0007](0007-api-type-contract.md) (tiền là chuỗi),
[ADR 0012](0012-i18n-shared-url-cookie-locale.md) (giao diện đọc MÃ, không đọc câu chữ),
[docs/plans/2026-08-24-tich-hop-map-tinh-phi-giao-xe.md](../plans/2026-08-24-tich-hop-map-tinh-phi-giao-xe.md)
(hồ sơ phân tích).

## Bối cảnh

Wave 2 đã dựng đủ máy tính phí giao nhận: bảng bậc `[{ toKm, fee }]`, bán kính tự báo giá,
validate không hở khoảng, và `PricingService.deliveryFeeFor(policy, distanceKm)`. Wave 9 rút vòng
báo giá ra khỏi luồng duyệt và để `deliveryFeeFor` lại **không có đường gọi nào** — docblock của
nó ghi thẳng: *"Đừng nối lại vào luồng duyệt mà không có quyết định sản phẩm mới."*

Lý do nó chết không phải vì thiết kế sai, mà vì thiếu đúng một con số: **`distanceKm` không có
nguồn**. Không ai đo được khoảng cách, nên chỗ duy nhất còn lại là bắt chủ xe gõ tay phí trên đơn
sau khi thoả thuận ngoài ứng dụng.

Tài liệu này là quyết định sản phẩm mà docblock kia đòi.

## Quyết định

### 1. Số tự động là **ước lượng**, chủ xe vẫn chốt

Hệ thống hiện quãng đường và phí **dự kiến** cho khách xem trước khi gửi yêu cầu. Nó **không**
ghi vào `bookings.delivery_fee`, **không** chặn duyệt, **không** sinh một trạng thái "chờ khách
xác nhận phí" nào.

ADR 0014 nói nền tảng không đứng giữa quan hệ khách ↔ gian hàng. Một con số do sàn tự chốt là sàn
vừa hứa thay chủ xe vừa gánh trách nhiệm khi số đó sai — mà nó sẽ sai đều đặn: đường cấm theo
giờ, phà, ngõ xe bốn bánh không vào được. Ước lượng giải quyết đúng vấn đề thật của khách ("giao
tới chỗ tôi tốn khoảng bao nhiêu") mà không tạo ra một lời hứa sàn không giữ nổi.

### 2. Khoảng cách **một chiều**, theo **đường bộ**

Một chiều là quy ước sẵn có của `delivery_tiers_json` (thiết kế Vehicle 360 §6.3, docblock
`deliveryFeeFor`). Đổi sang khứ hồi sẽ làm sai toàn bộ cấu hình các gian hàng đã nhập.

Đường bộ chứ không phải đường chim bay: ở Việt Nam sông, cầu và đường một chiều làm hai con số
lệch nhau hàng chục phần trăm. Đường chim bay chỉ được dùng làm **bộ lọc trước** (xem §5).

### 3. Điểm đi là **chi nhánh giữ xe**

`vehicles.branch_id` → `tenant_branches.latitude/longitude`, geocode một lần khi chủ shop lưu chi
nhánh. Không có toạ độ thì **không đoán tâm tỉnh** — trả `unavailable` và im lặng rơi về luồng cũ.
Một điểm đi lệch vài km là mọi đơn giao của chi nhánh đó sai tiền, tệ hơn hẳn việc không có số.

### 4. Không tra được **không bao giờ là một lỗi**

Endpoint `GET /public/listings/:id/delivery-distance` **luôn trả 200**. Mọi ngả hỏng là một giá
trị `status` (`@xeprime/types` → `DELIVERY_DISTANCE_STATUS`), và giao diện đọc MÃ đó (ADR 0012):

| `status` | Nghĩa | Giao diện làm gì |
| --- | --- | --- |
| `auto` | Trong bán kính — có cả km lẫn phí theo bậc | Hiện quãng đường + phí dự kiến |
| `manual` | Đo được nhưng ngoài bán kính tự báo | "Chủ xe sẽ trao đổi phí trực tiếp" |
| `unsupported` | Chính sách không bật giao nhận | Không có lựa chọn giao tận nơi |
| `address_not_found` | Không định vị được địa chỉ khách | Mời ghi rõ hơn — việc khách sửa được |
| `unavailable` | Chưa cấu hình bản đồ / chi nhánh chưa có toạ độ / provider lỗi | Im lặng, đúng luồng cũ |

Ném lỗi ở đây sẽ biến "bản đồ tạm không tra được" thành "không đặt được xe" — điều không đúng, vì
giao xe tận nơi vốn đã hoạt động không cần bản đồ suốt từ Wave 9.

## Kiến trúc

### Nhà cung cấp trung lập

`apps/api/src/modules/geo/geo-provider.ts` — cùng khuôn với `ocr-provider.ts` và vì cùng lý do:
thứ đứng sau là dịch vụ trả tiền của bên thứ ba, nên nó phải thay được mà không ai ngoài file
provider biết. Đổi sang Goong (dữ liệu địa chỉ Việt Nam sát hơn) hoặc OSRM tự host = một file
mới + đổi `useClass`; cache, lọc trước, tra bậc phí và toàn bộ giao diện không phải sửa.

Chưa cấu hình key → `GeoNotConfiguredProvider`, app boot bình thường, `status = unavailable`.

Hiện thực đầu tiên là **Google Maps Platform**: Geocoding API + Routes API (`TRAFFIC_UNAWARE`,
FieldMask chỉ xin `routes.distanceMeters` — cả hai đều là điều kiện để nằm ở bậc rẻ nhất).

### Hai key, không phải một

| Key | Ai gọi | Khoá bằng | Bật API nào |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | Chỉ backend | IP | Geocoding + Routes |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | Nằm lộ thiên trong HTML | HTTP referrer | **Chỉ** Maps Embed API |

Key server tuyệt đối không đi qua `NEXT_PUBLIC_*`. Dùng chung một key là mở hạn mức tính tiền cho
bất kỳ ai xem trang.

### Bản đồ xem-được là `<iframe>`, không phải SDK

Maps Embed API: không tính vào hạn mức, không một dòng JavaScript bên thứ ba, và chạy được cả
trong Server Component lẫn client island. Ngày nào cần kéo ghim mới phải lên Maps JavaScript API —
đó là một quyết định riêng, không phải hệ quả của cái này.

Bản đồ và con số km đến từ **hai nguồn khác nhau** (Embed vẽ, Routes đo) nên có thể lệch chút ít.
Con số là thứ có thẩm quyền; đừng đọc quãng đường ra từ bản đồ nhúng.

### Bốn lớp giữ hạn mức miễn phí đủ dùng

Hạn mức Essentials tính **theo từng SKU** (~10.000/tháng mỗi SKU), không phải cho cả tài khoản.
Một lượt tính phí tiêu tối đa 2 request (1 geocode + 1 routes), và 0 nếu trúng cache.

1. **Chi nhánh geocode một lần đời** — chỉ tra lại khi địa chỉ/tỉnh thật sự đổi, hoặc khi chi
   nhánh chưa có toạ độ (đường vá dữ liệu cũ).
2. **`geocode_cache`** — khoá là SHA-256 của địa chỉ đã chuẩn hoá. Cache **cả ca không tìm thấy**:
   người gõ sai địa chỉ thường thử lại nhiều lần liền.
3. **Lọc trước bằng đường chim bay** — `haversineKm > maxRadiusKm` là bằng chứng chắc chắn rằng
   đường bộ cũng vượt bán kính, kết luận được ngay mà **không gọi Routes API**.
4. **`geo_route_cache`** — toạ độ làm tròn về lưới ~110m trước khi băm, nên mọi lần hỏi lại cùng
   một chuyến giao đều trúng.

Cộng thêm ở client: debounce 900ms + địa chỉ tối thiểu 12 ký tự + cache của TanStack Query;
ở server: `@Throttle` 15 req/phút trên endpoint công khai.

`fetched_at` là cột **nghiệp vụ**, không phải cột kiểm toán: điều khoản của nhà cung cấp giới hạn
thời gian được lưu toạ độ, nên bản ghi quá hạn (30 ngày) bị coi là MISS và tra lại.

## Hệ quả

- `deliveryFeeFor()` sống lại, và vẫn là **nơi duy nhất** biết bậc phí. `DeliveryDistanceService`
  không có một phép cộng trừ tiền nào — nó chỉ cung cấp `distanceKm`.
- `PricingService` giữ nguyên tính chất thuần: mọi hàm của nó tính tiền từ dữ liệu đã có trong
  tay, không có hàm nào gọi ra Internet.
- Địa chỉ và toạ độ của khách là PII: không bao giờ lọt ra `public_listings` hay API công khai.
- Chưa cấu hình key thì **không có gì đổi** so với hôm nay — đó là tiêu chí nghiệm thu.

## Cái KHÔNG làm

- Không có vòng "shop báo giá rồi khách xác nhận lại" (đã bỏ ở Wave 9, không phục hồi).
- Không ghi phí tự động vào đơn.
- Không gợi ý địa chỉ (Places Autocomplete) và không cho kéo ghim (Maps JavaScript API) — hai thứ
  đó nâng độ chính xác nhưng mỗi thứ thêm một SKU vào hạn mức. Mở khi có số liệu sai thực tế,
  không mở trước.
- Không dùng khoảng cách để **chặn** đặt xe. Ngoài bán kính chỉ nghĩa là không tự báo giá được.
