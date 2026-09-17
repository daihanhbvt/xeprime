# ADR 0042 — Địa chỉ CÓ GHIM là một địa điểm ĐÃ ĐƯỢC BẢN ĐỒ XÁC NHẬN, không phải một ô chữ

Ngày: 17/09/2026 · Trạng thái: **Accepted; ghi đè [ADR 0035](0035-two-tier-administrative-address.md) điều 3 (phần xã/phường) và điều 5**

Liên quan: [ADR 0018](0018-map-delivery-distance.md) (quãng đường giao xe đo từ toạ độ; khoá server
không ra client), [ADR 0037](0037-geoapify-osm-map-provider.md) (nhà cung cấp bản đồ),
[ADR 0012](0012-i18n-shared-url-cookie-locale.md) (mã là dữ liệu, chỉ nhãn mới dịch),
[ADR 0004](0004-state-management-boundaries.md) (ranh giới state).

## Bối cảnh

ADR 0035 dựng một ô địa chỉ DUY NHẤT cho cả sản phẩm: tỉnh → xã/phường → số nhà → ghim. Nó đúng
cho người khai **địa chỉ vận hành của chính mình** — chủ xe biết chi nhánh của họ nằm ở phường nào,
và mã hành chính ở đó đi vào bộ lọc, thống kê, giấy tờ.

Nó sai cho người **đặt xe**. Ba thứ đo được trên chính màn hình đang chạy:

* **Hỏi một câu khách không trả lời được.** Danh mục cấp xã có 3.321 đơn vị và vừa đổi tên hàng
  loạt từ 01/07/2025. Một người ở Hà Nội thuê xe ở Bắc Ninh không biết xe sẽ giao tới phường nào,
  và ô "Xã/phường" bắt buộc nằm chắn giữa luồng thanh toán.
* **Bản đồ mở ra sai chỗ.** `MapPinPicker` có sẵn prop `fallbackCenter` nhưng `AddressField` chưa
  bao giờ truyền, nên mọi ô địa chỉ trong sản phẩm mở ra ở một hằng số giữa Đà Nẵng — kể cả khi xe
  ở Bắc Ninh và người dùng vừa chọn Bắc Ninh ngay phía trên.
* **Chữ không có toạ độ vẫn lưu được.** Ô "số nhà, đường" là chữ tự do; chỉ ai bấm vào một gợi ý
  mới có ghim. Nhưng phí giao tận nơi đo bằng quãng đường **tới cái ghim** (ADR 0018), nên một địa
  chỉ không ghim là một đơn không tính được phí — và điều đó chỉ lộ ra ở bước báo giá, sau khi
  khách đã điền xong mọi thứ.

Cộng thêm: tỉnh khách đã chọn ở thanh tìm xe không sống qua một lần F5, nên mỗi màn hình có địa chỉ
lại hỏi lại từ đầu một câu hệ thống đã biết câu trả lời.

## Quyết định

### 1. Chữ trong ô địa chỉ luôn là chữ ĐÃ ĐƯỢC XÁC NHẬN

Một và chỉ một trong hai nguồn, và **cả hai đều đổ ĐỦ ĐỊA CHỈ vào chính ô nhập**:

1. dòng người dùng **bấm** trong danh sách gợi ý — ô nhận CẢ HAI phần của dòng đó
   (`"21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế"`), không phải mỗi phần đậm;
2. **đặt ghim** trên bản đồ — địa chỉ tra ngược được nhảy lên ô, **đè** chữ cũ. Ghim mới là sự
   thật mới; giữ lại dòng chữ của vị trí trước đó là để ô nói một chỗ trong khi toạ độ trỏ một chỗ
   khác. Tra ngược hỏng thì chữ đang có được chốt lại — cái ghim vẫn là một xác nhận hợp lệ.

Nhãn của ô là **"Địa chỉ"**, không còn "Số nhà, đường": nó nhận trọn một địa chỉ chứ không còn là
mảnh thứ ba của một cụm ba phần.

Gõ mà không xác nhận thì khi rời ô, chữ quay về **giá trị đã xác nhận gần nhất** — form tạo mới là
rỗng (schema chặn Lưu), form sửa là chính địa chỉ đang lưu trong DB. Cố ý không xoá về rỗng một
cách máy móc: dữ liệu cũ chưa từng có ghim (ADR 0035 điều 7) và xoá nó vì một cú blur là phá dữ
liệu có thật.

**Không đi kèm lời giải thích nào.** Reset là im lặng, và ba dòng từng đứng giữa ô nhập với bản đồ
("đã trả ô về địa chỉ đã xác nhận", "vị trí này do hệ thống tra tự động, hãy xem lại ghim", "ghim
đang ở: …") đã bị bỏ: chúng mô tả CƠ CHẾ chứ không nói người dùng phải làm gì, và chúng chiếm đúng
chỗ mắt đang đi. Thứ ở lại là hai thứ đòi hành động — một cú bấm gợi ý không ra toạ độ, và lỗi
"chưa có vị trí" của schema. Hướng dẫn thì nói TRƯỚC, ở dòng chú thích dưới ô.

Ghim tay được tính là xác nhận, và đó là điều khoản giữ cho kỷ luật này không biến thành "không
đăng ký được": dữ liệu OpenStreetMap ở Việt Nam còn thưa số nhà và hẻm, nên luôn phải có một đường
đi tới toạ độ mà không cần nhà cung cấp biết địa chỉ đó.

Một bản logic duy nhất: `apps/web/src/components/form/ConfirmedPlaceField.tsx`. `AddressField` và
khối địa chỉ của khách đều dùng nó.

### 2. Bản đồ hỏng thì kỷ luật TẮT, không phải luồng dừng

`/places/search` trả `available: false` ⇒ ô quay về một ô chữ tự do, không xoá gì. Và điều kiện
**bắt buộc có toạ độ** chỉ áp khi người dùng thật sự tạo ra được một toạ độ — tức khi trình duyệt
dựng được bản đồ tương tác (`NEXT_PUBLIC_GEOAPIFY_MAP_KEY`). Thiếu khoá thì không có gợi ý để chọn
và cũng không có bản đồ để ghim, nên đòi toạ độ là khoá nút "Tiếp tục" bằng một lỗi không thao tác
nào sửa được. Đây là ADR 0035 điều 6 áp dụng đúng chữ.

### 3. Ô địa chỉ CÓ GHIM không hỏi xã/phường nữa

Ghi đè ADR 0035 điều 3. Ranh giới là **có ghim hay không**, không phải "khách hay chủ xe":

| Phần | Ô CÓ ghim (chi nhánh · hồ sơ gian hàng · đăng ký · đăng xe nhanh · giao xe · điểm đón) | Ô KHÔNG ghim (sổ khách) |
| --- | --- | --- |
| Tỉnh/thành | CHỌN từ danh mục — trừ luồng khách, nơi nó là ngữ cảnh (điều 4) | CHỌN từ danh mục |
| Xã/phường | **không hỏi** | CHỌN từ danh mục |
| Số nhà, đường | GÕ + **bắt buộc xác nhận** | GÕ tự do |
| Ghim | bắt buộc xác nhận | không có |

Lý do ranh giới nằm ở cái ghim: mã xã tồn tại để định vị **dưới cấp tỉnh**. Khi đã có một toạ độ
người dùng nhìn và xác nhận, nó định vị chính xác hơn hẳn một mã năm chữ số — trong khi danh mục
cấp xã có 3.321 đơn vị vừa đổi tên hàng loạt từ 01/07/2025, đủ để cả người khai địa chỉ của CHÍNH
MÌNH cũng phải dừng lại tra cứu. Không có ghim thì mã xã lại là cấp định vị duy nhất còn lại, nên
nó ở lại đúng chỗ đó.

`wardCode` **không bị gỡ khỏi hợp đồng**: cột vẫn còn, DTO vẫn nhận, dữ liệu cũ vẫn đọc được, và
`AddressService` vẫn đối chiếu xã-thuộc-tỉnh khi có giá trị (FK tổ hợp ở DB là lớp chặn cuối — ADR
0035 điều 2 giữ nguyên). Chỉ là không màn hình nào còn sinh ra nó.

Hai lớp phải bỏ CÙNG LÚC, nếu không là một nút Lưu chết không giải thích được:

* `registerShopSchema` thôi đòi `wardCode` ở tuyến gói; `branchFormSchema` và `ownerProfileSchema`
  dùng `addressShape` (xã tuỳ chọn) thay cho bản `…WithWard` đã bị xoá;
* `missingPackageShopListingRequirements` ở `@xeprime/types` bỏ mục `ward` — cổng đăng xe của gian
  hàng trả phí nay chấm năm mục, và `PACKAGE_SHOP_LISTING_REQUIREMENT.WARD` bị gỡ khỏi enum;
* `registerShop` gọi `AddressService.resolve` với `requireWard: false` ở cả hai tuyến.

Ở luồng KHÁCH, mã tỉnh lấy từ `suggestedProvinceCode` của địa điểm đã chọn — quy qua **bảng bí danh
tỉnh** ở server, nên tên trước sáp nhập vẫn ra mã đúng. Đó vẫn là ADR 0035 điều 4: không suy mã
**xã** từ dữ liệu bản đồ, vì ở cấp đó nhà cung cấp còn dùng tên trước sắp xếp.

Không có mã xã thì địa chỉ vẫn lưu: `booking_requests.delivery_ward_code` vốn nullable và
`AddressResolver.resolveOptional(..., { requireSelectable: false })` vốn nhận thiếu mã. Đây là dùng
đúng thứ đã có, không phải mở một ngoại lệ mới.

⚠️ Chuỗi RỖNG không được gửi lên. `@IsOptional()` của class-validator chỉ bỏ qua `null`/`undefined`,
còn `''` vẫn đi vào `@Length(5, 5)` và bật 400. Mọi nơi gọi gửi `wardCode: value || undefined`.

### 4. Ranh giới hai TUYẾN giao xe vẫn là BÁN KÍNH, không phải ranh giới tỉnh

Ô tỉnh của khách bị bỏ, **không** bị khoá cứng vào tỉnh của xe. Giao tận nơi giới hạn bằng
`delivery_max_radius_km`; Hà Nội ↔ Bắc Ninh cách nhau ~30km và nằm gọn trong nhiều bán kính đang
dùng. Khoá theo ranh giới hành chính sẽ chặn những chuyến hợp lệ bằng một quy tắc mà không dòng
chính sách nào nói ra.

Tỉnh của xe vẫn hiện — như một **dòng chữ ngữ cảnh**, không phải một ô bị disable. Một ô khoá mời
người ta ngồi thử bấm vào nó.

### 5. Bản đồ mở ở nơi người dùng đang nói tới

Thứ tự neo: **ghim hiện tại → điểm nhận xe của chính chiếc xe → tâm tỉnh đang chọn**. Tâm tỉnh là
34 hằng số ở `@xeprime/domain` (`provinceCenter`), neo vào khu trung tâm đô thị lớn nhất tỉnh.

Chúng là **vị trí mở đầu, không phải một cái ghim**: không giá trị nào được ghi vào
`latitude`/`longitude` của một bản ghi và không giá trị nào đi vào phép tính phí. Không thêm cột vào
bảng `provinces` (toạ độ không phải dữ liệu nghiệp vụ ở đây) và không hỏi nhà cung cấp bản đồ (mỗi
lần đổi tỉnh là một request có tính tiền cho một con số không bao giờ lưu lại). `provinceCodesMissingCenter()`
+ test khoá việc một quyết định sắp xếp mới không lặng lẽ để lại một tỉnh mở bản đồ ở Đà Nẵng.

Cùng điểm neo đó làm `bias` cho gợi ý, nên `"Nguyễn Huệ"` ra đúng vùng đang nói tới thay vì ra
TP.HCM mọi lúc. Backend gửi `proximity` + `circle` quanh điểm neo — thứ KÉO thứ tự kết quả mà
không loại bỏ gì, đúng cái cần vì giao xe tận nơi được phép qua ranh giới tỉnh.

**Khoanh vùng bằng TOẠ ĐỘ, không bằng CHỮ.** Chuỗi gửi đi hỏi bản đồ là ĐÚNG thứ người dùng gõ,
không ghép thêm tên xã hay tên tỉnh. Bản đầu có ghép, và nó phản tác dụng: autocomplete khớp theo
TỪ, nên mỗi từ thêm vào là một từ nữa phải khớp — mà cái được ghép lại là NHÃN giao diện ("TP Huế"),
không phải tên trong dữ liệu bản đồ. Đo trên máy thật: `q=21 Lý Thường, TP Huế` trả về rỗng trong
khi chính `21 Lý Thường` ra đúng chỗ.

### 6. Tỉnh đã chọn là MỘT câu trả lời dùng chung, nhớ ở `localStorage`

`apps/web/src/lib/province-memory.ts` — một khoá `xp.provinceCode` cho mọi bề mặt, hạn 180 ngày,
mã được đối chiếu với danh mục hiện hành lúc đọc.

* **Ghi** chỉ từ thao tác chủ động của người dùng: chọn tỉnh ở thanh tìm xe, đổi ô tỉnh trong một
  form địa chỉ. Gợi ý điền sẵn không bao giờ ghi ngược — nếu có, một giá trị máy tự điền sẽ tự
  phong thành "người dùng đã chọn" và không bao giờ hết hạn.
* **"Toàn quốc" XOÁ bộ nhớ**: nó là một lựa chọn, không phải một khoảng trống.
* **Đọc** ở thanh tìm xe (chỉ NGOÀI trang kết quả — ở `/search` thì URL là sự thật, và điền một
  tỉnh mà URL không mang là để viên địa điểm nói dối về danh sách bên dưới) và ở các form địa chỉ
  **TẠO MỚI** (`prefillRememberedProvince`, mặc định TẮT).
* Form **SỬA** không bao giờ điền: ô tỉnh trống ở đó nghĩa là bản ghi này không có tỉnh (dữ liệu
  trước ADR 0035), và điền vào đó tỉnh người dùng vừa tìm xe sẽ dời một địa điểm vận hành có thật
  sang tỉnh khác, âm thầm, chỉ vì họ bấm Lưu.

**Bộ nhớ là một GỢI Ý, và mỗi bề mặt tự quyết có nhận được không.** Đây là ràng buộc quan trọng
nhất của điều này, vì hai người ghi chọn từ hai danh mục KHÁC NHAU và không danh mục nào chứa trọn
danh mục kia:

| Bề mặt | Danh mục nó đọc | Nội dung |
| --- | --- | --- |
| Bộ chọn địa điểm ở trang tìm xe | `/public/destinations` | tỉnh **đang có xe** trên chợ |
| Ô địa chỉ trong form (`AddressField`) | `/provinces` | tỉnh **đang mở đăng ký** |

Một tỉnh có thể ở bên này mà không ở bên kia, theo cả hai chiều — và điều đó đổi theo thời gian
(tỉnh hết xe, admin tắt đăng ký). Nên mỗi bên phải **đợi danh mục của chính mình về rồi tra**, và
chỉ nhận mã tra ra được:

* thanh tìm xe tra hụt ⇒ để nguyên "Toàn quốc". Không làm vậy thì viên địa điểm hiện "Địa điểm
  không còn khả dụng" — một câu đúng nghĩa đen nhưng nói về một lựa chọn người dùng chưa hề làm ở
  đó;
* ô địa chỉ tra hụt ⇒ để trống. Không làm vậy thì AntD dựng một ô chọn mang mã nó không tra ra
  nhãn: người dùng nhìn thấy ô TRỐNG trong khi form đang giữ mã đó, rồi bấm Lưu và không hiểu vì
  sao hỏng.

Cả hai nhánh **không xoá bộ nhớ**: mã vẫn đúng, nó chỉ không dùng được ở bề mặt này lúc này.

## Hệ quả

* Mọi yêu cầu thuê có địa chỉ đều mang toạ độ (khi bản đồ có mặt), nên phí giao tận nơi tính được
  ngay tại thời điểm gửi thay vì hỏng ở bước báo giá.
* Form đặt xe của khách ngắn đi hai ô bắt buộc.
* **Mã xã ngừng được sinh ra ở mọi luồng có ghim**: đơn thuê, chi nhánh mới, hồ sơ gian hàng, đăng
  xe nhanh. Thống kê và bộ lọc theo cấp xã không dùng được — theo TỈNH thì vẫn, và đó là mức mà
  marketplace lọc (`public_listings`). Bản ghi cũ giữ nguyên mã đã có; form sửa không xoá nó.
* Cổng đăng xe của gian hàng trả phí chấm **năm** mục thay vì sáu. Một gian hàng đang bị chặn vì
  thiếu mỗi mục `ward` sẽ tự qua cổng sau lần deploy này — đúng ý định, vì mục đó không còn cách
  nào để điền.
* `Shop.listingGate.items.ward` bị gỡ khỏi hai bó ngôn ngữ; `Address.wardLabel` và các khoá cấp xã
  khác **ở lại** vì sổ khách vẫn dùng.
* Bản đồ tĩnh vẽ tuyến giao xe ở đáy khối phí trong modal thuê bị bỏ: nó vẽ lại chỗ khách vừa tự
  ghim trên bản đồ tương tác cách đó vài trăm pixel, trong một hộp thoại vốn đã phải cuộn.
* `requestFormSchema` thành một **hàm nhận `t`** (ADR 0012): câu báo lỗi validation là chữ người
  dùng đọc, và bản trước viết thẳng tiếng Việt vào module.
* Sửa một lỗi chặn có sẵn: `POST /public/booking-requests` đòi `deliveryAddress` (ô chữ tự do đời
  đầu) trong khi web chỉ gửi `deliveryAddressLine` từ khi có ADR 0035 — mọi yêu cầu giao tận nơi từ
  web dừng ở `VALIDATION_FAILED`. Guard nay đọc cả hai ngả, và ghim của khách được giữ kể cả khi
  không quy được mã hành chính.

## Xem lại khi

* Có nhu cầu thống kê đơn thuê theo cấp xã → cách đúng là **tra ngược từ toạ độ đã ghim** ở một job
  nền, không phải hỏi lại khách một câu họ không trả lời được.
* Dữ liệu OpenStreetMap ở Việt Nam đủ dày số nhà để tỉ lệ "phải ghim tay" tụt xuống gần 0 → cân
  nhắc bỏ luôn lối ghim tay khỏi luồng khách cho gọn.
* Đổi nhà cung cấp bản đồ (ADR 0037) → `suggestedProvinceCode` là chỗ duy nhất luồng khách phụ
  thuộc vào việc quy tên hành chính; kiểm lại nó trước.
