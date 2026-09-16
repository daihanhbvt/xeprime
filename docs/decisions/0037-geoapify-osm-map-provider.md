# ADR 0037 — Chuyển nhà cung cấp bản đồ sang Geoapify (OpenStreetMap)

Ngày: 15/09/2026 · Trạng thái: Accepted

Ghi đè: [ADR 0018](0018-map-delivery-distance.md) ở **phần nhà cung cấp và khoá** (mọi quyết định
sản phẩm của 0018 giữ nguyên) · [ADR 0035](0035-two-tier-administrative-address.md) điều 6 ở phần
thư viện bản đồ tương tác.

Liên quan: [ADR 0003](0003-styling-css-modules.md) (token, không inline style),
[ADR 0012](0012-i18n-shared-url-cookie-locale.md) (tên nhà cung cấp không dịch).

## Bối cảnh

ADR 0018 chọn Google Maps Platform và thiết kế `GeoProvider` như một khớp nối trung lập, với
docblock ghi sẵn: *"Đổi sang Goong / OSRM tự host = viết thêm một file implement interface này
rồi đổi `useClass`"*. Hôm nay là ngày dùng tới cái khớp nối đó.

Lý do trực tiếp: **Google Maps Platform bắt buộc gắn billing account hợp lệ** trước khi bất kỳ
key nào hoạt động, kể cả trong hạn mức miễn phí. Project `xeprime-maps` đang đứng ở đúng rào đó
(*"Your free trial requires a prepayment"*), nên bản đồ không hiện được ở máy dev lẫn staging —
không phải vì code, mà vì chưa có thẻ.

Đó là một rào chắn thật ở giai đoạn pilot: chưa có doanh thu, chưa muốn mở một dòng chi định kỳ
bằng ngoại tệ, và cần một môi trường dev mà bất kỳ ai clone repo về cũng chạy được.

## Quyết định

### 1. Geoapify + dữ liệu OpenStreetMap thay Google Maps Platform, toàn bộ

| Việc | Trước | Sau |
| --- | --- | --- |
| Địa chỉ chữ → toạ độ | Geocoding API | `api.geoapify.com/v1/geocode/search` |
| Gợi ý địa điểm | Places API (New) | `/v1/geocode/autocomplete` |
| Chi tiết địa điểm | Place Details | *(bỏ — xem điều 5)* |
| Toạ độ → địa chỉ | Geocoding (reverse) | `/v1/geocode/reverse` |
| Khoảng cách đường bộ | Routes API | `/v1/routing` (`mode=drive`) |
| Bản đồ xem-được | `<iframe>` Maps Embed | `<img>` Static Maps |
| Bản đồ kéo ghim | Maps JavaScript API | Leaflet + tile Geoapify |

Gói miễn phí: **3.000 credit/ngày, không cần thẻ tín dụng**.

### 2. Bản đồ xem-được là một tấm ẢNH, không phải iframe

`EmbedMap` (`<iframe>`) thành `StaticMap` (`<img>`). Nhẹ hơn bản cũ chứ không nặng hơn: không
còn một browsing context lồng nhau, vẫn không một byte JavaScript bên thứ ba nào, và `loading="lazy"`
vẫn chạy.

`<img>` trần chứ **không** qua `next/image`: qua `/_next/image` thì request tới Geoapify xuất
phát từ máy chủ của mình, nên khoá theo HTTP referrer — lớp bảo vệ duy nhất của một key nằm lộ
thiên trong HTML — mất tác dụng. Nếu hạn mức trở nên chật, lối đi tiếp theo là một route proxy
giữ key phía server, không phải bật `next/image`.

### 3. Bản đồ tương tác dùng Leaflet, không dùng MapLibre GL

Việc ở ô nhập địa chỉ đúng một câu: đặt và kéo MỘT cái ghim. Leaflet làm việc đó với ~40KB và
không cần WebGL, nên chạy được cả trên máy văn phòng cũ mà gian hàng hay dùng. MapLibre nặng gấp
mấy lần để đổi lấy xoay/nghiêng/vector — những thứ không ai dùng ở một ô chọn toạ độ.

Ghim vẽ bằng `L.divIcon` + CSS Module, không dùng ảnh marker mặc định: đường dẫn ảnh của Leaflet
vỡ dưới bundler, và một khối HTML thì lấy được màu từ token (ADR 0003).

### 4. Hai khoá, chia theo chỗ nó nằm — không phải theo API được bật

| Biến | Loại | Khoá bằng | Ai gọi |
| --- | --- | --- | --- |
| `GEOAPIFY_API_KEY` | **Secret** | IP của máy chạy API | backend: geocode, autocomplete, place details, reverse, routing |
| `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` | Variable | HTTP referrer/origin | trình duyệt: ảnh tĩnh + tile của Leaflet |

Khác Google, ở đây **một** key công khai lo cả ảnh tĩnh lẫn tile, nên bộ ba
`SERVER`/`EMBED`/`BROWSER` cũ rút còn hai. Điều cấm giữ nguyên và là điều quan trọng nhất của
mục này: **không bao giờ dùng chung key server với key trình duyệt**.

Cả hai đều `optional` kể cả ở production, đúng như ADR 0018: thiếu key thì khối bản đồ tự ẩn, ô
địa chỉ rơi về nhập tay, phí giao dự kiến không hiện — và luồng đặt xe chạy y như trước.

### 5. Mã địa điểm là TOẠ ĐỘ, không phải `place_id` của Geoapify

`place_id` của Geoapify **không giải ngược được** cho kết quả loại `building` — tức là địa chỉ
có SỐ NHÀ, đúng thứ một đơn giao xe cần. `/v2/place-details` trả HTTP 200 với `{"features":[]}`
ở mọi tổ hợp tham số (`features=details`, `details,building`, `building`, và không truyền gì).
Đã kiểm chứng trên dữ liệu thật ở Huế và Đà Nẵng. Nó chỉ giải được `street` và POI.

Nhưng autocomplete **đã kèm toạ độ** cho mọi kết quả. Vì vậy `GeoProvider.placeId` của nhà cung
cấp này là một mã tự phát dạng `gp1:<lat>,<lng>` (26 ký tự, thoải mái trong `VarChar(255)`), và
`placeDetails()` giải nó bằng **reverse geocode** — thứ trả lời được ở mọi điểm trên đất liền.
`place_id` thô bị bỏ hẳn: nó không giải được, không dùng ở đâu khác, và nhét thêm ~140 ký tự vào
một cột có hạn chỉ để làm kỷ niệm là tự chuốc rủi ro.

Mã của nhà cung cấp cũ (dữ liệu thời Google, `ChIJ…`) không khớp tiền tố → `placeDetails()` trả
`null` mà không gọi mạng; giao diện giữ nguyên ô địa chỉ và không có ghim, đúng nhánh đã có.

**Hệ quả cho giao diện, và nó quan trọng:** chữ điền vào ô "số nhà, đường" lấy từ **chính dòng
gợi ý người dùng vừa bấm**, không phải từ chuỗi server suy lại từ toạ độ. Hai thứ đó khác nhau
thật — chọn `"12, Nguyễn Huệ"` mà tra ngược toạ độ đó ra `"Hoàng Hạc Cafe, 18A, Nguyễn Huệ"`
(nhà bên cạnh). Dòng người ta bấm mới là thứ họ muốn. `formattedAddress` từ reverse chỉ dùng cho
dòng "Ghim đang ở: …", nơi việc nó lệch chút ít chính là thông tin cần cho quyết định chỉnh ghim.

**Tên tỉnh đọc từ `state`, thiếu thì rơi về `city`.** OpenStreetMap không nhất quán ở Việt Nam — đo trên dữ liệu thật: Hà Nội **không có** `state`
(tên tỉnh nằm ở `city`), Đà Nẵng có cả hai, Nghệ An có `state` còn `city` lại là tên xã. Chỉ đọc
`state` là Hà Nội mất tỉnh và bộ chọn không được gợi ý gì.

### 6. Ngưỡng tin cậy khi geocode — điều khoản MỚI, không có ở bản Google

Google trả `ZERO_RESULTS` khi không khớp. Geoapify/OSM gần như luôn trả về **một thứ gì đó** —
thường là tâm xã hoặc tâm tỉnh khi không khớp được số nhà.

Một cái ghim ở tâm tỉnh nằm ngay dưới dòng địa chỉ đúng là kiểu sai thuyết phục nhất, và nó chảy
thẳng vào quãng đường giao xe rồi thành tiền trên đơn của người khác. Vì vậy `geocode()` **loại**
kết quả có `rank.confidence` dưới `MIN_GEOCODE_CONFIDENCE` (0,25) và trả `null` — tức là rơi về
"hai bên tự thoả thuận", đúng nhánh mà hệ thống đã biết xử lý.

Ngưỡng này **không** áp cho `searchPlaces()`: gợi ý là thứ người dùng ĐỌC rồi tự chọn, còn
`geocode()` là chỗ máy tự chốt.

### 7. Chấp nhận: bản đồ chuyến giao không còn vẽ đường đi

Bản Google dùng Maps Embed `/directions` để vẽ một tuyến. Ảnh tĩnh của Geoapify vẽ được một
tuyến nhưng chỉ khi được đưa sẵn hình học của tuyến đó, mà `geo_route_cache` chỉ lưu số
ki-lô-mét. `mapRouteUrl` vì vậy đặt **hai cái ghim** (1 = điểm nhận, 2 = địa chỉ khách) trong một
khung bao có nới rộng, không vẽ đường nối.

Vẽ một đoạn thẳng giữa hai ghim thì tệ hơn hẳn: nó trông y hệt một lộ trình trong khi nó là
đường chim bay. Quãng đường THẬT đã nằm ngay dòng chữ phía trên với thẩm quyền của `GeoService`,
và ADR 0018 điều 1 vốn đã nói con số đó là **ước lượng**, không phải cam kết.

Muốn có đường đi trở lại thì phải cho `roadDistanceKm` trả thêm polyline và thêm một cột vào
`geo_route_cache` — một thay đổi schema, để dành cho lúc có người thật sự cần.

### 8. Ghi công nguồn dữ liệu là bắt buộc

Giấy phép ODbL của OpenStreetMap và điều khoản gói miễn phí của Geoapify đều đòi ghi công. Bản
đồ tĩnh có một dòng `<figcaption>`; bản đồ Leaflet dùng attribution control sẵn có. **Không được
gỡ** — và không dịch, vì đó là tên riêng (ADR 0012).

## Hệ quả

**Được:** không cần thẻ tín dụng, không cần billing account; dev nào clone repo cũng chạy được
bản đồ với một key tự đăng ký; một nhà cung cấp ít hơn phụ thuộc vào hệ sinh thái Google.

**Mất:** chất lượng địa chỉ cấp số nhà và hẻm ở Việt Nam của OSM **thưa hơn Google rõ rệt**. Ba
lớp đệm đã có sẵn từ trước và nay gánh nhiều hơn: tỉnh/xã lấy từ danh mục của mình chứ không từ
nhà cung cấp (ADR 0035), người khai địa chỉ phải nhìn ghim một lần trước khi lưu, và phí giao là
ước lượng chứ không phải cam kết (ADR 0018 điều 1).

**Cần theo dõi ở pilot:** tỉ lệ `geocode()` trả `null` vì dưới ngưỡng tin cậy. Nếu nó cao tới mức
ô địa chỉ mất tác dụng, lối đi tiếp theo là **Goong** — nhà cung cấp Việt Nam, dữ liệu địa chỉ VN
tốt hơn OSM, thanh toán bằng VND không cần thẻ quốc tế. Đổi sang nó vẫn chỉ là một file mới
implement `GeoProvider` cộng một dòng ở `geo.module.ts`; khớp nối này vừa chứng minh là nó hoạt
động.

**Chưa làm:** `apps/mobile` vẫn dùng Google Maps Static API (`EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY`).
App native do người khác giữ và nằm ngoài thay đổi này — nó cần một đợt riêng, nếu không sẽ là
hai nhà cung cấp bản đồ trong một sản phẩm.
