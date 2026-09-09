# ADR 0031 — Tách tầng gọi API theo app; `@xeprime/api-client` chỉ còn hạ tầng HTTP

Ngày: 09/09/2026 · Trạng thái: Accepted · Ghi đè: ADR 0007 (phần "một client cho web và native" ở
tầng FEATURE — phần contract-first vẫn giữ nguyên) · Liên quan: 0002, 0017

## Bối cảnh

`packages/api-client` được dựng theo hướng "MỘT client cho web và native": ngoài phần hạ tầng
(`client.ts`, `transport.ts`, `errors.ts`, `url.ts`, `http.ts`, `cache.ts`, `query-keys.ts`) nó còn
giữ 25 thư mục `features/*` — đường dẫn endpoint, serialize bộ lọc, alias type từ
`api.generated.ts` — cho cả hai app dùng chung.

Kiểm kê ngày 09/09/2026 (bám vào import specifier thật, không grep tên trần):

| | Web | App native |
| --- | --- | --- |
| Số feature dùng | **5** / 25 | **25** / 25 |
| Ví dụ mức dùng | `marketplace`: 1/9 hàm · `auth`: 8/14 hàm | dùng gần như toàn bộ |

Giá phải trả của việc dùng chung không nằm ở chỗ trùng code, mà ở chỗ **bán kính nổ**: sửa một
trường DTO cho một màn hình của app native là đụng vào module mà 20 màn của web đang import. Web
lại là bề mặt đang chạy pilot, còn app native đang thay đổi từng tuần. Một bên đang ổn định phải
gánh rủi ro hồi quy của bên đang xây.

Thêm một điểm: 4/5 feature "dùng chung" đó web đã có tầng api riêng nằm cạnh
(`features/marketplace/api.ts`, `features/catalog/api.ts`, `features/chat/api.ts`,
`services/auth.service.ts`) và chỉ uỷ quyền một phần sang package — nên "dùng chung" trên thực tế
đã là hai lớp chồng nhau, không phải một nguồn.

## Quyết định

### 1. `packages/api-client` chỉ giữ hạ tầng HTTP

Ở lại: cấu hình client, phong bì `{data,meta}`, phân trang, `ApiClientError` + mã lỗi,
`AuthTransport` (web `credentials:'include'` · native `Bearer` — ADR 0002/0017), `platformFetch`,
`STALE_TIME`, `queryKeys`. **Thư mục `src/features/` bị xoá.**

Ranh giới: cái gì không biết XePrime có nghiệp vụ gì thì ở lại; cái gì biết `/customers` tồn tại
thì đi.

### 2. Mỗi app giữ tầng feature của riêng mình

- **App native**: `apps/mobile/src/api/<feature>/` — bản đầy đủ 25 feature, chép nguyên văn, giữ
  nguyên tên export (`bookingsApi`, `vehiclesApi`, `marketplaceApi`…) và import chéo giữa feature.
- **Web**: KHÔNG có thư mục mirror. Phần web thật sự dùng được viết lại vào chính file api sẵn có
  của web, cạnh phần web đã tự viết — xem bảng ở §Hệ quả.

### 3. Query key vẫn dùng chung

`queryKeys` ở lại package. Nó là quy ước đặt tên cache, không phải lời gọi mạng; hai app lệch query
key là hai app không invalidate được cho nhau khi sau này có màn dùng chung.

### 4. Đánh đổi được chấp nhận tường minh: sửa nghiệp vụ là sửa HAI chỗ

Đổi một trường DTO, thêm một tham số lọc, đổi một đường dẫn — phải sửa CẢ bản web lẫn bản native.
Không còn cơ chế nào tự đồng bộ.

Cái giữ hai bản không trôi khỏi nhau **không phải** là code dùng chung nữa, mà là:

- `packages/types/src/api.generated.ts` — vẫn là nguồn type duy nhất, sinh bằng `openapi-typescript`
  (ADR 0007). Một field đổi tên ở backend làm ĐỎ typecheck ở cả hai app. Đây là hàng rào chính, và
  nó vẫn còn nguyên.
- Test hàm thuần đứng đôi: `filtersToParams` của sổ khách có test ở cả
  `apps/web/src/features/customers/api.test.ts` lẫn `apps/mobile/src/api/customers/api.test.ts`,
  giữ cùng kỳ vọng.

Thứ hàng rào type KHÔNG bắt được: hai bên gửi hai bộ query param khác nhau tới cùng một endpoint
(tên tham số là chuỗi, không phải type). Đó là rủi ro thật của quyết định này. Chỗ nào có nguy cơ
đó — hiện là `toListingQueryParams` và `filtersToParams` — phải có test hai phía.

## Hệ quả

Web dùng gì, và sau khi tách thì nó nằm ở đâu:

| Từ `packages/api-client/src/features/` | Web dùng | Nhà mới ở web |
| --- | --- | --- |
| `auth/api.ts` — `authApi` | 8/8 hàm | `apps/web/src/services/auth.service.ts` — gọi `apiGet/apiPost/apiDelete` thẳng, thêm `changePassword` |
| `auth/types.ts` — `CurrentUser` | 1 type | `apps/web/src/hooks/use-current-user.ts` — `Schemas['MeDto']` |
| `catalog/index.ts` — `catalogModelApi`, `CatalogModel` | 1/1 hàm | `apps/web/src/features/catalog/api.ts` |
| `catalog/index.ts` — `catalogLabel`, `groupCatalog`, `EMPTY_CATALOG`, `CatalogItem`, `CatalogMap` | tất cả | `apps/web/src/features/catalog/types.ts` |
| `chat/api.ts` — `chatApi` + 10 type | 10/10 hàm | `apps/web/src/features/chat/api.ts` + `types.ts` |
| `customers/api.ts` — `customersApi` + 16 type | 18/18 hàm | `apps/web/src/features/customers/api.ts` + `types.ts` (giữ đúng tên hàm cũ của web: `fetchCustomers`, `createCustomer`…) |
| `marketplace/api.ts` — `marketplaceApi.listing` | 1/9 hàm | **không viết lại** — web đã có `fetchListingDetailClient` gọi đúng `/public/listings/:id` |
| `marketplace/api.ts` — `toListingQueryParams` | 1 hàm | `apps/web/src/features/marketplace/filter-params.ts` |

20 feature còn lại (`account`, `booking-requests`, `bookings`, `branches`, `contracts`, `drivers`,
`finance`, `handovers`, `locations`, `members`, `payments`, `rental-policies`, `reviews`,
`settlement`, `tenants`, `trips`, `uploads`, `vehicle-documents`, `vehicle-maintenance`,
`vehicles`) chỉ app native dùng → chuyển thẳng, web không có bản nào.

Luật còn nguyên giá trị sau quyết định này:

- `apps/mobile/src/api/**` vẫn KHÔNG được import `next/*`, `antd`, DOM API, `File`,
  `XMLHttpRequest`, CSS hay React UI — nó là bản clone của code framework-free, và bước upload dùng
  `File` vẫn ở lại tầng app (web: `services/upload.ts`; native: `lib/r2-image-upload.ts`).
- Không đọc `process.env` trong `packages/api-client` — app vẫn truyền cấu hình vào bằng
  `configureApiClient({ baseUrl, transport })`.
- Type vẫn alias thẳng từ `api.generated.ts`, không viết tay DTO (ADR 0007).

## Điều kiện xem lại

Quay lại mô hình dùng chung nếu **cả hai** điều sau đúng:

1. App native đã ổn định (hết một chu kỳ release không đổi contract), VÀ
2. Đo được ≥ 3 lần hai bản trôi khỏi nhau gây lỗi thật ở production.

Khi đó việc gộp lại phải bắt đầu từ những feature web dùng ≥ 80% số hàm (hiện là `chat`,
`customers`), không gộp lại toàn bộ.
