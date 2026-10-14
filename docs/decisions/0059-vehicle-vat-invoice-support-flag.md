# ADR 0059 — "Có hỗ trợ xuất hoá đơn VAT" là THÔNG TIN chủ xe công bố theo từng xe, không phải chức năng hoá đơn

Ngày: 14/10/2026 · Trạng thái: Accepted · Mở rộng: ADR 0008 (thêm một cột mirror trên `public_listings`)
· Liên quan: ADR 0028 §4 (thuế khấu trừ phía chủ xe — KHÔNG đổi), ADR 0048 (mẫu công tắc lưu ngay),
ADR 0050 (phiên hỗ trợ mặc định từ chối), ADR 0051 · 0053 (bề mặt partner dùng chung hai tuyến)

## Bối cảnh

Khách doanh nghiệp và khách đi công tác cần hoá đơn VAT để quyết toán chi phí. Hôm nay họ không có
cách nào biết trước chủ xe nào xuất được hoá đơn: họ gửi yêu cầu, hỏi qua tin nhắn, và bỏ đi khi câu
trả lời là không. Phía chủ xe, những gian hàng có pháp nhân xuất được hoá đơn không có chỗ nào để nói
điều đó ra trên chợ.

Cám dỗ là làm luôn "chức năng hoá đơn": lấy thông tin xuất hoá đơn của khách lúc đặt xe, sinh số hoá
đơn, lưu bản PDF. Mỗi bước trong đó kéo XePrime vào nghĩa vụ của người phát hành hoá đơn điện tử, và
nhập nhằng với khoản thuế nền tảng đang khấu trừ thay chủ xe (ADR 0028 §4) — thứ còn chờ tư vấn thuế
(roadmap L3).

## Quyết định

### 1. Một cờ boolean theo TỪNG XE, mặc định `false`

`vehicles.vat_invoice_supported BOOLEAN NOT NULL DEFAULT false`. Theo xe chứ không theo gian hàng: một
gian hàng có thể có xe sở hữu (xuất được) cạnh xe hợp tác của cá nhân (không xuất được).

Dữ liệu cũ là `false`: không có gì cho phép suy ra một cam kết chủ xe chưa từng đưa ra. Migration
`20261014120000_vehicle_vat_invoice_support` dùng `NOT NULL DEFAULT false` làm phép backfill vì giá
trị backfill TRÙNG nghĩa với mặc định của xe mới (khác ADR 0048, nơi hai nghĩa đó khác nhau).

### 2. Đây là thông tin, không phải chức năng

Tính năng này **không** tạo, phát hành, lưu trữ hay xử lý hoá đơn nào, và XePrime **không** xuất hoá
đơn thay chủ xe; không lấy thông tin xuất hoá đơn của khách; không tính thuế VAT; không đổi giá, phí, tiền giữ chỗ, quyết toán hay sổ thuế khấu trừ. Cờ
**không** là điều kiện gửi yêu cầu, duyệt chuyến hay giao nhận, và không được snapshot vào đơn —
chưa có yêu cầu nghiệp vụ nào cần biết "lúc đặt, xe có hứa xuất hoá đơn không".

Mọi câu chữ cho khách nói rõ hai bên tự thoả thuận, xác nhận trực tiếp, và đúng PHẠM VI của hoá đơn:
chủ xe xuất cho **tiền thuê trả cho chủ xe**; XePrime không xuất thay chủ xe, và khoản khách trả cho
XePrime (phí dịch vụ) không nằm trong hoá đơn đó. KHÔNG viết "XePrime không phát hành hoá đơn" trống
không — XePrime là bên bán phí dịch vụ và gói thuê bao của chính mình, và "hoá đơn cho chuyến thuê
này" làm khách doanh nghiệp tưởng một hoá đơn phủ mọi khoản đã trả. Chỉ gắn dấu khi `true`; `false` nghĩa là "chưa công bố", không phải "từ chối", nên không có
nhãn phủ định nào.

### 3. Mirror sang `public_listings`, writer vẫn là `ListingsService`

`public_listings.vat_invoice_supported` để bộ lọc chợ đọc một bảng (ADR 0008). Chỉ
`ListingsService.syncFromVehicle` ghi, trong cùng transaction với lượt đổi cờ. Xe chưa ra chợ thì
`syncFromVehicle` chỉ chạm `status` — bản sao được ghi đủ ở lượt sync đưa xe ra chợ.

Bộ lọc `vatInvoice` của `GET /public/listings` và `/facets` chạy ở DB, trước phân trang, trong CẢ HAI
bản dựng điều kiện (`buildListingWhere` · `buildListingWhereSql`); facet đếm `amenities.vatInvoice`.
Index `(status, vat_invoice_supported, rank_score)` phục vụ bộ lọc theo sort mặc định. Cache facet
60 giây tự nhận tham số mới (khoá dựng từ cả query). **Không có cơ chế realtime nào**: khách thấy
thay đổi ở lần tải trang kế tiếp, qua đúng cache công khai mà mọi thông tin xe (giá, ảnh…) đang dùng
— danh sách kết quả và trang xe `PUBLIC_CACHE_SECONDS.listing` (30 giây), số đếm bộ lọc
`PUBLIC_CACHE_SECONDS.facets` (60 giây). Trình duyệt của chủ xe bỏ cache `marketplace` của chính nó
sau lượt lưu.

### 4. `PATCH /vehicles/:id/vat-invoice` — endpoint riêng, lưu ngay

Body `{ supported: boolean }`, `vehicles.update`, `@BranchScoped`, tenant từ membership. **Không**
`@SubscriptionTrackOnly` / `@RequiresFeature`: cờ áp như nhau cho tuyến hoa hồng và tuyến gói.
**Không** `@SupportAction`: đây là cam kết thương mại chủ xe đưa ra với khách, phiên hỗ trợ của nền
tảng không bật/tắt thay (web ẩn công tắc bằng `SUPPORT_HIDDEN_AREA.VAT_INVOICE_TOGGLE`).

Ghi bằng compare-and-set (`where` mang giá trị cũ) như ADR 0048: gửi lại đúng giá trị là no-op, hai
lượt song song chỉ một lượt ghi, một dòng audit `vehicle.vat_invoice.update` cho một lần đổi thật.

Không phải một trường của `PATCH /vehicles/:id`: lượt lưu form hồ sơ khoá dòng, chấm danh mục, làm
mới phiếu duyệt đang chờ — quá nặng cho một công tắc; và một trường trong form là chỗ ghi thứ hai cho
cùng một trạng thái.

### 5. Một chỗ trên giao diện chủ xe

Hàng "Xuất hoá đơn VAT" trong thẻ "Giá & chính sách" của Hồ sơ 360 (`VatInvoiceSupportRow`) — màn
`/vehicles/:id` dùng chung cho cả hai tuyến (chủ xe tuyến hoa hồng vào qua link hồ sơ ở không gian
"Quản lý xe"). Lưu ngay, `loading` khi đang lưu, lỗi theo mã; thiếu quyền hay trong phiên hỗ trợ thì
chỉ còn chữ.

Phía khách: toggle "Hỗ trợ xuất hoá đơn VAT" trong panel Bộ lọc (`LISTING_AMENITY.VAT_INVOICE`, sống
trên URL `?vatInvoice=1` — ADR 0004, "Xoá bộ lọc" xoá được), nhãn ngắn trên thẻ xe, và badge + khối
giải thích ở trang xe.

## Hệ quả

- `LISTING_AMENITY` (dùng chung web ↔ native) có thêm `vatInvoice`. **App native chưa nối** (ADR 0031,
  hai bản tầng gọi API): `apps/mobile/shared/src/api/marketplace/api.ts` (`toListingQueryParams`),
  `features/marketplace/components/FilterSheet.tsx` (`FilterDraft` · `draftFromFilters` ·
  `draftToPatch` · `facetFilters`), `VehicleCard.tsx` và `ListingDetailScreen.tsx` — việc của đội
  mobile. Tới lúc đó panel lọc của app hiện mục VAT mà chưa gửi tham số, và `FilterSheet.tsx` có lỗi
  kiểu TS7053 ở `draft[amenity]` / `set(amenity, …)` vì `FilterDraft` liệt kê tay bốn tiện ích (`tsc`
  của app hiện tự crash nên lỗi chưa lộ). Web đã bỏ kiểu liệt kê tay đó: `FilterPanel` và
  `toListingQueryParams` đọc thẳng `LISTING_AMENITY_VALUES`. `LISTING_AMENITY_DESC` (tiếng Việt)
  thành `@deprecated` — web đọc `Marketplace.filterPanel.amenityDesc.*` của bó message dùng chung.
- Không có gì để đối soát: XePrime không giữ bằng chứng chủ xe đã xuất hoá đơn. Khiếu nại "chủ xe hứa
  mà không xuất" đi qua kênh hỗ trợ như mọi cam kết công bố khác; dòng audit cho biết cờ bật từ lúc
  nào và ai bật.

## Phương án đã cân nhắc và bỏ

- **Cờ theo gian hàng.** Sai với gian hàng trộn xe sở hữu và xe hợp tác — xem điều 1.
- **Tính năng hoá đơn đầy đủ** (thông tin xuất hoá đơn lúc đặt, số hoá đơn, tải PDF). Biến XePrime
  thành bên phát hành/lưu hoá đơn và va vào sổ thuế khấu trừ chưa được tư vấn — xem Bối cảnh.
- **Không mirror, join sang `vehicles` lúc lọc.** Bộ lọc chợ chỉ đọc `public_listings` (ADR 0008); một
  chiều lọc join sang bảng khác là bản sao thứ ba của luật scope công khai.
- **Snapshot cờ vào đơn.** Không có quyết định nào đọc nó; thêm vào là một cột không ai bảo trì.

## Đã chốt với chủ sản phẩm (14/10/2026)

- **Chủ xe cá nhân tuyến hoa hồng VẪN có công tắc.** Một cá nhân có thể xuất hoá đơn qua doanh
  nghiệp của mình hoặc qua bên thứ ba — bật hay không là việc CHỦ XE tự quyết và tự chịu trách
  nhiệm với cam kết đó. Nền tảng không thẩm định khả năng xuất hoá đơn của ai.
- **Khấu trừ thuế thay chủ xe (ADR 0028 §4) không bị đụng tới.** Cờ chỉ là ghi chú thông tin cho
  người thuê; nó không đi vào sổ thuế khấu trừ, bảng kê chủ xe hay bất kỳ dòng tiền nào.
- **Không cần realtime.** Thấy thay đổi khi tải lại trang là đủ — xem điều 3.

## Điều kiện xem lại

- Khi có yêu cầu nghiệp vụ để nền tảng ghi nhận "khách cần hoá đơn" trên yêu cầu thuê, hay đối soát
  việc xuất hoá đơn — lúc đó cần snapshot vào đơn và một ADR về trách nhiệm thuế.
