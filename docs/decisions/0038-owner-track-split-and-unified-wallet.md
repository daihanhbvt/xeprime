# ADR 0038 — Tách hai tuyến chủ xe: một ví cho một người, và ranh giới Manage chặn ở server

Ngày: 15/09/2026 · Trạng thái: **Accepted** · **Ghi đè một phần**
[ADR 0027](0027-feature-tiers-basic-owner-vs-shop.md) (điều 3 trong phạm vi HẾT GÓI),
[ADR 0033](0033-money-ledger-and-deposit-allocation.md) (điều 2, cột chủ ví) ·
Liên quan: 0002, 0014, 0023, 0024, 0028, 0031, 0032

## Bối cảnh

ADR 0028 và 0032 chốt hai tuyến — chủ xe hoa hồng dùng Owner Lite trong `/account`, gian hàng
thuê bao dùng `/manage`. Rà soát ngày 15/09/2026 cho thấy **ranh giới đó chưa tồn tại ở nơi nó
phải tồn tại**, và ba chỗ hổng có hậu quả tiền hoặc quyền:

1. **Cổng `/manage` chỉ là một nhánh render.** `AppShell.tsx` redirect ở client; docblock ngay
   trên nó tin rằng backend đã chặn. Backend thì không có `billingMode` trong `req.tenant`, còn
   `PlanFeatureGuard` chạy `warn` ở **mọi cấu hình được ship** (máy dev đặt `on`, nên loại lỗi này
   chỉ xuất hiện sau khi deploy).

2. **Một cửa sổ mất tiền định kỳ.** Mọi tenant được gán một dòng thuê bao hoa hồng 0đ kỳ hạn 12
   tháng. Vị từ "gói hiện hành" đòi `ends_at > now`, còn job vòng đời chờ hết `graceDays` (seed 7)
   mới nối dòng mới. Trong cửa sổ đó `billingModeFor` rơi vào fallback `package` ⇒ **không thu phí
   dịch vụ và không thu cọc**. Migration backfill 30/08 gán gói cho toàn bộ tenant trong cùng một
   ngày, nên cửa sổ này mở cho cả sàn cùng lúc.

3. **Một người, hai ví.** Khoản hoàn ghi vào ví `user`, khoản XePrime phải trả ghi vào ví
   `tenant`. Với chủ xe tuyến hoa hồng, đó là hai số dư, hai danh sách tài khoản ngân hàng và hai
   hàng đợi chuyển tay cho **cùng một con người**. Sidebar `/account` của họ hiện đồng thời "Ví
   điểm" và "Tiền cho thuê xe", còn mục "Tài khoản nhận tiền" lại không dùng được cho ví thứ hai.

Cộng thêm hai rò quyền: `shop_manager` có `seller_profile.view` mặc định — chính khoá gác ví gian
hàng — nên quản lý đọc được số dư, toàn bộ sổ cái và lịch sử rút; và tài khoản gian hàng gửi được
yêu cầu thuê, kể cả cho xe của chính mình.

## Quyết định

### 1. Tuyến hiệu lực có BỐN pha, giải ở một chỗ

`resolveEffectiveBilling` (`@xeprime/types`) thay ba phép suy mâu thuẫn:

| Pha | `billingMode` | Năng lực nâng cao |
| --- | --- | --- |
| `current` | của dòng thuê bao | đủ |
| `grace` | **giữ nguyên** của dòng vừa hết hạn | **đủ** |
| `lapsed` | `commission` ngay, không chờ job | không |
| `unconfigured` | **`null`** | không |

**`unconfigured` không phải một tuyến.** Đường ĐỌC chịu được (báo giá trả `null`, listing giữ mặc
định cột); đường GHI TIỀN từ chối: `TENANT_BILLING_NOT_CONFIGURED` khi duyệt tay,
`AUTO_ACCEPT_BLOCKER.BILLING_NOT_CONFIGURED` khi tự nhận. Fallback `?? PACKAGE` biến một lỗi vận
hành thành một chuỗi booking không thu phí mà không ai thấy gì bất thường.

Ở tầng dữ liệu, ân hạn **chỉ áp cho dòng gói**: dòng hoa hồng 0đ do hệ thống tự gán được nối lại
ngay, và dòng mới bắt đầu từ mốc trước (`ends_at` với hoa hồng, hết ân hạn với gói) chứ không từ
`now` — job chạy mỗi giờ và `now` để lại khe hở đúng bằng độ trễ đó.

### 2. Một người có MỘT ví; ví thuộc tenant từ lúc họ thành chủ xe

Cả khoản hoàn khi chính chủ đi thuê lẫn khoản XePrime phải trả đều vào **ví của tenant**. Người
chưa là chủ xe giữ ví thuộc `user`.

Chuyển đổi là **đổi chủ của hàng ví, không chuyển tiền**: một `UPDATE` đặt `owner_type`,
`owner_tenant_id`, `owner_user_id` cùng lúc. Đây là cách duy nhất không sinh bút toán nào —
không có phép cộng để cộng đôi, không dòng lịch sử nào bị viết lại, và vì `wallets.id` **không
đổi** nên dòng sổ, lệnh rút và `hold_refunds.wallet_entry_id` vẫn trỏ đúng mà không phải sửa gì.

Hệ quả: **không cần chặn đăng ký khi người dùng đang có lệnh rút chờ xử lý.** Thông tin ngân hàng
trên lệnh đã là snapshot (ADR 0023 điều 8) nên admin vẫn chuyển đúng tài khoản họ đã khai.

Nâng từ hoa hồng lên gói **không đụng ví**: nó đã là ví tenant từ trước.

Dữ liệu cũ có CẢ HAI ví thì gộp bằng cách **chuyển chính dòng sổ** (giữ `id`/`kind`/`source`/
`amount`/`created_at`), cộng `pending_withdraw_amount`, **tính lại `balance_after`**, rồi xoá vỏ
rỗng dưới một guard. `balance_after` là ảnh chụp SUY RA, không phải sự thật của sổ — để nguyên thì
phép đối chiếu lệch ví báo động giả mãi mãi.

Điều này **ghi đè cột "chủ ví" ở [ADR 0033 điều 2](0033-money-ledger-and-deposit-allocation.md)**;
bốn nguồn ghi có giữ nguyên, không có nguồn thứ năm.

### 3. Ví gian hàng là quyền SỞ HỮU, không phải permission

Số dư, sổ cái, lịch sử rút, tạo/huỷ lệnh rút và tài khoản ngân hàng nhận tiền của gian hàng chỉ
thuộc về `shop_owner`. Thi hành bằng `@ShopOwnerOnly()`, **không** bằng một khoá trong `PERMISSION`.

Lý do không làm permission: permission uỷ quyền được. Chủ shop tạo một vai tuỳ biến rồi gán cho
quản lý là mở luôn đường ra của tiền, và guard đọc quyền từ DB mỗi request nên "mặc định không có"
không ngăn được gì. Câu hỏi ở đây cũng khác: không phải "người này được làm gì trong gian hàng" mà
"tiền này của ai".

`seller_profile.view`/`.manage` trở lại đúng phạm vi của nó (hồ sơ người bán: pháp nhân, thuế,
KYC) và **không còn mở ví**.

### 4. Ranh giới hai tuyến chặn ở SERVER, không sau công tắc rollout

`@SubscriptionTrackOnly()` + `SubscriptionTrackGuard` gác bộ quản lý gian hàng, đọc `billingMode`
mà `TenantScopeGuard` đã giải sẵn. Nó **chặn thật ngay và không đọc `PLAN_FEATURE_ENFORCEMENT`**:
công tắc đó gác một đợt ROLLOUT (hạ cấp năng lực dần, có đường lùi), còn ranh giới hai tuyến là
quyết định SẢN PHẨM — để nó nằm sau một công tắc rollout nghĩa là trên chính môi trường đang chạy
thật, ranh giới đó không tồn tại.

Câu hỏi "ai vào được Manage" là thuộc tính của TENANT, **không hỏi vai**: hết ân hạn thì chủ, quản
lý, nhân viên và người xem ra khỏi Manage cùng lúc. Bản trước hỏi `isCommissionTrack` — một hàm
gộp vai với tuyến — nên nó trả `false` cho mọi vai khác `shop_owner` và `!false` mở cổng cho họ ở
**mọi** gian hàng.

Ngoại lệ duy nhất: `req.platform` (ADR 0032 điều 6).

### 5. Hết ân hạn thì KHÔNG còn màn Manage chỉ-xem

**Ghi đè [ADR 0027 điều 3](0027-feature-tiers-basic-owner-vs-shop.md) trong phạm vi HẾT GÓI.**
Tenant đã về tuyến hoa hồng dùng Owner Lite, và Owner Lite không có bộ quản lý nâng cao ở bất kỳ
chế độ nào — kể cả `read_only`.

`read_only` **vẫn sống**, chỉ hẹp lại đúng một bậc: tenant **vẫn ở tuyến gói** mà hạ bậc (hoặc
đang trong ân hạn) thì tính năng đã có dữ liệu vẫn xem lại được. Đó mới là ca ADR 0027 điều 3 viết
ra để giải.

Điều ADR 0027 lo — *"không ai mất quyền xem sổ sách của chính mình"* — **không bị vi phạm**: đơn
đang chạy, bàn giao, chứng từ, ví điểm và khai thuế **không nằm sau cờ tính năng nào**, nên chủ xe
vẫn khép được chuyến và vẫn rút được tiền. Thứ mất đi là **sổ tổng hợp** (thu chi, công nợ, báo
cáo) — đúng ranh giới mà ADR 0027 điều 1 đã vẽ.

Trục quyết định là **TUYẾN**, không phải PHA: lấy pha làm mốc thì mốc "sau khi worker nối dòng hoa
hồng" lại thành `current` và `read_only` mọc lại — hành vi phụ thuộc việc job đã chạy hay chưa.

### 6. Tài khoản gian hàng không đặt xe; không ai tự thuê xe của mình

- Thành viên hoạt động của gian hàng **tuyến gói** — mọi vai — không gửi được yêu cầu thuê
  (`SHOP_ACCOUNT_CANNOT_BOOK`). Chủ xe tuyến **hoa hồng** vẫn thuê xe bình thường (ADR 0032 điều 1).
- Không ai đặt xe của chính gian hàng mình (`CANNOT_BOOK_OWN_VEHICLE`), và không ai tự duyệt yêu
  cầu do mình gửi (`CANNOT_DECIDE_OWN_REQUEST`). Đây là chuyện KẾ TOÁN: hai vai trên một booking
  khiến phí dịch vụ thu từ chính người nhận tiền, và người duyệt là người gửi.

Cổng đặt **sau** cửa OTP và **sau** điểm hội tụ danh tính (`effectiveUserId`), **trước** khi ghi
`booking_requests` và trước khi cấp phiên. Vị trí đó phủ cả ca "đăng xuất rồi đặt bằng OTP với
cùng số điện thoại" — `users.phone` là unique nên OTP tìm lại đúng tài khoản gian hàng.

Giao diện **không ẩn nút đặt xe**: ẩn nút không phải kiểm soát quyền, và ẩn đi thì chủ gian hàng
bấm mãi không được mà không bao giờ biết vì sao. Thông điệp phải nói rõ **"số điện thoại KHÁC"**.

### 7. Khu user của tài khoản gian hàng, và quy tắc chuyển tiếp

`/account` của tài khoản gian hàng giữ: marketplace, "Quản lý gian hàng", "Hồ sơ gian hàng" (hồ sơ
PHÁP NHÂN — **không** gọi là "Tài khoản của tôi") và phần tài khoản của chính con người đó. Ẩn:
chuyến, chat, thông báo phía khách, toàn bộ công cụ cho thuê.

Menu khu khách của họ có **đúng hai mục**: "Quản lý gian hàng" và "Hồ sơ gian hàng". Hồ sơ con
người, đổi mật khẩu và yêu cầu xoá tài khoản nằm ở `/manage/account`.

**Cổng URL, không chỉ ẩn menu.** Ẩn một mục mà để URL mở được là để lại cửa sau, và người dùng
tìm thấy nó bằng bookmark cũ chứ không bằng ý đồ xấu. `shopAccountRedirect` chặn MỌI đường dưới
`/account` và `/trips` — không liệt kê trắng từng route, vì một màn thêm vào tháng sau sẽ lặng lẽ
thành lối vào. Đích là màn TƯƠNG ĐƯƠNG trong Manage, không phải một trang 403.

**Chuyển tiếp — lối theo NGỮ CẢNH, không phải mục menu.** Ca thật: chủ xe tuyến hoa hồng đang đi
thuê xe người khác thì nâng lên gói — chuyến chưa xong, tiền hoàn chưa về, chat với chủ xe kia vẫn
mở. Những nghĩa vụ đó đi qua `/manage/account/trips` (khoá vai `renter`), và lối vào là một THẺ
trong "Tài khoản & bảo mật", chỉ hiện khi còn chuyến chưa khép.

Vì sao không phải một mục menu bật/tắt theo dữ liệu (bản 15/09 từng làm vậy qua
`MeDto.openRenterTripCount`): một mục xuất hiện rồi biến mất theo ngày khiến hai người cùng vai
nhìn thấy hai menu khác nhau và không ai giải thích được. Menu là bản đồ; bản đồ không đổi hình
dưới chân người đi.

`/manage` có **"Tài khoản & bảo mật"** cho người đăng nhập, tách khỏi hồ sơ tenant. Trước đó màn
đổi mật khẩu duy nhất nằm ở `/account` và không mục nào trong `SHOP_NAV` dẫn tới.

### 8. `/trips` phân biệt hai vai ở SERVER

Tham số `role` (`renter` / `host`) đi vào chính vị từ scope, nên lọc, đếm tổng, đếm từng tab và
phân trang dùng chung một định nghĩa. Bỏ trống = cả hai vai (client cũ không gãy).

Lọc ở client bị loại: nó cho ra những trang dài ngắn khác nhau và một con số tổng không khớp thứ
người dùng đếm được trên màn hình.

**Giao diện KHÔNG bày bộ chọn vai** (16/09/2026). Bản 15/09 thêm một hàng `Segmented`
"Tất cả · Tôi đi thuê · Tôi cho thuê" trên hai tab trạng thái; hai hàng điều khiển chồng nhau buộc
người đọc phải hiểu cái nào lồng trong cái nào trước khi đọc được chuyến nào, trong khi mỗi thẻ đã
mang nhãn vai của nó. `/trips` trở lại **đúng hai tab** Hiện tại / Lịch sử.

Chiều vai vẫn sống ở server: `?role=` trên URL được tôn trọng (deep link, thông báo) và
`TripsView lockedRole` khoá nó cho lối chuyển tiếp trong Manage. Bỏ phần giao diện không đụng tới
phép lọc, nên số đếm trên tab và phân trang vẫn khớp tập đang xem.

### 9. Owner Lite có MỘT cửa tiền, và menu gọn lại còn chín mục

Sidebar Owner Lite: Danh sách xe · Lịch xe · Cẩm nang cho thuê xe · Chuyến của tôi · Thông tin khai
thuế · Hợp đồng & Chứng từ · Chính sách bảo vệ dữ liệu · Tài khoản của tôi · Đổi mật khẩu. MỘT nhóm
phẳng, không tiêu đề — chủ xe không đổi vai khi bấm từ "Lịch xe" sang "Tài khoản của tôi".

Bảy mục rời khỏi menu. **Đây là thay đổi ĐIỀU HƯỚNG**: không route, dữ liệu, sổ cái, biên lai,
chứng từ hay quyền xử lý tiền nào bị xoá, và bookmark cũ vẫn mở được.

| Mục cũ | Nay ở đâu |
| --- | --- |
| Tiền cho thuê xe | Số dư hiện trong "Tài khoản của tôi"; sổ đầy đủ ở `/account/earnings` |
| Tài khoản nhận tiền | Trong "Tài khoản của tôi", và trong chính luồng rút tiền |
| Lịch sử thanh toán | Chi tiết từng chuyến; `/account/payments` vẫn mở được để tra soát |
| Yêu cầu xoá tài khoản | Trong "Tài khoản của tôi", cạnh danh tính mà nó đụng tới |
| Tin nhắn với khách | Hộp thư HỢP NHẤT trên biểu tượng chat ở header (điều 10) |
| Hồ sơ chủ xe | Sửa tại ngữ cảnh cần nó: thuế ở "Thông tin khai thuế", giấy tờ xe ở màn xe |
| Gói dịch vụ | Thẻ "Gian hàng của tôi" đầu trang hồ sơ — nâng cấp là việc MỘT LẦN |
| Đăng xuất | Menu avatar trên header (desktop và mobile) |

Lý do gộp tiền về một cửa: trước đợt này chủ xe mở menu và gặp BA màn tiền đứng cạnh nhau, không
màn nào tự nói mình chứa gì. Nay "Tài khoản của tôi" hiện **ba con số** của MỘT ví (khả dụng · đang
chờ chuyển · tổng nghĩa vụ — ADR 0033 điều 6), và bấm vào số điểm mới mở sổ giao dịch + lệnh rút.
Rút tiền vẫn là một YÊU CẦU có trạng thái, không phải một lời hứa chuyển ngay.

**Nâng cấp lên gian hàng là onboarding trên TENANT HIỆN CÓ.** `BillingService.purchase` nhận
`tenantId` của chính họ; không tạo tenant thứ hai, không tạo ví thứ hai, không dựng lịch sử song
song. Ví giữ nguyên vì nó đã thuộc tenant từ lúc họ thành chủ xe (điều 2) — đó là lý do nâng cấp
không phải chuyển một đồng nào.

### 10. Chủ xe tuyến hoa hồng có MỘT hộp thư, hợp nhất ở SERVER

Trục truy vấn tách khỏi trục vai: `CHAT_INBOX` (`customer` · `shop` · `unified`) trả lời "cho tôi
xem hội thoại nào"; `CHAT_SIDE` (`customer` · `shop`) vẫn là thuộc tính của TỪNG hội thoại.

`unified` là **hợp của đúng hai phạm vi người gọi đã có** — không phải phạm vi thứ ba, và không mở
thêm hội thoại nào. Hai vế rời nhau theo định nghĩa (vế gian hàng loại trừ hội thoại mà chính người
đó là khách), nên tổng, phân trang và số chưa đọc cộng thẳng được mà không đếm hai lần. Vai của mỗi
dòng suy từ `customerUserId`, không từ tham số truy vấn.

Hợp nhất diễn ra trong MỘT truy vấn. Ghép hai trang kết quả ở client cho ra những trang dài ngắn
khác nhau, một thứ tự thời gian sai ngay ở trang thứ hai, và một con số tổng không khớp màn hình.

AI thấy hộp thư hợp nhất: **chỉ `shop_owner` của tenant tuyến hoa hồng, và chỉ ở bề mặt khách.**

- Quản lý/nhân viên/người xem của tenant hoa hồng **không** — hôm nay họ không có hộp thư gian hàng
  nào trong giao diện, và cho họ hộp thư hợp nhất là lặng lẽ mở một bề mặt mới bằng một thay đổi
  điều hướng.
- Tuyến gói giữ hai hộp thư: `/chat` (khách) và `/manage/chat` (vận hành) là hai màn với hai tập
  thông tin và hai nhịp làm việc.
- Bề mặt `shop` **không bao giờ** hợp nhất: `/manage/chat` là bàn làm việc chung của cả gian hàng,
  và trộn hội thoại riêng của người đang đăng nhập vào đó là lộ việc riêng cho đồng nghiệp.

`/account/messages` trở thành chuyển hướng 308 sang `/chat`, mang theo `?c=`.

**Chuông** của chủ xe tuyến hoa hồng dùng bề mặt `owner`: hội thoại → `/chat?c=`, booking/yêu cầu →
`/trips/[id]` (endpoint chi tiết phục vụ cả hai vai), xe → `/account/vehicles`, gian hàng →
`/account/registration`. Không đường nào dẫn họ vào `/manage`.

### 11. `unconfigured` phải NÓI RA, không được coi là hoa hồng

`billingMode` rỗng là lỗi cấu hình, không phải một tuyến (điều 1). Giao diện vẫn cho họ làm việc ở
Owner Lite — họ SỞ HỮU một gian hàng và không có `/manage`, nên khoá luôn khu này sẽ để họ không còn
chỗ nào — nhưng `/account` phải hiện một cảnh báo nói rõ XePrime đang từ chối mọi đường ghi tiền của
họ (`TENANT_BILLING_NOT_CONFIGURED`). Không gọi họ là "hoa hồng", không in một % nào.

Cảnh báo KHÔNG chặn màn hình: đây là lỗi vận hành của nền tảng, người dùng không tự sửa được, và
xem xe / chuyến cũ / sổ tiền đều không đụng tới cấu hình gói.

### 12. Hạn mức xe: hai tuyến đếm theo hai cách, và chỉ một điểm thi hành

| Tuyến hiệu lực | Trần | Cách đếm | Gác ở đâu |
| --- | --- | --- | --- |
| `package` (`current` · `grace`) | số **CHỖ ĐÃ MUA**, theo LOẠI xe | ô tô và xe máy riêng | tạo xe **và** gửi lên chợ |
| `commission` (kể cả `lapsed`) | `OWNER_LITE_VEHICLE_LIMIT` = **3** | **TỔNG** ô tô + xe máy | chỉ ở **tạo xe** |
| `unconfigured` | 3, nhưng **mã lỗi khác** | tổng | chỉ ở **tạo xe** |

Ba điều đóng đinh ở đây:

**Trần Owner Lite là TỔNG, không phải 3 mỗi loại.** Câu hỏi nó trả lời là *"người này đang tự cho
thuê vài chiếc, hay đang vận hành một đội xe"* — ba ô tô cộng ba xe máy đã là một đội xe. Trần này
là quy tắc SẢN PHẨM viết trong code (`@xeprime/types`), không phải dữ liệu của bậc gói: tuyến hoa
hồng không bán chỗ nên nó không có `slots_json` để đọc.

**Nó đọc pha hiệu lực, không đọc "gói hiện hành".** Vị từ `ends_at > now` trả rỗng đúng giây một
gói hết hạn, và bản trước coi rỗng là KHÔNG GIỚI HẠN. Cộng với `graceDays = 7` và kỳ hoa hồng 12
tháng mà cả sàn nhận trong cùng một ngày (bối cảnh điều 2), đó là một cửa sổ ĐỊNH KỲ trong đó mọi
chủ xe đăng được vô số xe.

**Trần TỔNG chỉ gác điểm TẠO, không gác điểm gửi lên chợ.** Nó không cần điểm thứ hai — không tạo
được chiếc thứ tư thì không có chiếc thứ tư để gửi. Gác thêm ở đó lại gây đúng thiệt hại mà mục
dưới cấm: gian hàng 10 xe rơi về hoa hồng giữ nguyên 10 xe TRÊN CHỢ, nhưng mọi chiếc rời chợ một
lần (sửa hồ sơ, bị yêu cầu bổ sung, tạm gỡ) sẽ không bao giờ quay lại được — "gỡ xe đang bán" trả
góp, chỉ chậm hơn. Hạn mức theo CHỖ thì ngược lại: chỗ **là** suất trên chợ, nên nó gác cả hai.

`unconfigured` dùng cùng con số (mức an toàn khi hỏng là mức CHẶT) nhưng ném
`TENANT_BILLING_NOT_CONFIGURED` chứ không `PLAN_LIMIT_REACHED`: nói "chủ xe cá nhân đăng tối đa 3
xe" với một tenant chưa có gói là nói sai nguyên nhân, và đẩy họ đi mua một gói không sửa được gì.

**Chuyển tuyến không gỡ hàng.** Hạn mức của Owner Lite **chặn TẠO MỚI, không gỡ thứ đang có**. Gian
hàng bị chuyển tuyến mà đang có nhiều xe hơn hạn mức thì xe ở nguyên trên chợ, chuyến chạy tiếp, tiền về ví bình thường; cái bị
khoá là đăng thêm xe. Hạ cấp là hệ quả của việc *không trả tiền*, và phản ứng đúng là ngừng bán
thêm, không phải gỡ hàng đang bán xuống — cùng nguyên tắc mà [ADR 0020 điều 5] đã chốt cho xe khi
hết gói.

### 13. Danh mục gói: MỘT tuyến hoa hồng được bảo vệ, và nó không phải một SKU

Tuyến hoa hồng có **đúng một** bậc (`DEFAULT_COMMISSION_PLAN_CODE = free`). Backend giữ bất biến
đó ở ba cổng, tất cả trong `BillingService`:

| Thao tác | Kết quả |
| --- | --- |
| Tạo một bậc `commission` thứ hai | `COMMISSION_PLAN_IS_SINGLETON` |
| Archive bậc `commission` | `DEFAULT_PLAN_PROTECTED` |
| Đổi bậc `commission` sang `package` (hoặc ngược lại) | `DEFAULT_PLAN_PROTECTED` / `COMMISSION_PLAN_IS_SINGLETON` |
| Mở gian hàng khi danh mục thiếu bậc đó | `DEFAULT_COMMISSION_PLAN_MISSING` — **ném**, không log rồi đi tiếp |

Vì sao phải là bất biến chứ không phải một quy ước: `assignDefaultPlanWithinTx` và job vòng đời
đều chọn *"bậc `commission` đang bán có `sort_order` nhỏ nhất"*. Bậc thứ hai biến phép chọn đó
thành một cuộc xổ số — hai chủ xe mở gian hàng cùng ngày nhận hai mức phí khác nhau mà không ai
quyết định điều đó. Archive nó thì phép chọn không còn gì để chọn, và mọi gian hàng mở sau đó ra
đời ở pha `unconfigured` (điều 1): triệu chứng không hiện ở màn quản trị gói mà hiện hàng tuần sau,
ở chỗ khác hẳn.

Bản trước ghi `logger.error` rồi `return` khi thiếu bậc mặc định, nên việc đăng ký **thành công**
và tenant ra đời không có dòng thuê bao nào. Thất bại ngay lúc đăng ký nhìn thấy được và sửa được;
thất bại lặng lẽ thì người dùng chỉ phát hiện khi khách đầu tiên bấm đặt xe.

Hệ quả ở đường ĐỌC: `listPlansForTenant` lọc `billingMode = package`. Bậc hoa hồng không xuất hiện
ở màn chọn gói, vì bày nó ra là mời người dùng "mua" thứ họ đang dùng — và `purchase()` sẽ từ chối
với *"không có khoản phải trả"* mà không giải thích được vì sao lựa chọn đó lại hiện ra.

### 14. "Ngừng bán" nói về DANH MỤC; huỷ thuê bao là thao tác khác

Archive một bậc gói **không huỷ một thuê bao nào**. Mọi `tenant_subscriptions` đang trỏ tới nó chạy
hết kỳ với `billing_mode`, `slots_json` và `commission_percent` đã snapshot (ADR 0024). Thứ mất đi
là khả năng MUA MỚI (`purchase` từ chối `status != active`) và khả năng admin gán nó cho tenant
khác. Huỷ thuê bao là `cancel()` — thao tác khác, bảng khác, audit khác.

Màn quản trị gói phải nói ra điều đó, không để admin suy: bậc hoa hồng mang nhãn "Tuyến mặc định"
và trạng thái "Không bán" (không phải "Đang bán"), nút Ngừng bán không tồn tại cạnh nó, và trạng
thái "Ngừng bán" của một bậc gói kèm giải thích có SỐ thuê bao vẫn đang chạy.

## Ràng buộc bắt buộc

1. Không nơi nào được `?? BILLING_MODE.PACKAGE` khi thiếu gói. Dùng `resolveEffectiveBilling`.
2. `wallets.owner_*` là `ON DELETE RESTRICT`. Xoá tenant/user có ví phải xử lý nghĩa vụ trước,
   tường minh — cascade trên một sổ công nợ phải trả là xoá tiền của người khác không để lại vết.
3. Ví gian hàng không bao giờ gác bằng một khoá `PERMISSION`.
4. Guard TUYẾN không đọc `PLAN_FEATURE_ENFORCEMENT`.
5. Gộp ví không được sinh dòng ghi có giả; migration phải đối soát tổng nghĩa vụ trước/sau và
   rollback khi lệch.
6. Sổ TÀI KHOẢN NGÂN HÀNG đi theo chủ VÍ, qua `resolveRefundWalletOwner` — cùng hàm, cùng luật chọn
   tenant với migration. Đóng đinh `{USER, customerUserId}` ở đường hoàn tiền sẽ tách đôi lại đúng
   cái sổ vừa hợp nhất.
7. Hộp thư hợp nhất không được ghép ở client, và mệnh đề tìm kiếm/chưa-đọc phải gom bằng `AND` —
   gán thẳng `where.OR` sẽ ghi đè chính mệnh đề quyền sở hữu.
8. Hạn mức xe hỏi `resolveEffectiveBilling`, **không** hỏi "gói hiện hành". Không gói ≠ không giới
   hạn.
9. Danh mục có ĐÚNG MỘT bậc `commission`, không archive được, không đổi `billing_mode` được. Thiếu
   nó thì việc mở gian hàng FAIL, không tạo tenant không tuyến.
10. % phí dịch vụ hiển thị đọc từ `fee_policies.service_fee_percent` bản `active` — cùng nguồn với
    tiền. `tenant_subscriptions.commission_percent` là ảnh chụp bậc gói, không có ràng buộc nào giữ
    hai số khớp nhau, nên `EffectiveBilling` cố ý KHÔNG mang `commissionPercent`.

## Cần xem lại khi nào

- Khi có luồng CHUYỂN QUYỀN SỞ HỮU tenant: lúc đó ví là một phần tài sản được chuyển, và ca "một
  người vừa sở hữu tenant A vừa làm nhân viên gian hàng B" cần câu trả lời thật (nay chấp nhận ví
  thuộc tenant A).
- Khi hỗ trợ nhận yêu cầu từ nhân viên gian hàng muốn tự thuê xe — hiện đường đi là tạo một tài
  khoản khách riêng, và thông điệp ở điều 6 đã hướng dẫn sẵn.
- Khi bật `PLAN_FEATURE_ENFORCEMENT=on` ở production: rà lại xem điều 5 có làm đổi tập tenant bị
  ảnh hưởng không.
