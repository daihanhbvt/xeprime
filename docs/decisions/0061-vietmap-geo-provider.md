# ADR 0061 — Vietmap cho gợi ý địa chỉ và quãng đường; bản đồ trên web chỉ là ảnh tĩnh

Ngày: 15/10/2026 · Trạng thái: **Accepted** (chủ sản phẩm chốt 15/10/2026)

Ghi đè:

* [ADR 0037](0037-geoapify-osm-map-provider.md) **toàn bộ** phần nhà cung cấp, khoá và thư viện bản
  đồ. Ý định của điều 6 (không để máy tự chốt một toạ độ ở tâm tỉnh) giữ ở điều 5 dưới đây; cách
  giải mã `gp1:` ở điều 5 của 0037 giữ cho dữ liệu cũ.
* [ADR 0018](0018-map-delivery-distance.md) ở phần nhà cung cấp + khoá. Mọi quyết định sản phẩm của
  0018 giữ nguyên.
* [ADR 0035](0035-two-tier-administrative-address.md) điều 6 ở phần bản đồ tương tác: web không còn
  bản đồ tương tác nào, chỉ còn ảnh tĩnh (điều 1).
* [ADR 0042](0042-confirmed-place-address-for-renters.md) điều 1 (nguồn xác nhận thứ hai "đặt ghim"
  thay bằng "dùng đúng địa chỉ đã nhập" — điều 6 dưới đây), điều 2 (bỏ điều kiện bắt buộc toạ độ),
  và điều 5 ở phần "bản đồ mở ở đâu" (điểm neo nay chỉ còn kéo thứ tự gợi ý).

Liên quan: [ADR 0003](0003-styling-css-modules.md), [ADR 0012](0012-i18n-shared-url-cookie-locale.md).

## Bối cảnh

ADR 0037 chọn Geoapify/OpenStreetMap vì miễn phí, và tự ghi cái giá: dữ liệu số nhà và hẻm ở Việt
Nam thưa — đúng thứ luồng giao xe cần nhất. Lối đi tiếp mà 0037 ghi là một nhà cung cấp Việt Nam.

Hai lối đã thử trước khi chốt, ghi ở đây để không ai thử lại:

* **Google Maps Platform — loại (13–14/10/2026).** Việt Nam nằm trong danh sách *Prohibited
  Territories*: billing account đặt tại Việt Nam không bật được các API bản đồ, và điều khoản cấm cả
  ứng dụng làm ra để dùng tại các lãnh thổ đó. Nhánh `feature/web-google-maps` không merge.
* **Map4D — viết xong, không merge (14/10/2026).** Tích hợp đầy đủ (gợi ý, geocode, ma trận khoảng
  cách, Web SDK bản đồ) nằm trong một commit lưu trữ cục bộ trên nhánh `feature/web-map4d`. Chủ sản
  phẩm chọn Vietmap thay thế (15/10/2026).

Cùng lúc, chủ sản phẩm chốt phạm vi theo CHI PHÍ: **chỉ tìm địa chỉ và đo quãng đường** — không có
bản đồ tương tác. Mọi lượt gọi Vietmap đều tính tiền theo *giao dịch*, kể cả tile bản đồ (25 tile = 1
giao dịch), nên một khung bản đồ kéo/zoom được trên trang xe là tiền cho MỖI lượt xem, trong khi thứ
người xem cần chỉ là "chỗ này ở đâu". Cũng trong ngày, chủ sản phẩm bổ sung: vẫn hiện bản đồ ở chỗ
phù hợp, nhưng chỉ để xem — một ảnh tĩnh vẽ một lần rồi cache, không tính theo lượt xem.

Vietmap (Maps API v4) có đủ phần còn lại: gợi ý theo chữ gõ, tra chi tiết theo mã, geocode địa chỉ
đầy đủ, reverse, định tuyến — và trả địa chỉ theo **mô hình hành chính hai cấp** sau 01/07/2025
(`display_type=1`), khớp ADR 0035.

## Quyết định

### 1. Vietmap tìm địa chỉ, đo quãng đường và vẽ ảnh bản đồ tĩnh; web không có bản đồ tương tác

| Việc | API Vietmap v4 | Giao dịch | Ai gọi |
| --- | --- | --- | --- |
| Gợi ý khi gõ địa chỉ | `GET /api/autocomplete/v4` | 1 | web + app (qua `/places/search`) |
| Chọn một gợi ý → toạ độ | `GET /api/place/v4?refid=` | 1 | web + app (qua `/places/detail`) |
| Địa chỉ GÕ TAY → toạ độ | `/api/search/v4` rồi `/api/place/v4` | 2 | server, lúc lưu / lúc báo giá |
| Toạ độ → địa chỉ | `GET /api/reverse/v4` | 1 | chỉ app native (qua `/places/reverse`) |
| Quãng đường giao xe | `GET /api/route/v4` 2 điểm, `vehicle=car` | 1 | server |
| Xem vị trí (trang xe, thẻ hồ sơ xe, ô địa chỉ vừa chọn) | Static Map `POST /api/maps/statics/tm` — ẢNH, không tương tác | 1 mỗi điểm* | server, qua ảnh của API |
| Dẫn đường | **không gọi gì** — liên kết "Mở bằng Google Maps" | 0 | — |

\* Chưa có tài liệu về số giao dịch của Static Map; tính như một lượt. API cache ảnh theo toạ độ
trong bộ nhớ tiến trình, nên đây là một giao dịch cho mỗi điểm khác nhau sau mỗi lần khởi động/deploy
API — không theo lượt xem.

**Bản đồ để xem là một ẢNH TĨNH API vẽ hộ** (sửa 15/10/2026 theo chủ sản phẩm: vẫn hiện bản đồ ở chỗ
phù hợp, chỉ không tương tác). Ba endpoint, cả ba đọc toạ độ từ một thứ CÓ THẬT chứ không
nhận toạ độ từ request — nếu không thì bất kỳ ai cũng vẽ được bản đồ bất kỳ đâu bằng tiền của mình:

* `GET /public/listings/:id/pickup-map` — điểm nhận xe trên trang xe, chỉ cho xe đang trên chợ;
* `GET /branches/:id/map` — chi nhánh của chính gian hàng (cùng cổng với "chi tiết chi nhánh").
* `GET /places/map?placeId=` — địa điểm VỪA ĐƯỢC CHỌN trong ô địa chỉ (form chi nhánh, địa chỉ giao
  xe): chỉ vẽ cho mã đã qua `/places/detail` (có toạ độ trong cache), không tra thêm gì; địa chỉ gõ
  tay không có ảnh.

`GeoService.staticMap` giữ ảnh trong bộ nhớ của tiến trình API (LRU 200 ảnh ≈ 16MB; khởi động lại là
vẽ lại) và gộp các lượt vẽ đang chạy cho cùng một điểm; trình duyệt được giữ ảnh một ngày, URL mang toạ độ (`?v=`) nên chi nhánh dời đi là
ảnh mới. Ảnh chở dòng địa chỉ đã biết của điểm đó (gửi kèm để Vietmap không phải tự tra ngược). Web hiện
bằng `<img>` (`StaticMapImage`) — không thư viện bản đồ, không key trong bundle, `loading="lazy"`,
lỗi thì ẩn hẳn.

Liên kết Google Maps là một URL phổ quát (`maps/search/?api=1&query=lat,lng`) mở ứng dụng bản đồ
của người dùng: không key, không API, không thuộc Google Maps Platform, không tính tiền.

Ô địa chỉ không còn bản đồ kéo-ghim. `MapPinPicker`, `MapPreview`, SDK bản đồ và hook sức khoẻ bản
đồ bị gỡ khỏi web.

Khớp nối `GeoProvider` của ADR 0018 giữ nguyên: nhà cung cấp là một file
(`apps/api/src/modules/geo/vietmap-geo.provider.ts`) cộng một dòng ở `geo.module.ts`.

### 2. Một khoá, chỉ ở server

| Biến | Loại | Giới hạn trên Vietmap console |
| --- | --- | --- |
| `VIETMAP_API_KEY` | **Secret** | services key ("Key API"); IP = IP máy chạy API (máy dev: không giới hạn) |
| `GEO_DAILY_CALL_BUDGET` | Variable | — (cầu dao phía mình, điều 3) |

Không có khoá nào trong bundle web: ảnh bản đồ do server vẽ bằng chính services key nên không cần
"Key Tilemap", và không có gì nằm lộ thiên để người khác tiêu tiền của mình. Khoá optional kể cả ở production, đúng như ADR 0018.

### 3. Tối ưu chi phí — theo thứ tự lượt gọi bị chặn trước

1. **Không tải tile bản đồ** (điều 1): bản đồ để xem là ảnh tĩnh vẽ MỘT lần cho mỗi điểm rồi cache
   (bộ nhớ API + trình duyệt một ngày), không phải tile trả tiền theo mỗi lượt xem.
2. **Cầu dao theo ngày** — `GEO_DAILY_CALL_BUDGET` (mặc định 3.000 request/ngày giờ VN, mỗi tiến
   trình API; `DailyCallBudget`). `/places/*` là endpoint CÔNG KHAI; `@Throttle` chặn theo IP còn
   một trận quét đổi IP thì không. Chạm trần ⇒ "không hỏi được" tới hết ngày (điều 4), log cảnh
   báo MỘT lần. Vietmap console cũng cho đặt hạn mức theo key/IP — đặt cả hai lớp.
3. **Trần phía client và server**: debounce 400ms + tối thiểu 3 ký tự + chỉ hỏi khi đã biết tỉnh +
   KHÔNG hỏi cho chữ trùng địa chỉ đã xác nhận (form sửa vừa mở, địa chỉ nhớ từ lần trước, dòng
   gợi ý vừa bấm); `@Throttle` 30 lượt/phút/IP trên `/places/*`.
4. **Cache gợi ý trong bộ nhớ** 10 phút / 500 mục, khoá = chuỗi chuẩn hoá + điểm ưu tiên làm tròn
   ~1km: gõ lại, quay lại ô, hai người cùng tìm một con đường — một lượt.
5. **Cache Place theo mã** (`geocode_cache`, khoá `place:<ref_id>`, cả ca "mã không ra gì"): gợi
   ý của Vietmap KHÔNG kèm toạ độ nên bước chọn là một giao dịch thật; chọn lại cùng địa điểm (mở
   lại form sửa, hai khách cùng một chỗ) thì 0 giao dịch.
6. **Báo giá chỉ cho địa chỉ ĐÃ XÁC NHẬN.** Có toạ độ (`pinnedPoint`) thì không geocode gì. Không có
   toạ độ thì chỉ tra khi nguồn là `manual` — địa chỉ gõ tay khách đã chốt (điều 6); chữ đang gõ
   dở KHÔNG bao giờ bị tra. Và tra bằng ĐÚNG chuỗi `AddressService` sẽ tra lúc gửi yêu cầu (dòng
   địa chỉ + tỉnh của chi nhánh + "Việt Nam"): hai lượt dùng chung một bản ghi cache, nên lần gửi
   không tốn thêm giao dịch nào, và điểm lưu xuống đúng là điểm đã báo giá.
7. **Lọc trước bằng đường chim bay**: ngoài bán kính giao thì kết luận ngay, không gọi Route.
8. **Cache DB 90 ngày** (`GEO_CACHE_TTL_DAYS`) cho geocode (kể cả "không tìm thấy"), reverse (lưới
   ~110m) và quãng đường (lưới ~110m). Worker dọn mỗi giờ. 90 ngày CHỜ điều khoản lưu trữ của
   Vietmap (Còn mở Q1) — hạ ngay nếu họ yêu cầu.

Ước tính: một yêu cầu thuê có giao tận nơi tốn ~3–5 gợi ý + 1 Place + 1 ảnh của địa điểm vừa chọn +
1 Route ≈ **6–8 giao dịch**; trúng cache thì ít hơn. Ảnh điểm nhận xe trên trang xe là một giao dịch
cho mỗi xe sau mỗi lần khởi động API, không theo lượt xem.

### 4. "Không hỏi được" phải đi đường nhập tay

`/places/search` trả `available: false` cả khi CÓ key mà nhà cung cấp không trả lời (key bị từ chối,
hết giao dịch, chạm trần) → ô địa chỉ thành ô chữ tự do. Phí giao tự động trả `unavailable` (im
lặng) chứ không `address_not_found` khi lỗi là của nhà cung cấp (`GeoService.geocodeOutcome`). Bản đồ
hỏng không được trở thành "không đặt được xe" (ADR 0035 điều 6).

Provider coi body không đúng hình (mảng cho autocomplete/search/reverse, `code: "OK"` cho route) là
LỖI, không phải "không có kết quả": báo khách "không tìm thấy" lúc đó là đổ lỗi cho họ về một sự cố
của mình.

### 5. Không để máy tự chốt một toạ độ sai mà trông hợp lý

Search v4 **gần như không bao giờ trả "không có"** — nó khớp mờ theo TỪ. Đo trên key thật
15/10/2026: một chuỗi vô nghĩa kèm ", Hà Nội, Việt Nam" ra "Du Lịch Hà Nội Việt Nam" (Kim Liên) và
"Cửa Hàng Hà Nội Việt Nam" ở Nghệ An — chỉ vì chúng chứa chữ "Hà Nội Việt Nam". Nhận dòng đầu là
chốt một toạ độ sai trông như đúng — kiểu sai thuyết phục nhất, và nó chảy thẳng vào phí giao.
(Thử bằng `curl` trên Git Bash Windows thì chữ có dấu bị hỏng trước khi tới Vietmap và kết quả còn
tệ hơn nhiều — đo bằng Node hoặc trình duyệt.)

Nên `geocode()` (địa chỉ gõ tay) duyệt CẢ danh sách (tối đa 10 dòng, cùng một giao dịch) và chỉ nhận
dòng đầu tiên thoả cả ba:

1. không phải một đơn vị hành chính (tên trùng một mục trong `boundaries`, hoặc không có tên) — tâm
   của một phường/tỉnh không phải một địa chỉ (ý định của ADR 0037 điều 6);
2. mọi từ mang nghĩa trong tên dòng có mặt trong chuỗi hỏi (bỏ dấu; bỏ qua từ chỉ loại đường như
   "đường", "ngõ", "hẻm"), và có ít nhất một từ chữ;
3. tỉnh của dòng có mặt trong chuỗi hỏi. Chuỗi hỏi luôn kèm tỉnh (`addressGeocodeQuery`); không có
   tỉnh thì không dòng nào qua — không biết vùng thì không đoán.

Không dòng nào qua ⇒ "không tìm thấy" (một giao dịch, không tốn Place) ⇒ hai bên tự thoả thuận phí.
Không áp cho gợi ý: người dùng đọc rồi tự chọn. Kết quả mức ĐƯỜNG (không có số nhà) được nhận — sai
số vài trăm mét đến vài km trên một con đường dài, chấp nhận vì phí giao là DỰ KIẾN và chủ xe chốt
(ADR 0014). Đo cùng ngày qua provider: "Ngõ 120 Trường Chinh, Hà Nội" ra đúng "120 Trường Chinh,
Kim Liên", chuỗi vô nghĩa ra "không tìm thấy".

### 6. "Dùng đúng địa chỉ đã nhập" thay cho ghim tay

Kỷ luật "chữ trong ô luôn đã được xác nhận" của ADR 0042 giữ nguyên, nhưng nguồn xác nhận thứ hai
đổi: không còn bản đồ để đặt ghim, nên cuối danh sách gợi ý có dòng **"Không có trong danh sách? Dùng
đúng địa chỉ đã nhập"** — khách CHỦ ĐỘNG chốt chữ họ gõ (hẻm, số nhà mới). Toạ độ và mã địa điểm cũ
bị dọn, nguồn ghi `manual`, và nơi gọi được báo (`onConfirmedManually`) để dọn thứ suy ra từ địa
điểm cũ: luồng khách trả tỉnh về tỉnh của xe, form chi nhánh gỡ cảnh báo lệch tỉnh. Dòng đó chỉ hiện
khi danh sách gợi ý của ĐÚNG chữ đang hiện đã về (không trong quãng debounce).

Nhãn `manual` là thứ báo giá dựa vào (điều 3.6), nên nó phải đúng từng phím: gõ đè lên địa chỉ gõ
tay đã chốt thì nhãn tạm gỡ, ô quay về mốc thì nhãn quay lại. Hai ca cũng thành `manual`: gợi ý
không dùng được (ô là ô chữ tự do — chữ gõ chính là địa chỉ), và chọn một gợi ý đúng lúc nhà cung cấp
không trả lời Place (`/places/detail` trả `available: false` thay vì "không có" — bảo khách chọn
lại lúc hết giao dịch là một vòng lặp).

Hệ quả cho dữ liệu: địa chỉ không còn luôn mang toạ độ. Server tra địa chỉ chữ khi cần —
`AddressService` lúc lưu chi nhánh/hồ sơ (`locationSource = geocoded`), `DeliveryDistanceService` lúc
báo giá — tra không ra thì phí giao do hai bên thoả thuận. Schema đặt xe (`requestFormSchema`) thôi
bắt buộc `pickupLatitude`/`deliveryLatitude`; chữ địa chỉ vẫn bắt buộc.

### 7. Mã địa điểm là `ref_id` của Vietmap

`ref_id` (`auto:…` / `geocode:…`) là chuỗi mã hoá mà độ dài chạy theo địa chỉ, có thể vượt cột
`place_id VarChar(255)` ở mọi bảng. Nên: `/places/detail` nhận tới 1.024 ký tự (đủ để tra), nhưng mã
trả về form và mã ghi vào `geocode_cache.place_id` đi qua `storablePlaceId()` — quá 255 thì `null`.
Toạ độ là thứ hệ thống dùng; mã chỉ để tham chiếu. Khoá băm của cache vẫn là mã đầy đủ nên cache Place
không mất tác dụng. Mã `gp1:` thời Geoapify giải tại chỗ, không gọi mạng.

### 8. `/places/reverse` chỉ còn cho app native

Web không còn ghim để kéo. Reverse trả tỉnh gợi ý (`boundaries` loại 0) cho app đoán tỉnh từ vị trí
thiết bị, và KHÔNG trả mã địa điểm (`placeId: null`): kết quả cache theo ô lưới ~110m và trả cho
người khác ở gần — mã của dòng gần nhất lúc người đầu tiên hỏi nói sai về điểm của người sau.

### 9. App native chưa chuyển

`apps/mobile` do dev mobile phụ trách và không đổi trong thay đổi này. App vẫn vẽ bản đồ bằng
Geoapify (`EXPO_PUBLIC_GEOAPIFY_MAP_KEY`); gợi ý địa chỉ, chọn địa điểm và quãng đường đi qua API nên
đã là Vietmap. Muốn bỏ hẳn chi phí bản đồ ở app thì làm như web: thay `map-static.ts` /
`map-interactive.ts` / `MapPinSheet.tsx` bằng liên kết mở ứng dụng bản đồ + dòng "dùng đúng địa chỉ
đã nhập".

## Hệ quả

**Được:** dữ liệu địa chỉ Việt Nam của một nhà cung cấp Việt Nam, định dạng hành chính hai cấp; chi
phí bản đồ không còn tính theo lượt xem (ảnh tĩnh vẽ một lần mỗi điểm rồi cache); không còn khoá nào
trong bundle web; build web không còn biến bản đồ.

**Mất:**

* Bản đồ trên trang xe, hồ sơ xe và ô địa chỉ chỉ là ảnh: không kéo, không zoom. Xem rộng hay dẫn
  đường thì bấm "Mở bằng Google Maps".
* Cache ảnh nằm trong bộ nhớ tiến trình: mỗi lần deploy/khởi động lại, mỗi điểm được vẽ lại một lần
  (một giao dịch).
* Không chỉnh được toạ độ trên web: địa chỉ Vietmap chưa biết đi đường "dùng đúng địa chỉ đã nhập",
  toạ độ do server tra (có thể lệch hoặc không có) thay vì do người dùng ghim.
* Mỗi lần chọn gợi ý tốn một giao dịch Place (gợi ý không kèm toạ độ), giảm bằng cache theo mã.
* Cầu dao đếm trong bộ nhớ tiến trình: đủ cho một máy API một tiến trình; chạy nhiều bản thì trần
  nhân theo số bản.
* Cầu dao là MỘT quỹ cho mọi lượt gọi: một trận quét `/places/*` công khai (30 lượt/phút/IP, nhiều
  IP) có thể tiêu hết quỹ ngày và kéo theo báo giá giao xe + tra địa chỉ lúc lưu tới hết ngày. Chấp
  nhận ở giai đoạn pilot: hậu quả là "phí giao do hai bên thoả thuận", không mất tiền và không chặn
  đặt xe. Tách quỹ (gợi ý công khai / tra giá phía server) khi log cho thấy cầu dao bị chạm thật.

## Còn mở

- **Q1 — Điều khoản lưu trữ của Vietmap.** Tài liệu chỉ ghi "may implement caching"; chưa có điều
  khoản về thời hạn giữ toạ độ/quãng đường (cache 90 ngày; toạ độ lưu vĩnh viễn trong chi nhánh/đơn).
- **Q2 — Giá.** Trial: 60.000 giao dịch (Vietmap quy đổi ≈ 3.000.000đ, tức ~50đ/giao dịch). Giá gói
  Standard theo giao dịch, hoá đơn VAT, hợp đồng — cần bảng giá trong console hoặc từ Vietmap.
- **Q3 — Hình lỗi thật.** *Đã đo 15/10/2026 trên key thật:* key sai → HTTP 401 body rỗng; `refid`
  không ra gì → HTTP 404 body rỗng (code coi là "không có", có cache); Search không bao giờ rỗng
  (điều 5); `ref_id` dài ~170 ký tự (dưới trần 1.024 của `/places/detail`, vẫn có thể vượt 255);
  Place trả `address` là phần HÀNH CHÍNH chứ không phải "số nhà + đường" như tài liệu ghi (code đọc
  `display`). Còn chưa đo: body khi hết giao dịch / chạm hạn mức ngày — code coi mọi HTTP lỗi là
  "không hỏi được".
- **Q4 — Giới hạn trial.** Trial chặn 500 request/ngày cho mỗi API (autocomplete không chặn theo ngày)
  và tắt sẵn một số API. Đủ cho dev/staging; nâng gói trước khi mở cho khách thật.
