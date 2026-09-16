# ADR 0040 — Hai tuyến ĐĂNG KÝ tách hẳn: ý định lưu ở DB, thanh toán mở Manage

Ngày: 16/09/2026 · Trạng thái: **Accepted** · **Ghi đè [ADR 0036](0036-single-approval-gate-for-commission-owners.md) điều 4** (_"xác minh là cổng của việc MUA GÓI"_)

## Bối cảnh

[ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md) đặt ra HAI tuyến trên một
chợ, và [ADR 0038](0038-owner-track-split-and-unified-wallet.md) đã tách ranh giới _vận hành_
của chúng (ai vào được `/manage`, ai dùng Owner Lite). Nhưng **ranh giới ĐĂNG KÝ thì chưa bao
giờ tồn tại.** Trên `develop`, hai điểm vào của sản phẩm —

- "Đăng xe cho thuê" / "Trở thành chủ xe" → tuyến hoa hồng,
- "Đăng ký gian hàng" → tuyến trả phí theo gói,

— dùng **chung** `ShopRegistration`, **chung** `POST /tenants`, và khác nhau đúng một prop
`variant` điều khiển câu chữ. Ghép với `TenantsService.registerShop` gán gói hoa hồng mặc định
cho **mọi** tenant mới ([ADR 0015](0015-vehicle-slot-billing.md) điều 9), kết cục là:

> người vừa bấm "Đăng ký gian hàng" nhận `billingMode: 'commission'` ở `/auth/me`, và
> `resolveWorkspaceHref` điều hướng họ vào đúng màn **"Hồ sơ chủ xe"** của tuyến kia — nơi có
> một wizard ba bước "Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ" mà họ không hề chọn.

Hướng vá đầu tiên đã thử là **khôi phục redirect cứng về `/manage/shop`** sau khi tạo gian hàng.
Nó không đủ, và lý do quan trọng hơn bản thân cái bug: tenant mới **vẫn** mang gói hoa hồng, nên
`AppShell` (và từ ADR 0038 là cả `SubscriptionTrackGuard` ở server) đá họ trở lại Account ngay
sau đó. Vấn đề không ở đích đến; nó ở chỗ **hệ thống không biết người này đã chọn cửa nào.**

Bốn cách phân biệt hai tuyến ở client đều đã được thử và đều sai vì **cùng một lý do — chúng
không sống qua một lần F5**:

| Cách                         | Chết khi nào                            |
| ---------------------------- | --------------------------------------- |
| prop `variant` của component | tải lại trang                           |
| `?next=` trong URL           | tải lại trang, hoặc điều hướng một nhịp |
| state của router             | tải lại trang                           |
| "đã có gói hay chưa"         | ngay lập tức — mọi tenant đều có gói    |

Và một luồng thanh toán thì **bắt buộc** phải sống qua F5: người dùng mở app ngân hàng, chuyển
khoản, quay lại. Có người đóng trình duyệt và mở lại trên máy khác.

Hai vấn đề đi kèm, cùng gốc:

1. **Xác minh pháp nhân là cổng mua gói** (ADR 0036 điều 4). Ghép nó với luồng đăng ký gian hàng
   thì thứ tự thành: tạo gian hàng → gửi hồ sơ xác minh → **CHỜ admin** (không SLA) → mới được
   trả tiền. Một người đang muốn mua chỗ bán hàng phải chờ một cái gật đầu, và trong lúc chờ họ
   không dùng được gì cả. Đó là chỗ rơi rụng lớn nhất của phễu trả phí — và nó đứng chắn ở đúng
   chỗ nền tảng đang muốn thu tiền.
2. **`wardInvalid` lọt ra giao diện ở dạng mã trần.** Ba ô địa chỉ trong `@xeprime/validators`
   mang mẫu `/^d{5}$/` và `/^d{2}$/` — thiếu dấu gạch chéo ngược, nên chúng khớp chuỗi `"ddddd"`
   và **không khớp một mã hành chính thật nào**. Mọi lượt chọn xã đều bị từ chối, và vì
   `ShopOnboarding.validation` chưa có khoá `wardInvalid`, `useValidationResolver` để nguyên
   chuỗi gốc.

## Quyết định

### 1. Ý ĐỊNH ĐĂNG KÝ là DỮ LIỆU, nằm ở `tenants.onboarding_state`

`POST /tenants` nhận `registrationTrack: 'commission' | 'package'` (tuỳ chọn, mặc định
`commission` để client cũ không vỡ), và nó được **lưu**:

| `onboarding_state` | Nghĩa                                      | Vào được đâu                                 |
| ------------------ | ------------------------------------------ | -------------------------------------------- |
| `commission`       | Cửa "Đăng xe cho thuê" (mặc định)          | Owner Lite ở `/account`                      |
| `package_pending`  | Cửa "Đăng ký gian hàng", **chưa** trả tiền | CHỈ màn onboarding (chọn gói → chuyển khoản) |
| `package_active`   | Hoá đơn gói đã `paid` và thuê bao đã bật   | `/manage` đầy đủ                             |

Đây là trục **THỨ TƯ**, độc lập với ba trục đã có. Không gộp:

```
tenants.status                     — gian hàng còn được hoạt động không (khoá/mở của nền tảng)
tenant_subscriptions.billing_mode  — tiền chạy theo tuyến nào NGAY LÚC NÀY
SHOP_VERIFICATION (approval_tasks) — nền tảng đã xem xét pháp nhân chưa
tenants.onboarding_state           — người này vào bằng cửa nào, và còn nợ bước nào   ← MỚI
```

Vì sao **không** mượn `tenants.status`: cột đó là trạng thái vận hành và
`TENANT_STATUS_PUBLISHABLE` chỉ nhận `active` ([ADR 0008](0008-public-listings-sync.md)). Biểu
diễn "chờ thanh toán gói" bằng nó nghĩa là toàn bộ xe của một gian hàng đang bán biến khỏi
marketplace mỗi lần họ gia hạn — đúng loại lỗi mà ADR 0036 đã gỡ một lần.

Giá trị canh bằng CHECK `tenants_onboarding_state_check` ở DB ([ADR 0005](0005-status-enums.md)).

### 2. Tuyến gói KHÔNG nhận gói hoa hồng tạm

`registerShop` với `registrationTrack = package` **không gán dòng thuê bao nào**. Gán một dòng
hoa hồng tạm là biến người vừa bấm "Đăng ký gian hàng" thành chủ xe tuyến hoa hồng ở **mọi** nơi
đọc `billingMode`: khu làm việc, nhãn tài khoản, trần 3 xe Owner Lite, % phí dịch vụ hiện cho
khách của họ.

Hệ quả là đúng: pha của họ là `unconfigured`, nên `billingModeForMoneyOrThrow` **từ chối** mọi
đường ghi tiền (`TENANT_BILLING_NOT_CONFIGURED`). Một gian hàng chưa trả tiền thì cũng chưa nhận
đơn.

`unconfigured` vẫn là **lỗi cấu hình** theo [ADR 0038](0038-owner-track-split-and-unified-wallet.md)
điều 1 ở mọi trường hợp khác; riêng ca này nó là trạng thái CHỜ có thật, nên
`effectiveBillingFor` hạ mức log từ `error` xuống `debug` khi tenant ở `package_pending` — dạy đội
vận hành bỏ qua chính mã log đó là cách tệ nhất để giữ nó hữu ích.

Không cần "quyền purchase tạm": `subscription.purchase` đến từ **VAI**
(`permissionsForTenantMember`), và `/subscription/*` cố ý không mang `@SubscriptionTrackOnly` —
đó là phễu nâng cấp. Tuyến gói mua được gói ngay mà không cần một dòng thuê bao nào.

### 3. Mốc `package_pending → package_active` ghi trong CHÍNH transaction bật thuê bao

Ở cả hai đường: webhook SePay (`activateFromInvoiceWithinTx`) và admin gán tay (`assign`). Ba
thứ cùng sống cùng chết — hoá đơn `paid`, dòng thuê bao `active`, mốc onboarding.

Tách mốc ra ngoài (một job, hay một lượt gọi API sau khi client thấy `paid`) tạo ra một cửa sổ
trong đó gian hàng đã trả tiền nhưng routing vẫn giữ họ ở màn chuyển khoản — và
`resolveChainStart` đã huỷ dòng hoa hồng tạm (nếu có) trước đó, nên trong cửa sổ đó họ không
thuộc tuyến nào cả.

`updateMany` có điều kiện trạng thái (khuôn claim của `subscription-lifecycle`): chạy lại/song
song là no-op, và tenant vào bằng **cửa hoa hồng** rồi mua gói vẫn giữ `commission` — họ chưa
từng đi qua cửa gian hàng.

**Không có nút "Tôi đã chuyển khoản".** Kích hoạt là việc của webhook; một nút tự khai đã trả
tiền là một đường mở Manage không qua tiền.

### 4. `package_active` là VĨNH VIỄN

Gói hết hạn thì tenant rơi về tuyến hoa hồng (`resolveEffectiveBilling` → `LAPSED`) nhưng cột
này **không lùi**. Nó trả lời "người này đã từng đi qua cửa gian hàng chưa", và câu trả lời đó
không đổi.

Lùi nó về `package_pending` sẽ đẩy một gian hàng đang vận hành thật vào màn onboarding lần đầu;
lùi về `commission` sẽ mời họ vào wizard "Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ" mà họ đã
làm xong từ lâu. Đây là lý do `resolveWorkspaceHref` đưa gian hàng hết gói về **danh sách xe**,
không về màn tiến trình đăng ký — dù `resolveOwnerStage` chấm họ là `registering` ngay khi chiếc
xe cuối rời chợ.

### 5. Thanh toán mở TUYẾN GÓI và Manage — xác minh thôi làm cổng thu tiền

**Ghi đè ADR 0036 điều 4.** `assertShopVerifiedForPlan` bị gỡ khỏi `purchase` và `assign`, và mã
`SHOP_VERIFICATION_REQUIRED` ra khỏi hợp đồng API.

Điều **không** đổi, và phải nói rõ vì nó là ranh giới dễ bị hiểu sai nhất:

- Thanh toán **không** mở bất cứ thứ gì thuộc trục kiểm duyệt. Xe vẫn đi qua `approval_tasks`
  loại `VEHICLE` từng chiếc (ADR 0008).
- **Không nơi nào** đánh `verification = verified` vì tiền đã về, và không phiếu duyệt giả nào
  được tạo.
- Xác minh giữ nguyên vai trò của nó ở đường pháp lý/rút tiền, và vẫn khoá sửa hồ sơ khi đang
  trong hàng đợi (`SHOP_VERIFICATION_PENDING`).

Hệ quả ở giao diện: trạng thái `unverified` **không dựng gì** trên trang Cửa hàng nữa. Một nút
không đổi lấy được gì cho người bấm nó — trong khi vẫn khoá hồ sơ khỏi việc sửa suốt thời gian
chờ — thì ẩn hẳn, không đổi thành một dòng giải thích luật nội bộ. Ba trạng thái còn lại vẫn
hiện: `pending` giải thích vì sao hồ sơ đang bị khoá, `needs_revision`/`rejected` là cuộc trao
đổi đang mở với người duyệt.

### 6. Onboarding gian hàng: HAI bước, trạng thái suy từ SERVER

`/manage/onboarding` là route DUY NHẤT của cả hai tuyến, và nó là màn **bare** (không dựng
sidebar Manage trước khi thanh toán — cổng quản lý chưa mở thì không được bày ra rồi để mọi mục
bên trong trả 403).

| Trạng thái thật                                   | Màn hiện ra                                                   |
| ------------------------------------------------- | ------------------------------------------------------------- |
| chưa có gian hàng, `?track=commission` (mặc định) | form hồ sơ chủ xe → `?next=`                                  |
| chưa có gian hàng, `?track=package`               | **bước 1**: tạo gian hàng trả phí                             |
| `package_pending`, chưa có hoá đơn chờ            | **bước 2a**: chọn gói / số chỗ / kỳ hạn                       |
| `package_pending`, có hoá đơn chờ                 | **bước 2b**: QR VietQR, số còn thiếu, mã đối soát, trạng thái |
| gói đã hiệu lực                                   | `replace('/manage/shop?welcome=1&section=profile')`           |
| tuyến hoa hồng (đã có gian hàng)                  | khu làm việc của họ                                           |

`?track=` chỉ có nghĩa khi **chưa** có gian hàng; sau đó nguồn là `onboarding_state`.

Bước 1 của tuyến gói đòi **tên · SĐT liên hệ · tỉnh · xã · địa chỉ chi tiết** — đúng bộ
`missingPackageShopListingRequirements` trừ logo (xem điều 7), nên hai lớp không thể lệch nhau.
Hỏi ở bước 1 rẻ hơn hẳn so với để họ trả tiền xong rồi mới bị cổng đăng xe từ chối. Loại hình
(`tenantType`) **không** bị hỏi: nguồn duy nhất của chế độ thu phí là GÓI
([ADR 0014](0014-owner-and-shop-single-role.md) điều 2).

SĐT ở bước này là **số liên hệ của GIAN HÀNG**, không phải một "số đã xác thực" thứ hai: nó điền
sẵn từ tài khoản và sửa được, và giao diện nói đúng điều đó. Số đã qua OTP của người chủ sống ở
`users.phone` và hiện ở khối "Chủ gian hàng".

Điều kiện điều hướng sau khi trả tiền là `/auth/me` **thật sự** đã nhận tuyến gói — không phải
"hoá đơn vừa biến khỏi danh sách chờ". Hai thứ đó cách nhau một round-trip, và nhảy sang
`/manage/shop` trong khoảng đó nghĩa là `AppShell` đọc scope cũ rồi đá người dùng ngược ra.

### 7. Cổng ĐĂNG XE của gian hàng tuyến gói: `missingPackageShopListingRequirements`

Bộ quy tắc **thứ hai** ở `packages/types/src/shop-profile.ts`, và nó cố ý **không** dùng lại
`SHOP_PROFILE_REQUIREMENT`:

| Bộ                                 | Câu hỏi                                       | Áp cho ai               | Hệ quả khi thiếu              |
| ---------------------------------- | --------------------------------------------- | ----------------------- | ----------------------------- |
| `SHOP_PROFILE_REQUIREMENT`         | Reviewer có gì để XÁC MINH pháp nhân?         | mọi tenant gửi xác minh | không gửi được phiếu `tenant` |
| `PACKAGE_SHOP_LISTING_REQUIREMENT` | Gian hàng trả phí đã đủ mặt tiền để BÁN chưa? | CHỈ gian hàng tuyến gói | không gửi được XE lên chợ     |

Gộp chúng lại là hỏng theo cả hai chiều: bộ trên đòi `ownerName`/`ownerPhone` và coi `logo` là
gợi ý, nên đem nguyên nó ra gác việc đăng xe thì logo không bao giờ bị đòi; còn thêm `logo` vào
bộ trên là chặn luôn chủ xe tuyến hoa hồng — một người có một chiếc xe không có logo gian hàng
và không cần có, và bắt họ thiết kế một cái là dựng lại đúng rào cản mà ADR 0036 vừa gỡ.

Sáu mục: `displayName` · `contactPhone` · `province` · `ward` · `address` · `logo`. Nguồn dữ liệu
rõ ràng và **không** đọc cột trùng lặp: `displayName`/`logoUrl` ← `tenant_profiles`; phần địa chỉ

- SĐT ← **chi nhánh mặc định** (`tenant_branches`, nguồn sự thật vận hành — hai cột tỉnh trên hồ
  sơ chỉ là bản sao). Không đòi `ownerFullName`, email, hay toạ độ ghim.

Thi hành ở `VehiclesService.submitForPublicReview`, **trước** transaction: xe không chuyển sang
`pending` và **không** phiếu duyệt nào được tạo khi cổng thất bại.

Mã lỗi là `SHOP_LISTING_REQUIREMENTS_MISSING` — **riêng**, không dùng chung `PROFILE_INCOMPLETE`
với cổng xác minh. Hai bộ quy tắc có hai từ vựng khác nhau và `displayName`/`province` lại trùng
tên giữa chúng, nên một client chỉ nhìn `details.missing` sẽ dựng nhãn của bộ này cho mã của bộ
kia và câu chữ vẫn trông hợp lý. `details.missing` là danh sách **MÃ**
([ADR 0012](0012-i18n-shared-url-cookie-locale.md)); web dựng nhãn theo ngôn ngữ đang dùng.

Checklist trên trang Cửa hàng chuyển `logo` từ nhóm "nên có" sang nhóm CHẶN khi gian hàng ở tuyến
gói (`ShopProfileChecklist`, prop `logoRequired`). Để nó ở nhóm gợi ý là đúng thứ docblock của
`missingShopProfileRequirements` viết ra để chặn, chỉ đảo chiều: checklist nói "không bắt buộc"
trong khi server chặn.

Người dùng tuyến gói **vẫn** tạo xe, sửa xe và lưu nháp bình thường khi chưa có logo. Chỉ thao
tác "gửi xe duyệt công khai" bị chặn.

### 8. Ba trạng thái phải tách rõ

1. **Đã thanh toán / kích hoạt gói** → được dùng Manage. (`onboarding_state` + `billing_mode`)
2. **Hồ sơ gian hàng đủ điều kiện đăng xe** → điều 7.
3. **Xe được duyệt công khai** → từng xe qua `approval_tasks` loại `VEHICLE`, không đổi.

## Hệ quả

- Thêm `tenants.onboarding_state` + CHECK + index partial cho hàng đợi "đã tạo mà chưa trả tiền".
  Backfill: tenant từng có dòng thuê bao `package` → `package_active`; còn lại giữ `commission`.
  Không tenant nào được backfill thành `package_pending` — đoán nó cho dữ liệu cũ là khoá một
  gian hàng đang chạy ra khỏi Manage.
- `MeDto.tenant` và `MyShopDto` mang `onboardingState`; `req.tenant` cũng có, để hai cổng ở
  server không phải truy vấn `tenants` lần thứ hai mỗi request.
- `ACCOUNT_TRACK` có giá trị **thứ năm** `package_pending`, và `resolveAccountTrack` hỏi trục
  đăng ký **trước** khi kết luận `unconfigured`. Không có nó thì mọi người vừa xong bước 1 nhận
  một thẻ đỏ "Chưa xác định gói" + một dải "liên hệ hỗ trợ" trên `/account` và ở menu tài khoản
  của khu công khai — cho một hệ thống đang chạy đúng, ngay tại bước lẽ ra phải mời họ trả tiền.
  Cùng lý do với việc hạ mức log ở `effectiveBillingFor`, chỉ ở tầng giao diện.
- `SubscriptionTrackGuard` trả mã **riêng** `PACKAGE_ONBOARDING_INCOMPLETE` cho
  `package_pending`. Cùng câu trả lời "không", lối đi tiếp ngược hẳn:
  `SUBSCRIPTION_TRACK_ONLY` nghĩa là "khu này không dành cho bạn, về Owner Lite", còn người đang
  chờ đối soát thì khu này **là** của họ.
- `GET /subscription/invoices/pending` — bất biến "mỗi gian hàng tối đa MỘT hoá đơn trả được" do
  server giữ, nên câu trả lời phải đến từ đó. Web polling nó 8 giây trong lúc chờ và tự dừng ở
  trạng thái kết thúc.
- Bộ chọn mua gói tách thành `usePlanPurchase` + `PlanPurchaseFields`, dùng chung giữa
  `PurchaseModal` và bước 2. Hai bản của cùng công thức giá là cách chắc chắn nhất để một màn
  hiện một con số mà server tính ra con số khác.
- `PROVINCE_CODE_PATTERN` / `WARD_CODE_PATTERN` thành hằng ở `@xeprime/validators` — bản viết
  inline đã sai ba lần. Thêm bản dịch cho `wardRequired`/`wardInvalid`/`addressLineRequired`/
  `phoneRequired` vào `ShopOnboarding.validation`.
- `registerShopSchema` gộp cả hai tuyến bằng `.when('registrationTrack', …)` thay vì hai schema:
  React Hook Form giữ resolver của lần dựng đầu, nên một biểu thức `isPackageTrack ? A : B` sẽ
  đổi luật mà RHF không biết.
- `verifyShop` ở `test/helpers/service-factory.ts` và bốn lời gọi của nó bị gỡ — chúng là
  scaffolding của cổng vừa bỏ.

## Điều kiện xem lại

- **Cổng xác minh trở lại đường tiền.** Nếu nghĩa vụ pháp lý (KYC người bán, hoá đơn điện tử) đòi
  pháp nhân được xem xét _trước khi_ thu tiền, cổng đó quay lại — nhưng khi đó nó phải có SLA và
  một đường tự phục vụ, không phải một hàng đợi im lặng.
- **Verification mất hết consumer.** Sau đợt này nó chỉ còn là một nhãn + một lần khoá sửa hồ sơ.
  Nếu release gate pháp lý (ADR 0028 release gate 1) chọn `seller_profiles` làm trục KYC duy
  nhất, thì trục `approval_tasks` loại `tenant` nên bị gỡ hẳn — cùng với hàng đợi admin của nó.
- **Gian hàng bỏ dở giữa bước 2.** Hôm nay họ nằm ở `package_pending` vô thời hạn và chỉ vào
  được màn thanh toán. Nếu số đó lớn, cần một đường "để sau" đưa họ về tuyến hoa hồng — nhưng đó
  là một quyết định sản phẩm về giá, không phải một sửa lỗi kỹ thuật.
- **Nhiều bậc gói.** Bước 2 hôm nay tự chọn bậc duy nhất đang bán. Khi danh mục có từ hai bậc,
  màn đó cần một bảng so sánh thật, không phải một `<Select>`.
