# ADR 0059 — Google Maps Platform là nhà cung cấp bản đồ DUY NHẤT

Ngày: 13/10/2026 · Trạng thái: **Accepted** (chủ sản phẩm chốt 13/10/2026)

Ghi đè: [ADR 0037](0037-geoapify-osm-map-provider.md) **toàn bộ** phần nhà cung cấp, khoá và thư
viện bản đồ — ý định của điều 6 (không để máy tự chốt một ghim ở tâm tỉnh) được giữ lại ở điều 4
dưới đây · [ADR 0018](0018-map-delivery-distance.md) ở phần nhà cung cấp + khoá (mọi quyết định sản
phẩm của 0018 giữ nguyên) · [ADR 0035](0035-two-tier-administrative-address.md) điều 6 ở phần thư
viện bản đồ tương tác.

Liên quan: [ADR 0042](0042-confirmed-place-address-for-renters.md) (địa chỉ có ghim phải được bản
đồ xác nhận — không đổi), [ADR 0003](0003-styling-css-modules.md) (ghim lấy màu từ token),
[ADR 0012](0012-i18n-shared-url-cookie-locale.md) (nhãn bản đồ theo ngôn ngữ giao diện).

## Bối cảnh

ADR 0037 rời Google vì một rào chắn hành chính, không phải kỹ thuật: Google Maps Platform bắt buộc
gắn billing account (thẻ) trước khi bất kỳ key nào chạy. Cái giá đã được ghi ở mục "Mất" của chính
ADR đó — dữ liệu số nhà và hẻm ở Việt Nam của OpenStreetMap thưa hơn Google rõ rệt — và nó rơi đúng
vào thứ luồng giao xe cần nhất: toạ độ của một địa chỉ CÓ SỐ NHÀ.

Chủ sản phẩm chọn chấp nhận billing account để lấy chất lượng dữ liệu đó, và chọn **toàn bộ** Google
chứ không trộn. Trộn cũng không phải một lựa chọn hợp lệ: điều khoản Google Maps Platform cấm dùng
nội dung của họ (kết quả Geocoding, Places) cùng một bản đồ không phải của Google.

## Quyết định

### 1. Google Maps Platform cho mọi việc bản đồ, gỡ hẳn Geoapify/Leaflet

| Việc | Trước (0037) | Sau |
| --- | --- | --- |
| Địa chỉ chữ → toạ độ | Geoapify Geocoding | **Geocoding API** |
| Gợi ý địa điểm | Geoapify Autocomplete | **Places API (New)** — `places:autocomplete` |
| Chi tiết địa điểm | reverse geocode trên mã `gp1:` | **Places API (New)** — Place Details, FieldMask Essentials |
| Toạ độ → địa chỉ | Geoapify Reverse | **Geocoding API** (`latlng`) |
| Khoảng cách đường bộ | Geoapify Routing | **Routes API** — `computeRoutes`, `TRAFFIC_UNAWARE`, FieldMask `routes.distanceMeters` |
| Bản đồ xem-được | `<img>` Geoapify Static Maps | **Maps Embed API** (`<iframe>`) |
| Bản đồ kéo ghim | Leaflet + tile Geoapify | **Maps JavaScript API** + `AdvancedMarkerElement` |

Khớp nối `GeoProvider` của ADR 0018 giữ nguyên: đổi nhà cung cấp là một file mới
(`google-geo.provider.ts`) cộng một dòng ở `geo.module.ts`. Cache, lọc trước bằng đường chim bay, tra
bậc phí và toàn bộ giao diện ô địa chỉ không phải sửa.

### 2. Bản đồ xem-được là Maps Embed API, không phải Static Maps

Embed API **miễn phí, không giới hạn lượt**. Static Maps và Maps JavaScript API trừ vào hạn mức tính
tiền theo TỪNG LƯỢT XEM. Bản đồ điểm nhận xe nằm trên trang chi tiết xe công khai — trang có lượt xem
lớn nhất của sản phẩm — nên đây là chỗ một lựa chọn sai biến thành dòng chi định kỳ.

Cái giá: một `<iframe>` nặng hơn một `<img>`. Chấp nhận được vì nó `loading="lazy"` (hầu như luôn
nằm dưới màn hình đầu) và không kéo byte JavaScript nào vào bundle của mình.

Maps JavaScript API (có tính tiền theo lượt tải bản đồ) CHỈ nạp khi ô chỉnh ghim thật sự mở.

Nhãn bản đồ theo ngôn ngữ giao diện (`language=vi|en`); dữ liệu địa chỉ backend lưu luôn là `vi`.

### 3. Hai khoá, chia theo chỗ nó nằm

| Biến | Loại | Khoá bằng | API được bật |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | **Secret** | IP của máy chạy API (máy dev: không khoá IP, chỉ khoá API) | Geocoding API · Places API (New) · Routes API |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Variable | HTTP referrer của các site web | Maps Embed API · Maps JavaScript API |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Variable, tuỳ chọn | — | Map ID cho `AdvancedMarkerElement`; trống ⇒ `DEMO_MAP_ID` |

Điều cấm của 0018/0037 giữ nguyên và là điều quan trọng nhất: **không bao giờ dùng chung key server
với key trình duyệt**. Key trình duyệt nằm lộ thiên trong bundle; nếu nó gọi được Geocoding/Places
thì ai xem trang cũng tiêu được hạn mức tính tiền của mình.

Cả ba đều `optional` kể cả ở production, đúng như ADR 0018: thiếu key thì khối bản đồ tự ẩn, ô địa
chỉ rơi về nhập tay, phí giao dự kiến không hiện — luồng đặt xe chạy y như trước.

`GOOGLE_HOLIDAY_API_KEY` (Calendar API, worker) vẫn là key thứ ba riêng: khác tiến trình, khác API,
và thu hồi một key không được kéo theo key kia.

### 4. Không để máy tự chốt một ghim mức tỉnh/thành phố

Ý định của ADR 0037 điều 6 giữ nguyên, đổi cách đo. Không khớp được số nhà/đường, Geocoding API hay
trả TÂM tỉnh hoặc thành phố kèm `partial_match` thay vì `ZERO_RESULTS`. `geocode()` loại kết quả mà
MỌI `types` của nó thuộc nhóm thô (`country`, `administrative_area_level_1/2`, `locality`,
`colloquial_area`, `postal_code`, `political`) và trả `null` — tức rơi về "hai bên tự thoả thuận".
Cấp phường và chi tiết hơn vẫn được nhận.

Luật thứ hai bắt ca mà luật loại trên không thấy: số nhà không có trong dữ liệu, Google rơi về TÂM
con đường (`route` + `partial_match`). Kết quả `partial_match` có vùng bao (`viewport`) rộng quá
**2 km** theo đường chéo cũng bị loại — tâm của Nguyễn Văn Linh hay Quốc lộ 1 có thể cách chỗ thật
cả chục km. Đường ngắn khớp một phần vẫn được nhận (nhóm ADR 0037 chủ ý giữ), và kết quả KHỚP ĐỦ
có vùng bao rộng (sân bay, khu đô thị) không bị luật này đụng tới.

Không áp cho gợi ý địa điểm: người dùng đọc rồi tự chọn, còn `geocode()` là chỗ máy tự chốt.

### 4b. Có key không có nghĩa là dùng được — "không hỏi được" phải đi đường nhập tay

Với Google, hai key dùng chung MỘT billing account: thẻ hết hạn hay chạm trần quota là cả gợi ý
địa điểm lẫn bản đồ cùng hỏng, trong khi key vẫn "đã cấu hình". Ba chỗ phải nhận ra điều đó lúc
CHẠY, không chỉ lúc đọc env:

| Chỗ | Nhà cung cấp hỏng thì |
| --- | --- |
| `GET /places/search` | `available: false` (không phải `true` + danh sách rỗng) ⇒ ô địa chỉ mở cho nhập tay |
| Phí giao tự động (`DeliveryDistanceService`) | `unavailable` (im lặng), KHÔNG `address_not_found` — đó không phải lỗi của khách |
| Form đặt xe (`canConfirmLocation`) | Google từ chối key hay script không tải được ⇒ thôi đòi toạ độ (`useInteractiveMapUsable`) |

`GeoService` vì vậy trả ba ngả phân biệt được cho tra địa chỉ (`geocodeOutcome`: `ok` ·
`not_found` · `unavailable`) và `null` (khác mảng rỗng) cho gợi ý địa điểm. Đây là ADR 0035 điều 6
áp dụng đúng chữ: bản đồ hỏng không được trở thành "không đặt được xe".

Ô ghim không dựng lại bản đồ sau khi Google đã từ chối key trong lần tải trang đó, và không dựng lại
mỗi lần `disabled` bật/tắt quanh một lần lưu — mỗi lần dựng là một lượt Dynamic Maps tính tiền.
Ô mở ra đã ở chế độ chỉ-xem thì dùng bản đồ nhúng miễn phí.

### 5. Mã địa điểm là `place_id` của Google; mã `gp1:` cũ trả `null` không gọi mạng

`place_id` được phép lưu lâu dài theo điều khoản (khác toạ độ). Mã thời Geoapify (`gp1:<lat>,<lng>`)
còn nằm trong `branches.place_id` và các đơn cũ: `placeDetails()` nhận ra nó không phải mã Google và
trả `null` ngay — gửi sang Google là một request tính tiền đổi lấy HTTP 400. Giao diện đã có sẵn
nhánh này (giữ ô địa chỉ, không ghim mới); toạ độ đã lưu của bản ghi cũ không bị đụng tới.

### 6. Cache tối đa 30 ngày, và XOÁ sau 30 ngày

Điều khoản chỉ cho lưu tạm toạ độ tối đa 30 ngày liên tiếp. `GeoService` thôi đọc bản ghi quá
`GEO_CACHE_TTL_DAYS` (`@xeprime/domain`); worker xoá hẳn chúng mỗi giờ
(`apps/worker/src/jobs/geo-cache-cleanup.ts`). Thôi đọc không phải là xoá — một dòng nằm đó vẫn là
toạ độ của Google đang được lưu. Bản ghi Geoapify cũ rời bảng theo cùng vòng đó.

**Phạm vi của điều này chỉ là hai bảng cache.** Toạ độ còn được lưu VĨNH VIỄN trong dữ liệu nghiệp
vụ — chi nhánh, yêu cầu thuê, địa chỉ giao xe — với nguồn `google_place` (chọn từ gợi ý) hoặc
`geocoded` (máy tra từ chữ). Xem mục "Còn mở".

### 7. Ghi công là của Google

Bản đồ Embed và Maps JavaScript API tự in ghi công. Dòng `© OpenStreetMap · Geoapify` và attribution
control của Leaflet đã gỡ cùng thư viện.

### 8. App native chuyển theo — trước khi bật key Google ở môi trường mà app trỏ vào

`apps/mobile` do dev mobile phụ trách và KHÔNG đổi trong cùng thay đổi này. App vẫn vẽ bản đồ bằng
Geoapify (`EXPO_PUBLIC_GEOAPIFY_MAP_KEY`) trong khi gợi ý địa điểm của nó (đi qua API) đã là dữ liệu
Google — đúng cái điều khoản cấm ở phần Bối cảnh. Việc của dev mobile, phải xong trước production:

| File | Đổi thành |
| --- | --- |
| `apps/mobile/shared/src/lib/map-static.ts` | Maps Static API (hoặc Embed trong WebView) với key riêng của app |
| `apps/mobile/shared/src/lib/map-interactive.ts` + `components/map/MapPinSheet.tsx` | Maps JavaScript API trong WebView thay Leaflet + tile Geoapify |
| `apps/mobile/{customer,manage}/.env.example` | bỏ `EXPO_PUBLIC_GEOAPIFY_MAP_KEY` |

## Hệ quả

**Được:** dữ liệu số nhà, hẻm và địa điểm ở Việt Nam tốt hơn hẳn — đúng chỗ luồng giao xe yếu nhất
từ ADR 0037; bản đồ xem-được miễn phí không giới hạn; một nhà cung cấp, một console, một kiểu khoá.

**Mất:** bắt buộc billing account (thẻ); vượt hạn mức miễn phí hằng tháng của từng SKU là tiền thật.
Lớp chặn đã có trong code: cache 30 ngày, lọc chim bay trước Routes API, debounce + ngưỡng 3 ký tự +
`@Throttle` ở `/places/*`, FieldMask hẹp nhất cho Places/Routes. Lớp chặn ở console là việc VẬN HÀNH
bắt buộc: cảnh báo ngân sách + trần quota theo ngày cho từng API (`docs/third-party-keys.md` §4).

**Dữ liệu hành chính:** Google ở Việt Nam còn dùng tên tỉnh/quận/phường trước sắp xếp 01/07/2025.
Không đổi gì: tỉnh/xã vẫn lấy từ danh mục của mình, nhà cung cấp chỉ cho toạ độ và phần "số nhà,
đường" (ADR 0035 · 0042).

**Chưa làm, để dành khi lưu lượng cần:** session token cho Autocomplete (gộp các lượt gõ của một lần
chọn địa điểm vào một phiên tính tiền) — đổi được mà không đổi hợp đồng bắt buộc, vì `sessionToken`
là tham số tuỳ chọn.

## Còn mở

**Q1 — Toạ độ của Google trong dữ liệu nghiệp vụ (cần chủ sản phẩm + pháp lý chốt trước
production).** Điều khoản Google giới hạn việc lưu toạ độ họ trả về ở 30 ngày, bất kể lưu ở bảng
nào; điều 6 chỉ phủ hai bảng cache. Hai lối:

1. Chỉ lưu vĩnh viễn toạ độ NGƯỜI DÙNG tự xác nhận bằng ghim (`map_pin`); với nguồn `google_place`
   giữ `place_id` (được lưu vô thời hạn) và tra lại khi cần; nguồn `geocoded` thì tra lại hoặc bỏ.
   Là một thay đổi schema + luồng ghi địa chỉ, chạm cả web lẫn app native.
2. Ghi nhận đây là rủi ro CHẤP NHẬN ở giai đoạn pilot, kèm mốc xem lại.

Chưa có quyết định — không có code nào thay đổi vì mục này.
