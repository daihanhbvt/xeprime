# Tích hợp bản đồ để tự tính phí giao xe tận nơi

Ngày: 24/08/2026 · Trạng thái: **ĐÃ TRIỂN KHAI** (bậc 1)

> Quyết định chốt lại thành [ADR 0018](../decisions/0018-map-delivery-distance.md) — đọc ADR trước,
> file này giữ phần **phân tích và các con số** dẫn tới quyết định đó.
>
> **Phạm vi đã làm khác bản phân tích ở một chỗ có chủ đích:** không có vòng báo giá cho shop và
> không có bước khách xác nhận lại. Khách thấy quãng đường + phí **dự kiến** ngay khi nhập địa chỉ;
> shop bật báo giá tự động (bậc phí + bán kính) thì con số hiện, không bật thì màn hình giữ
> **nguyên** luồng cũ. Câu Unknown ở §9.2 vì thế **không còn phải trả lời**.

> Việc này nằm trong danh sách "Hoãn có chủ đích" của `docs/completion-roadmap.md` §Vehicle 360:
> _"bản đồ tự tính khoảng cách"_. Đây là hồ sơ mở lại nó.

---

## 1. Kết luận trước

Phần **khó nhất đã làm xong từ Wave 2** và đang nằm im trong repo: bảng bậc phí theo km, bán
kính tự báo giá, validate không hở khoảng, kiểu `BookingRequestDeliveryQuote`, cột
`delivery_quote_json`, cột `bookings.delivery_fee`, snapshot giá. Mảnh duy nhất thiếu là **con số
`distanceKm`** — hiện không ai sinh ra nó, nên Wave 9 đã cắt cả vòng báo giá và để chủ xe gõ tay
phí trên đơn.

Vậy phạm vi thật của việc này **không phải "làm tính năng giao xe"**, mà là: _cắm một nguồn
khoảng cách vào chỗ đang trống, rồi nối lại `deliveryFeeFor()` đã có sẵn._

Ba việc, theo đúng thứ tự phụ thuộc:

| # | Việc | Vì sao cần |
| --- | --- | --- |
| 1 | **Toạ độ điểm đi** — geocode địa chỉ chi nhánh một lần khi shop lưu chi nhánh | `tenant_branches.latitude/longitude` đã có cột nhưng form chi nhánh **không hề thu thập** |
| 2 | **Toạ độ điểm đến** — geocode địa chỉ khách nhập | `booking_requests.delivery_address` đang là chuỗi tự do, không có toạ độ |
| 3 | **Khoảng cách đường bộ** giữa hai điểm → `distanceKm` → `deliveryFeeFor()` | Hàm đã viết + đã test, chỉ thiếu tham số |

Bản đồ hiển thị là việc **thứ tư, độc lập và gần như miễn phí** — xem §5.3.

---

## 2. Hiện trạng chi tiết

### 2.1 Đã có (không phải viết lại)

| Thứ | Ở đâu |
| --- | --- |
| Bật/tắt giao xe theo chính sách | [schema.prisma:1343](../../prisma/schema.prisma#L1343) `rental_policies.delivery_enabled` |
| Bán kính tự báo giá | `delivery_max_radius_km` — [schema.prisma:1346](../../prisma/schema.prisma#L1346) |
| Bảng bậc phí `[{ toKm, fee }]` | `delivery_tiers_json` — [schema.prisma:1348](../../prisma/schema.prisma#L1348) |
| Validate bậc: tăng dần, không hở, bậc cuối = bán kính | [pricing.service.ts:283-307](../../apps/api/src/modules/pricing/pricing.service.ts#L283-L307) |
| **Máy tra phí theo km** | [pricing.service.ts:518](../../apps/api/src/modules/pricing/pricing.service.ts#L518) `deliveryFeeFor(policy, distanceKm)` → `auto` \| `manual_required` \| `disabled` |
| Kiểu báo giá lưu trên yêu cầu | [packages/types/src/pricing.ts:116](../../packages/types/src/pricing.ts#L116) `BookingRequestDeliveryQuote { distanceKm, fee, source, quotedBy, quotedAt, policyUpdatedAt }` |
| Cột lưu báo giá | `booking_requests.delivery_quote_json` — [schema.prisma:1112](../../prisma/schema.prisma#L1112) |
| Phí giao trên đơn + snapshot giá | `bookings.delivery_fee` + `price_snapshot_json` |
| Dòng `delivery` trong breakdown | [pricing.service.ts:691-711](../../apps/api/src/modules/pricing/pricing.service.ts#L691-L711) |
| UI khách chọn "Giao xe tận nơi" + nhập địa chỉ | [RequestBookingFlow.tsx:1014](../../apps/web/src/features/booking-requests/components/RequestBookingFlow.tsx#L1014) |
| UI shop sửa phí giao trên đơn | [UpdateDeliveryFeeModal.tsx](../../apps/web/src/features/bookings/components/UpdateDeliveryFeeModal.tsx) |
| Cột toạ độ chi nhánh | [schema.prisma:475-476](../../prisma/schema.prisma#L475-L476) `latitude/longitude Decimal(10,7)` |
| Toạ độ trong DTO chi nhánh | [branch.dto.ts:104-109](../../apps/api/src/modules/branches/dto/branch.dto.ts#L104-L109) — API **đã nhận** lat/lng |

### 2.2 Thiếu / đang chết

| Thứ | Trạng thái thật |
| --- | --- |
| `deliveryFeeFor()` | **Chỉ được gọi trong `apps/api/test/rental-pricing.spec.ts`.** Docblock ghi rõ: _"Wave 9: KHÔNG còn đường gọi nào trong luồng nghiệp vụ… Đừng nối lại vào luồng duyệt mà không có quyết định sản phẩm mới."_ → tài liệu này chính là quyết định đó |
| Form chi nhánh | [BranchFormDialog.tsx](../../apps/web/src/features/branches/components/BranchFormDialog.tsx) chỉ có `name`, `provinceCode`, `address`, `phone` — **không có ô toạ độ, không có bản đồ** |
| Toạ độ khách | Không tồn tại ở bất kỳ bảng nào |
| Bất kỳ SDK/API bản đồ nào | **Zero.** Grep `google\|maps\|geocod\|leaflet\|mapbox\|goong` toàn repo chỉ ra Google **Auth** và OCR provider |
| Chữ hiện cho khách | `booking-requests.json` → `"feeFree": ...`, `"feeNote": "Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp…"` — tức đang hứa **miễn phí + thoả thuận sau** |
| `pickupPoint` trên listing công khai | [public-listings.service.ts:815-822](../../apps/api/src/modules/public-listings/public-listings.service.ts#L815-L822) trả `address`, `provinceName`, `phone`, `branchName` — **không trả lat/lng** |

---

## 3. Chọn nhà cung cấp & hạn mức

Người dùng đã chốt Google Maps Platform. Ghi nhận và phân tích theo hướng đó; kiến trúc §5 vẫn
để đường thoát (§8.3).

### 3.1 Đúng ra cần mấy SKU

Con số "10.000 lượt/tháng" là **hạn mức riêng của TỪNG SKU** ở bậc Essentials (Google đổi từ mô
hình credit $200/tháng sang free-tier theo SKU từ 03/2025), **không phải** 10.000 cho cả tài
khoản. Cần kiểm lại trên Console trước khi triển khai vì Google có sửa bảng giá.

| SKU | Dùng để làm gì | Hạn mức miễn phí | Có bắt buộc không |
| --- | --- | --- | --- |
| **Geocoding API** | địa chỉ chữ → lat/lng (chi nhánh + khách) | ~10k/tháng | ✅ Bắt buộc |
| **Routes API** (Compute Routes, Essentials) | khoảng cách **đường bộ** giữa 2 điểm | ~10k/tháng | ✅ Bắt buộc |
| **Maps Embed API** | nhúng bản đồ xem-được bằng `<iframe>` | **$0, không giới hạn** | ✅ Nên dùng — xem §5.3 |
| Maps JavaScript API | bản đồ tương tác, kéo ghim | ~10k map load/tháng | ❌ Chỉ khi cần ghim tay |
| Places Autocomplete | gợi ý địa chỉ khi khách gõ | ~10k session/tháng | ❌ Bậc 2 — xem §8.1 |

> **Vẫn phải bật billing và gắn thẻ** dù chỉ dùng trong hạn mức. Không có billing thì key trả lỗi.

### 3.2 Ước lượng tiêu thụ

Một lượt khách yêu cầu giao tận nơi tiêu **tối đa 2 request** (1 geocode địa chỉ khách + 1 routes),
và **0 request** nếu cache trúng. Chi nhánh geocode một lần đời — vài chục request/tháng cho cả
sàn.

Với cache + prefilter Haversine (§6), 10k/tháng đủ cho khoảng **7.000–10.000 lượt tính phí giao
mỗi tháng**. Seed hiện tại có 107 đơn; ngưỡng này còn rất xa. Nếu vượt, giá vượt hạn mức rơi vào
khoảng vài USD/1.000 request — vẫn nhỏ, nhưng phải có **cảnh báo ngân sách trên Cloud Console**
chứ không phát hiện bằng hoá đơn.

---

## 4. Bốn quyết định nghiệp vụ phải chốt trước khi code

Đây là phần dễ bị bỏ qua và là phần đắt nhất nếu chốt sai. Đề xuất kèm lý do:

### 4.1 Số tự động là **báo giá tạm**, chủ xe vẫn là người chốt

ADR 0014: _nền tảng không đứng giữa quan hệ khách ↔ gian hàng_. Nếu để hệ thống tự chốt phí giao
thì sàn vừa hứa thay chủ xe vừa gánh trách nhiệm khi số sai (đường cấm, phà, giao giờ cao điểm).

→ **Đề xuất:** tự động điền `distanceKm` + `fee` với `source = 'auto'`, hiện cho khách là _"phí
giao dự kiến"_, chủ xe xác nhận/sửa khi duyệt. Ngoài bán kính giữ nguyên `source = 'manual'` như
`DELIVERY_QUOTE_SOURCE` đã định nghĩa.

### 4.2 Khoảng cách **một chiều**, theo **đường bộ**

`docs/design/12_VEHICLE_360_MANAGEMENT.md` §6.3 đã ghi _"km một chiều"_ và docblock của
`deliveryFeeFor` cũng ghi _"khoảng cách một chiều"_. Giữ nguyên, **không** đổi sang khứ hồi —
đổi sẽ làm sai toàn bộ cấu hình bậc phí shop đã nhập.

Đường bộ (Routes API) chứ không phải đường chim bay: ở Việt Nam sông/cầu/đường một chiều làm
Haversine lệch 30–60%, shop sẽ mất tiền hoặc khách bị hớ.

### 4.3 Điểm đi = **chi nhánh giữ xe**, không phải hồ sơ gian hàng

`vehicles.branchId` → `tenant_branches`. Fallback theo đúng thứ tự `public-listings.service.ts`
đang dùng cho `pickupPoint`: `branch.address` → `tenant.profile.address`. Nếu cả hai đều không
geocode được → **không tự tính**, rơi về `manual_required`, không đoán bừa toạ độ tỉnh.

### 4.4 Snapshot, không đọc lại

Phí giao chốt vào `bookings.delivery_fee` + `price_snapshot_json` như hiện tại. Shop sửa bậc phí
sau đó **không** đổi đơn cũ. `policyUpdatedAt` trong `BookingRequestDeliveryQuote` đã có sẵn để
phát hiện báo giá cũ — dùng nó, đừng so từng field.

---

## 5. Kiến trúc đề xuất

### 5.1 Một interface trung lập, theo đúng khuôn `ocr-provider.ts`

Repo đã có tiền lệ tốt cho việc cắm dịch vụ ngoài:
[apps/api/src/modules/vehicles/documents/ocr-provider.ts](../../apps/api/src/modules/vehicles/documents/ocr-provider.ts)
— interface trung lập + `OcrNotConfiguredProvider` mặc định **fail rõ ràng, không giả kết quả**.
Làm y hệt:

```
apps/api/src/modules/geo/
  geo-provider.ts        # interface + GeoNotConfiguredProvider (mặc định)
  google-geo.provider.ts # implement bằng Geocoding + Routes REST (fetch, không SDK)
  geo.service.ts         # điều phối: cache → prefilter → provider
  geo.module.ts
```

```ts
export interface GeoProvider {
  readonly name: string;
  readonly enabled: boolean;
  /** Địa chỉ chữ → toạ độ. Không đọc được thì trả null, KHÔNG đoán. */
  geocode(address: string, hint?: { provinceCode?: string }): Promise<GeoPoint | null>;
  /** Khoảng cách ĐƯỜNG BỘ một chiều, km. */
  drivingDistanceKm(from: GeoPoint, to: GeoPoint): Promise<number | null>;
}
```

Chưa cấu hình key → provider mặc định, endpoint trả **503 `GEO_NOT_CONFIGURED`** có kiểm soát,
luồng rơi về nhập tay. App vẫn boot bình thường — giống hệt cách `R2_*`/OCR đang làm.

### 5.2 Key: **hai key khác nhau**, không phải một

Đây là chỗ dễ sai nhất và hậu quả là hoá đơn của người khác.

| Key | Dùng ở đâu | Khoá bằng | Env |
| --- | --- | --- | --- |
| **Server key** | Geocoding + Routes, gọi từ NestJS | IP restriction + chỉ bật 2 API đó | `GOOGLE_MAPS_SERVER_KEY` (apps/api, zod schema) |
| **Embed key** | `<iframe>` bản đồ, lộ trong HTML | HTTP referrer restriction + **chỉ** Maps Embed API | `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` |

Server key **tuyệt đối không** đi qua `NEXT_PUBLIC_*`. Toàn bộ geocode/routes gọi từ backend —
vừa giấu được key, vừa cache tập trung được, vừa không để client tự khai `distanceKm` (cùng
nguyên tắc với `❌ API tenant-sensitive nhận tenant_id từ body` trong CLAUDE.md §5).

### 5.3 "Xem map đơn giản" = `<iframe>` Maps Embed API — **0 quota**

Yêu cầu là _"xem được map đơn giản"_. Không cần Maps JavaScript API, không cần thư viện, không
cần `'use client'` cho map tĩnh:

```html
<iframe src="https://www.google.com/maps/embed/v1/place?key=…&q=10.7769,106.7009" loading="lazy" />
```

Maps Embed API tính giá **$0 không giới hạn** — nên bản đồ xem-được ở trang chi tiết xe, trang chi
nhánh và màn duyệt yêu cầu **không tốn một request nào** trong 10k. Chỉ khi cần **ghim tay/kéo
thả** mới phải lên Maps JavaScript API (bậc 2, §8.2).

Lưu ý CSP: [apps/web/next.config.ts](../../apps/web/next.config.ts) hiện **chưa** khai
`headers()`/CSP nào, nên iframe chạy ngay. Nếu sau này thêm CSP thì phải mở
`frame-src https://www.google.com`.

### 5.4 Luồng dữ liệu

```
Shop lưu chi nhánh (address)
   └─► GeoService.geocode → tenant_branches.latitude/longitude   [1 request, một lần đời]

Khách chọn "Giao tận nơi" + nhập địa chỉ, bấm "Tính phí giao"
   └─► POST /booking-requests/delivery-quote-preview { vehicleId, address }
         ├─ lấy branch của vehicleId  → điểm đi (đã có toạ độ, 0 request)
         ├─ geocode địa chỉ khách     → cache?  hit: 0 request / miss: 1 request
         ├─ Haversine prefilter: > maxRadius × 1.4 → manual_required, DỪNG (0 request)
         ├─ Routes API                → cache?  hit: 0 request / miss: 1 request
         └─ pricing.deliveryFeeFor(policy, distanceKm)
              → { kind: 'auto', fee } | 'manual_required' | 'disabled'

Shop duyệt yêu cầu
   └─► ghi delivery_quote_json (distanceKm, fee, source, quotedBy, quotedAt, policyUpdatedAt)
       + bookings.delivery_fee + price_snapshot_json      [bất biến từ đây]
```

---

## 6. Tiết kiệm quota — bốn lớp

1. **Geocode chi nhánh một lần đời.** Chỉ gọi lại khi `address`/`provinceCode` thật sự đổi
   (so chuỗi đã chuẩn hoá, không gọi mỗi lần bấm Lưu).
2. **Cache geocode.** Bảng `geocode_cache(address_hash, provider, lat, lng, place_id, formatted_address, fetched_at)`.
   Khoá = SHA-256 của địa chỉ đã chuẩn hoá (lowercase, gộp khoảng trắng, bỏ dấu câu thừa).
   Địa chỉ ở Việt Nam lặp lại rất nhiều (chung cư, toà nhà, sân bay) → tỉ lệ trúng cao.
3. **Prefilter Haversine.** Đường chim bay **luôn ≤** đường bộ. Nếu `haversine > maxRadiusKm`
   thì chắc chắn ngoài bán kính → trả `manual_required` mà **không gọi Routes API**. Đây là bộ
   lọc rẻ nhất và bắt được phần lớn ca giao liên tỉnh. Hàm haversine đặt ở `@xeprime/domain`
   (framework-free, app native dùng lại được).
4. **Cache khoảng cách.** Khoá `(branchId, lat làm tròn 3 chữ số, lng làm tròn 3 chữ số)` — ~110m
   lưới, đủ mịn cho bậc phí tính theo km, gộp được mọi lần khách bấm lại.

Cộng thêm: **debounce ở FE** — chỉ gọi khi khách bấm nút hoặc rời ô địa chỉ, tuyệt đối không gọi
theo từng ký tự.

---

## 7. Rủi ro & ràng buộc

| Rủi ro | Mức | Xử lý |
| --- | --- | --- |
| **Điều khoản Google về cache** | Cao | Google Maps ToS giới hạn thời gian lưu toạ độ (thường nêu ~30 ngày), trong khi `place_id` được lưu lâu dài. → `geocode_cache` phải có **TTL + cột `fetched_at`** và job dọn; ưu tiên lưu `place_id`. **Phải đọc lại ToS bản hiện hành trước khi chốt TTL** |
| **Chất lượng geocode địa chỉ VN** | Cao | Địa chỉ tự do kiểu "hẻm 12/3 đường X, P.Y" hay geocode về tâm phường → sai vài km → sai bậc phí. Giảm bằng Places Autocomplete (§8.1) hoặc cho khách ghim vị trí (§8.2). Trước mắt: **luôn hiện `formatted_address` Google trả về để khách xác nhận đúng chỗ**, và luôn để chủ xe sửa được |
| **Địa chỉ khách là PII** | Cao | `delivery_address` + toạ độ khách **không bao giờ** được lọt ra `public_listings` hay API public (ADR 0008). Chỉ shop chủ quản + khách đó đọc được |
| **Đổi kỳ vọng của khách** | Trung bình | Chữ hiện tại hứa _"Miễn phí"_ + _"chủ xe trao đổi trực tiếp"_. Bật tự tính là **đổi lời hứa** → phải sửa cả `vi` và `en` của namespace `booking-requests` (skill `i18n`), không chỉ thêm chữ mới |
| **Vượt hạn mức âm thầm** | Trung bình | Bật budget alert trên Cloud Console + đếm request trong log có cấu trúc (`nestjs-pino`) để tự biết trước |
| **Google chết / timeout** | Trung bình | Mọi lỗi provider → `manual_required`, **không bao giờ** chặn khách gửi yêu cầu. Timeout ngắn (≤3s) + không retry vô hạn |
| **Client tự khai khoảng cách** | Cao | `distanceKm` chỉ do server tính. Endpoint preview **không nhận** `distanceKm` từ body |

---

## 8. Phân bậc phạm vi

### Bậc 1 — MVP đúng yêu cầu "tích hợp đơn giản" (đề xuất làm)

- ADR 0018 chốt §4 (một chiều · đường bộ · số tự động là tạm · điểm đi = chi nhánh).
- `apps/api/src/modules/geo/` — interface + Google provider + `GeoNotConfiguredProvider`.
- 2 env mới ở [env.schema.ts](../../apps/api/src/config/env.schema.ts) + `.env.example`.
- Migration: bảng `geocode_cache` (+ `distance_cache` nếu tách riêng) — skill `database-change`.
- Geocode chi nhánh trong `BranchesService.create/update`; form chi nhánh hiện lại
  `formatted_address` + iframe map để chủ shop xác nhận đúng chỗ.
- Endpoint preview phí giao + nối lại `deliveryFeeFor()` vào luồng duyệt yêu cầu.
- FE: nút "Tính phí giao dự kiến" ở bước chọn giao xe + hiện breakdown; iframe map ở trang chi
  tiết xe và màn duyệt yêu cầu.
- i18n `vi` + `en` cho toàn bộ chữ mới **và** chữ cũ đang hứa miễn phí.
- Test: `deliveryFeeFor` (đã có) + provider giả + ca `GEO_NOT_CONFIGURED` + ca prefilter chặn.

### Bậc 2 — nâng độ chính xác (làm sau, khi có số liệu sai thực tế)

1. **Places Autocomplete** cho ô địa chỉ khách — buộc địa chỉ chuẩn, kèm sẵn `place_id`
   (bỏ luôn 1 lần geocode). Thêm 1 SKU vào quota.
2. **Ghim vị trí trên bản đồ** — cần Maps JavaScript API (10k map load/tháng). Giải quyết dứt
   điểm ca hẻm/ngõ mà geocode chịu thua.
3. Hiện bán kính phục vụ của shop dưới dạng vòng tròn trên bản đồ ở trang gian hàng.

### 8.3 Đường thoát nếu Google không hợp

Vì `GeoProvider` là interface trung lập, đổi sang **Goong** (dữ liệu địa chỉ Việt Nam sát hơn,
giá rẻ hơn đáng kể) hay **OSRM tự host** chỉ là viết thêm một file provider + đổi `useClass` ở
module — phần cache/prefilter/tính phí/UI không phải sửa. Đây là lý do phải làm interface ngay từ
đầu chứ không gọi thẳng `fetch('https://maps.googleapis.com/…')` trong service.

---

## 9. Câu chưa có lời

1. **TTL cache toạ độ** — phụ thuộc ToS bản hiện hành, phải đọc trước khi chốt migration.
2. **Khách có phải xác nhận lại báo giá trước khi shop duyệt không?**
   `docs/design/12_VEHICLE_360_MANAGEMENT.md` §6.3 đánh dấu chính câu này là **Unknown** và ghi
   _"cần chốt trước triển khai backend"_. Vẫn còn Unknown.
3. **Xe không gắn `branchId`** (cột nullable) — geocode `tenant.profile.address` hay thẳng tay
   `manual_required`? Đề xuất: `manual_required`, để lộ dữ liệu thiếu thay vì đoán.
