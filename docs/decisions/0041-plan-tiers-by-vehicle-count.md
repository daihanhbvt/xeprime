# ADR 0041 — Ba bậc gian hàng bán theo SỐ XE và KỲ HẠN; bậc doanh nghiệp bán bằng tư vấn

Ngày: 17/09/2026 · Trạng thái: **Accepted** · Ghi đè [ADR 0029](0029-per-vehicle-flat-pricing-and-customer-side-fees.md)
điều 3, [ADR 0015](0015-vehicle-slot-billing.md) điều 1/3/8, và [ADR 0038](0038-owner-track-split-and-unified-wallet.md)
điều 12 ở phần CÁCH ĐẾM của tuyến gói

## Bối cảnh

ADR 0029 chốt giá pilot theo CHỖ: `100.000đ/chỗ ô tô/tháng`, `40.000đ/chỗ xe máy/tháng`, phí nền
0đ, kỳ hạn bán tối thiểu 3 tháng. Mô hình đó đã thi công đủ: `limits_json.perVehiclePrice`,
`includedCars/includedMotorbikes`, `maxCars/maxMotorbikes`, `terms: [{months, discountPercent}]`,
`tenant_subscriptions.slots_json`, và một đường "mua thêm chỗ giữa kỳ" (`add-slots`).

Chủ sản phẩm chốt lại (17/09/2026) một mô hình bán hàng khác. Ba thứ đổi cùng lúc, và chúng kéo
theo nhau:

1. **Người mua không đếm chỗ, họ chọn một BẬC.** "Tối đa 3 xe · 1 chi nhánh · 100.000đ/tháng" là
   một câu đọc xong là quyết được. "Chọn số chỗ ô tô, chọn số chỗ xe máy, nhân đơn giá, rồi nhân
   số tháng" là một bài toán — và ở màn onboarding, một bài toán đứng giữa người dùng và lần trả
   tiền đầu tiên.
2. **Giá phải là con số TRÒN.** 3 tháng 250.000đ, 6 tháng 450.000đ, 1 năm 800.000đ. Từ mô hình cũ
   (đơn giá × số chỗ × số tháng × (1 − %giảm)) không có bộ % nào ra được đúng ba con số đó.
3. **Bậc lớn nhất không bán tự động.** Doanh nghiệp không giới hạn xe/chi nhánh cần tư vấn và một
   mức giá đàm phán; bày một giá niêm yết cho nó là vừa mất thương lượng vừa sai với thực tế bán.

Đây **không** phải thay đổi ở mô hình DOANH THU: hai tuyến của ADR 0028 giữ nguyên (tuyến hoa hồng
thu 10% phí dịch vụ ở PHÍA KHÁCH; tuyến gói 0đ/chuyến), và ADR 0029 điều 1–2 (phụ phí nằm phía
khách, ba dòng có cổng riêng) giữ nguyên hiệu lực. Thứ đổi là **cách đóng gói và định giá tuyến
gói**, và hạn mức đi kèm.

## Quyết định

### 1. Bậc gói bán bằng TRẦN SỐ XE, không bằng số chỗ mua

`plans.limits_json` của một bậc `package` mô tả một BẬC, không mô tả một bảng đơn giá:

```jsonc
{
  "maxVehicles": 3,        // TỔNG ô tô + xe máy. null = không giới hạn
  "maxBranches": 1,        // null = không giới hạn
  "maxMembers": null,
  "termPrices": [          // giá CẢ KỲ, VND chuỗi (ADR 0007)
    { "months": 1,  "price": "100000" },
    { "months": 3,  "price": "250000" },
    { "months": 6,  "price": "450000" },
    { "months": 12, "price": "800000" }
  ],
  "salesOnly": false,      // true = bậc tư vấn, xem điều 5
  "recommended": false,    // nhãn "Được đề xuất" trên bảng giá
  "graceDays": 7,
  "features": ["finance", "debts", "..."]
}
```

Biến mất khỏi hình dạng này: `perVehiclePrice`, `includedCars`, `includedMotorbikes`, `maxCars`,
`maxMotorbikes`, và `terms: [{months, discountPercent}]`.

**Trần là TỔNG hai loại xe, không phải hai con số.** Cùng lập luận mà ADR 0038 điều 12 đã dùng cho
Owner Lite: câu hỏi mà trần này trả lời là *"gian hàng này đang vận hành bao nhiêu xe"*, và ba ô tô
cộng ba xe máy là sáu xe. Giữ hai trần riêng ở đây nghĩa là một bậc "10 xe" thật ra bán 20, và màn
bảng giá không nói được nó bán gì bằng một dòng.

### 2. Giá là SỐ TUYỆT ĐỐI của từng kỳ hạn; phần trăm tiết kiệm được TÍNH RA để hiển thị

`termPrices[].price` là tiền CẢ KỲ, admin gõ thẳng. Không có `discountPercent` nào được lưu, và
không có phép nhân nào ở đường tiền: `purchase()` và `assign()` đọc đúng con số của kỳ hạn được
chọn.

% tiết kiệm trên thẻ kỳ hạn ("Tiết kiệm 17%") là **phép so sánh hiển thị**, tính từ chính bảng giá:

```
saving% = round(100 × (1 − price(N) ÷ (price(1) × N)))
```

Bậc không bán kỳ 1 tháng thì không có mốc để so ⇒ không hiện % nào. Ba ràng buộc đi kèm:

- **Không dòng tiền nào mang % này.** Hoá đơn ghi `subtotal = totalAmount = price(N)` và
  `discountAmount = 0`. Một dòng "giảm giá" trên chứng từ phải tương ứng với một khoản giảm THẬT
  trên một giá gốc THẬT; ở đây giá gốc của kỳ 12 tháng là 800.000đ, không phải 1.200.000đ.
- **Không tính % ở client rồi gửi lên.** Server không nhận giá từ client ở đường tự mua.
- `termPrices` cũng là **danh sách kỳ hạn ĐƯỢC BÁN** (giữ nguyên tinh thần ADR 0029 điều 3): mua
  với kỳ hạn không có trong bảng bị từ chối, và đó là lớp chặn thật — ẩn thẻ ở UI chỉ là UX.

### 3. Hạn mức được SNAPSHOT lên dòng thuê bao — `quota_json` thay `slots_json`

`tenant_subscriptions.quota_json` chụp lại trần lúc gán/kích hoạt:

```jsonc
{ "maxVehicles": 3, "maxBranches": 1, "maxMembers": null }
```

Vì sao phải snapshot chứ không đọc xuyên qua `plans.limits_json`: cùng lý do ADR 0024 điều 2 đã
chốt cho `billing_mode`. Admin sửa bậc "Cơ bản" từ 3 xe xuống 2 xe là một quyết định về DANH MỤC;
để nó lật hạn mức của mọi gian hàng đang chạy giữa kỳ là đổi điều kiện hợp đồng của một khoản đã
thu tiền.

Đọc hạn mức là một biểu thức, không phải một `??`:

```ts
const quota = parsePlanQuota(row.quotaJson);        // null = dòng cũ, chưa có snapshot
const maxVehicles = quota ? quota.maxVehicles : limits.maxVehicles;
```

`quota.maxVehicles === null` nghĩa là **không giới hạn** và phải thắng; `?? limits.maxVehicles` đọc
nó thành "chưa khai" và rơi về bậc gói — sai ở đúng chỗ tốn tiền nhất. Parser chỉ công nhận một
snapshot khi khoá `maxVehicles` CÓ MẶT (số nguyên hoặc `null` tường minh); jsonb hỏng/thiếu rơi về
`null` (không có snapshot) chứ không rơi về "không giới hạn".

### 4. Trần xe gác điểm TẠO ở cả hai tuyến; điểm CHỢ chỉ gác trần ĐÃ TRẢ TIỀN

ADR 0038 điều 12 tách hai tuyến theo CÁCH ĐẾM (chỗ theo loại ↔ tổng). Cách đếm nay là một:
**TỔNG**, ở cả hai tuyến. Thứ còn khác nhau là điểm thi hành, và nó đổi trục — từ "tuyến nào" sang
"trần này có được trả tiền không":

| Nguồn trần | Trần | Gác tạo xe | Gác gửi lên chợ |
| --- | --- | --- | --- |
| Bậc gói đã mua (`reason: 'plan'`) | `quota.maxVehicles` | ✅ | ✅ |
| Owner Lite (`reason: 'owner_lite'`) | `OWNER_LITE_VEHICLE_LIMIT` = 3 | ✅ | ❌ |
| Chưa cấu hình (`reason: 'billing_unconfigured'`) | 3, mã lỗi khác | ✅ | ❌ |

Hai lý do, ngược chiều nhau, và cả hai đều đã được viết ra ở ADR 0038:

- **Tuyến hoa hồng không gác chợ** vì trần tạo đã đủ: không tạo được chiếc thứ tư thì không có
  chiếc thứ tư để gửi. Gác thêm ở đó gây đúng thiệt hại ADR 0038 cấm — gian hàng rơi khỏi gói giữ
  nguyên xe TRÊN chợ, nhưng mọi chiếc rời chợ một lần sẽ không quay lại được.
- **Trần đã trả tiền thì gác chợ**, vì đó là cửa duy nhất còn lại của một lần HẠ BẬC. Gói mới nối
  đuôi gói cũ (`resolveChainStart`), nên một gian hàng 40 xe hạ về bậc 3 xe bước sang kỳ mới với 40
  xe đang bán và một hoá đơn 100.000đ. Không gác chợ ở đó là để ngỏ một lỗ định giá, không phải bảo
  vệ hàng đang bán.

Chuyển tuyến/hạ bậc vẫn **không gỡ thứ đang có** (ADR 0038 giữ nguyên): xe ở nguyên trên chợ, chuyến
chạy tiếp, tiền về ví. Thứ bị khoá là đăng thêm và đưa THÊM xe lên chợ.

`assertVehicleQuota` mất tham số `vehicleType` (đếm tổng thì loại xe không vào `where` nữa) và
`remainingMarketplaceSlots` bị gỡ — nó phục vụ một đường gửi hàng loạt theo LOẠI chưa từng có nơi
gọi.

### 5. Bậc `salesOnly` — bán bằng tư vấn, admin gán tay với giá thoả thuận

`limits.salesOnly = true` đánh dấu bậc doanh nghiệp. Hệ quả, cả ba đều ở SERVER:

| Đường | Hành vi |
| --- | --- |
| Bảng giá (`GET /subscription/plans`) | VẪN hiện — thẻ "Liên hệ tư vấn", không có giá |
| Tenant tự mua (`POST /subscription/purchase`) | Từ chối: `PLAN_NOT_SELF_SERVE` |
| Admin gán (`POST /platform/tenants/:id/subscriptions`) | Cho phép, **bắt buộc** gửi `price` |

`price` ở đường admin là giá ĐÀM PHÁN, ghi audit như mọi thao tác platform. Với bậc thường, `price`
là tuỳ chọn: bỏ trống thì lấy giá niêm yết của kỳ hạn, gửi lên thì đó là một khoản giảm/tăng có chủ
đích — và cũng có audit. Bậc `salesOnly` không có giá niêm yết để rơi về, nên ở đó `price` là bắt
buộc, chặn bằng mã `VALIDATION_FAILED` chứ không mặc định 0đ.

`salesOnly` **không** miễn kỳ hạn: vẫn chọn trong `SUBSCRIPTION_TERM_MONTHS` (1/3/6/12, có CHECK ở
DB). Mở kỳ hạn tuỳ ý là một thay đổi ở DB CHECK và ở `addCalendarMonthsVn`, không thuộc phạm vi này.

### 6. "Mua thêm chỗ giữa kỳ" bị gỡ

`POST /platform/tenants/:id/subscriptions/add-slots` và `BillingService.addSlots` biến mất cùng
`slots_json`: nghiệp vụ đó nói về việc mua THÊM CHỖ, và không còn chỗ để mua. Đổi bậc giữa kỳ là
`cancel()` rồi `assign()` — hai thao tác có sẵn, mỗi thao tác một dòng audit, và dòng mới bắt đầu
từ `now` chứ không nối đuôi (đúng ngữ nghĩa "đổi hợp đồng" thay vì "gia hạn"). Endpoint đó chưa có
nơi gọi nào ở web hay app native.

### 7. Ba bậc seed, và danh mục KHÔNG bị đóng ở con số ba

Seed tạo ba bậc `package` cạnh bậc hoa hồng duy nhất (ADR 0038 điều 13 giữ nguyên):

| Mã | Tên | Trần xe | Chi nhánh | 1 tháng | 3 tháng | 6 tháng | 12 tháng |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shop-basic` | Gói cơ bản | 3 | 1 | 100.000 | 250.000 | 450.000 | 800.000 |
| `shop-advanced` | Gói nâng cao | 10 | 3 | 250.000 | 650.000 | 1.200.000 | 2.000.000 |
| `shop-pro` | Gói chuyên nghiệp | ∞ | ∞ | — bán bằng tư vấn (`salesOnly`) — |

Ba bậc là DỮ LIỆU seed, không phải một bất biến trong code: `BillingService` không đếm bậc
`package` và không biết tên nào. Bất biến duy nhất của danh mục vẫn là **đúng một** bậc
`commission` (ADR 0038 điều 13). Cả ba bậc `package` mang `FULL_MANAGE_FEATURES` — ranh giới năng
lực là giữa hai TUYẾN (ADR 0027/0038), không phải giữa ba bậc; ba bậc khác nhau ở QUY MÔ.

Bậc `per-vehicle` của ADR 0029 đi theo đường `retireLegacyPlans` đã có sẵn: XOÁ khi không còn thuê
bao trỏ tới, ARCHIVE kèm cảnh báo khi còn. Không bao giờ xoá cứng một bậc còn thuê bao —
`plan_id` là `ON DELETE RESTRICT` và mã gói đó nằm trên hoá đơn đã phát hành.

### 8. Thuê bao đang chạy được ÁNH XẠ sang bậc tương đương, trong migration

Chủ sản phẩm chốt chuyển ngay thay vì chờ hết kỳ. Migration ánh xạ theo TỔNG chỗ đã mua
(`slots_json.car + slots_json.motorbike`) sang bậc có trần nhỏ nhất còn chứa được, và ghi
`quota_json` từ chính bậc đó. `plan_id`, `price`, `starts_at`, `ends_at` của dòng đang chạy **giữ
nguyên** — gian hàng đã trả tiền tới ngày nào thì dùng tới ngày đó; thứ đổi là trần đi kèm.

Điều đó có nghĩa một số dòng sẽ mang `plan_id` trỏ tới bậc đã archive, và đó là đúng: archive nói
về DANH MỤC, không huỷ thuê bao (ADR 0038 điều 14).

## Hệ quả

- `packages/types`: `PlanLimitsJson` đổi hình; `PlanSlots`/`parsePlanSlots`/`termDiscountPercent`/
  `subscriptionTermTotalPreview` nghỉ hưu, thay bằng `PlanQuotaSnapshot`/`parsePlanQuota`/
  `planTermPrice`/`planTermSavingPercent`/`planSellableTerms`/`isPlanSelfServe`.
- `PlanInvoiceLine.kind` nhận thêm `'package'` và **chỉ ghi** giá trị đó; `'base'`/`'slot'`/
  `'add_slot'` ở lại trong union để hoá đơn cũ còn đọc được.
- `PlanInvoiceSnapshot.slots` → `.quota`. Parser đọc được cả hoá đơn cũ (cộng `car + motorbike`
  thành `maxVehicles`) — hoá đơn `issued` đang chờ tiền lúc deploy vẫn kích hoạt được.
- Mã lỗi mới `PLAN_NOT_SELF_SERVE`. `PLAN_LIMIT_REACHED` giữ nguyên tên nhưng `details` đổi từ
  `{vehicleType, used, limit}` sang `{scope, used, limit}`.
- **Đợt CONTRACT của `plans`** đi cùng migration này — bốn cột mà ADR 0010/0015/0020 đã hẹn gỡ
  nay không còn nơi nào đọc: `price`, `duration_days`, `max_vehicles` (thay bằng
  `limits_json.maxVehicles` + `quota_json`) và `assumed_monthly_gmv_json` (đầu vào DUY NHẤT của
  phép kiểm điểm giao mà ADR 0029 điều 4 đã cho nghỉ hưu). Giữ chúng qua đợt này nghĩa là màn
  quản trị gói có hai câu trả lời cho "trần xe của bậc này là bao nhiêu".
- `MySubscriptionDto.usage.<loại>.limit` bị gỡ: trần nay là MỘT con số ở `fleetQuota`. Giữ hai ô
  `used`/`onMarketplace` theo loại vì màn hình vẫn cần chúng.
- `maxBranches` thành hạn mức THẬT (chặn ở `BranchesService.create`) — trước ADR này nó là một ô
  admin nhập mà không nơi nào đọc, và bảng giá mới in nó lên thẻ.
- App native (`apps/mobile/src/features/subscription/components/PurchaseSheet.tsx` và
  `apps/mobile/src/api/subscription/`) dùng chung contract này nên phải sửa theo — ADR 0031 nói rõ
  hai bản KHÔNG tự đồng bộ.

## Xem lại khi nào

- Sau pilot ba bậc: đo tỉ lệ chọn từng bậc và tỉ lệ chạm trần 3/10 xe. Trần đúng là trần mà người
  chạm vào sẽ nâng bậc, không phải trần khiến họ bỏ đi.
- Khi bậc `salesOnly` bán đủ nhiều để giá đàm phán hội tụ — lúc đó nó nên có bảng giá và thôi
  `salesOnly`.
- Nếu xuất hiện nhu cầu thật về kỳ hạn dài hơn 12 tháng (hợp đồng doanh nghiệp), vì nó chạm DB
  CHECK `tenant_subscriptions_term_months_check` chứ không chỉ chạm dữ liệu.
