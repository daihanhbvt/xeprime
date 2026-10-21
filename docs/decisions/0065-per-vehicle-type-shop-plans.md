# ADR 0065 — Gói gian hàng theo LOẠI XE: tối đa một gói xe máy và một gói ô tô cùng lúc; gói doanh nghiệp bán bằng tư vấn

Ngày: 21/10/2026 · Trạng thái: **Accepted** · Ghi đè: [0041](0041-plan-tiers-by-vehicle-count.md) điều 1, 4 (cách đếm ở hàng `plan`), 7, 8 và gạch "`maxBranches` thành hạn mức THẬT" ở mục Hệ quả; [0038](0038-owner-track-split-and-unified-wallet.md) điều 12 hàng `package` · Giữ nguyên: 0041 điều 2, 3, 5, 6, 9 · Liên quan: 0010, 0022, 0024, 0027, 0040, [0064](0064-financial-flow-v2.md)

## Bối cảnh

ADR 0041 bán ba bậc theo TỔNG số xe (`shop-basic` 3 xe · `shop-advanced` 10 xe · `shop-pro` không giới
hạn) kèm trần chi nhánh. Thực tế bán hàng cho thấy hai nhóm khách khác hẳn nhau về giá trị một xe: một
cửa hàng 8 xe máy và một gian hàng 8 ô tô bị xếp cùng một bậc và trả cùng một giá, trong khi doanh thu
mỗi chuyến chênh nhau nhiều lần. Trần TỔNG khiến bậc đó vừa đắt với người cho thuê xe máy vừa rẻ với
người cho thuê ô tô.

Chủ sản phẩm chốt (21/10/2026) bán gói THEO LOẠI XE, và bỏ trần chi nhánh — chi nhánh không phải thứ
khách hàng nghĩ tới khi chọn gói, và chưa ai chạm trần đó.

## Quyết định

### 1. Bảy bậc, mỗi bậc một PHẠM VI loại xe

| Mã | Phạm vi (`vehicle_scope`) | Trần xe trong phạm vi | Bán |
| --- | --- | --- | --- |
| `moto_1` | `motorbike` | 1 | Tự mua |
| `moto_5` | `motorbike` | 5 | Tự mua |
| `moto_10` | `motorbike` | 10 | Tự mua |
| `car_1` | `car` | 1 | Tự mua |
| `car_5` | `car` | 5 | Tự mua |
| `car_10` | `car` | 10 | Tự mua |
| `enterprise_contact` | `all` | không giới hạn (`null`) | `salesOnly` — admin gán, giá đàm phán bắt buộc |

- Phạm vi là thuộc tính của BẬC (`plans.vehicle_scope`) và được **chụp lên dòng thuê bao**
  (`tenant_subscriptions` mang phạm vi + `quota_json`), cùng lý do snapshot của ADR 0041 điều 3. Phạm
  vi của một bậc đã có thuê bao không sửa được.
- Kỳ hạn bán: **1 / 3 / 6 / 12 tháng**, giá là SỐ TUYỆT ĐỐI admin nhập cho từng kỳ ở `limits.termPrices`
  — ADR 0041 điều 2 giữ nguyên (không phép nhân, % tiết kiệm chỉ để hiển thị). Giá niêm yết của sáu bậc
  tự mua là dữ liệu admin, không chốt trong ADR này.
- `maxBranches` thôi là hạn mức: không còn chặn ở `BranchesService.create`, không in trên thẻ gói.
- Bậc hoa hồng duy nhất (ADR 0038 điều 13) giữ nguyên, không có phạm vi.

### 2. Tối đa MỘT gói xe máy và MỘT gói ô tô cùng lúc; `enterprise_contact` loại trừ cả hai

Một gian hàng có thể đồng thời giữ một thuê bao phạm vi `motorbike` và một thuê bao phạm vi `car`. Thuê
bao phạm vi `all` chồng lên cả hai: trong khoảng thời gian của nó không có thuê bao `car` hay
`motorbike` nào.

Chuỗi kỳ (`planSubscriptionChain`, ADR 0041 điều 6 bổ sung 08/10/2026) chạy **theo từng phạm vi**: gia
hạn, nối đuôi, đổi bậc, huỷ đuôi chuỗi đều xét các kỳ cùng phạm vi. Gán `enterprise_contact` với
`timing = now` huỷ mọi kỳ `car`/`motorbike` còn hạn trong cùng transaction (mỗi kỳ một dòng audit lý do
`replaced`); với `next_term` nó nối sau kỳ kết thúc MUỘN NHẤT trong hai phạm vi. Khoá
`pg_advisory_xact_lock(subscriptionChainLockKey(tenant))` vẫn theo TENANT, không theo phạm vi — một khoá
cho mọi đường ghi chuỗi của một gian hàng.

### 3. Hạn mức đếm THEO LOẠI XE trong phạm vi của từng gói

- Gói `car_N` gác số ô tô của gian hàng ≤ N; gói `moto_N` gác số xe máy ≤ N; `enterprise_contact` không
  giới hạn cả hai. Một loại không bao giờ dùng trần của loại kia.
- Đọc trần vẫn là biểu thức tường minh của ADR 0041 điều 3 — `quota ? quota.maxVehicles : limits.maxVehicles`
  — nay trên dòng thuê bao CỦA ĐÚNG phạm vi chứa loại xe đó (phạm vi `all` chứa cả hai).
- `PLAN_LIMIT_REACHED.details` mang `{ vehicleType, used, limit }`.

### 4. Loại xe không có gói thì KHÔNG lên chợ — không rơi về hoa hồng

Gian hàng tuyến gói không có thuê bao hiện hành nào chứa một loại xe ⇒ trần của loại đó là **0**:

- **Gửi lên chợ bị chặn** ở server cho tới khi mua gói cho loại đó (`PLAN_SCOPE_REQUIRED`, 403, kèm
  `details.vehicleType`; cũng chặn đổi loại xe sang loại chưa có gói); giao diện mời mua gói đúng loại.
- Tạo hồ sơ xe của loại đó cũng bị chặn bằng cùng trần 0 — ADR 0041 điều 4 giữ nguyên nguyên tắc "trần
  ĐÃ TRẢ TIỀN gác cả tạo xe lẫn gửi chợ".
- Xe của loại đó **không** đi tuyến hoa hồng: một gian hàng không có hai tuyến cùng lúc (ADR 0032 điều 1).
- Không gỡ thứ đang có (ADR 0038 điều 12, 0041 điều 4 giữ nguyên): gói một loại hết hạn trong khi gói
  loại kia còn ⇒ xe của loại hết gói ở nguyên trên chợ, chuyến chạy tiếp; bị khoá là thêm xe và đưa THÊM
  xe của loại đó lên chợ.

### 5. Có MỘT gói hiện hành bất kỳ ⇒ cả gian hàng ở tuyến gói

Tuyến hiệu lực (`resolveEffectiveBilling`, ADR 0038 điều 1) là `package` khi gian hàng có ít nhất một
thuê bao gói ở pha `current` hoặc `grace`, bất kể phạm vi: **0% hoa hồng cho MỌI chuyến** (kể cả xe của
loại vừa hết gói còn trên chợ) và **Full Manage** cho cả gian hàng. Chỉ khi mọi phạm vi hết ân hạn thì
gian hàng về tuyến hoa hồng (ADR 0038 điều 5 giữ nguyên). Mốc `package_pending → package_active`
(ADR 0040 điều 3) ghi trong transaction kích hoạt gói ĐẦU TIÊN được trả, ở phạm vi bất kỳ.

### 6. Bảo đảm ở tầng DB

Ba bất biến dưới đây phải là constraint, không phải phép kiểm ở tầng app (cùng kỷ luật ADR 0006/0022):

1. **Không hai kỳ gói chồng nhau trên cùng (tenant, phạm vi).** `EXCLUDE USING gist` trên
   `tenant_subscriptions` theo `tenant_id WITH =`, khoảng phạm vi `WITH &&`, `tstzrange(starts_at, ends_at)
   WITH &&`, giới hạn ở dòng gói chưa huỷ.
2. **`all` loại trừ `car` và `motorbike`.** Rơi ra từ (1) nếu phạm vi được biểu diễn thành một khoảng
   chồng được — hình dạng dự kiến: cột sinh `int4range` (`car` = `[1,2)`, `motorbike` = `[2,3)`, `all` =
   `[1,3)`), để `&&` của gist tự bắt chồng lấn mà không cần extension mảng.
3. **Một hoá đơn MỞ cho mỗi (tenant, phạm vi).** Unique một phần trên `subscription_invoices
   (tenant_id, vehicle_scope) WHERE status IN ('issued', 'partially_paid')`
   (`subscription_invoices_one_payable_per_tenant_scope`). Phát hành/gán `enterprise_contact` huỷ hoá đơn mở
   của hai phạm vi kia trong cùng transaction.

`BillingService` vẫn là writer duy nhất (ADR 0041 điều 9.2); lỗi constraint ánh xạ về mã lỗi nghiệp vụ,
không lọt 500.

### 7. Chuyển đổi thuê bao đang chạy — MIỄN PHÍ, cùng ngày hết hạn

Trong migration (không phải job nền), theo số xe HIỆN CÓ của từng loại tại thời điểm chuyển:

- `shop-basic` / `shop-advanced` ⇒ mỗi loại nhận bậc NHỎ NHẤT chứa được số xe của loại đó (0–1 ⇒ `_1`,
  2–5 ⇒ `_5`, 6–10 ⇒ `_10`) — tức một CẶP `moto_*` + `car_*`; có loại vượt 10 xe ⇒ cả gian hàng nhận
  `enterprise_contact`.
- `shop-pro` ⇒ `enterprise_contact`.
- Dòng mới giữ đúng `starts_at`/`ends_at` của dòng cũ, không sinh hoá đơn, không thu thêm; `quota_json`
  chụp từ bậc mới; ghi audit nguồn `plan_migration`. Hoá đơn đã phát hành giữ nguyên.
- Ba mã cũ đi đường `retireLegacyPlans` (XOÁ khi không còn thuê bao trỏ tới, ARCHIVE khi còn —
  `plan_id` là `ON DELETE RESTRICT`).

### 8. Nâng gói ngay trong kỳ (mid-term immediate upgrade) — Phương án B

Khi gian hàng chọn nâng bậc **ngay lập tức** trong cùng phạm vi (ví dụ `moto_5` → `moto_10`):
- Kỳ hiện tại kết thúc ngay trong transaction (`ends_at = now()`).
- Hoá đơn mới phát hành với **GIÁ ĐẦY ĐỦ** của bậc mới, không hoàn tiền và không tính trừ ngày còn lại của kỳ cũ.
- Server thực thi: `timing = 'now'` trong API purchase/switch (`SUBSCRIPTION_CHANGE_TIMING.NOW`); constraint `EXCLUDE` không bị vi phạm vì kỳ cũ đã đóng trước khi kỳ mới mở.
- Giao diện hiển thị rõ chính sách: *"Kỳ hiện tại kết thúc ngay hôm nay. Bạn thanh toán đầy đủ giá gói mới, không hoàn tiền ngày còn lại."*

## Quan hệ với ADR cũ

| ADR | Phần bị ghi đè | Phần giữ nguyên |
| --- | --- | --- |
| 0041 | **Điều 1** (trần là TỔNG hai loại; `maxBranches` trong hình dạng bậc); **điều 4** ở hàng `plan` (đếm tổng, `assertVehicleQuota` bỏ `vehicleType`) — nay đếm theo loại trong phạm vi; **điều 7** (ba bậc seed); **điều 8** (ánh xạ theo tổng chỗ — nay theo điều 7 ở trên); gạch "`maxBranches` thành hạn mức THẬT" ở Hệ quả | Điều 2 (giá tuyệt đối từng kỳ), điều 3 (snapshot `quota_json`, đọc tường minh), hàng `owner_lite`/`billing_unconfigured` của điều 4 (TỔNG 3, chỉ gác tạo), điều 5 (`salesOnly` cần giá đàm phán), điều 6, điều 9 |
| 0038 | Điều 12 hàng `package` (đã bị 0041 sửa thành tổng) — nay: trần theo LOẠI trong phạm vi gói, gác tạo **và** gửi chợ | Hàng `commission`/`unconfigured`, "chuyển tuyến không gỡ hàng", điều 1, 5, 13, 14 |

## Hệ quả

- `plans`: thêm `vehicle_scope`; `limits_json` bỏ `maxBranches`. `tenant_subscriptions` +
  `subscription_invoices` mang phạm vi; ba constraint ở điều 6.
- `@xeprime/types`: `planSubscriptionChain`, `subscriptionCancelBlockOf`, `parsePlanQuota` nhận phạm vi;
  `isPlanSelfServe` giữ nguyên.
- Màn mua gói (`/manage/subscription`, onboarding tuyến gói) chọn tối đa một bậc mỗi loại; bậc doanh
  nghiệp là thẻ "Liên hệ tư vấn". Màn admin gán gói chọn phạm vi.
- App Partner (`apps/mobile/shared/src/features/subscription/`, `apps/mobile/shared/src/api/subscription/`)
  phải sửa theo — hai bản API không tự đồng bộ (ADR 0031).

## Cần xem lại khi nào

- Sau một chu kỳ bán: tỉ lệ chọn từng bậc và tỉ lệ chạm trần 1/5/10 — nếu nhiều gian hàng mua `_10` rồi
  dừng ở 6–7 xe, cần bậc giữa.
- Khi gian hàng vượt 10 xe một loại đủ nhiều để giá doanh nghiệp hội tụ — mở bậc `_20` tự mua.
- Nếu xuất hiện nhu cầu thật quản lý hồ sơ xe nội bộ cho loại chưa có gói (không lên chợ) — đó là nới
  điều 4, cần quyết định sản phẩm mới.
- Nếu chi nhánh trở lại thành thứ khách trả tiền vì nó.
