# Module Finance trên app native — đã làm gì, còn nợ gì

> Ngày viết: 07/09/2026 · Nhánh `feature/mobile-module-finance`
>
> Tài liệu này viết cho **người làm module tiếp theo**. Nó trả lời hai câu: *cái gì đã chạy được*
> và *chỗ nào còn hở, hở tới mức nào*. Trạng thái toàn app vẫn ở `docs/mobile-module-status.md`;
> module Customer ở `docs/mobile-customer-module-status.md`, Vehicle ở
> `docs/mobile-vehicle-module-status.md`.

---

## 1. Giao được gì

**6/6 mục.** FIN-01→04 dựng mới; FIN-05/06 đã có từ module Booking và đợt này được **audit +
vá parity**, không viết lại.

| FIN | Nội dung | Route | Màn / file |
| --- | --- | --- | --- |
| 01 | Tổng quan tài chính — ba lớp tiền, biểu đồ, cơ cấu danh mục, hai dải xếp hạng | `/manage/finance` | `features/finance/FinanceOverviewScreen.tsx` · `components/FinanceOverviewCards` · `CategoryBreakdown` · `VehicleProfitList` · `CustomerRevenueList` · `FinancePeriodBar` |
| 02 | Sổ Thu-Chi — lọc, tổng theo bộ lọc, chi tiết phiếu, tạo/duyệt/huỷ | `/manage/receipts` | `ReceiptListScreen.tsx` · `components/ReceiptCard` · `ReceiptSummaryCards` · `ReceiptDetailSheet` · `ReceiptFormSheet` · `ReceiptLinkCard` · `ReceiptLinkPicker` · `ReceiptAttachmentsField` |
| 03 | Danh mục thu chi | (tấm trượt trong FIN-02) | `components/CategoryManagerSheet.tsx` |
| 04 | Công nợ | `/manage/debts` | `DebtListScreen.tsx` · `components/DebtCard.tsx` |
| 05 | Ghi nhận thu tiền + huỷ phiếu thu của đơn | `/manage/bookings/[id]` · `…/payments` | `features/settlement/components/RecordPaymentSheet.tsx` · `PaymentsScreen.tsx` — **audit, xem §4** |
| 06 | Thu cọc / hoàn cọc | `/manage/bookings/[id]` · `…/settlement` | `features/bookings/components/BookingSettlementCard.tsx` · `features/settlement/components/RefundSheet.tsx` — **audit, xem §4** |

Khối dùng lại ở hai hồ sơ:

| Khối | Ở đâu | Ghi chú |
| --- | --- | --- |
| `FinanceEntityPanel` | Hồ sơ 360 của xe · tab "Thu chi" của hồ sơ khách | MỘT component, khác nhau đúng `kind` + mệnh đề thu hẹp. Cùng endpoint với FIN-01 nên con số không thể lệch |
| `ReceiptDetailSheet` | Sổ Thu-Chi · tab Thu chi của khách | MỘT implementation cho mọi `ReceiptCard` |

Ba mục `finance-overview` · `receipts` · `debts` trong `manage-nav.ts` đã có `href` và cờ gói
(`PLAN_FEATURE.FINANCE` cho hai mục đầu, `PLAN_FEATURE.DEBTS` cho công nợ — đúng cờ backend gác).

---

## 2. Quyền và cờ gói — ai thấy gì, ai ghi được gì

Bảng này là hợp đồng, không phải mô tả. `permission` chỉ ẩn/hiện; **guard backend mới là lớp
chặn thật** (CLAUDE.md mục 6), và hai trục kiểm **nối tiếp** (ADR 0027 điều 2).

| Quyền / cờ | Mở ra cái gì | Thiếu thì sao |
| --- | --- | --- |
| `finance.view` | Cả ba màn FIN-01/02/04 + khối tiền ở hồ sơ xe/khách | Màn thiếu quyền; **không phát một request tài chính nào** |
| `receipt.create` | Nút "Tạo phiếu", tấm tạo phiếu, thêm/xoá danh mục, hai ô gợi ý đơn/xe | Ẩn hành động; danh mục thành chỉ đọc |
| `receipt.approve` | Duyệt · huỷ phiếu ở chi tiết | Chi tiết không có hành động nào |
| `payments.record` | "Thu tiền" ở màn Công nợ và ở đơn · "Thu cọc" · ghi nhận hoàn cọc | Ẩn hành động |
| `payments.void` | Huỷ một phiếu thu đã ghi · ĐIỀU CHỈNH bản ghi hoàn cọc | Ẩn hành động |
| `bookings.view` | "Xem đơn" ở Công nợ · lối mở đơn ở chi tiết phiếu | Mã đơn vẫn đọc được, không có lối đi |
| `vehicles.view` | Thẻ xe ở dải "Hiệu quả theo xe" mở hồ sơ 360 · lối mở xe ở chi tiết phiếu | Thẻ chỉ để đọc |
| `customers.view` | Thẻ khách ở dải "Doanh thu theo khách" mở hồ sơ · lối mở khách ở chi tiết phiếu | Thẻ chỉ để đọc |
| `PLAN_FEATURE.FINANCE` = `read_only` | **Vẫn ĐỌC được toàn bộ sổ và dữ liệu cũ** | Nút tạo/duyệt bị khoá kèm câu giải thích ĐÚNG lý do ("gói hết hạn"), không giả thành thiếu quyền |
| `PLAN_FEATURE.DEBTS` | Mục Công nợ trong menu | `hidden` thì mục biến khỏi menu (backend gác `GET /debts`) |

---

## 3. Bốn luật TIỀN được khoá bằng test

1. **Ba lớp không trộn.** "Doanh thu" (kỳ, đã loại cọc) · "Tiền vào" (quỹ, GỒM cọc) · "Cọc đang
   giữ"/"Công nợ" (tại thời điểm này, không phụ thuộc kỳ). Mỗi lớp một khối riêng với câu chú
   thích của nó.
2. **Mỗi ô tổng dẫn tới ĐÚNG tập phiếu sinh ra nó.** "Doanh thu" mang `sourceGroup=business` +
   `status=approved`; "Tiền vào" cố ý KHÔNG mang `sourceGroup`; "Cọc đang giữ" mang
   `sourceGroup=held_funds` và KHÔNG mang kỳ; "Khách còn nợ" dẫn sang `/manage/debts` chứ không
   phải sổ.
3. **Cọc không cộng vào "đã trả".** Client không cộng gì — nó gửi đúng `kind`, server phân biệt.
4. **Không hoàn quá cọc đã thu.** Trần nằm ở `SettlementService.assertRefundable` (server là nơi
   duy nhất có `depositReceived` đúng tại thời điểm ghi); app hiện "Cọc đã nhận" ngay đầu tấm và
   khi server từ chối thì tấm Ở LẠI kèm câu lỗi — không báo thành công, không đóng.

Kèm theo: mọi phép so/trừ tiền chạy trên CHUỖI (`subtractMoney`/`isZeroMoney`/`isNegativeMoney`),
không qua `Number()` — ADR 0007.

---

## 4. FIN-05/06 — audit đã vá gì

Cả hai đã chạy từ module Booking. Đợt này đối chiếu lại với web/API và đóng bốn khoảng trống:

| Chỗ | Trước | Sau |
| --- | --- | --- |
| `BookingMoneyCard` — "Thu vượt" | `Number(collectedAmount) - Number(amountDue)` | `subtractMoney` trên chuỗi + `isNegativeMoney`/`isZeroMoney`, **đúng như web**. Bản cũ sai từ 2^53 trở lên |
| Invalidate sau khi thu tiền / huỷ phiếu thu | `bookings` · `payments` · `settlement` · `finance` | thêm **`receipts`** và **`debts`** (web đã có) + `customers` · `dashboard`. Thiếu hai nhánh đầu thì sổ Thu-Chi và màn Công nợ giữ số cũ đúng lúc người vừa thu tiền đi đối chiếu |
| Invalidate sau khi ghi/điều chỉnh hoàn cọc, sửa phụ phí | `bookings` · `finance` | cùng bộ trên — hoàn cọc sinh một phiếu `deposit_refund` trong sổ |
| Schema ô tiền của `RecordPaymentSheet` / `RefundSheet` | `.integer()` + `.min(1)` / `.min(0)`, mặc định `0` | bỏ `.integer()` (cột tiền là `Decimal(14,2)`, web không chặn phần lẻ) · `moreThan(0)` như web · mặc định `null` khi không có số gợi ý, để không ghi một khoản 0 ₫ |

Phần **không** đổi (đã đúng parity, giữ nguyên): điều kiện hiện/ẩn nút, câu xác nhận, phân tách
`payments.record` ↔ `payments.void`, `expectedRowVersion` + lý do bắt buộc khi điều chỉnh,
`kind` là tham số chứ không phải ô cho người dùng chọn.

---

## 5. Chỗ CỐ Ý khác web (đã cân nhắc, đừng "sửa lại cho giống")

| Web | App native | Vì sao |
| --- | --- | --- |
| Bảng 9 cột + `DataTable` | Thẻ + phân trang server-side | Bảng 1320px không vừa 390dp |
| `Segmented` kỳ + `RangePicker` | `FinancePeriodBar`: dải viên CUỘN NGANG + hai ô ngày | Sáu kỳ tiếng Việt không vừa một hàng; bóp lại thì "Tháng trước" bị cắt |
| Drawer/Modal | `BottomSheet` | Hình thái native cho cùng vai trò |
| Bộ lọc hiện trên trang, chip "đang lọc" dưới thanh | Bộ lọc trong `ManageFilterSheet`; **PHẠM VI thành viên gỡ được** ở đầu màn | URL của web tự nói phạm vi; app không có thanh địa chỉ, nên một cuốn sổ bị lọc âm thầm đọc ra là "gian hàng chỉ có ngần này phiếu" |
| `<input type=file>` cho chứng từ | Tấm trượt ba nguồn: máy ảnh · thư viện · tệp PDF | Native không có ô chọn tệp vạn năng |
| Chứng từ PDF hiện bằng `PreviewImage` | Ô icon, chạm mở trình duyệt hệ thống | Native không xem PDF trong ứng dụng; một ô ảnh hỏng còn tệ hơn |
| Xoá danh mục gọi mutation NGAY | Có bước **xác nhận** | Nút xoá native là một biểu tượng 24dp cạnh mép ngón tay; một cú chạm nhầm xoá mất danh mục của gian hàng, không có đường hoàn tác |
| `/manage/debts` **không** có màn thiếu quyền | Có màn thiếu quyền + không gọi API | Kỷ luật "UI không có quyền thì không đi lấy dữ liệu" của app; web đang hở chỗ này (xem §7) |
| Danh mục tải hỏng → danh sách rỗng | Báo LỖI + nút thử lại | "Rỗng" và "gọi hỏng" là hai chuyện; web đang hở chỗ này (xem §7) |
| Khối tiền ở hồ sơ xe/khách có kỳ trên URL | Kỳ ở state màn | App không có URL để chia sẻ (ADR 0004) |
| Biểu đồ `recharts` `<ComposedChart>` | `react-native-gifted-charts` `<BarChart showLine>` | Hai thư viện, **một hình**: hai cột cùng thang + đường lợi nhuận + trục Y tiền rút gọn + lưới ngang + mốc 0 khi lỗ. Xem §5b |
| Tooltip hiện khi rê chuột | Chạm một cặp cột → dòng chi tiết ngay dưới biểu đồ | Native không có hover |
| Nhãn trục X `01/09/2026` | `01/09` ở độ mịn ngày/tuần (`fmt.dayMonth`) | 10 ký tự không vừa bề rộng một cặp cột ở 390dp — nhãn bị cắt thành `01/0…` |
| "Tạo và tiếp tục" GIỮ loại/ngày/hình thức/danh mục/liên kết của phiếu vừa lưu | Trả form về **TRẮNG**, chỉ giữ chính ô tick và xe mặc định của lối vào | Một form còn nguyên dữ liệu cũ sau khi đã lưu là chỗ sinh phiếu TRÙNG: người dùng không phân biệt được "cái vừa lưu" với "cái đang nhập", sửa mỗi số tiền rồi bấm lưu là ra một phiếu mang danh mục và xe họ không hề chọn. Xe mặc định thì khác — nó đến từ NGỮ CẢNH màn hình, không từ phiếu cũ |

---

## 5b. Biểu đồ — vì sao đổi thư viện, và chỗ dễ vỡ

Bản đầu của module Customer dựng biểu đồ bằng `View` trần, có lý do rõ ràng: *"một biểu đồ cột
đơn thang chỉ cần hình chữ nhật"*. Lý do đó **hết đúng ở FIN-01**, nơi cần đủ hình của web —
trục Y tiền, lưới ngang, mốc 0 cho kỳ lỗ, và **đường lợi nhuận**. Bản `View` không có đường đó
trong khi dòng mô tả ngay trên biểu đồ (chuỗi dùng CHUNG với web) vẫn ghi *"đường là lợi nhuận"*.
Chữ nói dối hình là lý do đổi, không phải vì SVG đẹp hơn.

| | Web | App |
| --- | --- | --- |
| Thư viện | `recharts` 3.10.1 | `react-native-gifted-charts` **1.4.78** (ghim CỨNG) |
| Dựng bằng | `<ComposedChart>`: 2 `<Bar>` + 1 `<Line>` | `<BarChart showLine lineData={…}>` |
| Màu | `CHART_COLOR` → `var(--xp-color-viz-*)` | `chartColors` → **CÙNG token** qua `XP_TOKENS` |
| Bo cột · nét đường · điểm mốc | `[4,4,0,0]` · 2px · r=4 | y hệt |
| Lưới | nét đứt `3 3`, chỉ ngang | y hệt (`rulesType="dashed"`) |
| Đường lợi nhuận | `type="monotone"` | `curved` + `CurveType.CUBIC` |
| Chọn độ mịn | ba tab `Ngày/Tuần/Tháng` | ba **viên chip** — một cú bấm là đổi |
| Thang trục Y | `getNiceTickValues` (`tickCount=5`) | **cùng thuật toán**, `niceAxis` |
| Bề rộng | `ResponsiveContainer` phủ khung | phủ khung; kỳ dày mốc thì cuộn |
| Nhãn trục X | bỏ bớt (`preserveStartEnd`) | y hệt (`labelledBuckets`), đặt ở ĐÁY |
| Tên mốc | một chuỗi cho cả trục lẫn tooltip | trục bản NGẮN, thẻ chi tiết bản đầy đủ |
| Chú giải | dưới biểu đồ | **trên**, căn giữa |
| Đọc số một mốc | tooltip khi rê chuột | thẻ chi tiết dưới biểu đồ khi CHẠM mốc |

**Thang trục Y phải là thang của web, không phải một phép làm tròn riêng.** Bản đầu lấy đỉnh
tuyệt đối rồi làm tròn lên bội số của số vạch: đỉnh `2.839.966 ₫` ra thang
`709k · 1,4tr · 2,1tr · 2,8tr`, trong khi web in `1,5tr · 3tr`. Tệ hơn, nửa âm chỉ dựng hai nấc nên
đường lợi nhuận tụt xuống `−2,84tr` **bị cắt cụt** — phần lỗ biến mất khỏi hình. `niceAxis` ở
`revenue-trend-layout.ts` là bản port `getNiceTickValues` của `recharts`, đã **đối chiếu 4.050
trường hợp với chính thư viện web**, lệch 0. Một chỗ cố ý khác: recharts vẽ được trục có đỉnh
đúng bằng 0 (khi mọi giá trị ≤ 0), thư viện native thì không — nhưng ca đó không xảy ra với dữ
liệu thật vì doanh thu và chi phí không bao giờ âm.

**Bề rộng tối thiểu là trọn khung.** Kỳ ít mốc (`Tháng` của một kỳ ngắn: đúng một cột) thì
`fitGroupedBars` chia đều khung thành các dải như `recharts`, cột nở tới `maxBarSize` rồi thôi —
trước đó một mốc duy nhất vẽ ra biểu đồ rộng 60dp nằm lọt thỏm giữa thẻ 330dp. Kỳ dày mốc
(`Ngày` của một tháng) thì giữ cỡ cột thoải mái và cuộn ngang: ép 30 ngày vào 330dp cho cột 3dp,
nhìn ra được xu hướng nhưng không còn chạm trúng mốc nào. **`width` phải luôn truyền** — thiếu nó,
vùng cuộn của thư viện là một khối tuyệt đối không khai bề rộng nên nó nở bằng chính dải cột, biểu
đồ tràn khỏi thẻ và không cuộn được.

**Vùng chạm là một DẢI phủ trọn chiều cao**, không phải bản thân cái cột. `onPress` của thư viện
chỉ có ở cột, mà cột của một ngày không phát sinh đồng nào thì cao 0dp — không có gì để chạm; còn
chấm trên đường lợi nhuận thì thư viện vẽ trong một lớp `<Svg>` đặt `pointerEvents: 'none'` trên
iOS và `onPress` của nó chỉ nối được vào state focus NỘI BỘ của thư viện, không có đường nào báo
ra ngoài. Một dải phủ toàn chiều cao giải quyết cả ba (cột · chấm · khoảng trống), giống hệt nhau
trên hai nền tảng. Khi biểu đồ cuộn được, dải bám theo `onScroll` mà `BarChart` chuyển tiếp.

**Bảng màu là chỗ đã sai và đã sửa.** Bản đầu tô biểu đồ bằng `colors.success` / `colors.danger` /
`colors.primaryActive` — xanh lá / đỏ / vàng, trong khi web là teal / nâu cam / tím. Cùng một báo
cáo mà hai client ra hai bộ màu là hỏng đúng ở bề mặt người dùng mở cả hai lên để đối chiếu; và
nó còn mượn sắc thái cảnh báo cho một cột chi phí hoàn toàn bình thường. Token `color-viz-*` đã
có sẵn trong `XP_TOKENS` từ đầu, chỉ là `apps/mobile/src/theme/tokens.ts` chưa map — giờ có
`chartColors`.

**Ba dependency đi liền nhau.** `react-native-gifted-charts` · `react-native-svg` ·
**`expo-linear-gradient`**. Cái thứ ba trông như thừa (không dùng gradient nào), nhưng `BarChart`
import TĨNH `Components/common/LinearGradient`, và module đó `require` gói gradient rồi **ném
lỗi** nếu không tìm thấy — tức màn Tổng quan doanh thu trắng ngay khi có dữ liệu.
`RevenueTrendChart.test.tsx` dựng biểu đồ thật để chặn đúng ca đó.

**Chỗ dễ vỡ nhất: phép căn ĐƯỜNG lợi nhuận.** `BarChart` không có khái niệm "nhóm" — cặp cột
được tạo bằng một dải cột xen kẽ hai độ rộng khe, nên dải có 2N phần tử trong khi đường chỉ có N
điểm. Để đường dùng chung `spacing` của cột thì nó chỉ dài bằng nửa biểu đồ và mọi điểm đều chỉ
sai chỗ. Lời giải nằm ở [`revenue-trend-layout.ts`](../apps/mobile/src/features/finance/components/revenue-trend-layout.ts),
tách khỏi component vì nó đọc công thức toạ độ NỘI BỘ của `gifted-charts-core`
(`getXForLineInBar`) — và vì một đường lệch nửa nhóm vẫn render bình thường, chỉ người dùng mới
thấy nó chỉ vào sai cột. Test số học ở đó là thứ duy nhất bắt được, nên **version ghim cứng**:
một bản minor đổi công thức là test đỏ chứ không phải người dùng phát hiện.

**KHÔNG dùng `pointerConfig` của thư viện.** Nó suy chỉ số cột từ
`(x − initialSpacing) / (spacing + barWidth)`, tức giả định mọi khe bằng nhau — dải cột ở đây xen
kẽ hai độ rộng khe nên chỉ số trỏ sẽ lệch dần về cuối kỳ, càng nhiều mốc càng lệch. Dải chạm tự
dựng đặt đúng `groupCenterX` thì không thể trỏ nhầm; bất biến "tâm hai mốc liền nhau cách đúng một
bước" được khoá bằng test. Và phải có một dòng MỜI CHẠM khi chưa chọn gì — không có gì trên hình
tự nói ra rằng biểu đồ bấm được.

**Đồng hồ giả trong test.** `BarChart` hẹn một `setTimeout(labelsAppear, animationDuration)` lúc
mount rồi chạy tiếp một `Animated.timing` 500ms, và không có prop nào tắt được
(`isAnimated={false}` chỉ tắt animation của cột; `animationDuration={0}` rút ngắn chứ không bỏ).
Test kết thúc trước cái hẹn đó, jest dỡ môi trường, rồi callback mới chạy và làm chết worker —
hoặc jest treo, không thoát. **File test nào RENDER biểu đồ đều phải `jest.useFakeTimers()`**:
`RevenueTrendChart` · `FinanceOverviewScreen` · `FinanceEntityPanel` · `CustomerFinancePanel`.

---

## 6. Còn nợ

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| **Không SỬA được phiếu đã tạo** | Không phải nợ | Web cũng không có — `ReceiptFormDrawer` chỉ tạo. Đừng mở ở app trước |
| **Không ĐỔI TÊN danh mục** | Không phải nợ | Backend có `PATCH /finance/categories/:id` từ Phase 6 nhưng KHÔNG giao diện nào gọi. Mở cùng lúc hai bên hoặc không mở |
| `receiptFormSchema` có hai bản | Thấp | Bản web là hàm nhận `t` của `next-intl` nên không sống được trong `@xeprime/validators`; bản app trả MÃ và dùng `useValidationResolver`. **Cùng namespace, cùng khoá message**, nên hai bên không thể báo lỗi khác nhau. Gộp thật khi web đổi sang resolver dịch-theo-mã |
| `apps/web/src/features/finance/api.ts` chưa dùng `@xeprime/api-client` | Thấp | Đợt này chỉ được sửa i18n ở web, nên wrapper web giữ nguyên. Hàm serialize ở package dùng chung là bản gương từng dòng và có test canh |
| `vehicleLabel` có hai bản | Thấp | Đã vào `@xeprime/domain`; `apps/web/src/lib/vehicle-label.ts` là bản song sinh còn lại, hợp nhất khi web đổi import |
| Version `react-native-gifted-charts` ghim cứng | Thấp | Cố ý — xem §5b. Nâng thì chạy `revenue-trend-layout.test.ts` trước, nó khoá công thức căn đường lợi nhuận |
| Chưa có màn "sổ quỹ"/đối soát ngân hàng | Không thuộc phase | ADR 0022/0028 — chưa triển khai ở cả hai client |

---

## 7. Vấn đề PHÁT HIỆN Ở WEB — ghi lại, KHÔNG sửa

Đợt này chỉ được sửa i18n ở `apps/web`. Ba chỗ dưới đây là hành vi web, đã clone đúng hoặc đã
nêu ở §5, và cần một đợt riêng:

1. **`/manage/debts` không kiểm quyền ở trang.** `DebtsPage` không có `PermissionState`, nên một
   người thiếu `finance.view` mở thẳng URL sẽ thấy khung trang rồi mới nhận 403 từ API. Menu đã
   gác bằng `finance.view` nên đường vào bình thường không lộ, nhưng deep link thì có.
2. **`CategoryManagerModal` không có trạng thái LỖI.** `isLoading ? …loading : list.map(…)` —
   tải hỏng thì `categories` là `undefined`, danh sách thành rỗng và người dùng đọc ra "gian hàng
   chưa có danh mục nào".
3. **`apps/web/src/features/payments/schema.ts` và `RecordRefundDialog` viết thẳng chuỗi tiếng
   Việt** ("Nhập số tiền", "Số tiền phải lớn hơn 0", "Điều chỉnh một bản ghi đã chốt cần lý do",
   nhãn nút, câu toast). Giao diện tiếng Anh báo lỗi bằng tiếng Việt đúng lúc người dùng đang mắc
   kẹt — đúng thứ ADR 0012 cấm, và đúng thứ `receiptFormSchema` bên cạnh đã sửa bằng cách nhận
   `t`. Bản app dùng `useValidationResolver` nên không mắc; chuyển web sang là một đợt i18n riêng
   (đợt này chỉ đụng `BookingReceiptList`).
4. **Đổi CHIỀU TIỀN không xoá danh mục đã chọn.** `ReceiptFormDrawer` nạp lại danh mục theo
   `type` nhưng giữ nguyên `categoryId`, nên chọn một danh mục CHI rồi đổi sang "Phiếu thu" là gửi
   lên một `categoryId` thuộc chiều kia. App clone đúng hành vi này (parity), nên sửa thì phải sửa
   cả hai bên cùng lúc.
5. **`SettlementCard` / `RecordRefundDialog` còn so tiền bằng `Number()`**
   (`Number(data.additionalDue) > 0`, `Number(settlement.surchargeTotal) > 0`). Chỉ là so sánh
   hiển thị nên chưa sinh lỗi thật, nhưng nó đi ngược ADR 0007 và `subtractMoney`/`isZeroMoney`
   đã có sẵn ở `@/lib/money`.

---

## 8. Nợ kỹ thuật đã ĐÓNG trong đợt này

| Nợ | Đóng thế nào |
| --- | --- |
| Phiếu trong tab "Thu chi" của khách chỉ ĐỌC | `ReceiptCard` nhận `onPress` + mọc `DetailChevron`; mở `ReceiptDetailSheet` — CÙNG implementation với sổ Thu-Chi, không có bản riêng cho khách |
| "Xem tất cả N phiếu" dẫn tới màn còn dở | `/manage/receipts` giờ là FIN-02 đầy đủ; lối vào giữ `tenantCustomerId` và màn đích hiện viên phạm vi nói rõ đang lọc theo ai |
| Mục `receipts` trong menu chưa có `href` | Đã gắn, cùng `finance-overview` và `debts` |
| Hồ sơ 360 của xe **không có** khối tiền theo kỳ | `FinanceEntityPanel` nhúng ngay sau dải liên kết nhanh, đúng vị trí web — cùng component với hồ sơ khách |
| Chip "Sổ thu chi" ở hồ sơ xe là nút chết | Đã có `href` mang `?vehicleId=`, cùng tham số web đặt trên URL |
| Finance API mới có 3 hàm ở `@xeprime/api-client` | Đủ bộ: `receiptsApi` (7 hàm), `financeCategoriesApi`, `debtsApi`, `financeApi` (5 hàm) + 8 hàm serialize dùng chung, có test |
| Ô liên kết XE hiện id thô khi mở từ hồ sơ xe | Nạp trước xe đã chọn bằng CÙNG query key với tấm chọn (`includeId`) — thẻ xác nhận hiện tên xe ngay lần vẽ đầu, không phải một ULID 26 ký tự |
| Tải tệp CÔNG KHAI chỉ nhận ẢNH | `uploadPublicFileToR2` nhận cả PDF, kiểm MIME + dung lượng ngay sau khi đo số byte thật (cùng cái bẫy `Content-Length`) |
| `StatGrid` không có chú thích và không bấm được | Thêm `hint` (docblock đã hứa từ đầu) và `onPress` + mũi tên — điều kiện để một thẻ tổng dẫn được về tập dữ liệu sinh ra nó |
| `vehicleLabel` chỉ có ở web | Vào `@xeprime/domain/display` cạnh `LIST_SEPARATOR` |
| `BookingMoneyCard` cộng trừ tiền bằng `Number()` | `subtractMoney` trên chuỗi — xem §4 |
| Thu tiền không làm mới sổ và công nợ | Xem §4 |

---

## 8b. Đợt hardening (soát lại 08/09/2026)

Bảy chỗ tìm ra khi đối chiếu lại từng màn với web sau khi module đã "xong" — không cái nào là
tính năng mới, tất cả là chỗ app hứa một đằng làm một nẻo.

| Chỗ | Hỏng thế nào | Sửa |
| --- | --- | --- |
| `ReceiptDetailSheet` — nút "Huỷ phiếu" | Gói hết hạn: câu "chỉ xem được" hiện ngay TRÊN một nút vẫn bấm được. Duyệt bị khoá, huỷ thì không — mà huỷ cũng là một phép GHI, nên cú bấm đó chắc chắn ăn 403 (ADR 0027 điều 3) | Khoá cùng lúc với duyệt, kèm test |
| `ReceiptFormSheet` — xe chọn sẵn đã biến mất | Xe đã xoá/đã rời gian hàng thì ô liên kết hiện TRỐNG trong khi `vehicleId` vẫn nằm trong form và vẫn được gửi — người dùng gõ xong mọi ô rồi mới nhận 404. Web có `vehicleGone`, app bỏ sót | Dựng `vehicleMissing` theo đúng vị từ của web (`includeId` xin đích danh mà không thấy) + `Callout`, kèm test |
| `ReceiptFormSheet` — điền số còn nợ của đơn | `Number(debtAmount) > 0` — một phép SO SÁNH tiền bằng float (ADR 0007) | `isZeroMoney`/`isNegativeMoney` trên chuỗi; `Number` chỉ còn ở bước đổ vào ô nhập |
| `FinanceOverviewScreen` — kéo làm mới | Chỉ refetch `summary`. Ba lớp số nhảy sang giá trị mới trong khi biểu đồ, hai khối cơ cấu và hai dải xếp hạng ngay dưới vẫn là số cũ — đúng cái màn hình lệch mà thao tác làm mới sinh ra để dọn | `refreshAll` gọi cả sáu truy vấn; `refreshing` nhìn cả sáu |
| `ReceiptListScreen` — kéo làm mới | Chỉ refetch danh sách. Khoá thẻ tổng cố ý bỏ `page`/`limit` nên nó cũng không đi theo — phiếu mới hiện ra dưới bốn con số tổng cũ | Refetch cả hai |
| `DebtListScreen` — lỗi nền | `query.isError` không kèm `&& !query.data`, nên một lần refetch nền hỏng xoá luôn trang đang đọc thành màn lỗi. Sổ Thu-Chi đã làm đúng | Đồng bộ với sổ Thu-Chi |
| `StatGrid` biến thể `grid` — `hint` là MẢNG | `{cell.hint}` đổ thẳng vào một `<Text>`: React Native nối các phần tử KHÔNG dấu cách ("Tiền mặt 40.000.000 ₫Chuyển khoản 56.500.000 ₫"). Biến thể `list` đã đi qua `hintLines` | Cả hai biến thể đọc `hint` qua cùng `hintLines` |
| `CustomerRevenueList` | `'—'` gõ cứng trong mã và `String(row.trips)` (bỏ qua định dạng số theo ngôn ngữ) | `Common.labels.emptyValue` + `fmt.count` |


## 9. Test đã bổ sung

| File | Khoá lại điều gì |
| --- | --- |
| `packages/api-client/.../finance/api.test.ts` | Serialize bộ lọc (một nguồn cho hai client) · thẻ tổng KHÔNG mang phân trang · phạm vi xe ≠ phạm vi khách · hai dải xếp hạng độc lập · `hasReceiptFilters` đếm đủ mọi chiều |
| `apps/mobile/.../FinanceOverviewScreen.test.tsx` | Ba lớp tiền không trộn · biên `null` ≠ 0% · bốn lối đi từ ô tổng mang đúng tham số · phần chưa gắn xe/khách không bốc hơi · hai dải phân trang riêng · ma trận quyền |
| `apps/mobile/.../ReceiptListScreen.test.tsx` | Không gọi API khi thiếu `finance.view` · gói `read_only` vẫn đọc được · viên phạm vi hiện + gỡ được · thẻ tổng cùng bộ lọc với danh sách · rỗng-thật ≠ rỗng-do-lọc · dấu +/− là NGHĨA · số lớn không mất chính xác |
| `apps/mobile/.../ReceiptDetailSheet.test.tsx` | Đủ trường của DTO · lối đi theo quyền · duyệt/huỷ theo trạng thái + nguồn · phiếu tự động không thao tác tay · xác nhận trước khi duyệt · gói hết hạn |
| `apps/mobile/.../ReceiptFormSheet.test.tsx` | Chế độ liên kết quyết định payload · chỉ hỏi danh sách khi cần · xe nạp sẵn hiện TÊN chứ không phải id · ô bắt buộc chặn gửi · nhãn nút theo chiều tiền |
| `apps/mobile/.../CategoryManagerSheet.test.tsx` | Danh mục hệ thống KHÔNG xoá được · xoá phải xác nhận · thêm gửi tên đã trim · ba mức quyền/gói · lỗi ≠ rỗng |
| `apps/mobile/.../DebtListScreen.test.tsx` | Không gọi API khi thiếu quyền · hai hành động gác bằng hai quyền khác nhau · "Thu tiền" mở đúng tấm FIN-05 · rỗng thật · `filter=all` xuống server |
| `apps/mobile/.../FinanceEntityPanel.test.tsx` | Phạm vi đi xuống CẢ hai truy vấn · bộ số của xe ≠ của khách · lối tạo phiếu chỉ có ở xe và KHÔNG mang kỳ · lối ra sổ mang kỳ nhưng không mang độ mịn |
| `apps/mobile/.../hooks/use-finance.test.tsx` | Tạo/duyệt/huỷ phiếu làm mới đủ sáu nhánh (`receipts` · `finance` · `debts` · `bookings` · `customers` · `dashboard`) |
| `apps/mobile/.../CustomerFinancePanel.test.tsx` | Thẻ phiếu mở CHI TIẾT dùng chung · "Xem tất cả" giữ phạm vi khách · hồ sơ khách không có lối tạo phiếu |
| `apps/mobile/.../revenue-trend-layout.test.ts` | Chuỗi tiền → số ĐẶT HÌNH giữ dấu âm · rác không thành NaN · **đường lợi nhuận rơi đúng tâm cặp cột** ở mọi chỉ số và mọi bố cục · trần trục Y chia hết cho số vạch |
| `apps/mobile/.../RevenueTrendChart.test.tsx` | Biểu đồ dựng THẬT (bắt thiếu peer `expo-linear-gradient`) · kỳ có LỖ · mọi giá trị bằng 0 · một mốc duy nhất |
| `apps/mobile/.../settlement/record-payment.test.tsx` | `kind` phân biệt tiền thuê ↔ cọc · không ghi khoản 0 ₫ · lỗi giữ tấm mở · hoàn cọc mặc định là số server đề xuất · hoàn quá cọc bị server từ chối · điều chỉnh bắt buộc lý do + `expectedRowVersion` |

Tổng: **+179 case** trên app native (315 → 494, trong đó 491 chạy thật + 3 skip) và **+18 case** ở
`@xeprime/api-client` (22 → 40).

---

## 10. Cần dựng lại dev client?

**CÓ.** Đợt này thêm hai native module cho biểu đồ: **`react-native-svg`** và
**`expo-linear-gradient`** (xem §5b). Chạy `pnpm --filter @xeprime/mobile android` (hoặc `ios`)
trước khi thử trên máy thật — bản dev client cũ sẽ nổ ở màn Tổng quan doanh thu và ở khối tiền
của hồ sơ xe / hồ sơ khách.

Phần còn lại của module không thêm gì: `expo-image-picker`, `expo-document-picker`,
`expo-clipboard`, `expo-image` đều đã có từ hai đợt trước.
