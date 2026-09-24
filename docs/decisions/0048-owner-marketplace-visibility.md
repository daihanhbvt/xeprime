# ADR 0048 — Công tắc hiển thị trên chợ của chủ xe (trục thứ ba)

Ngày: 23/09/2026 · Trạng thái: Accepted · Ghi đè: **0005 điều `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`** (bỏ `hidden`) · Mở rộng: 0008 §2 · Liên quan: 0030, 0036, 0040, 0041

## Bối cảnh

Chủ xe không có cách nào tạm rút một chiếc xe khỏi chợ. Xe đã bán, xe đang sửa dài ngày, xe cho người nhà mượn một tháng — cả ba đều là chuyện thường ngày, và cả ba hôm nay chỉ có hai lối thoát, cả hai đều sai:

1. **Xoá mềm xe.** Mất hồ sơ, mất lịch sử chuyến, mất giấy tờ, và `remove()` từ chối nếu còn lịch tương lai. Đây là xoá một tài sản, không phải cất nó đi.
2. **Đổi `operation_status` sang `inactive`.** Không có tác dụng gì ngoài chợ — `public_listings` không đọc cột đó, nên xe vẫn hiện và vẫn nhận yêu cầu thuê.

Cám dỗ hiển nhiên là dùng `public_status = hidden`. Nó SAI, và sai theo cách chỉ lộ ra sau khi đã ship:

- `hidden` là quyết định **kiểm duyệt của nền tảng** (`POST /platform/vehicles/:id/hide`, có `reason`, ghi audit với `actorScope: 'platform'`). Cho chủ xe ghi vào cột đó nghĩa là họ tự gỡ được án ẩn — vì `VEHICLE_PUBLIC_STATUS_SUBMITTABLE` đang có `hidden`, một cú bấm "Gửi duyệt lại" là đủ.
- Ngược lại cũng hỏng: admin `unhide` một chiếc xe mà chủ xe đang cố ý cất đi sẽ kéo nó trở lại chợ, và không ai biết vì sao.
- Và không có chỗ nào phân biệt được hai câu hỏi khác hẳn nhau: *"nền tảng có cho xe này bán không"* với *"chủ xe có muốn bán nó lúc này không"*.

Một cột không trả lời được hai câu hỏi độc lập.

## Quyết định

### 1. Ba trục độc lập, ba cột

| Trục | Cột | Ai đổi | Nghĩa |
| --- | --- | --- | --- |
| **Vận hành** | `vehicles.operation_status` | Gian hàng | Xe rảnh / đang thuê / bảo dưỡng / ngừng hoạt động |
| **Kiểm duyệt** | `vehicles.public_status` | **Nền tảng** (`ApprovalService`, `PlatformVehiclesService`) | Nháp · chờ duyệt · đã duyệt · cần bổ sung · bị từ chối · **bị nền tảng ẩn** · lưu trữ |
| **Hiển thị** | `vehicles.marketplace_enabled` (MỚI) | **Chủ xe** | Có cho xe hiện ngoài chợ không |

`marketplace_enabled BOOLEAN NOT NULL DEFAULT true`. Migration `20260923170000_vehicle_marketplace_visibility` thêm cột NULLABLE → `UPDATE ... WHERE IS NULL` → `SET DEFAULT true` + `SET NOT NULL`, ba bước tường minh để phép backfill đọc được trong file chứ không nấp trong một `DEFAULT`. Mọi xe đang có đều `true`: trước ADR này khái niệm "chủ xe tạm ẩn" không tồn tại, nên giá trị nào khác cũng là âm thầm gỡ cả chợ xuống trong một lần deploy.

Trạng thái vận hành **không** tham gia phép gộp hiển thị. Một chiếc xe đang có khách thuê vẫn phải hiện ngoài chợ để nhận yêu cầu cho những ngày sau — trộn hai trục đó lại là gỡ nửa đội xe khỏi chợ mỗi cuối tuần.

### 2. Một phép gộp, ở một chỗ

`resolveMarketplaceVisibility()` ở `packages/types/src/status/marketplace-visibility.ts` — thuần, dùng chung API và web:

```
xoá mềm       → archived
gian hàng khoá → shop_inactive
public_status = hidden → platform_hidden
public_status ≠ approved_public → not_approved
marketplace_enabled = false → owner_paused
còn lại → visible
```

Thứ tự **chỉ** quyết định LÝ DO nào được kể khi nhiều vế cùng chặn (mọi vế đều là AND, nên `visible` không phụ thuộc thứ tự). Nó đi từ rào không gỡ được bằng thao tác trên chính chiếc xe, xuống rào chủ xe tự gỡ bằng một cú bấm. Nói "bạn đang tắt hiển thị" với một người mà gian hàng vừa bị khoá là chỉ sai chỗ: họ bật lại công tắc, không có gì xảy ra, và không ai giải thích tại sao.

Ở tầng ghi, hai trục gặp nhau đúng **một** chỗ: `deriveStatus()` trong `ListingsService` — `active` chỉ khi đã duyệt VÀ chủ xe bật. `public_listings` **không** có cột `marketplace_enabled`: bảng snapshot chỉ cần biết KẾT QUẢ, và thêm một cột ở đó là thêm một thứ có thể trôi khỏi bản gốc. Với khách, "ẩn vì chủ xe tắt" và "ẩn vì chưa duyệt" là cùng một điều — xe không có ở đó. Lý do là chuyện của màn quản lý, và nó đọc `vehicles`.

Ở tầng đọc công khai, bốn vế gom vào `marketplaceVehicleWhere()` (`apps/api/src/common/marketplace-vehicle-scope.ts`) — trước đợt này là **năm bản sao** rải ở chi tiết xe ngoài chợ, báo giá, ngữ cảnh mã khuyến mãi, khoảng cách giao xe và gửi yêu cầu thuê. Bỏ sót một bản là chủ xe tắt hiển thị nhưng ai giữ link cũ vẫn gửi được yêu cầu, và gian hàng nhận một yêu cầu cho chiếc xe họ vừa cất đi.

### 3. `PATCH /vehicles/:id/marketplace-visibility` — tắt thì luôn được, bật thì có cổng

Body `{ enabled: boolean }`, permission `vehicles.submit_public` (cùng quyền đưa xe ra chợ — tách ra một permission riêng sẽ tạo một vai "được đưa xe ra chợ nhưng không được rút về", thứ không ai muốn tồn tại), tenant lấy từ membership.

**Tắt luôn được**, kể cả khi gian hàng đang khoá hay nền tảng đang ẩn xe: gỡ xe của mình khỏi chợ không cần xin phép ai. Và tắt **không chạm vào bất cứ thứ gì đang chạy** — `public_status`, `operation_status`, `booking_requests`, `bookings`, `vehicle_occupancies`, `booking_holds` đều nguyên vẹn. Đúng một thứ đổi: `public_listings.status` xuống `hidden`, qua writer duy nhất của bảng đó (ADR 0008 §1).

**Bật** qua ba cổng, và cả ba đều về CHỖ ĐỨNG, không về hồ sơ xe:

1. `public_status = approved_public`. `hidden` có mã lỗi **riêng** (`VEHICLE_PLATFORM_HIDDEN`) chứ không dùng chung `VEHICLE_NOT_APPROVED_PUBLIC`: lối đi tiếp khác hẳn — ở đó không có nút nào chủ xe bấm được, và gộp hai mã là mời họ đi gửi duyệt lại một chiếc xe nền tảng vừa cố ý gỡ xuống.
2. Gian hàng `active` (`SHOP_NOT_ACTIVE`).
3. Mặt tiền gian hàng trả phí còn đủ (`assertPackageShopReadyToList` — cùng cổng với `submitForPublicReview`, ADR 0040 điều 7).

Ghi bằng compare-and-set: `updateMany` mang `marketplace_enabled = !enabled` trong `where`, cộng `public_status = approved_public` khi bật. Hai request song song cùng đích thì chỉ một cái `count === 1`; cái còn lại không ghi audit, không sync lại listing, và trả về trạng thái hiện tại. Cùng mệnh đề đó khoá luôn cuộc đua với một lượt ẩn của nền tảng chen vào sau các cổng — `vehicles` và `public_listings` không lệch nhau được. Gửi lại đúng giá trị đang có là no-op ở nhánh nhanh trước transaction: **một dòng audit cho một lần đổi thật**, không phải một dòng cho một cú bấm.

Audit: `vehicle.marketplace_visibility.update`, `actorScope: 'tenant'`, before/after là `{ marketplaceEnabled }`, ghi trong CÙNG transaction với lệnh cập nhật và lượt sync listing.

#### Hai cổng cố ý KHÔNG chạy ở đây

**Trần số xe của gói** (`assertVehicleQuota`) đếm theo `public_status`, mà công tắc này không đổi `public_status` — chiếc xe đang tạm ẩn vẫn nằm trong phép đếm suốt thời gian đó. Chạy nó ở đây nghĩa là một gian hàng vừa hạ bậc **tắt được nhưng không bật lại được**: công tắc thành cánh cửa một chiều, trong khi việc tắt nó chưa bao giờ nhả ra một chỗ nào cho ai.

**Điều kiện hồ sơ xe** (`missingPublishRequirements`) đã chấm ở cổng duyệt, và từ ADR 0030 thì giá/ảnh/mô tả sửa tự do sau đó mà xe vẫn ở ngoài chợ. Chấm lại ở đây tạo một bất đối xứng lạ: cùng một chiếc xe, cùng một hồ sơ, được phép ĐANG hiện nhưng không được phép hiện LẠI.

### 4. `hidden` rời khỏi phễu tự phục vụ của chủ xe

`VEHICLE_PUBLIC_STATUS_SUBMITTABLE` bỏ `hidden` — còn `draft`, `needs_revision`, `rejected`. Cho gửi duyệt lại từ `hidden` là cho chủ xe gỡ án ẩn bằng cách bấm một nút và đợi một lượt duyệt, đúng thứ việc ẩn xe sinh ra để ngăn. Muốn xe hiện lại thì nền tảng bỏ ẩn.

Nhãn đổi theo: `VEHICLE_PUBLIC_STATUS_META.hidden` và `Domain.vehiclePublicStatus.hidden` từ "Đã ẩn" thành **"Bị nền tảng ẩn"** (màu `danger`, không còn `neutral`), `Vehicles.publish.status.hidden` từ *"Gửi duyệt lại để xe hiển thị trở lại"* thành *"XePrime đã gỡ xe khỏi chợ. Liên hệ hỗ trợ XePrime để được xem xét lại."* Một nhãn nói trống không "Đã ẩn" khiến hai việc hoàn toàn khác nhau đọc lên y hệt nhau.

`PlatformVehiclesService.unhide` **không** đụng `marketplace_enabled`. Chủ xe đang tắt thì bỏ ẩn chỉ trả lại trạng thái kiểm duyệt, và xe vẫn nằm ngoài chợ cho tới khi chính họ bật lại. `syncFromVehicle` nhân hai trục nên điều đó tự đúng — chỉ cần không ai ghi thêm gì ở đó.

### 5. Server suy lý do, client không ghép lại

`VehicleListItemDto` (và `VehicleDetailDto` kế thừa) mang ba trường: `marketplaceEnabled` (lựa chọn), `isMarketplaceVisible` (kết quả), `marketplaceVisibilityReason` (`visible` · `owner_paused` · `not_approved` · `platform_hidden` · `shop_inactive` · `archived`).

Chúng ở **danh sách**, không chỉ ở chi tiết: nếu chỉ chi tiết mới biết một chiếc xe đang bị chủ tạm ẩn thì thẻ xe ngoài danh sách trông y hệt một chiếc đang bán, và chủ xe không có cách nào nhìn ra chiếc mình quên bật lại.

Lý do do **server** suy. Hai bề mặt cùng ghép lại từ ba status sẽ ghép ra hai câu khác nhau, và câu sai luôn là câu chủ xe đang đọc. Vế "gian hàng đang hoạt động" đọc bằng MỘT lượt `tenant.findUnique` cho cả trang (mọi bề mặt ở đây đã tenant-scoped nên câu trả lời là một giá trị), không join vào `LIST_SELECT`.

### 6. Bố cục ở `/manage/vehicles/[id]`: công tắc lên ĐẦU, việc lên chợ vào "Việc cần làm"

Bản đầu đặt công tắc trong thẻ "Duyệt & hiển thị trên chợ" ở cột phải, gần cuối một trang dài. Đúng về phân loại, sai về sử dụng — và nó để lộ một lỗi có sẵn: thẻ "Việc cần làm" ngay đầu trang chỉ đọc cảnh báo do server tính, nên một chiếc xe còn là NHÁP hiện **"Không có việc cần làm"** trong khi việc thật nằm ở chỗ phải cuộn mới thấy. Hai khối trên cùng một trang nói hai điều trái ngược về cùng một xe, và khối nói sai là khối người dùng đọc trước.

**Cột thao tác đầu trang** (trên "Chỉnh sửa"/"Xem lịch") mang hàng **"Trên chợ"**:

- xe `approved_public` → nhãn + trạng thái bằng chữ (`Đang hiển thị` / `Tạm ẩn`) + công tắc, dấu "i" cho câu *"Tắt hiển thị không ảnh hưởng các yêu cầu và đơn thuê hiện có."*;
- xe chưa duyệt → **một THẺ trạng thái, không phải công tắc mờ**: `Chưa hiển thị` · `Đang chờ duyệt` · `Cần bổ sung` · `Không được duyệt` · `Bị nền tảng ẩn` · `Đã lưu trữ`. Nhãn đọc theo trục "khách có thấy xe không" và cố ý KHÁC `Domain.vehiclePublicStatus` (đọc theo trục quy trình duyệt) — cùng một mã, hai câu hỏi;
- thiếu quyền → chỉ còn phần chữ, không vẽ nút cho một hành động không mở;
- ở mobile các NÚT chuyển xuống thanh CTA đáy màn còn hàng này ở lại, trải hết chiều ngang.

Không còn trạng thái `disabled` nào khác. Gian hàng bị khoá hay mặt tiền thiếu thì backend trả mã lỗi kèm câu giải thích **đúng lúc người dùng cần nó**, thay vì một dòng luật nội bộ đứng sẵn trong header — và TẮT thì luôn được, nên một ô mờ ở đó sẽ khoá luôn quyền rút xe về.

**Thẻ "Việc cần làm"** nhận thêm ĐÚNG MỘT việc, dựng từ bản ghi xe bằng `vehiclePublicationTask()`:

| Trạng thái | Việc | Hành động |
| --- | --- | --- |
| `draft` còn thiếu | Hoàn tất hồ sơ để đưa xe lên chợ | Hoàn tất hồ sơ → tab chứa mục thiếu ĐẦU TIÊN |
| `draft` đã đủ | Xe đã sẵn sàng để xét duyệt | Gửi duyệt |
| `pending_public_review` | Hồ sơ đang được xét duyệt | Xem trạng thái (neo xuống thẻ xét duyệt) |
| `needs_revision` | Cần bổ sung thông tin | Cập nhật hồ sơ · Gửi duyệt lại (khi checklist đủ) |
| `rejected` | Xe chưa được chấp thuận | Cập nhật hồ sơ · Gửi duyệt lại (khi checklist đủ) |
| `hidden` | Xe đang bị nền tảng ẩn | **Liên hệ hỗ trợ** — không có đường tự phục vụ (điều 4) |
| `approved_public` + tắt | Xe đang tạm ẩn khỏi chợ (gợi ý) | Bật hiển thị (neo lên công tắc) |

Bốn quy tắc giữ nó không thành một cái loa:

1. **`submit` chỉ hiện khi checklist đã đủ.** `submitForPublicReview` từ chối bằng `VEHICLE_PUBLISH_INCOMPLETE` nếu không, và một nút chắc chắn dẫn tới lỗi là một nút không nên vẽ.
2. **Mức `info` xuống CUỐI thẻ và không vào badge.** "Xe đang tạm ẩn" là gợi ý; nó không được đẩy một chuyến sắp phải giao ra khỏi ba dòng đầu. Mức `critical`/`warning` thì lên đầu.
3. **Lọc hai cảnh báo server nói trùng** (`public_action_required`, `missing_vehicle_info`) — chúng chỉ có chữ, việc ở đây có checklist và CTA. Lọc ở WEB chứ không ở server: thẻ xe ngoài danh sách vẫn cần chúng, vì ở đó không có chỗ cho một việc có nút.
4. **`showEmpty=false` khi đã có việc** — "Không có việc cần làm" ngay dưới một việc đang hiện là đúng câu tự mâu thuẫn mà đợt này sửa.

### 7. Màn kiểm duyệt phải GIẢI THÍCH được, vì nó không sửa được

Nền tảng chỉ ĐỌC `marketplace_enabled` (điều 4) — nhưng "không sửa được" chỉ đúng khi màn hình nói ra điều đó. Người kiểm duyệt bấm "Bỏ ẩn", thấy listing vẫn `hidden`, và kết luận hệ thống lỗi; đó là một lỗi UX thật, không phải một chi tiết.

`PlatformVehicleDto` mang thêm `isMarketplaceVisible` + `marketplaceVisibilityReason`, suy ở SERVER bằng cùng `resolveMarketplaceVisibility` (điều 2). Danh sách này **không** tenant-scoped nên `shopActive` đọc từ chính hàng dữ liệu (`tenant.status`/`tenant.deletedAt`), không từ một scope chung. Màn chi tiết hiện ba dòng thành một bộ: **Bản ghi trên sàn** (dữ liệu thô) → **Chủ xe cho hiển thị** (Bật/Tắt, kèm dấu "i" nói rõ nền tảng chỉ xem) → **Kết quả trên chợ** (Đang hiển thị / Đang ẩn + LÝ DO).

Nút đổi tên **"Bỏ ẩn xe" → "Gỡ ẩn của nền tảng"**: tên cũ hứa một kết quả mà thao tác không đảm bảo. Khi `marketplaceEnabled = false`, cả câu xác nhận lẫn toast nói thẳng hệ quả — *"Đã gỡ ẩn của nền tảng. Xe vẫn đang tạm ẩn theo lựa chọn của chủ xe."*

Bộ lọc nhanh **"Đang hiển thị"** chuyển từ `publicStatus = approved_public` sang tham số mới `marketplaceVisible` trên `GET /platform/vehicles`, dựng bằng chính `marketplaceVehicleWhere()` (đẩy vào `AND` chứ không spread, vì nó mang hai khoá mà bộ lọc khác có thể đã dùng). Nhãn cũ là một lời nói dối có thể đo được: nó trả về xe mà chủ đã cất đi, dưới đúng chữ "đang hiển thị". Cột "Trên sàn" của bảng cũng chuyển sang đọc lý do hiệu lực.

**Thẻ phía dưới** mất cả công tắc lẫn nút gửi duyệt và trở thành thẻ TRA CỨU: dải trạng thái, checklist đánh dấu từng mục, mốc gửi/mốc duyệt. Tên đổi theo vai — `Tiến trình xét duyệt` khi chưa duyệt, **`Thông tin xét duyệt`** khi đã duyệt, và lúc đó nó thu gọn sẵn (hồ sơ xét duyệt là lịch sử, không phải việc đang làm). Không lặp lại CTA nào ở trên.

Nhãn trục ở hồ sơ 360 đổi từ "Public" thành **"Kiểm duyệt"**. Trục thứ ba KHÔNG thêm vào hàng trạng thái đó — nó sống ở cột thao tác, cạnh chính cái công tắc đổi nó.

`isPublic` ở `VehiclePricingDto` **giữ nguyên nghĩa cũ** — "nền tảng đã duyệt" — và docstring được sửa để nói đúng điều đó. Nó là trục KIỂM DUYỆT, không phải "khách có thấy xe không"; đổi nó theo `marketplace_enabled` sẽ làm cảnh báo khoá-trường ở màn giá bật tắt theo một thứ không liên quan. Cùng lý do, biến cục bộ `isPublic` ở các màn SỬA xe đổi tên thành `isApproved`. Ngược lại, "Xem trang xe" ở đầu trang quản lý xe chuyển sang đọc `isMarketplaceVisible`: một chiếc xe đã duyệt mà chủ xe đang tạm ẩn thì `/listings/:id` trả 404, nên một link sáng ở đó là dẫn người dùng tới một trang không tồn tại.

`isPublic` ở `VehiclePricingDto` **giữ nguyên nghĩa cũ** — "nền tảng đã duyệt" — và docstring được sửa để nói đúng điều đó. Nó là trục KIỂM DUYỆT, không phải "khách có thấy xe không"; đổi nó theo `marketplace_enabled` sẽ làm cảnh báo khoá-trường ở màn giá bật tắt theo một thứ không liên quan. Cùng lý do, biến cục bộ `isPublic` ở các màn SỬA xe đổi tên thành `isApproved`. Ngược lại, "Xem trang xe" ở đầu trang quản lý xe chuyển sang đọc `isMarketplaceVisible`: một chiếc xe đã duyệt mà chủ xe đang tạm ẩn thì `/listings/:id` trả 404, nên một link sáng ở đó là dẫn người dùng tới một trang không tồn tại.

## Hệ quả

- **Không có đường vòng.** Chi tiết xe ngoài chợ, báo giá công khai, ngữ cảnh mã khuyến mãi, khoảng cách giao xe, mở hội thoại từ trang xe và gửi yêu cầu thuê đều đi qua `marketplaceVehicleWhere()`. Hội thoại ĐÃ mở không bị đụng: chủ xe cất xe đi không phải lý do để cắt liên lạc với người đang hỏi về chuyến của họ.
- **Mobile tự hưởng phần đúng mà không sửa file nào.** `VehiclePublishCard` đọc `VEHICLE_PUBLIC_STATUS_SUBMITTABLE` nên nút "Gửi duyệt lại" tự biến mất ở xe bị nền tảng ẩn; nhãn `Domain.vehiclePublicStatus.hidden` đổi theo bó message dùng chung. Công tắc thì **chưa** có ở app native (ADR 0031: hai bản tầng gọi API, không tự đồng bộ) — việc của đội mobile.
- **`Vehicles.publish.panel.submit`/`resubmit`/`submitted` GIỮ NGUYÊN trong bó message dù web không còn dùng.** `apps/mobile/src/features/vehicles/components/VehiclePublishCard.tsx` đọc đúng ba khoá đó, và `next-intl` suy kiểu TỪ cấu trúc JSON — xoá là lỗi biên dịch mobile, không phải một test đỏ (cùng cái bẫy ADR 0047 ghi lại). Xoá được khi màn đó của app native chuyển theo bố cục mới. `panel.title` thì có đổi chữ ("Tiến trình gửi duyệt công khai" → "Tiến trình xét duyệt"), nên tiêu đề thẻ ở app native đổi theo — đúng ý, và không cần mobile sửa gì.
- **Một dòng audit cho một lần đổi thật**, nên `vehicle.marketplace_visibility.update` đếm được như một chỉ số sản phẩm ("bao nhiêu xe bị cất đi trong tháng") mà không phải lọc nhiễu.

## Phương án đã cân nhắc và bỏ

- **Dùng `public_status = hidden` cho cả hai việc.** Toàn bộ phần Bối cảnh ở trên.
- **Thêm một giá trị mới vào `VEHICLE_PUBLIC_STATUS` (ví dụ `owner_paused`).** Vẫn là một cột cho hai câu hỏi, chỉ tinh vi hơn: một chiếc xe vừa "đã duyệt" vừa "chủ xe tắt" phải mang được cả hai sự thật cùng lúc, và một enum thì không.
- **Denormalize `marketplace_enabled` sang `public_listings`.** Cùng lý do ADR 0008 §3 từ chối `tenant_status`: một bản sao nữa để trôi, đổi lấy không gì cả — phép gộp đã nằm ở `deriveStatus` và listing chỉ cần kết quả.
- **Một trường `marketplaceEnabled` trong `PATCH /vehicles/:id`.** Nó có permission riêng, luật riêng khi bật, một dòng audit riêng, và phải chạy được khi người dùng không có quyền sửa xe. Nhét vào endpoint sửa hồ sơ là gói tất cả những thứ đó vào một chỗ đã đông.
- **Modal xác nhận trước khi tắt.** Thao tác đảo ngược được bằng đúng một cú bấm và không huỷ gì cả. Một hộp thoại ở đây dạy người dùng bấm "Đồng ý" mà không đọc.
- **Radio "Hiển thị / Ẩn" trong hàng nút Sửa/Xoá.** Đây là một trạng thái bật/tắt lật đi lật lại, không phải một lựa chọn giữa các phương án.
- **Chạy `assertVehicleQuota` và `missingPublishRequirements` ở cổng bật.** Xem điều 3.
- **Giữ công tắc ở thẻ xét duyệt phía dưới** (bản đầu của chính ADR này). Đúng về phân loại, nhưng chủ xe phải cuộn qua tiền, thông số, giấy tờ và lịch sử mới biết xe có đang bán hay không — thứ họ kiểm tra thường xuyên nhất. Xem điều 6.
- **Vẽ công tắc `disabled` cho xe chưa duyệt.** Một ô mờ mời người ta bấm rồi không làm gì, và nó phải mang theo một câu giải thích luật nội bộ để đỡ vô nghĩa. Một THẺ trạng thái nói đúng chừng ấy thông tin mà không hứa một hành động không tồn tại.
- **Tính việc "đưa xe lên chợ" ở server, trong `VehicleAlertsService`.** DTO cảnh báo chỉ có `title`/`detail`/`href` — không chứa được checklist, mức đủ/thiếu, hay một nút gọi mutation. Và nó dùng chung với thẻ xe ngoài danh sách, nơi không có chỗ cho những thứ đó.
- **Bật hộ công tắc ngay từ nút "Bật hiển thị" trong Việc cần làm.** Thành chỗ ghi thứ hai cho cùng một trạng thái, và người dùng không nhìn thấy cái công tắc vừa đổi. CTA neo lên chính nó.

## Điều kiện xem lại

- Khi app native làm công tắc này: bản gọi API của nó ở `apps/mobile/src/api/vehicles/` phải thêm cùng endpoint, và màn hồ sơ xe phải phân biệt được `platform_hidden` với `owner_paused` — ADR 0031, hai bản KHÔNG tự đồng bộ.
- Khi có nhu cầu "hẹn giờ bật lại" (tắt tới ngày X): thêm cột mốc + job, KHÔNG mượn `operation_status` hay một trạng thái kiểm duyệt mới.
- Khi trần số xe của gói chuyển sang đếm theo "đang hiện ngoài chợ" thay vì `public_status`: cổng bật phải chạy lại `assertVehicleQuota`, và lập luận ở điều 3 hết hiệu lực.
