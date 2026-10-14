# ADR 0059 — "Có hỗ trợ xuất hoá đơn VAT" là THÔNG TIN gian hàng / chủ xe công bố cho MỌI xe, không phải chức năng hoá đơn

Ngày: 14/10/2026 · Trạng thái: Accepted · Áp dụng: ADR 0008 §3 (chợ JOIN `tenants`, không chép
trạng thái tenant sang listing) · Liên quan: ADR 0028 §4 (thuế khấu trừ phía chủ xe — KHÔNG đổi),
ADR 0050 (phiên hỗ trợ mặc định từ chối), ADR 0051 · 0053 (site partner dùng chung hai tuyến)

## Bối cảnh

Khách doanh nghiệp và khách đi công tác cần hoá đơn VAT để quyết toán chi phí. Hôm nay họ không có
cách nào biết trước chủ xe nào xuất được hoá đơn: họ gửi yêu cầu, hỏi qua tin nhắn, và bỏ đi khi câu
trả lời là không. Phía chủ xe, người xuất được hoá đơn không có chỗ nào để nói điều đó ra trên chợ.

Cám dỗ là làm luôn "chức năng hoá đơn": lấy thông tin xuất hoá đơn của khách lúc đặt xe, sinh số hoá
đơn, lưu bản PDF. Mỗi bước trong đó kéo XePrime vào nghĩa vụ của bên phát hành hoá đơn, và nhập nhằng
với khoản thuế nền tảng đang khấu trừ thay chủ xe (ADR 0028 §4).

## Quyết định

### 1. Một thiết lập CẤP GIAN HÀNG, áp cho mọi xe, mặc định `false`

`tenants.vat_invoice_supported BOOLEAN NOT NULL DEFAULT false`. Bật một lần là mọi xe của gian hàng /
chủ xe mang dấu hiệu và vào bộ lọc; không có ghi đè theo từng xe.

Bản đầu (cùng ngày, chưa merge) đặt cờ trên TỪNG XE kèm bản sao trên `public_listings`. Chủ sản phẩm
chốt lại: khả năng xuất hoá đơn là của NGƯỜI BÁN, không phải của một chiếc xe — chủ xe không muốn
bật lại cho từng xe, và một gian hàng "xe này có, xe kia không" là thứ khách không hiểu được. Migration
`20261014160000_vat_invoice_support_shop_level` dời cờ về `tenants` và gỡ hai cột cũ; cờ theo xe chưa
từng lên staging/production nên không có gì để mang sang.

Dữ liệu cũ là `false`: không có gì cho phép suy ra một cam kết chủ xe chưa từng đưa ra.

### 2. Đây là thông tin, không phải chức năng

Tính năng này **không** tạo, phát hành, lưu trữ hay xử lý hoá đơn nào, và XePrime **không** xuất hoá
đơn thay chủ xe; không lấy thông tin xuất hoá đơn của khách; không tính thuế VAT; không đổi giá, phí,
tiền giữ chỗ, quyết toán hay sổ thuế khấu trừ (ADR 0028 §4 giữ nguyên). Cờ **không** là điều kiện gửi
yêu cầu, duyệt chuyến hay giao nhận, và không snapshot vào đơn.

Mọi câu chữ cho khách nói rõ hai bên tự thoả thuận, xác nhận trực tiếp, và đúng PHẠM VI của hoá đơn:
chủ xe xuất cho **tiền thuê trả cho chủ xe**; XePrime không xuất thay chủ xe, và khoản khách trả cho
XePrime (phí dịch vụ) không nằm trong hoá đơn đó. KHÔNG viết "XePrime không phát hành hoá đơn" trống
không — XePrime là bên bán phí dịch vụ và gói thuê bao của chính mình, và "hoá đơn cho chuyến thuê
này" làm khách doanh nghiệp tưởng một hoá đơn phủ mọi khoản đã trả. Chỉ gắn dấu khi `true`; `false`
nghĩa là "chưa công bố", không phải "từ chối", nên không có nhãn phủ định nào.

### 3. Chợ JOIN `tenants`, không chép sang `public_listings`

Cùng lý do ADR 0008 §3 từ chối denormalize `tenants.status`: bật/tắt phải là MỘT `UPDATE` một dòng, có
hiệu lực cho cả đội xe cùng lúc — không phải N dòng snapshot có thể lệch nhau, và không cần đường đồng
bộ nào từ `TenantsService` sang `ListingsService`.

Bộ lọc `vatInvoice` của `GET /public/listings` và `/facets` là một điều kiện trên quan hệ `tenant`, ở
CẢ HAI bản dựng điều kiện (`buildListingWhere` · `buildListingWhereSql`, bản SQL là một `EXISTS` trên
`tenants`), chạy trong câu truy vấn trước phân trang; facet đếm `amenities.vatInvoice`. Thẻ xe và trang
xe đọc cờ qua cùng lượt join gian hàng mà chúng đã có (tên, ảnh, tuyến). Không thêm index: `tenants` là
bảng nhỏ (quy mô MVP ~1.000) và đã được join sẵn ở mọi truy vấn chợ.

**Không có cơ chế realtime nào**: khách thấy thay đổi ở lần tải trang kế tiếp, qua đúng cache công
khai mà mọi thông tin xe (giá, ảnh…) đang dùng — danh sách kết quả và trang xe
`PUBLIC_CACHE_SECONDS.listing` (30 giây), số đếm bộ lọc `PUBLIC_CACHE_SECONDS.facets` (60 giây).

### 4. `GET` / `PATCH /tenants/current/vat-invoice`

- `GET` — `tenants.view`; `@SupportAction(TENANT_PROFILE_VIEW)`: nhân sự hỗ trợ XEM được để trả lời
  khách.
- `PATCH` body `{ supported: boolean }` — `tenants.update` (cùng quyền với hồ sơ và chính sách gian
  hàng), tenant từ membership. **Không** `@SubscriptionTrackOnly` / `@RequiresFeature`: áp như nhau hai
  tuyến. **Không** `@SupportAction`: đây là cam kết thương mại chủ xe đưa ra với khách, phiên hỗ trợ
  không bật/tắt thay (web ẩn bằng `SUPPORT_HIDDEN_AREA.VAT_INVOICE_TOGGLE`).

Writer duy nhất: `TenantsService.setVatInvoiceSupport`. Ghi bằng compare-and-set (`where` mang giá trị
cũ): gửi lại đúng giá trị là no-op, hai lượt song song chỉ một lượt ghi, một dòng audit
`tenant.vat_invoice.update` cho một lần đổi thật.

Endpoint riêng chứ không phải một trường của `PATCH /tenants/current/profile`: công tắc lưu NGAY khi
bấm, còn lượt lưu hồ sơ là một form nhiều ô (tên, địa chỉ, đổi tỉnh dời chi nhánh mặc định…).

### 5. Hai chỗ đặt, một component

`VatInvoiceSetting` (`features/shop/components/`) — phần thân: trạng thái bằng chữ + công tắc + ghi chú
"ai xuất hoá đơn, cho khoản nào". Lưu ngay, `loading` khi đang lưu, lỗi theo mã; tải hỏng có thử lại;
thiếu quyền sửa hoặc trong phiên hỗ trợ thì chỉ còn chữ.

- **Tuyến gói:** trang **Chính sách thuê** (`/shop/policies`), một section riêng ngay dưới công tắc thu
  cọc, ĐỨNG NGOÀI tabs theo loại xe — đặt trong tabs sẽ gợi ý sai rằng nó khác nhau theo loại xe.
- **Tuyến hoa hồng:** chủ xe cá nhân không có trang chính sách gian hàng, nên nó là một section của
  **Hồ sơ chủ xe** (`/account?section=vat-invoice`), sau "Địa chỉ nhận xe".

Phía khách: toggle "Hỗ trợ xuất hoá đơn VAT" trong panel Bộ lọc (`LISTING_AMENITY.VAT_INVOICE`, sống
trên URL `?vatInvoice=1` — ADR 0004, "Xoá bộ lọc" xoá được), nhãn ngắn trên thẻ xe, badge + khối giải
thích ở trang xe.

## Đã chốt với chủ sản phẩm (14/10/2026)

- **Thiết lập chung, không theo từng xe** — xem điều 1.
- **Chủ xe cá nhân tuyến hoa hồng VẪN có công tắc.** Một cá nhân có thể xuất hoá đơn qua doanh nghiệp
  của mình hoặc qua bên thứ ba — bật hay không là việc CHỦ XE tự quyết và tự chịu trách nhiệm với cam
  kết đó. Nền tảng không thẩm định khả năng xuất hoá đơn của ai.
- **Khấu trừ thuế thay chủ xe (ADR 0028 §4) không bị đụng tới.** Cờ chỉ là ghi chú thông tin cho
  người thuê; nó không đi vào sổ thuế khấu trừ, bảng kê chủ xe hay bất kỳ dòng tiền nào.
- **Không cần realtime.** Thấy thay đổi khi tải lại trang là đủ — xem điều 3.

## Hệ quả

- `LISTING_AMENITY` (dùng chung web ↔ native) có thêm `vatInvoice`. **App native chưa nối** (ADR 0031,
  hai bản tầng gọi API): `apps/mobile/shared/src/api/marketplace/api.ts` (`toListingQueryParams`),
  `features/marketplace/components/FilterSheet.tsx` (`FilterDraft` · `draftFromFilters` ·
  `draftToPatch` · `facetFilters`), `VehicleCard.tsx` và `ListingDetailScreen.tsx`; công tắc của chủ xe
  trên app native cũng chưa có. Tới lúc đó panel lọc của app hiện mục VAT mà chưa gửi tham số, và
  `FilterSheet.tsx` có lỗi kiểu TS7053 ở `draft[amenity]` / `set(amenity, …)` vì `FilterDraft` liệt kê
  tay bốn tiện ích (`tsc` của app hiện tự crash nên lỗi chưa lộ). Web đã bỏ kiểu liệt kê tay đó:
  `FilterPanel` và `toListingQueryParams` đọc thẳng `LISTING_AMENITY_VALUES`. `LISTING_AMENITY_DESC`
  (tiếng Việt) thành `@deprecated` — web đọc `Marketplace.filterPanel.amenityDesc.*` của bó message dùng
  chung.
- Không có gì để đối soát: XePrime không giữ bằng chứng chủ xe đã xuất hoá đơn. Khiếu nại "chủ xe hứa
  mà không xuất" đi qua kênh hỗ trợ như mọi cam kết công bố khác; dòng audit cho biết cờ bật từ lúc nào
  và ai bật.

## Phương án đã cân nhắc và bỏ

- **Cờ theo từng xe** (bản đầu của chính ADR này) — xem điều 1.
- **Trường trong `rental_policies`** (mặc định gian hàng + ghi đè theo xe, như "giao xe tận nơi").
  Mang theo cả cơ chế kế thừa/ghi đè mà quyết định này không muốn, và chủ xe tuyến hoa hồng sửa chính
  sách theo TỪNG XE (`policySource="direct"`) — tức là quay lại đúng cờ theo xe.
- **Ghép vào `tenant_payment_settings`.** Bảng đó là cấu hình THU TIỀN (XePrime có giữ tiền khách hay
  không); đặt một cờ "không đụng tiền" vào đó là mời người đọc sau nghĩ nó có.
- **Chép sang `public_listings`.** ADR 0008 §3 — xem điều 3.
- **Tính năng hoá đơn đầy đủ** (thông tin xuất hoá đơn lúc đặt, số hoá đơn, tải PDF) — xem Bối cảnh.
- **Snapshot cờ vào đơn.** Không có quyết định nào đọc nó; thêm vào là một cột không ai bảo trì.

## Điều kiện xem lại

- Khi có yêu cầu nghiệp vụ để nền tảng ghi nhận "khách cần hoá đơn" trên yêu cầu thuê, hay đối soát
  việc xuất hoá đơn — lúc đó cần snapshot vào đơn và một ADR về trách nhiệm thuế.
- Khi có nhu cầu thật cho "gian hàng này xuất được cho xe A nhưng không cho xe B" (ví dụ xe hợp tác của
  cá nhân trong một gian hàng doanh nghiệp): thêm ghi đè theo xe CÓ CHỦ Ý, không quay lại cờ theo xe
  thuần.
