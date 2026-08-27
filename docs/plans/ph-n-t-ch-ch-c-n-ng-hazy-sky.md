# Epic — `/manage/finance` "Tổng quan doanh thu"

> ✅ **ĐÃ TRIỂN KHAI 25/08/2026** (ba đợt — xem các mục "Đợt 2" / "Đợt 3" bên dưới). Verify sau đợt 3: jest
> **30/30** (`finance-reports.spec.ts`, PostgreSQL thật) · vitest **1672/1672 (114 file)** ·
> typecheck api + web sạch · lint 0 error · `i18n:check` **2378 khoá** parity · `i18n:audit` **0 chuỗi thô** trong mọi file mới · `migrate status` up to date,
> **không migration** · `next build` xanh và recharts nằm trong **chunk lazy riêng** (không vào
> `rootMainFiles`, nên ngân sách 180KB của marketplace không bị đụng).
>
> **Bốn khác biệt so với plan gốc, đều có lý do:**
> 1. **`unassignedCost` chuyển từ `/finance/by-vehicle` sang `/finance/summary`.** Nó là con số của
>    KỲ, không đổi khi sang trang — để trong trang dữ liệu thì `fetchPage` (vốn chỉ đọc `data`/`meta`)
>    không lấy được, và mỗi lần bấm trang lại nạp lại một con số y hệt.
> 2. **Dải data-viz là NĂM bậc, không phải sáu** như brand guide phác. Năm bậc qua trọn bộ kiểm ở
>    chế độ **so mọi cặp**; thử 12 ứng viên cho bậc thứ sáu, không bậc nào giữ được điều đó. Thêm
>    một bậc hỏng là bán lời hứa "sáu series phân biệt được" mà người mù màu không nhận được.
> 3. **Cơ cấu danh mục KHÔNG tô màu định danh.** Mỗi dòng đã có tên chữ; tô 18 danh mục bằng 18 màu
>    là bắt người đọc tra bảng màu cho thứ đã ghi bằng chữ. Màu ở đó chỉ nói thu hay chi — nhờ vậy
>    cũng không cần một dải màu dài hơn năm bậc.
> 4. **Kỳ 400 ngày cho ra `week`, không phải `month`** như §9 dự đoán: 400/7 = 57 bucket vẫn dưới
>    trần 92. Test khoá cả hai bậc nâng (`day → week` và `day → month`).
>
> **Hai điều phát hiện khi làm:**
> - **DB đã có CHECK `refund_amount <= deposit_received`**, nên kịch bản "hoàn dư" ở §9 không dựng
>   được trực tiếp. Đường ra số âm thật là: ghi hoàn cọc xong rồi **huỷ giao dịch cọc** — snapshot
>   giữ số cũ còn tiền sống thì không còn. Test dựng đúng kịch bản đó; phép kẹp sàn từng đơn vẫn là
>   thứ ngăn một đơn ăn mất cọc của đơn khác.
> - **Backtick trong comment SQL làm vỡ template literal.** `` -- `v.tenant_id` `` đóng luôn chuỗi
>   `Prisma.sql`. Comment trong khối SQL không được dùng backtick.
>
> ---
>
> ## Đợt 2 (25/08) — doanh thu theo TỪNG XE / TỪNG KHÁCH
>
> User hỏi: hai chiều này "chưa có". Đúng một nửa — bảng tổng hợp theo xe có ở đợt 1, nhưng **màn
> chi tiết của MỘT thực thể** thì chưa, và sổ khách tính doanh thu trên `bookings` (khác cơ sở với
> màn tài chính) nên hai màn ra hai số cho cùng một khách.
>
> **Chốt với user:** "user" = khách thuê · bề mặt = màn chi tiết từng thực thể · cơ sở = tiền THẬT
> đã thu.
>
> **Quyết định cốt lõi: KHÔNG viết endpoint mới.** Ba endpoint báo cáo nhận thêm
> `vehicleId`/`tenantCustomerId`. Một endpoint riêng cho "doanh thu một chiếc xe" sẽ là bản thứ hai
> của cùng phép tính, và bản thứ hai luôn trôi khỏi bản đầu — đúng cái bệnh mà đợt 1 vừa chữa giữa
> `/finance/summary` và `VehiclesService.stats`. Thu hẹp vị từ thay vì nhân đôi nó nghĩa là con số ở
> hồ sơ xe **không thể** lệch dòng của nó trong bảng tổng quan; có test khoá đúng đẳng thức đó.
> Phạm vi cần HAI bản SQL (`sqlReceiptScope` / `sqlBookingScope`) vì tiền nằm ở `receipts` còn số
> chuyến / cọc / công nợ nằm ở `bookings`.
>
> **Bộ số khác nhau theo loại thực thể, không chỉ khác nhãn:** xe có doanh thu·chi phí·lợi nhuận·biên;
> khách có doanh thu·còn nợ. Chi phí của gian hàng không gắn vào khách, nên "Chi phí 0 ₫ · Lợi nhuận
> = Doanh thu" chỉ là hai ô giả vờ mang thông tin.
>
> **Gỡ bỏ có chủ đích:** dòng "Doanh thu (luỹ kế)" ở thẻ *Hiệu suất* của hồ sơ xe. Từ khi khối tiền
> theo kỳ nằm ngay dưới, giữ lại là đặt hai số tiền với hai ý nghĩa thời gian khác nhau trên cùng một
> màn. Test lật sang khẳng định dòng tiền KHÔNG còn ở đó.
>
> **Ranh giới giữ nguyên:** ba thẻ *Tổng giá trị thuê / Đã thu / Còn nợ* ở đầu hồ sơ khách vẫn tính
> trên `bookings` — đó là bề mặt đi ĐÒI NỢ, nó phải tính trên đơn. Khối mới tính trên tiền thật đã
> thu. Hai câu hỏi khác nhau nên hai con số, và nhãn từng khối nói thẳng điều đó.
>
> ---
>
> ## Đợt 3 (25/08) — bảng xếp hạng doanh thu theo khách ở `/manage/finance`
>
> Đợt 2 dựng màn chi tiết cho từng khách; đợt này thêm bảng XẾP HẠNG ở trang tổng quan, song song
> với bảng hiệu quả theo xe. `GET /finance/by-customer` đi đúng khuôn `by-vehicle`.
>
> **`unassignedRevenue` vào summary** — đối xứng với `unassignedCost`: phiếu thu tay không liên kết
> đơn thì không thuộc về khách nào, và thiếu con số đó thì tổng các dòng nhỏ hơn thẻ "Doanh thu"
> mà phần chênh không có chỗ giải thích.
>
> **Một lỗi tự bắt được khi làm:** bản đầu tính tỷ trọng ở client bằng `Number(a)/Number(b)` — vừa
> vi phạm ADR 0007, vừa (nếu lấy tổng của TRANG làm mẫu số) cho ra bộ % cộng tròn 100% ở mọi trang,
> nghe hợp lý và sai hoàn toàn. Chuyển phép chia về SERVER trên NUMERIC, mẫu số là doanh thu CẢ KỲ
> kể cả phần chưa gắn khách — cùng mẫu số với thẻ "Doanh thu". Có test khoá đúng mẫu số đó.
>
> **Không có cột "còn nợ"**: công nợ là số tại thời điểm này còn bảng là của một kỳ. Trộn hai đơn vị
> thời gian vào một bảng là mời người đọc so hai thứ không so được.
>
> **Hai bảng phân trang độc lập** (`customerSort`/`customerPage`): dùng chung một cặp `sort`/`page`
> thì bấm sang trang ở bảng này kéo luôn bảng kia. Có test khoá. Tên khách chỉ thành liên kết khi có
> `customers.view`.
>
> **Còn thiếu, đã biết:** biểu đồ chưa có **bảng số liệu tương đương** cho trình đọc màn hình — số
> theo từng bucket hiện chỉ có trên hình (thẻ tổng và hai bảng kia thì đọc được). 11 chuỗi thô còn
> lại của `features/finance` nằm ở `BookingReceiptList.tsx` và `schema.ts`, và 176 chuỗi của khu
> `customers` nằm ngoài `CustomerReceiptsPanel` — đều là file epic này không chạm, để nguyên trong
> bản kiểm kê thay vì allowlist im lặng.
>
> Plan file · tạo 25/08/2026 · phạm vi đã chốt với user
> Kế thừa: [ADR 0013](../decisions/0013-no-online-payment-mvp.md) · [0014](../decisions/0014-owner-and-shop-single-role.md) ·
> [0007](../decisions/0007-api-type-contract.md) · [0004](../decisions/0004-client-state.md) ·
> [0003](../decisions/0003-styling-css-modules.md) · [0012](../decisions/0012-i18n-shared-url-cookie-locale.md)
> Tiếp nối: [Epic nối tiền vào sổ Thu-Chi (19/08)](2026-08-19-noi-tien-vao-so-thu-chi.md) §5 —
> *"báo cáo/biểu đồ/drill-down từ `/manage/finance`"* là phần **cố ý cắt** khỏi đợt đó.

---

## 1. Context — vì sao làm

`docs/design/09_PAGE_DESIGN_ORDER.md:77` (Wave 3.1) mô tả màn này là *"Doanh thu / đã thu / còn
phải thu / cọc đang giữ / chi phí / lãi-lỗ. **Mỗi ô bấm được → danh sách sinh ra nó**"*, và
`docs/design/07_INFORMATION_ARCHITECTURE.md:73` giao cho nhóm "Tiền" câu hỏi *"Tháng này lãi hay
lỗ, ai còn nợ?"*.

Thực tế [`finance/page.tsx`](../../apps/web/src/app/(manage)/manage/finance/page.tsx) là **89 dòng**:
4 thẻ `Statistic` + một `RangePicker`, gọi đúng một endpoint `GET /finance/summary`. Không biểu đồ,
không bảng, không bấm được vào đâu, filter không nằm trên URL, và toàn bộ chữ còn thô tiếng Việt.

Điều kiện để làm đã chín từ 19/08: chi phí bảo dưỡng, thu cọc, hoàn cọc **đã tự lên sổ**, nên
`receipts` giờ là bức tranh tiền đầy đủ. `docs/completion-roadmap.md:366` ghi thẳng:
*"báo cáo tài chính (lãi/lỗ theo xe, xuất CSV) — **dữ liệu nay đã đủ vì chi phí xe đã vào sổ**"*.

### 1.1 Một mâu thuẫn phải đóng trong đợt này

| Bề mặt | Công thức | Loại tiền cọc? |
| --- | --- | --- |
| `/manage/finance` — `FinanceOverviewService.summary` ([:118-133](../../apps/api/src/modules/finance/finance-overview.service.ts#L118-L133)) | `Σ receipts approved` theo `type` | ❌ **không** |
| Thẻ xe `/manage/vehicles` — `VehiclesService.stats` ([:181](../../apps/api/src/modules/vehicles/vehicles.service.ts#L181)) | cùng phép gộp + `source NOT IN held_funds` | ✅ có |

Cùng một gian hàng, hai màn hai con số. [ADR 0013 §3](../decisions/0013-no-online-payment-mvp.md)
đứng về phía thứ hai: *"Cọc vẫn là **tài sản giữ hộ**: không cộng vào `paid_amount`, và bị loại
khỏi 'Doanh thu' theo xe qua `HELD_FUNDS_RECEIPT_SOURCES`."*

Đây chính là món đã ghi nợ ở [plan 19/08 §5.1](2026-08-19-noi-tien-vao-so-thu-chi.md):
*"Ý nghĩa 'Tổng thu' của `/finance/summary` — nay gồm cả cọc… Cần chốt và nói rõ trên giao diện."*

### 1.2 Kết quả mong muốn

1. Chủ gian hàng mở trang biết ngay **kỳ này lãi hay lỗ**, và lãi/lỗ đó khác gì với **số tiền đang
   cầm trong két**.
2. Mỗi con số **bấm được** về đúng danh sách phiếu sinh ra nó, và tổng ở đó **khớp từng đồng**.
3. Nhìn thấy **xe nào đang nuôi mình, xe nào đang ăn tiền mình**.
4. Không màn nào trong sản phẩm còn cho hai con số khác nhau cho cùng một câu hỏi.

---

## 2. "Doanh thu" trong XePrime gồm những gì — bản đồ nguồn tiền

### 2.1 Hai dòng tiền KHÔNG BAO GIỜ cộng chung

```
DÒNG 1 — TIỀN THUÊ XE          Khách ──────────────► Gian hàng
                                (tiền mặt / CK trực tiếp)
                                XePrime không chạm vào, chỉ ghi sổ hộ (ADR 0013)
                                ⇒ đây là thứ trang này nói về

DÒNG 2 — TIỀN GÓI DỊCH VỤ      Gian hàng ──────────► XePrime
                                (ADR 0015 cước theo chỗ xe, ADR 0016 SePay đối soát)
                                ⇒ doanh thu của NỀN TẢNG, thuộc /manage/admin, KHÔNG thuộc trang này
```

`payments` mang `booking_id` **hoặc** `subscription_id`, không bao giờ cả hai. Không có bảng nào
nối hai dòng, và [ADR 0015 §hoãn](../decisions/0015-vehicle-slot-billing.md) chặn hoa hồng theo
đơn: *"không cầm tiền của khách thì không cắt được %"*.

### 2.2 Năm nguồn phiếu — cái nào là doanh thu, cái nào không

`RECEIPT_SOURCE` ([`packages/types/src/status/finance.ts:70`](../../packages/types/src/status/finance.ts#L70)):

| Source | Loại | Vào Doanh thu / Chi phí? | Bản chất |
| --- | --- | --- | --- |
| `payment` | thu | ✅ | Thu tiền thuê một đơn (`payments.kind='rental'`) |
| `manual` | thu | ✅ | Phiếu tay: quá giờ, đền bù va quẹt, phạt nguội, thu khác |
| `deposit` | thu | ❌ **không** | **Tiền giữ hộ** — sẽ trả lại |
| `deposit_refund` | chi | ❌ **không** | Trả lại chính khoản giữ hộ đó |
| `maintenance` | chi | ✅ | Bảo dưỡng (`maintenance`) hoặc sửa chữa sự cố (`repair`) |
| `manual` | chi | ✅ | Bảo hiểm, rửa xe, giao/nhận, đổ xăng, vận hành, marketing, văn phòng |

`HELD_FUNDS_RECEIPT_SOURCES = [deposit, deposit_refund]` ([:111](../../packages/types/src/status/finance.ts#L111))
đã tồn tại và đã có docblock giải thích — chỉ là `FinanceOverviewService` chưa dùng.

### 2.3 Ba khoản KHÔNG nằm trong sổ (và vì sao)

| Khoản | Vì sao không có phiếu | Trang này làm gì với nó |
| --- | --- | --- |
| **Phụ phí** (`booking_surcharges`) | Là khoản **ĐÒI**, không phải tiền đổi tay. Tiền thật đi qua hai đường đã có phiếu: khách trả thêm (`payment`) hoặc trừ vào cọc (phiếu hoàn cọc đã là **số ròng**). Sinh phiếu là **đếm hai lần** | Nằm trong **Công nợ phải thu**, không nằm trong Doanh thu |
| **Nghĩa vụ nguồn xe** (`vehicle_source_details`: trả góp, thuê lại, hoa hồng ký gửi) | Chưa bao giờ sinh phiếu chi định kỳ — nợ kỹ thuật đã ghi ở roadmap `:452` | **Ngoài phạm vi.** Thuộc `/manage/finance/vehicle-obligations` (trang riêng, chưa dựng) |
| **Tiền gói trả cho XePrime** | Là dòng 2 ở §2.1 | Ngoài phạm vi |

⇒ **"Lợi nhuận" của trang này là lãi TIỀN MẶT theo sổ thu-chi**, chưa trừ khấu hao/lãi vay/tiền
thuê xe của chủ. Phải nói rõ điều đó trên giao diện, không để người dùng tự hiểu là lãi ròng.

---

## 3. Quyết định đã chốt với user

| Quyết định | Chốt |
| --- | --- |
| Thư viện biểu đồ | **`recharts`** — SVG thuần nên series đọc được `var(--xp-viz-*)`, khớp design token và sẵn sàng dark theme; tooltip/responsive/a11y có sẵn. Chỉ nằm trong route `/manage`, không đụng ngân sách 180KB của marketplace (`docs/design/10` §5) |
| Trình bày tiền | **Tách 3 lớp**: Kết quả kinh doanh (loại cọc) · Dòng tiền quỹ (gồm cọc) · Trạng thái tại thời điểm (cọc đang giữ, công nợ) |
| Phạm vi | Biểu đồ thu-chi theo thời gian · Cơ cấu theo danh mục · Hiệu quả theo xe |
| **KHÔNG** làm đợt này | So sánh kỳ trước (delta %) · nối hai thẻ `—` ở `/manage` · xuất CSV |

---

## 4. Bố cục trang

```
┌ Tổng quan doanh thu ─────────────────────────────────────────────────────┐
│  [Hôm nay][Tuần này][Tháng này][Quý này][Năm nay][Tháng trước]  ⟨lọc⟩    │
│                                                                          │
│  KẾT QUẢ KINH DOANH — kỳ đã chọn                          ⓘ chưa trừ     │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐   khấu hao/    │
│  │ Doanh thu  │ │  Chi phí   │ │ Lợi nhuận   biên 76,6% │   lãi vay      │
│  │ 82.500.000 │ │ 19.300.000 │ │ 63.200.000             │                │
│  └────────────┘ └────────────┘ └────────────────────────┘                │
│                                                                          │
│  DÒNG TIỀN QUỸ (gồm cọc)          TẠI THỜI ĐIỂM NÀY                      │
│  Vào 96.5tr · Ra 24.1tr · +72.4tr  Cọc đang giữ 14tr (7đ) · Nợ 37tr (16đ)│
│                                                                          │
│  ┌ Thu · Chi · Lợi nhuận theo [ngày|tuần|tháng] ───────────────────────┐ │
│  │  ▇▇  ▇▇  ▇▇  ▇▇   cột đôi Doanh thu/Chi phí + đường Lợi nhuận      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌ Doanh thu theo danh mục ──────┐ ┌ Chi phí theo danh mục ────────────┐ │
│  │ Thanh toán đơn ███████ 71.2tr │ │ Bảo dưỡng    ████ 8.1tr  42% (12) │ │
│  │ Phí quá giờ    ██      6.4tr  │ │ Đổ xăng      ███  5.2tr  27% (31) │ │
│  └───────────────────────────────┘ └──────────────────────────────────┘ │
│                                                                          │
│  ┌ Hiệu quả theo xe ────────────────── [Sắp xếp: Lợi nhuận ▾] ────────┐ │
│  │ Xe            Chuyến  Doanh thu   Chi phí   Lợi nhuận   Biên       │ │
│  │ Vios 51A-123     12   18.400.000  2.100.000 16.300.000  88,6%      │ │
│  │ …                                                                   │ │
│  │ ⓘ Chi phí chung chưa gắn xe: 3.200.000 ₫                            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Vì sao ba lớp tách rời chứ không một hàng sáu thẻ:** ba lớp trả lời ba câu hỏi khác nhau và có
ba đơn vị thời gian khác nhau. "Lợi nhuận" là **của một kỳ**; "Cọc đang giữ" là **tại lúc này** và
không phụ thuộc kỳ đã chọn. Xếp chúng cạnh nhau cùng một hàng là mời người đọc cộng trừ hai thứ
không cộng trừ được với nhau.

**Vì sao thanh ngang chứ không donut cho cơ cấu danh mục:** gian hàng có tới 18 danh mục hệ thống
cộng danh mục riêng. Donut quá 5 lát là không đọc được, còn thanh ngang xếp giảm dần đọc được ở
mọi số lượng, mang được cả số tiền lẫn %, lẫn số phiếu, và **bấm được từng dòng**.

### 4.1 Mỗi con số bấm được về đâu

| Ô | Đích |
| --- | --- |
| Doanh thu / Chi phí | `/manage/receipts?type=income\|expense&sourceGroup=business&status=approved&from&to` |
| Tiền vào / Tiền ra | `…?type=…&status=approved&from&to` (không lọc `sourceGroup`) |
| Cọc đang giữ | `…?sourceGroup=held_funds&status=approved` |
| Công nợ | `/manage/debts` |
| Một dòng danh mục | `…?categoryId=…&status=approved&from&to` |
| Một dòng xe | Hồ sơ xe; link phụ → `…?vehicleId=…&status=approved&from&to` |

---

## 5. Backend

### 5.1 Slice 0 — một chỗ định nghĩa "doanh thu"

**`apps/api/src/common/finance-period.ts` (mới)** — cùng vai trò `booking-money.ts` giữ cho công nợ:
một định nghĩa, mọi bề mặt dùng lại.

```ts
/** Phiếu là TIỀN THẬT: đã duyệt, chưa xoá, rơi trong kỳ (theo occurred_at, giờ VN). */
export function ledgerWhere(tenantId, from, to): Prisma.ReceiptWhereInput

/** KẾT QUẢ KINH DOANH — ledgerWhere + loại tiền giữ hộ (ADR 0013 §3). */
export function businessWhere(tenantId, from, to): Prisma.ReceiptWhereInput

/** Bản SQL của cùng vị từ, cho các câu raw phải group/date_trunc. */
export const SQL_LEDGER_SCOPE, SQL_BUSINESS_SCOPE: Prisma.Sql
```

`VehiclesService.stats` ([:171-184](../../apps/api/src/modules/vehicles/vehicles.service.ts#L171-L184))
chuyển sang dùng `businessWhere` — hiện nó tự viết `source: { notIn: [...] }`, và đó là bản thứ hai
sắp trôi khỏi bản này.

**`ReceiptListQueryDto` += `sourceGroup`** (`business` | `held_funds`) → `whereOf` map sang
`source: { notIn | in: HELD_FUNDS_RECEIPT_SOURCES }`. Đây là thứ làm cho **drill-down khớp từng
đồng**: không có nó, bấm "Doanh thu 82,5tr" sẽ mở ra một sổ cộng 96,5tr. Hằng
`RECEIPT_SOURCE_GROUP` đặt cạnh `RECEIPT_SOURCE` trong `packages/types/src/status/finance.ts`.

### 5.2 Slice 1 — `GET /finance/summary` mở rộng

Giữ nguyên `totalIncome` / `totalExpense` / `balance` với **đúng nghĩa hiện tại là DÒNG TIỀN QUỸ**
(gồm cọc — tiền có vào két thật, nên số đó không sai, chỉ bị gọi nhầm tên trên giao diện). Thêm:

| Trường mới | Nghĩa |
| --- | --- |
| `revenue` / `cost` / `profit` | Kết quả kinh doanh — `businessWhere`, đã loại tiền giữ hộ |
| `profitMarginPercent` | `profit / revenue × 100`, **`null` khi `revenue = 0`** (không phải `0`) |
| `depositHeld` / `depositHeldBookings` | Cọc đang giữ **tại thời điểm này**, không lọc theo kỳ |

`depositHeld` = `Σ payments(kind=deposit, status=succeeded)` − `Σ booking_deposit_settlements.refund_amount`,
gộp theo booking rồi kẹp sàn 0 từng đơn (một đơn hoàn dư không được ăn sang cọc của đơn khác), scope
`SQL_DEBT_SCOPE` (bỏ đơn huỷ/đã xoá). `depositHeldBookings` đếm đơn còn dư > 0.

> Đây cũng là lần đầu **"Cọc đang giữ"** có bề mặt — `docs/xeprime_screen_spec_by_role_before_db.md:486`
> liệt kê nó là chức năng của cả 5 vai, và hiện không màn nào có.

### 5.3 Slice 2 — `GET /finance/series?from&to&granularity=`

Trả `{ granularity, buckets: [{ bucket, revenue, cost, profit, cashIn, cashOut }] }`.

```sql
date_trunc($g, r.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
```

Ba điều bắt buộc, mỗi điều đều là một cách nói dối nếu bỏ:

1. **Gộp theo giờ VN, không phải UTC.** Một phiếu 05:00 sáng giờ VN có `occurred_at` là 22:00 UTC
   hôm trước — gộp theo UTC là ném doanh thu sang sai ngày. Cùng lý do đã sinh ra
   [`common/day-range.ts`](../../apps/api/src/common/day-range.ts).
2. **Điền bucket rỗng bằng `generate_series`.** Thiếu nó, ba ngày không có phiếu biến mất và đường
   lợi nhuận nối thẳng qua khoảng trống — biểu đồ vẽ ra một xu hướng không tồn tại.
3. **Server chốt `granularity` và trả lại giá trị đã dùng.** Nếu kỳ dài quá ngưỡng (> 92 bucket)
   thì tự nâng `day → week → month`. Client hiển thị đúng thứ server trả, không tự đoán.

Index `receipts_tenant_occurred_idx` (`tenant_id, occurred_at`) đã có sẵn — không cần migration.

### 5.4 Slice 3 — `GET /finance/by-category?from&to&type=`

`groupBy(['categoryId'])` trên `businessWhere` + `type`, join tên danh mục. Trả
`{ categoryId, name, systemKey, amount, count, sharePercent }`, sắp giảm dần.

Phiếu không có danh mục (`category_id IS NULL`) gom thành **một dòng "Chưa phân loại"** với
`categoryId: null` — không im lặng bỏ đi, nếu không tổng các dòng sẽ nhỏ hơn thẻ Doanh thu ngay
phía trên và không ai giải thích được chênh lệch.

### 5.5 Slice 4 — `GET /finance/by-vehicle?from&to&sort&page&limit`

Raw SQL gộp `receipts` theo `vehicle_id` với `SQL_BUSINESS_SCOPE`, `SUM(...) FILTER (WHERE type=…)`,
join `vehicles` lấy tên + biển số; số chuyến từ `bookings` có `pickup_at` trong kỳ,
`status <> cancelled`, `deleted_at IS NULL`. Khuôn mẫu tốt nhất để chép:
`CustomersService.statsCte` ([:840-875](../../apps/api/src/modules/customers/customers.service.ts#L840-L875)).

`sort` ∈ `profit | revenue | cost | trips` (mặc định `profit` giảm dần) — hằng
`VEHICLE_PROFIT_SORT` + `_VALUES` ở `packages/types`, theo đúng khuôn `TENANT_CUSTOMER_SORT`.

**Trả thêm `unassignedCost`** — tổng phiếu chi **không gắn xe** (marketing, văn phòng, chi phí chung)
trong kỳ. Không có nó thì `Σ chi phí theo xe ≠ Chi phí` ở thẻ trên, và người dùng sẽ đi tìm mãi
khoản chênh. Hiện dưới bảng dưới dạng một dòng chú thích, không phải một dòng xe giả.

### 5.6 Controller

Bốn endpoint mới vào [`finance-overview.controller.ts`](../../apps/api/src/modules/finance/finance-overview.controller.ts),
tất cả `@TenantScoped()` + `@RequirePermissions(PERMISSION.FINANCE_VIEW)`. Controller này khai báo
`@Controller()` với path trần và **không có route `:id` nào**, nên không dính bẫy thứ tự route đã
gặp ở `receipts.controller.ts`.

Chạy lại hợp đồng type sau khi xong: `pnpm run contract` (ADR 0007 — không viết tay
`api.generated.ts`).

---

## 6. Frontend

### 6.1 Bọc recharts sau một cửa duy nhất

**`apps/web/src/components/chart/` (mới)** — `recharts` chỉ được import ở đây, không nơi nào khác:

| File | Việc |
| --- | --- |
| `ChartFrame.tsx` | `ResponsiveContainer` + `<figure>/<figcaption>` + trạng thái loading/rỗng/lỗi. Là `'use client'` lá — không kéo cả trang thành client |
| `chart-theme.ts` | Trục/lưới/legend lấy từ design token, không hex cứng |
| `ChartTooltip.tsx` | Tooltip dùng `fmt.money()` để tiền trong tooltip giống hệt tiền trong thẻ |
| `chart-data.ts` | **Ranh giới chuỗi → số duy nhất.** Recharts cần `number`; tiền từ API là chuỗi (ADR 0007). Quy đổi về **đồng nguyên** đúng tại đây, có docblock; mọi chữ hiển thị vẫn sinh từ chuỗi gốc |

Lý do gom: đổi thư viện biểu đồ sau này chỉ chạm bốn file, và không lập trình viên nào phải nhớ
"biểu đồ thì tiền được phép thành số".

### 6.2 Design token data-viz — nợ thiết kế X-02, phải trả trước khi vẽ

`docs/design/01_BRAND_GUIDE.md:94` đã ghi sẵn: *"Dashboard tài chính cần dải 6 màu phân biệt được,
**không** lấy từ màu ngữ nghĩa — nếu không, cột 'chi phí' màu đỏ sẽ bị đọc thành 'lỗi'."*
`packages/ui/src/styles/tokens.css` hiện **không có** token nào cho việc này.

Thêm vào `tokens.css` + `packages/ui/src/tokens/index.ts`:
`--xp-viz-1..6` (6 sắc phân biệt được: teal · tím · hổ phách đậm · hồng sẫm · lam sâu · ô-liu) và
ba bí danh vai trò `--xp-viz-revenue` / `--xp-viz-cost` / `--xp-viz-profit`.

Giá trị hex cụ thể chốt khi làm — **bắt buộc gọi skill `dataviz`** trước khi viết dòng chart đầu
tiên; nó mang bộ kiểm tương phản và luật màu. Ba ràng buộc cứng: không mượn `--xp-color-error/success/warning`;
hai cột cạnh nhau đạt ≥ 3:1; khối `@media (prefers-color-scheme: dark)` để sẵn (tokens.css hiện
light-only, dark là increment sau — cấu trúc phải sẵn chỗ).

### 6.3 Trang + component

Viết lại `apps/web/src/app/(manage)/manage/finance/page.tsx` theo đúng khuôn
[`receipts/page.tsx`](../../apps/web/src/app/(manage)/manage/receipts/page.tsx) — đó là trang chín
nhất trong khu manage: `<Suspense>` bọc view (hook đọc `useSearchParams`), `PermissionState kind="forbidden"`
thay toàn bộ nội dung khi thiếu `FINANCE_VIEW`, `Segmented` kỳ nhanh ghi thẳng `from`/`to`,
`FilterBar` với `dateRange`, `useErrorMessage()`.

| File mới trong `features/finance/components/` | Nội dung |
| --- | --- |
| `FinanceOverviewCards.tsx` | Ba lớp thẻ ở §4. Lớp 3 mang nhãn "tại thời điểm này" tường minh |
| `RevenueTrendChart.tsx` | `ComposedChart`: hai `Bar` (Doanh thu/Chi phí) + một `Line` (Lợi nhuận); `Segmented` ngày/tuần/tháng đồng bộ với `granularity` server trả |
| `CategoryBreakdown.tsx` | Hai cột thanh ngang; mỗi dòng bấm được |
| `VehicleProfitTable.tsx` | `DataTable` + `Select` sắp xếp trong `FilterBar`. **Không dùng `sorter` trên cột** — `DataTable.tsx:197` ghi rõ 0/14 bảng trong repo làm thế; quy ước là `Select` đẩy lên tham số `sort` của API |

**Tách dùng chung (skill `shared-code`):** thẻ tiền hiện có hai bản — `Card` nội bộ trong
[`ReceiptSummaryCards.tsx:78-108`](../../apps/web/src/features/finance/components/ReceiptSummaryCards.tsx#L78-L108)
và bản sắp viết. Nâng thành `components/data-display/MoneyStat.tsx` (nhãn · giá trị · sắc thái ·
skeleton · dòng phụ) và cho `ReceiptSummaryCards` dùng lại — đây là lần lặp thứ hai, đúng ngưỡng
tách.

| Hook / hạ tầng | Việc |
| --- | --- |
| `hooks/use-finance-filters.ts` | `useUrlFilters` với `from`/`to`/`g`/`sort`/`page`/`limit`. **Mặc định = Tháng này** khi URL trống — một biểu đồ không biên là một biểu đồ vô nghĩa |
| `hooks/use-finance-series.ts`, `use-finance-by-category.ts`, `use-finance-by-vehicle.ts` | Khuôn `use-finance-summary.ts` |
| `packages/api-client/src/query-keys.ts` | `finance.series` / `finance.byCategory` / `finance.byVehicle` |
| `constants/routes.ts` | `receiptsPath.filtered` nhận thêm `categoryId`, `type`, `sourceGroup`, `status`, `from`, `to` |
| `packages/domain/src/datetime.ts` | `buildPeriodRange` += `this_quarter`, `this_year`. Kiểu `PeriodKey` mở rộng; `RECEIPT_PERIOD_VALUES` của sổ **giữ nguyên 4 lựa chọn**, trang này dùng tập 6 |

### 6.4 i18n

Nhánh mới `Finance.overview.*` ở **cả hai** `packages/domain/messages/{vi,en}/finance.json`.
Namespace `Finance` đã đăng ký, không phải sửa `namespaces.ts`.

Một điểm tinh tế: **tên danh mục hệ thống nằm trong DB bằng tiếng Việt** (`Thanh toán đơn`,
`Bảo dưỡng/Thay nhớt`…). Ở giao diện `en`, nhãn tra từ `systemKey` qua message; danh mục riêng của
gian hàng (`systemKey = null`) giữ nguyên tên người dùng đặt. **Mã (`categoryId`, `systemKey`) là
dữ liệu, không dịch** — chỉ nhãn mới dịch (ADR 0012).

Nhãn menu đã có sẵn và đúng: `navigation.json:47` = `Tổng quan doanh thu` / `Revenue overview`.

---

## 7. Bẫy đã biết — viết ra để không vấp

| # | Bẫy | Cách chặn |
| --- | --- | --- |
| 1 | Gộp bucket theo UTC ⇒ doanh thu rơi sai ngày | `AT TIME ZONE 'Asia/Ho_Chi_Minh'` trong `date_trunc` |
| 2 | Bucket rỗng bị bỏ ⇒ đường lợi nhuận nối qua khoảng trống, vẽ ra xu hướng không có thật | `generate_series` điền đủ |
| 3 | Drill-down không khớp thẻ | `sourceGroup` + `status=approved` trong link; thẻ và sổ dùng chung vị từ |
| 4 | `Σ chi phí theo xe ≠ Chi phí` | Trả và hiện `unassignedCost` |
| 5 | `Σ danh mục ≠ tổng` | Dòng "Chưa phân loại" cho `category_id IS NULL` |
| 6 | So sánh tiền bằng `Number()` — trang hiện tại đang làm ở [`page.tsx:21`](../../apps/web/src/app/(manage)/manage/finance/page.tsx#L21) | `isNegativeMoney()` / `isZeroMoney()` từ `@/lib/money` (ADR 0007) |
| 7 | Biên lợi nhuận chia cho 0 | `profitMarginPercent = null` khi `revenue = 0`; giao diện hiện `—`, không hiện `0%` |
| 8 | "Cọc đang giữ" bị đọc thành số theo kỳ | Đặt ở lớp 3 riêng, nhãn "tại thời điểm này", **không** nhận `from`/`to` |
| 9 | "Lợi nhuận" bị đọc thành lãi ròng | Chú thích: chưa trừ khấu hao / lãi vay / tiền thuê xe của chủ (§2.3) |
| 10 | recharts rò sang bundle marketplace | Chỉ import trong `components/chart/`, các file đó là `'use client'` lá dưới route `(manage)` |
| 11 | Spec API tự bỏ qua im lặng khi thiếu PostgreSQL và vẫn báo xanh | `pnpm db:up` **trước** mọi lệnh test API (roadmap §2.1) |

Đồng thời sửa `docs/CODEMAP.md:79` — dòng đó vẫn trỏ `common/money.ts` (`bookingDebt` = `total − paid`)
là "một định nghĩa duy nhất" của công nợ, trong khi từ 19/08 định nghĩa thật ở
[`common/booking-money.ts`](../../apps/api/src/common/booking-money.ts). Ai đọc CODEMAP rồi dùng
`bookingDebt()` cho màn mới sẽ bỏ sót phụ phí — đúng bug người dùng đã báo.

---

## 8. Cố ý KHÔNG làm đợt này

So sánh kỳ trước (delta %) · nối hai thẻ `—` ở `/manage` (`DashboardView.tsx:75,83`) · xuất CSV/Excel ·
`/manage/finance/vehicle-obligations` (trả góp / thuê lại / hoa hồng ký gửi — trang riêng, cần sinh
lịch nghĩa vụ trước) · doanh thu **nền tảng** (chặn bởi `subscription_invoices` chưa tồn tại, ADR 0015 §5) ·
chiều **chi nhánh** (`receipts` không có `branch_id`; suy từ xe được nhưng phiếu chi chung thì mù) ·
thu `additionalDue` khi phụ phí vượt cọc.

---

## 9. Xác minh

1. `pnpm db:up` trước mọi lệnh test API (bẫy #11).
2. **Không cần migration** — bốn endpoint chỉ đọc, index đã có. Chạy `prisma migrate status` +
   `migrate diff` để chứng minh sạch.
3. `pnpm run contract` sinh lại `openapi.json` + `api.generated.ts`; kiểm `git diff` chỉ có DTO mới.
4. Jest theo module (skill `verify-changes`, không quét cả workspace) — `finance-overview.spec.ts` mở rộng:
   - phiếu cọc **không** vào `revenue` nhưng **có** vào `totalIncome`;
   - phiếu lúc 05:00 giờ VN rơi đúng bucket ngày hôm đó, không phải hôm trước;
   - kỳ 3 ngày trong đó 1 ngày không phiếu ⇒ trả đủ **3** bucket;
   - kỳ 400 ngày với `granularity=day` ⇒ server hạ xuống `month` và **echo lại** giá trị đã dùng;
   - `revenue = 0` ⇒ `profitMarginPercent === null`;
   - phiếu chi không gắn xe ⇒ vào `unassignedCost`, không vào dòng xe nào;
   - `depositHeld` sau thu cọc → hoàn cọc một phần → còn đúng phần chênh; hoàn dư một đơn **không**
     ăn sang cọc đơn khác;
   - `sourceGroup=business` ở `/receipts/summary` trả **đúng** con số `revenue` của `/finance/summary`
     cùng kỳ — đây là test khoá chặt bẫy #3.
5. Vitest `apps/web`: `finance-page.test.tsx` mới (3 lớp thẻ; thiếu quyền → `PermissionState`;
   đổi kỳ ghi `from`/`to` lên URL; bấm dòng danh mục sinh đúng link) + test của `chart-data.ts`.
6. `pnpm --filter @xeprime/web i18n:check` (parity vi↔en) và `i18n:audit` cho màn vừa chuyển.
7. `typecheck` + `lint` scoped: `apps/api`, `apps/web`, `packages/{types,domain,ui,api-client}`.
8. **Smoke thật** — đăng nhập chủ shop, kỳ "Tháng này": Doanh thu ở đây **khớp** tổng doanh thu các
   xe ở `/manage/vehicles`; bấm từng ô ra sổ và đối chiếu tổng khớp từng đồng; thu nhỏ xuống mobile
   kiểm biểu đồ và bảng; đổi sang `en` kiểm nhãn danh mục hệ thống và nhãn trục.
9. Cập nhật `docs/completion-roadmap.md` (đóng epic, gỡ "báo cáo tài chính" khỏi danh sách kế tiếp),
   `docs/CODEMAP.md` (§7 dòng 79 + mục chart mới), `docs/design/03_PRODUCT_GAP_ANALYSIS.md` (X-02 đã trả).
