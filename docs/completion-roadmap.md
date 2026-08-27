# XePrime — Completion Roadmap (tiến độ thực tế)

> **Đây là nguồn "đang ở đâu / làm gì tiếp".** Đọc file này đầu mỗi session (cùng `CLAUDE.md`,
> `docs/decisions/`, `docs/CODEMAP.md`). Khi **đóng xong một phase**, cập nhật bảng §2 + mục phase
> tương ứng ở đây — đừng để tiến độ chỉ nằm trong trí nhớ hay plan file global `~/.claude/plans/`.
>

## 0. Trạng thái kiểm thử — đo ngày 21/08/2026

Các con số `Verify:` nằm trong từng mục epic bên dưới là **ghi chép tại thời điểm đóng epic đó**,
không phải trạng thái hiện tại. Bảng này mới là trạng thái hiện tại; cập nhật nó khi chạy lại.

| Lệnh | Kết quả 21/08/2026 |
| --- | --- |
| `pnpm run typecheck` | 11/11 task PASS |
| `pnpm --filter @xeprime/web test` | **1658/1658 PASS** (113 file) — đo lại 21/08 sau A1 |
| `pnpm --filter @xeprime/api test` | **665/666** — 1 đỏ, xem dưới |
| `pnpm --filter @xeprime/web lint` | 0 error · 11 warning |
| `pnpm --filter @xeprime/api lint` | sạch |
| `pnpm --filter @xeprime/web i18n:check` | OK — 22 namespace × 2 ngôn ngữ, 2183 khoá, parity khớp |

**Một test đỏ, là BOM HẸN GIỜ chứ không phải hồi quy.**
[`vehicle-documents.spec.ts`](../apps/api/test/vehicle-documents.spec.ts) hardcode
`expiresAt: '2026-08-20'` kèm chú thích "còn 8 ngày" — viết khi hôm nay là 12/08. Từ 21/08 giấy
tờ đó **đã quá hạn thật**, nên assert đòi `expiring_soon` mà nhận `expired`. Nó sẽ đỏ mỗi ngày
cho tới khi ngày trong test tính theo `now` thay vì cố định.

**Một test flaky đã biết.** `search-experience.test.tsx` có lần đỏ 2 test
(`getMultipleElementsFoundError` trên `role="tablist"`), lần sau xanh, trên **cùng một mã nguồn**
không đổi từ 18/08. Mock `IntersectionObserver` dùng mảng cấp module. Hướng xử lý là ổn định
test, **không** phải đổi `role` của sản phẩm.

> **26/08 (đợt 3) — HAI CỬA CẤP PHIÊN CÒN SÓT.** Rà lại toàn bộ `sessions.attach` thì còn đúng
> hai chỗ chỉ trả cookie, và cả hai **cấp phiên kèm theo một hành động khác** nên rất dễ sót:
> **`POST /auth/mobile/register`** (mới, kế thừa `RegisterDto` của web nên luật mật khẩu chỉ có
> một bản) và **`POST /public/booking-requests` + `client: "native"`** → cặp token đi trong
> `receipt.session` thay vì `Set-Cookie`.
> Không có nhánh "đoán từ header" ở chỗ thứ hai: đúng lời gọi đó khách chưa có credential nào để
> mà đoán, nên client phải tự khai; `client` lạ bị từ chối chứ không âm thầm rơi về web.
> `test/mobile-register-and-guest-session.spec.ts` (9 test) khoá bằng khẳng định **`set-cookie`
> phải vắng mặt** — cookie gửi cho app native là một phiên rơi vào hư không, và app vẫn nhận 201
> nên nó hỏng im lặng.
> Verify: **jest api 897/897 (67 suite)** · vitest web 1775/1775 · typecheck 17/17 · lint sạch ·
> không migration.

> **26/08 (đợt 2) — BA ĐƯỜNG ĐĂNG NHẬP CHO APP NATIVE (ADR 0019 §8).** Guard toàn cục vốn đã
> nhận cả cookie lẫn `Authorization: Bearer`, nên API nghiệp vụ không thiếu gì; chỗ hổng là các
> endpoint **phát phiên** — chúng trả cookie, thứ app native không có chỗ chứa.
> Thêm **`POST /auth/mobile/phone/login`** (SĐT + OTP, controller riêng ở module
> `phone-verification` để không tạo phụ thuộc vòng với `AuthModule`) và
> **`GET /auth/social/:provider?client=native` → one-time code → `POST /auth/mobile/social/exchange`**.
> **Deep link mang MÃ chứ không mang token**: deep link nằm lại trong log của hệ điều hành, nên
> một refresh token 60 ngày ở đó là bí mật dài hạn ghi ra đĩa. Mã sống 60 giây, dùng một lần,
> và đoán sai `code_verifier` thì **đốt luôn mã**.
> Ba lớp chặn: **PKCE app↔backend** (tách hẳn PKCE backend↔provider — Android custom scheme
> không độc quyền), **allowlist `MOBILE_AUTH_REDIRECT_URIS`** (`redirect_uri` do client gửi ⇒ là
> dữ liệu của kẻ tấn công cho tới khi khớp env; là danh sách vì Expo dev trả `exp://…`), và
> **CHECK ở DB** buộc `client='native'` phải có đủ hai cột.
> Migration `20260826170000_native_social_auth` — bảng `native_auth_codes` + 2 cột ở `oauth_states`.
> Worker dọn cả hai bảng mỗi giờ.
> Verify: **jest api 888/888 (66 suite)** · worker 24/24 · typecheck 17/17 · lint sạch ·
> `migrate diff` vẫn đúng 25 câu chênh lệch cố ý.

> **26/08 — ĐĂNG NHẬP GOOGLE/FACEBOOK TỰ CHỦ (ADR 0019).** Vòng OAuth chuyển từ trình duyệt về
> SERVER: `GET /auth/social/:provider` + `/callback`, cả hai trả **302 chứ không JSON** — một lỗi
> JSON ở đây là trang trắng giữa luồng đăng nhập. `state` + PKCE nằm ở bảng mới `oauth_states`,
> tiêu thụ bằng **một câu `UPDATE` có điều kiện** rồi kiểm `count === 1` (đọc-rồi-ghi sẽ cho hai
> callback song song cùng đi tiếp — có test chạy `Promise.allSettled` khoá đúng điều đó).
> **Facebook không phải OIDC**: không có chữ ký để kiểm, nên bắt buộc `debug_token` + đối chiếu
> `app_id`; bỏ bước đó là token substitution. **Google thì không kiểm chữ ký** — token đến thẳng
> từ endpoint của Google qua TLS trong chính lời gọi đó (OIDC Core §3.1.3.7), và `nonce` từ
> `oauth_states` mới là chốt chặn replay thật sự.
> **`AuthService.upsertUserFromIdentity`** tách ra từ `upsertUserFromIdToken`, thân hàm giữ NGUYÊN
> — 5 test luật nối tài khoản còn xanh là bằng chứng đổi nguồn không kéo theo đổi hành vi.
> Đã gỡ: `token-verifier.ts`, `POST /auth/session`, `POST /auth/mobile/session`,
> `firebase-social-auth.ts`, `AUTH_MODE`. Firebase chỉ còn phục vụ chat (ADR 0009).
> Web đổi đúng 4 file; nút social giờ **chuyển trang cả tab** (popup bị chặn trong webview
> Facebook/Zalo), và `next` phải lọc bỏ `auth`/`next`/`authError` — không lọc thì đăng nhập xong
> hộp đăng nhập mở lại. Trang `/manage/login` i18n hoá luôn (namespace `Auth.portal`).
> `SUPPORTED_LOCALES` chuyển về `@xeprime/types` vì API cũng cần để chuyển tiếp ngôn ngữ cho màn
> đồng ý của provider.
> `apps/worker` thêm vòng lặp thứ tư dọn `oauth_states` mỗi giờ — bảng chỉ có ghi và xoá, phần
> lớn hàng không bao giờ được tiêu thụ (người bỏ giữa chừng, bot quét endpoint công khai), nên
> không dọn là phình vô hạn mà không màn hình nào để lộ ra.
> Verify: **jest api 866/866 (64 suite)** · `openapi-contract` 18/18 · **vitest web 1775/1775
> (120 file)** · worker 24/24 · typecheck 17/17 task · lint api/worker sạch, web 0 error ·
> `i18n:check` 2684 khoá parity · migration `20260826140000_oauth_states` đã áp, đối chiếu `\d`
> và `migrate diff` vẫn đúng 25 câu chênh lệch cố ý.

> **25/08 (đợt 3) — BẢNG DOANH THU THEO KHÁCH ở `/manage/finance`.** Đợt 2 đã dựng màn chi tiết
> cho từng khách; đợt này thêm bảng XẾP HẠNG ở trang tổng quan, song song với bảng hiệu quả theo xe.
> **`GET /finance/by-customer`** — cùng khuôn `by-vehicle`: tập dòng là HỢP của "khách có phát sinh
> tiền" và "khách có chuyến" (khách thuê cả tháng mà tiền chưa lên sổ vẫn phải hiện — đó là dấu hiệu
> cần đi thu tiền), `COUNT(*) OVER ()` thay câu đếm thứ hai, `ORDER BY` từ union đã validate.
> **`unassignedRevenue` vào `FinanceSummaryDto`** — đối xứng với `unassignedCost`: phiếu thu tay
> không liên kết đơn thì không thuộc về khách nào, và thiếu con số này thì tổng các dòng nhỏ hơn thẻ
> "Doanh thu" mà phần chênh không có chỗ giải thích.
> **Tỷ trọng tính ở SERVER trên NUMERIC**, mẫu số là doanh thu CẢ KỲ kể cả phần chưa gắn khách —
> tức cùng mẫu số với thẻ "Doanh thu". Bản đầu tôi viết `Number(a)/Number(b)` ở client: vừa vi phạm
> ADR 0007, vừa (nếu lấy tổng của TRANG làm mẫu số) cho ra bộ % cộng tròn 100% ở mọi trang — nghe
> hợp lý và sai hoàn toàn. Có test khoá đúng mẫu số này.
> **Không có cột "còn nợ"**: công nợ là số TẠI THỜI ĐIỂM NÀY còn bảng là của một KỲ; trộn hai đơn vị
> thời gian vào một bảng là mời người đọc so hai thứ không so được. `/manage/debts` mới trả lời
> "ai đang nợ tôi".
> **Hai bảng phân trang ĐỘC LẬP** (`customerSort`/`customerPage` trên URL): dùng chung một cặp
> `sort`/`page` thì bấm sang trang ở bảng này kéo luôn bảng kia. Có test khoá.
> Tên khách chỉ thành liên kết khi có `customers.view` — thiếu quyền thì vẫn đọc được tên (đúng mức
> phơi bày mà `/manage/debts` đã có với `finance.view`) nhưng không mở được hồ sơ.
> Verify: **jest 30/30** (`finance-reports.spec.ts`, +8 spec) · **vitest 1672/1672 (114 file)** ·
> typecheck api+web sạch · lint 0 error · `i18n:check` 2378 khoá parity · `next build` xanh ·
> không migration.

> **25/08 (đợt 2) — DOANH THU THEO TỪNG XE / TỪNG KHÁCH.** Câu hỏi của user: hai chiều này "chưa
> có". Đúng một nửa — bảng tổng hợp theo xe vừa dựng ở đợt 1, còn *màn chi tiết của MỘT thực thể*
> thì chưa: hồ sơ xe chỉ có một con số **luỹ kế** + link ra sổ, sổ khách có *Tổng giá trị thuê /
> Đã thu / Còn nợ* nhưng **tính trên `bookings`**, khác cơ sở với màn tài chính (tính trên
> `receipts`) ⇒ hai màn ra hai số cho cùng một khách.
> **Chốt với user:** "user" = **khách thuê** · bề mặt = **màn chi tiết từng thực thể** · cơ sở =
> **tiền THẬT đã thu**.
> **Cách làm — KHÔNG viết endpoint mới.** Ba endpoint báo cáo nhận thêm `vehicleId`/`tenantCustomerId`
> (`FinanceScope` ở `common/finance-period.ts`, hai bản: `sqlReceiptScope` cho tiền, `sqlBookingScope`
> cho số chuyến/cọc/công nợ vì chúng nằm ở `bookings`). Một endpoint riêng cho "doanh thu một chiếc
> xe" sẽ là **bản thứ hai của cùng phép tính**, và bản thứ hai luôn trôi khỏi bản đầu; thu hẹp vị từ
> thay vì nhân đôi nó nghĩa là con số ở hồ sơ xe **không thể** lệch dòng của nó ở bảng tổng quan —
> có test khoá đúng đẳng thức đó.
> **`FinanceSummaryDto` += `trips`** (số chuyến có ngày NHẬN XE trong kỳ) — mẫu số của mọi câu hỏi
> về doanh thu, và đúng nghĩa ở mọi phạm vi.
> **FE:** `FinanceEntityPanel` dùng chung, nhúng vào **hồ sơ xe** (sau `ModuleLinks`, gác
> `finance.view`) và **tab Thu-Chi của sổ khách** (khối số theo kỳ ở trên, danh sách phiếu làm bằng
> chứng ở dưới). Bộ số **khác nhau theo loại thực thể**: xe có doanh thu·chi phí·lợi nhuận·biên; khách
> có doanh thu·còn nợ — chi phí gian hàng không gắn vào khách nên "Chi phí 0 ₫ · Lợi nhuận = Doanh
> thu" chỉ là hai ô giả vờ mang thông tin. Kỳ nằm trên URL (`?from=&to=`) nên link gửi được.
> **Gỡ bỏ có chủ đích:** dòng "Doanh thu (luỹ kế)" trong thẻ *Hiệu suất* của hồ sơ xe — từ khi khối
> tiền theo kỳ nằm ngay dưới, giữ lại là đặt hai số tiền với hai ý nghĩa thời gian khác nhau trên
> cùng một màn. Thẻ đó nay chỉ nói chuyện vận hành; khoá `Vehicles.overview.performance.revenue` đã
> xoá khỏi cả hai ngôn ngữ, và test lật sang khẳng định dòng tiền KHÔNG còn ở đó.
> **Dọn kèm:** `use-finance-summary.ts` (hook cũ nhận `from`/`to` rời) bị `useFinanceSummaryOverview`
> thay thế hoàn toàn ⇒ xoá; `useFinancePeriodFilters` tách ra từ `useFinanceOverviewFilters` để khối
> nhúng và màn tổng quan dùng chung một cách đọc kỳ.
> **Nhắc lại ranh giới:** ba thẻ *Tổng giá trị thuê / Đã thu / Còn nợ* ở đầu hồ sơ khách **giữ nguyên
> cơ sở `bookings`** — đó là bề mặt đi ĐÒI NỢ và nó phải tính trên đơn. Khối mới tính trên tiền thật
> đã thu. Hai câu hỏi khác nhau nên hai con số, và nhãn của từng khối nói thẳng điều đó.
> Verify: **jest 22/22** (`finance-reports.spec.ts`, +6 spec phạm vi) · **vitest 1667/1667 (114 file,
> +9 spec `FinanceEntityPanel`)** · typecheck api+web sạch · lint 0 error · `i18n:check` 2363 khoá
> parity · `i18n:audit` **0 chuỗi thô** trong file mới (khu `customers` 183→176 nhờ chuyển
> `CustomerReceiptsPanel`) · `next build` xanh, recharts vẫn nằm trong chunk lazy riêng · không migration.

> **25/08 — epic TỔNG QUAN DOANH THU (`/manage/finance`).** Trang 89 dòng gồm 4 thẻ `Statistic`
> thành màn báo cáo thật, và đóng luôn một **mâu thuẫn định nghĩa** đã ghi nợ ở plan 19/08 §5.1:
> `FinanceOverviewService.summary` cộng CẢ tiền cọc vào "Tổng thu" trong khi `VehiclesService.stats`
> đã loại — cùng một gian hàng, hai màn hai con số. **Cách đóng: `apps/api/src/common/finance-period.ts`**
> (cùng vai trò `booking-money.ts` giữ cho công nợ) — `ledgerWhere` = dòng tiền quỹ, `businessWhere`
> = kết quả kinh doanh đã loại tiền giữ hộ theo ADR 0013 §3; `VehiclesService.stats` bỏ bản sao
> `source: notIn` của nó và dùng chung.
> **Ba lớp tiền trên giao diện, không trộn:** Kết quả kinh doanh (doanh thu · chi phí · lợi nhuận +
> biên) · Dòng tiền quỹ (vào · ra · cân đối, GỒM cọc) · Tại thời điểm này (**cọc đang giữ** — bề mặt
> đầu tiên cho thứ `screen_spec` §7.7 đòi cho cả 5 vai — và công nợ). Lý do tách: ba câu hỏi khác
> nhau, hai đơn vị thời gian khác nhau; xếp chung một hàng là mời người đọc cộng trừ hai thứ không
> cộng trừ được.
> **Bốn endpoint mới** (`finance-overview.controller.ts`, đều `FINANCE_VIEW`): `/finance/summary`
> mở rộng (+`revenue`/`cost`/`profit`/`profitMarginPercent`/`unassignedCost`/`depositHeld`),
> `/finance/series` (`date_trunc` **theo giờ VN** + `generate_series` điền bucket rỗng + server tự
> nâng bậc độ mịn rồi TRẢ LẠI giá trị đã dùng), `/finance/by-category`, `/finance/by-vehicle`
> (`COUNT(*) OVER ()`, tập dòng là HỢP của "xe có tiền" và "xe có chuyến"). **Không migration** —
> `receipts_tenant_occurred_idx` đã đủ.
> **Drill-down khớp từng đồng:** `ReceiptListQueryDto` += `sourceGroup` (`business`|`held_funds`).
> Không có nó, bấm thẻ "Doanh thu 82,5tr" mở ra một sổ cộng 96,5tr — thẻ nói một số, danh sách nó
> dẫn tới nói số khác. Có test khoá chặt hai vế bằng nhau.
> **Biểu đồ, lần đầu trong repo:** `recharts` 3.10.1 (SVG nên series đọc được `var(--xp-color-viz-*)`;
> canvas thì không) bọc sau `components/chart/` — build xác nhận nó nằm trong **chunk lazy riêng**,
> không vào `rootMainFiles`, nên ngân sách 180KB của marketplace không bị đụng.
> **Trả nợ thiết kế X-02:** dải data-viz `--xp-color-viz-1..5` + ba bí danh vai
> (`revenue`/`cost`/`profit`). **NĂM bậc chứ không sáu** như brand guide phác: năm bậc này qua trọn
> bộ kiểm màu (dải sáng · chroma · mù màu deutan/tritan · mắt thường · tương phản ≥3:1) ở chế độ
> **so MỌI CẶP**; không tìm được bậc thứ sáu nào giữ được điều đó, và thêm một bậc hỏng là bán một
> lời hứa mà người mù màu không nhận được. Dark theme cần bộ giá trị RIÊNG — đã ghi tại chỗ.
> **Dọn kèm:** `MoneyStat` (`components/data-display/`) — `ReceiptSummaryCards` đang giữ một bản
> `Card` nội bộ và bản thứ hai sắp mọc; `buildPeriodRange` += `this_quarter`/`this_year` (+ type
> `PeriodKey`), sổ Thu-Chi **giữ nguyên 4 lựa chọn** của nó.
> **Cố ý KHÔNG làm:** so kỳ trước (delta %) · nối hai thẻ `—` ở `/manage` · xuất CSV ·
> `/manage/finance/vehicle-obligations`. Còn thiếu đã biết: biểu đồ chưa có **bảng số liệu tương
> đương** cho trình đọc màn hình (số theo từng bucket chỉ có trên hình).
> Verify: **jest 16/16 spec mới** (`finance-reports.spec.ts`, PostgreSQL thật — khoá cả bẫy bucket
> 05:00 giờ VN, bucket rỗng, nâng bậc độ mịn, cọc ngoài doanh thu, `unassignedCost`) · **vitest
> 1657/1657 (113 file)** · typecheck api+web sạch · lint 0 error · `i18n:check` 2328 khoá parity ·
> `i18n:audit` **0 chuỗi thô** trong mọi file mới · `migrate status` up to date, không migration.
> Kế hoạch: `docs/plans/ph-n-t-ch-ch-c-n-ng-hazy-sky.md`.

> **21/08 — ADR 0014/0015/0016 + wave A1 (khung `/account`).** Chốt bằng ADR ba câu hỏi đã treo:
> **(0014)** chủ xe và chủ gian hàng là **MỘT vai** `shop_owner`, một tenant — `tenants.tenant_type`
> (đã có từ Phase 0 nhưng chưa điều khiển gì) từ nay **chỉ là NHÃN hiển thị**, năng lực đọc từ GÓI;
> "nâng cấp lên gian hàng" = mua gói + đổi nhãn, **không chuyển sở hữu**. Kèm đó là ranh giới
> "XePrime là cái CHỢ": nền tảng vẫn duyệt gian hàng/xe nhưng **không đứng giữa** giấy tờ, giá,
> tranh chấp, giao nhận — nên **xác thực giấy tờ khách là shop làm tay**, không có hàng đợi duyệt.
> **(0015)** cước theo **CHỖ XE trả trước** (không đếm cuối kỳ → không cần cron chốt kỳ, và
> `assertVehicleQuota` sẵn có làm đúng việc này), kỳ hạn bằng **THÁNG LỊCH** (`addCalendarMonthsVn`
> của ADR 0011 — `plans.duration_days` là ngày, gia hạn 12 lần gói 30 ngày ra 360 ngày), bảng
> `subscription_invoices`, và **hết hạn → gỡ xe khỏi chợ, KHÔNG khoá tenant** (đơn đang chạy có
> khách thật). Sửa 3 điều của ADR 0010, đã ghi chú ngược vào chính file đó.
> **(0016)** SePay là **đối soát chuyển khoản, không phải cổng thanh toán** và **không tự trừ tiền**
> — mở một khe hẹp của ADR 0013 chỉ cho tiền GÓI (chiều gian hàng → nền tảng); webhook phải
> idempotent **bằng constraint DB**, xác thực time-safe, kích hoạt do webhook chứ không do redirect.
> **A1 (FE, không đụng backend):** `/account` từ một trang đơn thành **khu có vỏ riêng** —
> `ROUTES.ACCOUNT` thành object 8 route, `constants/account-nav.ts` (9 mục, cờ `comingSoon` cho mục
> chưa dựng theo yêu cầu "chưa làm thì để sẵn menu"), `AccountShell` (vỏ + **cổng đăng nhập đặt
> MỘT lần** cho cả khu thay vì mỗi trang tự gác), `AccountSidebar` (desktop cột dọc ↔ mobile dải
> cuộn ngang, cùng một cây dữ liệu), `AccountComingSoon`, `ShopEntryCard` (thẻ "Gian hàng của tôi"
> / "Đăng xe cho thuê" / "Quản trị nền tảng" theo vai thực tế — **đây là cửa vào phễu thu phí**).
> **Lọc theo ADR 0014, có chủ đích:** bỏ "Quản lý đơn thuê" (đã là `/manage/bookings`), bỏ
> "Ví & Ưu đãi" (ví giữ số dư tiền cần giấy phép trung gian thanh toán), bỏ khối "Tỉ lệ phản hồi /
> 5★" (là chỉ số của GIAN HÀNG, người đi thuê không có tỉ lệ phản hồi), ẩn "0 điểm".
> **Dọn kèm:** `useMarketLogout()` — `MarketHeader` đang chép tay 3 bước đăng xuất và menu tài khoản
> sắp là bản thứ ba; quên bước dọn cache ở một bản là dữ liệu người vừa thoát nằm lại cho người kế
> tiếp. **Điều hướng `/account` ↔ `/manage` KHÔNG phải làm gì** — cả hai chiều đã nối sẵn từ trước
> (`ManageUserCard` ▸ Hồ sơ · `MarketHeader` ▸ Quản lý gian hàng).
> Verify: **vitest 1658/1658 (113 file, +21 test mới)** · typecheck web sạch · lint 0 error ·
> `i18n:check` parity 1683 khoá · `i18n:audit` **0 chuỗi thô** trong mọi file mới.
> Kế hoạch đầy đủ (EPIC A 5 wave + EPIC B 5 wave): `docs/plans/2026-08-21-tai-khoan-ca-nhan-va-mo-hinh-thu-phi.md`.
>
> **19/08 — epic NỐI TIỀN VÀO SỔ THU-CHI + dựng lại `/manage/receipts`.** Đóng đúng chỗ đứt mà
> §2.1 đã chỉ ra, và nó rộng hơn mô tả cũ. **Bốn mắt xích đã nối:** (1) `payments.kind='deposit'`
> **chưa từng có đường ghi nào** → `depositReceived` vĩnh viễn = 0 và cả máy quyết toán cọc Wave 10
> chạy không tải; nay `RecordPaymentDto.kind` + nút **Thu cọc** ở `SettlementCard`, và cọc **KHÔNG**
> cộng vào `paid_amount` (cọc là tài sản giữ hộ — cộng vào là công nợ tụt giả), `voidPayment` đối
> xứng. (2) **Hoàn cọc** sinh phiếu **chi** số RÒNG trong cùng tx; sửa bản ghi thì **sửa phiếu tại
> chỗ** (unique index phủ cả dòng đã huỷ). (3) **Chi phí bảo dưỡng** → phiếu chi khi hoàn tất, danh
> mục tách `repair` ↔ `maintenance`. (4) `receipts.tenant_customer_id` (cột nằm không từ S-01) nay
> có người ghi. **Phụ phí CỐ Ý không sinh phiếu** — nó là khoản ĐÒI, tiền chỉ chuyển động khi khách
> trả thêm hoặc bị trừ vào cọc, mà phiếu hoàn cọc đã là số ròng; sinh thêm là đếm hai lần.
> **Schema:** `receipts.occurred_at` (ngày tiền di chuyển ≠ lúc gõ vào máy) · `source` +
> `source_ref_id` + CHECK + unique `(tenant,source,source_ref_id)` chống ghi kép · `receipt_no`
> unique theo tenant + retry · `finance_categories.system_key`. **Chặn huỷ phiếu tự động** (409
> `RECEIPT_SOURCE_LOCKED`, `details` chỉ đường quay về) — kèm đó phải mở đường sửa, nên có
> `PATCH …/maintenance/records/:id/cost` (`correctCost`, lý do bắt buộc, audit giữ giá trị cũ):
> `updateRecord` từ chối mọi phiếu ĐÃ ĐÓNG nên chi phí ghi sai vốn **không sửa được từ trước**.
> **Lỗi tìm thấy khi làm:** bộ lọc ngày lệch **7 tiếng** (`new Date('2026-08-19')` = 07:00 giờ VN)
> và `/manage/finance` gửi ISO đầy đủ còn `FilterBar` gửi `YYYY-MM-DD` → hai màn ra hai số cho cùng
> một câu hỏi; sửa ở backend một chỗ (`common/day-range.ts`). **Màn `/manage/receipts` dựng lại:**
> `FilterBar` 7 trường + preset kỳ, thẻ tổng cộng ĐÚNG bộ lọc đang xem (dùng chung `whereOf` với
> danh sách), drawer chi tiết (dùng `GET /receipts/:id` vốn bỏ không), form auto-fill từ đơn + ảnh
> minh chứng + số tiền bằng chữ, thẻ mobile riêng, gác `PermissionState`. **Liên kết hai chiều:**
> đơn/xe → link sổ đã lọc; sổ khách → tab **Thu chi** thật.
> **Vòng review nội bộ tìm thêm 7 lỗi, đã sửa hết** — nặng nhất: (a) vòng `0đ → có tiền lại` bị
> unique index khoá **vĩnh viễn** (nay `updateAmountWithinTx` HỒI SINH phiếu thay vì bỏ qua dòng
> đã huỷ, có test); (b) cọc thổi phồng "Doanh thu" theo xe (`HELD_FUNDS_RECEIPT_SOURCES` loại
> `deposit`/`deposit_refund` khỏi `VehiclesService.stats`); (c) `bookingId`/`vehicleId` client gửi
> ghi mà **không kiểm tenant** — FK là khoá đơn, không composite, nên `LIST_SELECT` join ra tên xe
> + biển số của gian hàng khác; (d) vòng retry `receipt_no` là mã chết (transaction đã abort ở vi
> phạm đầu) → bỏ vòng lặp, hậu tố 4→8 ký tự, ngày theo giờ VN. **Còn thiếu, đã ghi:** nút "Sửa chi
> phí" trên phiếu bảo dưỡng đã hoàn tất (API xong, UI chưa) — xem §5.1 của plan.
> **Đợt 2 — MỘT con số phải-thu cho một đơn** (`common/booking-money.ts`). Người dùng báo một
> đơn thật: thu 720k tiền thuê qua nút "Thu tiền" + 200k quá giờ ghi bằng phiếu tay ⇒ màn đơn nói
> 720k, sổ nói 920k. Nguyên nhân: tiền của một đơn nằm ở BA bảng không nói chuyện với nhau
> (`payments` → `paid_amount` · `booking_surcharges` → chỉ nuôi phép tính hoàn cọc · `receipts`
> gắn tay → chỉ ở sổ). Nay một công thức duy nhất, có cả bản TS lẫn bản SQL:
> `phảiThu = total + phụ phí` · `đãThu = paid + phiếu tay đã duyệt + min(phụ phí, cọc đã thu)` ·
> `cònNợ = max(0, phảiThu − đãThu)`. **`min(phụ phí, cọc đã thu)` là mấu chốt chống ĐẾM HAI LẦN** —
> quyết toán đã trừ phụ phí vào tiền hoàn cọc, cộng thẳng vào nợ nữa là bắt khách trả hai lần.
> Áp cho: chi tiết/danh sách đơn · `/manage/debts` (kể cả bộ lọc `unpaid`) · dashboard tài chính ·
> sổ khách · giám sát nền tảng. **Hợp đồng CỐ Ý giữ `total − paid`** — nó là bản đông cứng lúc ký,
> phụ phí phát sinh sau. Đơn thuê nay có `surchargeTotal`/`amountDue`/`otherCollected`/
> `collectedAmount`, hiện "Thu vượt" khi thu nhiều hơn phải thu, và hộp "Sổ tiền của đơn" liệt kê
> cả phiếu ghi thẳng ở sổ.
> Verify: **jest 622/622 (51 suite, PostgreSQL thật)** · **vitest 1533/1533 (103 file)** ·
> typecheck api/types/web sạch · lint scoped sạch · `migrate diff` sạch · backfill chạy lại ra 0
> dòng · i18n:check parity.
> Plan: `docs/plans/2026-08-19-noi-tien-vao-so-thu-chi.md`.
>
> Cập nhật gần nhất: **17/08/2026 (đợt 2 — hoàn thiện)** — epic **Đa dịch vụ** đóng TRỌN sau
> audit end-to-end, 6 commit:
> **(1) Hành trình with_driver đi trọn vòng đời** — `bookings` +route_type/pickup_address/
> destination (CHECK route⇒with_driver), approve() copy đủ trong cùng transaction, đơn tay
> (BookingFormDialog + StaffBookingFlow) nhập hành trình, hiển thị ở chi tiết đơn/khối tài
> xế/`/trips`/hợp đồng (snapshot đóng băng); helper chung `common/route-context.ts`.
> **(2) Giá theo LỘ TRÌNH có tài xế** — +with_driver_inter_city_price/+one_way_price
> (fallback bậc gần nhất + `estimateNote` = tổng chỉ là TẠM TÍNH); routeType vào public
> quote + calendar quote (staff flow hết mù dịch vụ) + approve — khách và shop cùng một số.
> **(3) Tab Giá & chính sách theo KHỐI dịch vụ** (tự lái ngày/cuối tuần/giờ · giá tháng ·
> 3 giá route), bỏ dịch vụ → `orphanPriceClears` xoá giá stale (FE cảnh báo trước), publish
> validation THEO dịch vụ (đăng gì phải có giá đó — BE `missingPublicFields` + FE
> `publication.ts` đối xứng). **(4) Service context đồng bộ** — tab trang chủ ghi URL
> (shallow) → khối "Xe khả dụng" lọc ngay; /search có chip "Tất cả" tường minh; MỘT
> `activeService` cho badge+giá+link ở card; detail có selector dịch vụ + giá lớn đổi theo;
> thiếu giá chuyên biệt → "Liên hệ báo giá" (không mượn giá tự lái).
> **(5) Policy mặc định TÁCH THEO LOẠI XE** — `rental_policies.vehicle_type`, precedence
> override xe → theo loại → legacy; migration nhân bản policy cũ cho car+motorbike; UI 2 tab.
> **(6) Tài xế vận hành được** — EXCLUDE gist `bookings_driver_schedule_excl` (một tài xế
> không nhận 2 đơn giao nhau, range nửa hở), `license_expires_at` (hết hạn trước lúc trả xe
> → không gán), `GET /drivers/assignable` trả cờ bận/hết hạn để Select disable kèm lý do.
> Verify: Jest 519 (5 spec mới) + vitest 1236, lint scoped sạch, seed idempotent, luồng thật
> (quote 3 route 2.6/3.2/4.2tr, fallback + note, sàn 7 ngày 400, screenshot 3 trang).
>
> **19/08 — nền đa ngữ vi/en dựng xong, i18n hoá đang đi theo đợt ([ADR 0012](decisions/0012-i18n-shared-url-cookie-locale.md)).**
> `next-intl` KHÔNG locale routing: hai ngôn ngữ dùng CHUNG url, locale nằm ở cookie httpOnly
> `XP_LOCALE` đọc phía server (`proxy.ts` không đổi một dòng). Xong trọn vẹn: hạ tầng + bộ đổi
> ngôn ngữ (3 vị trí: MarketHeader · manage Topbar · vỏ trang auth), tầng ĐỊNH DẠNG dùng chung
> (`useAppFormat`/`getAppFormat` — tiền/ngày/thời lượng/km/gói dài hạn, thay 333 lời gọi ở 86
> file), 342 nhãn nghiệp vụ (`Domain`) phủ 68 `<StatusTag>`, bảng mã lỗi API (`Errors`), vỏ
> công khai (header/footer/tab bar/4 bước/gian hàng nổi bật), **Hero + Sticky Search trọn bộ**
> (gồm bộ chọn địa điểm), điều hướng hai cổng, và trang quên/đặt lại mật khẩu.
> Hai lệnh gác: `pnpm --filter @xeprime/web i18n:check` (parity vi↔en, ICU, không giá trị rỗng)
> và `i18n:audit` (quét AST). **Còn lại ~3.9k chuỗi**, gần hết nằm ở cổng quản lý — `i18n:audit`
> là bản kiểm kê chính xác, đọc theo khu vực. Thứ tự làm tiếp: `components/form` + `manage-common`
> (dùng chung, mở khoá phần còn lại) → vehicles → booking-requests → rental-policies → còn lại.
>
> **18/08 — thuê dài hạn chuyển sang GÓI CỐ ĐỊNH ([ADR 0011](decisions/0011-long-term-fixed-packages.md)).**
> Sáu gói 1/2/3/6/9/12 tháng; ngày trả = ngày nhận + N **tháng lịch** do server tính (client không
> gửi); khách chỉ nêu nguyện vọng nhận xe (`within_7_days` server tự tính khoảng | `specific_date`),
> gian hàng chốt ngày giờ chính xác trong hộp thoại duyệt (trùng lịch → 409, yêu cầu vẫn chờ duyệt).
> Máy giá tách `buildDailyQuote` ↔ `buildLongTermPackageQuote`; mốc ưu đãi canonical theo THÁNG,
> không cộng dồn, % không được giảm khi hạn tăng. Gỡ sạch cách trình bày gây nhầm: badge `-38%`,
> dòng "tiết kiệm so với thuê theo ngày", giá + khuyến mãi TỰ LÁI hiện trong ngữ cảnh dài hạn.
> Dữ liệu cũ: chỉ backfill gói khi khớp khít tháng lịch; mốc ưu đãi theo ngày không quy đổi được
> giữ nguyên dạng `legacy` (máy giá bỏ qua, form cảnh báo); snapshot giá lịch sử KHÔNG sửa.
> Plan: `docs/plans/2026-08-18-da-dich-vu-tai-xe-va-thue-dai-han.md`.
>
> **18/08 — SỔ KHÁCH CỦA GIAN HÀNG (gap S-01) đóng end-to-end.** `/manage/customers` +
> `/manage/customers/[id]` hết là stub. Ba bảng mới (`tenant_customers` unique
> `(tenant_id, normalized_phone)` · `tenant_customer_notes` bất biến · `tenant_customer_documents`
> ở bucket R2 riêng tư) + composite FK từ `bookings`/`booking_requests`/`receipts` — DB tự chặn
> gắn đơn của shop A vào khách của shop B. Định danh khách là **SĐT đã chuẩn hoá**: `09…`/`84…`/
> `+84…` là một người; **không bao giờ gộp theo tên**. Backfill trong migration gom đơn + yêu cầu
> cũ theo `(tenant, SĐT chuẩn hoá)`, idempotent, KHÔNG sửa một ký tự nào của snapshot
> `customer_name`/`customer_phone`. Module `modules/customers/` (writer duy nhất) + 5 quyền mới
> `customers.*`; mọi con số (số lần thuê, tổng, đã thu, còn nợ, no-show, trả muộn) **tính động**
> từ `bookings` theo đúng định nghĩa công nợ Phase 6 — không cột đếm nào bị denormalize. Tiền là
> quyền riêng: thiếu `finance.view` thì trường tiền trả `null` và lọc/sắp xếp theo tiền bị **từ
> chối 403** (bỏ qua im lặng vẫn để lộ thứ hạng công nợ qua thứ tự dòng). `blocked` chặn yêu cầu
> và đơn MỚI ở gian hàng đó; đường công khai chỉ nhận **thông điệp trung tính** (kiểm SAU cửa OTP
> để không dò được số nào đang bị chặn). Verify: jest 42 test mới + 164 test cũ liên quan xanh,
> vitest 34 test mới, typecheck api/web sạch, migration đã áp + chạy lại backfill ra 0 dòng.

---

## 1. Mục tiêu (milestone đã chốt với user)

**"Product vận hành đủ tiền"** — sản phẩm chạy được vòng vận hành thật của một shop cho thuê xe:
đăng xe → duyệt → marketplace → khách đặt (verify SĐT) → shop duyệt → đơn thuê → lịch → **thu/chi,
cọc, công nợ, hợp đồng** → thông báo/đánh giá, cộng admin nền tảng khoá shop + audit.

⇒ Đường tới milestone đi qua **hết Phase 6 (Finance)**. Phase 7–9 là sau milestone.

Chi tiết nghiệp vụ từng phase: `docs/xeprime_build_plan_nextjs_nestjs_prod.md`. Khi mâu thuẫn,
**ADR (`docs/decisions/`) thắng**.

---

## 2. Tiến độ thực tế

| Phase | Nội dung | Trạng thái |
| --- | --- | --- |
| 0 | Base monorepo (Next/Nest/PG/Prisma), CI cục bộ, seed | ✅ Xong, đã commit |
| 1 | Auth / RBAC / Tenant / Layout | ✅ Xong |
| 2 | Shop approval + Vehicle core | ✅ Xong |
| 3 | Public listing (snapshot ADR 0008) + Marketplace + gallery/tiện ích xe | ✅ Xong |
| 4 | Booking request + Booking + Calendar + **gate verify SĐT** + check-conflict preview | ✅ Xong 29/07, đã commit |
| 5 | Notification ✅ · Review ✅ · Chat (ADR 0009) | ✅ Notification/Review xong · Chat dựng đáng kể (realtime sau cờ `FIRESTORE_ENABLED`) |
| **6** | **Finance / Thu-Chi / Công nợ / Hợp đồng** | ✅ **S1 + S2 + S3 Contracts XONG** — migration đã áp, verify sạch → **đóng milestone "vận hành đủ tiền"** |
| 7 | Admin platform đầy đủ | ✅ **Lõi xong 31/07 (commit `262801b`)** — approval · gian hàng khoá/mở · dashboard · audit-view · nhân sự · gói-hạn (ADR 0010). ✅ **04/08: 3 màn giám sát** all-vehicles / all-bookings / all-customers (CHƯA commit). Còn lại §11.1: **support tickets · invoice cho gói** |
| 8 | Migration từ Firestore + chạy song song | ❌ Sau |
| 9 | QA / hardening / production | 🟡 **Hạ tầng deploy 27/08 + CD và sao lưu 27/08** (`docs/deployment.md`, `docs/backup-and-restore.md`, `deploy/`, `.github/workflows/deploy.yml`, `tools/backup-pull/`) — phần QA/hardening còn nguyên |
| — | **Epic Vehicle 360** (ngoài lịch phase) | ✅ **Xong 13/08/2026** — 8 wave, Release Gate PASS. Chi tiết §2.1 |

> **27/08 — HẠ TẦNG TRIỂN KHAI (chưa commit).** Repo trước đó không có gì cho production: chỉ có
> `docker-compose.yml` dựng PostgreSQL cho dev. Đã thêm `deploy/` (Dockerfile · Caddyfile · mẫu
> env · 4 script vận hành), `docker-compose.prod.yml`, `.dockerignore` và
> [`docs/deployment.md`](deployment.md) — trong đó có cả phần chọn cấu hình VPS và bản đồ tên miền.
>
> **Một image duy nhất** chạy cả api/web/worker/migrate: cắt nhỏ cây `node_modules` symlink của
> pnpm cho từng service là chỗ hỏng lúc 2 giờ sáng chứ không phải chỗ tiết kiệm, và
> `prisma migrate deploy` vốn cần Prisma CLI (một devDependency).
>
> **Tên miền (deployment.md §2.1–2.3).** Ba giao diện dùng CHUNG một origin — `xeprime.vn` cho
> `/` + `/manage` + `/manage/admin`. Không tách `manage.`/`admin.` vì 275 lượt `ROUTES.*` trong
> 91 file đang là đường dẫn tương đối, và ADR 0014 coi chủ shop với khách là cùng một con người.
> Mọi hostname giữ ở 2 cấp (`api-stg` chứ không `api.stg`) vì Universal SSL của Cloudflare chỉ
> phủ một cấp. Hai môi trường = hai VPS: chỉ MỘT Caddy bind được 80/443.
>
> **BA bug thật, cả ba do việc build/chạy image bắt được:**
>
> 1. **`trust proxy` chưa bao giờ được đặt** (`bootstrap.ts`). Sau reverse proxy, `req.ip` là IP
>    của Caddy cho MỌI request ⇒ @nestjs/throttler gộp toàn bộ người dùng vào chung hạn mức 120
>    req/phút và giới hạn gửi OTP theo IP mất tác dụng. Thêm `TRUST_PROXY_HOPS` — một CON SỐ (số
>    lớp proxy) chứ không phải cờ bật/tắt: bật khi không có proxy là để ai cũng tự khai IP.
>    Sau Cloudflare (mây cam) giá trị đúng là 2, không phải 1.
>
> 2. **`.dockerignore` bỏ sót `**/*.tsbuildinfo`** — mẫu không có `**/` chỉ khớp ở gốc context.
>    `base.json` bật `incremental: true`, nên buildinfo của máy dev lọt vào image trong khi
>    `dist/` bị loại: tsc kết luận "không có gì đổi", **emit 0 file và thoát 0**, rồi
>    `@xeprime/domain` chết với TS2307 "Cannot find module". Xanh trên CI (checkout sạch), đỏ
>    trên máy dev. Sửa hai lớp: mẫu `**/` + một bước `find -delete` trong builder.
>
> 3. **`SESSION_COOKIE_NAME` được đọc lúc CHẠY, không phải lúc build** — và cả `proxy.ts` lẫn
>    `packages/types/src/session.ts` đều ghi chú ngược lại. Next 16 + Turbopack chỉ nhúng cứng
>    `NEXT_PUBLIC_*`. Đo trực tiếp: build image với tên cookie khác mặc định, gọi
>    `/manage/vehicles` kèm cookie tên đó vẫn nhận **307**, còn cookie tên mặc định lại **200**.
>    Hệ quả: mọi triển khai đổi tên cookie — tức là **staging**, vì hai môi trường BẮT BUỘC phải
>    khác tên (cookie domain `.xeprime.vn` gửi lẫn sang nhau) — sẽ có proxy không bao giờ thấy
>    phiên: người đã đăng nhập bị đá về `/manage/login` thành vòng lặp, không một dòng lỗi nào.
>    Sửa: service `web` nhận đúng MỘT biến runtime qua `environment:` (không nạp cả `.env` vào
>    tiến trình render nội dung người dùng), và 4 chỗ ghi chú sai đã viết lại theo hành vi đo
>    được. Sau sửa, cùng stack, chỉ recreate container `web`: cookie staging → **200**, cookie
>    mặc định → **307**. Lưu ý cho người sửa sau: `env-session-cors.spec.ts` cấm MỌI literal tên
>    cookie trong `proxy.ts`, luật đó bắt cả comment.
>
> **Hai môi trường, một file compose.** `deploy.sh --env <tên>` đặt đồng thời `-p xeprime-<tên>`,
> `--env-file .env.<tên>` và biến `XP_ENV_FILE`; lệch một trong ba là stack tách đôi trong im
> lặng (volume mới, database rỗng, không ai báo lỗi). `container_name` cố định bị **bỏ hẳn** để
> Docker tự đặt theo project — nhìn `docker ps` là biết máy đang chạy môi trường nào.
> `backup-db.sh`/`restore-db.sh` nhận cùng cờ, tên file dump mang nhãn môi trường, và restore
> cảnh báo khi nhãn không khớp: khôi phục dump staging đè lên production là tai nạn không có nút
> hoàn tác.
>
> **Hai bẫy cú pháp đã trả giá, ghi lại để khỏi vấp lần hai:** `env_file: [${VAR:-default}]`
> không parse được — trong YAML flow sequence, dấu ngoặc nhọn sau ký hiệu đô-la mở một flow
> mapping; phải nháy đơn. Và trong Node, `String.replace(a, b)` diễn giải các chuỗi đặc biệt
> trong `b` (`$&`, dấu đô-la + backtick, dấu đô-la + nháy đơn) — chính ghi chú này từng chèn
> nguyên phần đầu tài liệu vào giữa file vì lý do đó. Truyền HÀM thay vì chuỗi.
>
> **Verify:** build image đầy đủ PASS (2,62 GB) · smoke stack thật ở CẢ HAI đường
> (mặc định và `--env staging`): `migrate deploy` áp toàn bộ migration trong container →
> `/health` trả `{"status":"ok","database":"up"}` → `/docs` trả 404 (Swagger tắt đúng ở
> production) → web trả 200 → worker boot đúng → `down -v` dọn sạch · `caddy validate` sạch ·
> `docker compose config` hợp lệ và volume tách đúng cho cả hai project · `bash -n` cả 4 script ·
> api typecheck + lint sạch · web + types typecheck sạch · vitest web **1775/1775** · jest
> `env-session-cors` **25/25** (thêm 3 test khoá `TRUST_PROXY_HOPS`).
>
> **`APP_ENV` — tách "môi trường đã triển khai" khỏi "kiểu build" (27/08, đợt 3).** User muốn lên
> staging ngay, chưa mua eSMS. Nhưng staging BẮT BUỘC chạy `NODE_ENV=production` (nếu không Next
> trộn bản React dev vào bundle), mà `NODE_ENV=production` đang kéo theo một nhóm luật thuộc loại
> khác hẳn — "tính năng phải chạy THẬT": bắt buộc eSMS, SMTP, đủ bộ R2. Trên staging ba luật đó
> chỉ có nghĩa là tốn tiền tin nhắn để test một luồng đặt xe giả.
>
> Thêm `APP_ENV: production | staging` và tách `superRefine` làm hai tầng:
> **BẢO MẬT** (https · cookie Secure · secret không còn giá trị mẫu · CORS toàn https) áp cho MỌI
> môi trường đã triển khai — staging KHÔNG được miễn, nó cũng nằm trên Internet công khai và cũng
> phát cookie phiên thật. **NĂNG LỰC** (eSMS · SMTP · R2) chỉ production; thiếu thì suy giảm có
> kiểm soát (OTP vào log, email vào log, upload 503) chứ app không gãy.
> Mặc định là `production` — giá trị nghiêm ngặt nhất; nới lỏng phải tường minh, không phải thứ
> rơi vào vì quên khai. 8 test khoá đúng luật đó, trong đó 4 test khẳng định staging VẪN bị chặn
> bởi từng luật bảo mật (cái bẫy hiển nhiên khi thêm một môi trường "dễ tính hơn" là nới luôn cả
> nhóm kia).
>
> **Đánh đổi đã ghi rõ:** `devCode` (mã OTP trong response) mở cho staging — điều kiện là
> `NODE_ENV=production` **và** `APP_ENV=production` mới khoá, chứ không chỉ `NODE_ENV` như trước;
> chỉ xét `NODE_ENV` là khoá luôn staging và biến mọi lần test luồng đặt xe thành một lần đi đọc
> `docker compose logs api`. Hệ quả: trên staging ai gọi được endpoint gửi OTP cũng xác thực được
> SĐT bất kỳ ⇒ **không đưa dữ liệu khách hàng thật lên staging**. `main.ts` in cảnh báo lúc boot
> liệt kê đúng những gì đang suy giảm — đó là thứ phát hiện việc chép nhầm file env sang máy
> production ngay từ giây khởi động đầu tiên.
>
> Không đụng DTO/controller nên hợp đồng OpenAPI không đổi (`openapi-contract` 18/18 xanh).
>
> **Chưa deploy lên máy thật lần nào** — §8 của `deployment.md` ghi các nợ có chủ đích.

> **27/08 — CD + SAO LƯU (chưa commit).** Đã đóng hai khoảng hở lớn nhất của hạ tầng bên trên.
>
> **CD (`.github/workflows/deploy.yml`).** Merge `develop`→`staging`→`main` là deploy tự động;
> Run workflow cho phép chọn môi trường/ref, và điền `image_tag` để **rollback** về image cũ
> trong ~2 phút. Build chuyển hẳn sang GitHub Actions → GHCR, VPS chỉ `docker compose pull`
> (`deploy.sh --image <ref>`, neo `x-app-image` trong compose) — nợ "build chạy trên chính VPS"
> đã trả. `ci.yml` thêm job `build` và `workflow_call` để làm cổng chặn dùng chung.
>
> ⚠️ Image mang nhãn MÔI TRƯỜNG (`:staging-<sha>`) vì `NEXT_PUBLIC_API_URL` bị Next nhúng cứng
> lúc build — **không dùng chéo giữa hai môi trường**. File `.env.<môi trường>` trên VPS được
> sinh tự động từ GitHub Environment mỗi lần deploy, nên sửa tay trên máy sẽ bị ghi đè.
>
> **Sao lưu (`docs/backup-and-restore.md`).** `backup-db.sh` viết lại: flock (deploy trùng cron
> không còn chạy hai `pg_dump`), kiểm đĩa TRƯỚC khi ghi, dọn retention TRƯỚC khi dump, timeout,
> `pg_restore --list` để bắt file cụt, `.sha256`, và `mv` nguyên tử để máy pull không bao giờ
> đọc phải file dở. Hẹn giờ bằng systemd timer (`Persistent=true` chạy bù, `OnFailure=` cảnh
> báo) thay cron. Cảnh báo qua Telegram bằng `curl`.
>
> **Đưa bản sao ra khỏi máy: máy tại công ty PULL qua SFTP chỉ-đọc**, VPS không push và không
> cầm khoá ghi vào mạng công ty — `ForceCommand internal-sftp -R` + chroot
> (`setup-backup-user.sh`). Phía Windows ở `tools/backup-pull/`: tải bù mọi bản còn thiếu, so
> SHA-256, giữ 12 tuần, và dead-man switch cảnh báo khi bản mới nhất quá 8 ngày — lớp duy nhất
> bắt được việc chính VPS đã chết. Kèm `Test-XePrimeRestore.ps1`: hằng tháng `pg_restore` thật
> vào một Postgres dùng-một-lần rồi đếm bản ghi.
>
> **Cố ý KHÔNG làm:** PITR/WAL archiving và cloud object storage. Hệ quả phải biết: **RPO 24
> giờ** — sự cố lúc 22h mất 19 giờ đơn thuê/phiếu thu chi. Ghi ở `deployment.md` §8.
>
> **Việc chèn ngoài phase (29–30/07):** đặt xe passwordless + đăng nhập SĐT + điều chỉnh UX là
> feature do user yêu cầu, KHÔNG nằm trong lịch phase — làm xong nhưng **milestone chưa nhích**
> (S3 Contracts vẫn là việc đóng Phase 6). Ghi ở mục Phase 4 (30/07).
>
> **Cờ `comingSoon` đã dọn (30/07 → 18/08):** `booking-requests`, `members`, `drivers` và
> `customers` là **page thật đã xong** — đã gỡ cờ trong `constants/nav.ts`. Còn `pickup-areas`
> và `trash` vẫn là stub thật (giữ cờ).
>
> ✅ **Milestone "vận hành đủ tiền" đã đạt (Phase 6 xong hết).**
>
> **31/07 — Phase 7 lõi đóng (CHƯA commit, user tự commit):** 4 slice end-to-end:
> **(A) Dashboard nền tảng** — `GET /platform/dashboard/summary`
> (`modules/platform-admin/platform-dashboard.*`), `/manage` switch theo `platformRole`
> (`ManageHome` → `features/platform-dashboard`). **(B) Audit read** — migration
> `20260731100000_add_audit_log_indexes` (index `created_at` + `action,created_at`),
> `GET /platform/audit-logs[/:id]` (list KHÔNG kéo JSONB, detail mới có before/after),
> `AUDIT_ACTOR_SCOPE` vào `@xeprime/types`, page thật `admin/audit` (`features/admin-audit`,
> filter URL ADR 0004, drawer JSON Trước/Sau). **(C) Nhân sự nền tảng** — CRUD
> `platform_memberships` (`platform-staff.*`, mirror `members`): add theo email, PATCH đổi role,
> DELETE → removed; service enforce 1 membership/user (guard chỉ đọc row ACTIVE đầu), chặn tự
> thao tác mình + chặn gỡ/hạ `platform_admin` ACTIVE cuối cùng (check trong tx); page thật
> `admin/staff` (`features/admin-staff`). **(D) Gói/hạn** — **ADR 0010** + migration
> `20260731120000_add_plans_subscriptions` (bảng `plans` + `tenant_subscriptions` append-only,
> "expired" suy ra từ `ends_at`, không job); module `billing` (writer duy nhất), permission mới
> `platform.billing.manage` (+ finance_admin), lỗi `PLAN_LIMIT_REACHED`;
> `BillingService.assertVehicleQuota` gọi đầu `VehiclesService.create` (không gói = không giới
> hạn); tenant detail thêm `currentPlan`; FE page `admin/plans` (`features/admin-plans`) + section
> "Gói dịch vụ" trong drawer gian hàng (gán/gia hạn nối đuôi, lịch sử, huỷ sớm). Sửa kèm: 2 lỗi
> có sẵn từ commit cab3b61 (`public-home.spec` thiếu `refreshRating`, `listings-sync.spec` sai
> type) + `jest maxWorkers: 4` (không giới hạn worker thì cạn kết nối PG khi thêm suite).
> Verify: jest 21 suite / 128 test xanh · typecheck/lint sạch · smoke HTTP thật (login admin →
> dashboard/audit/staff/plans/gán+gia hạn gói → dọn dữ liệu smoke).
>
> **04/08 — 3 màn giám sát nền tảng (CHƯA commit):** đóng gần hết §11.1 build plan.
> **(A) Quyền** — 5 permission mới ở `packages/types/src/rbac.ts`: `platform.vehicles.view` ·
> `platform.vehicles.moderate` · `platform.bookings.view` · `platform.customers.view` ·
> `platform.customers.view_pii`. `PLATFORM_STAFF` bỏ 4 key tenant (`vehicles.view`…, vốn không
> cấp được gì cho người không thuộc tenant) đổi sang key `platform.*`; `SUPPORT` là role duy
> nhất ngoài admin có `view_pii`. Đã chạy seed (37 permission).
> **(B) Index** — migration `20260804100000_add_platform_monitoring_indexes` đã áp: các list này
> KHÔNG có `tenant_id` dẫn đường nên mọi index `(tenant_id, …)` cũ vô dụng. Thêm btree
> `users(created_at)`, `vehicles(created_at)`, `vehicles(public_status, created_at)`,
> `bookings(status, created_at)`, `bookings(customer_phone)` + **3 GIN trigram** cho ô tìm kiếm
> `ILIKE '%q%'` (`users.display_name`, `vehicles.name+plate_number`, `bookings.code+customer_name`).
> `migrate diff` sạch (schema ↔ DB khớp cả index trigram).
> **(C) Xe toàn hệ thống** — `platform-vehicles.*`: list lọc trạng thái duyệt/vận hành/loại xe/
> trạng thái gian hàng + tìm tên-biển-mã; **ẩn/bỏ ẩn xe vi phạm** đổi `publicStatus`
> `approved_public ↔ hidden` rồi gọi `ListingsService.syncFromVehicle` trong CÙNG tx (ADR 0008 —
> module này không tự ghi `public_listings`), `updateMany` theo trạng thái nguồn nên sai bước →
> 409, lý do ẩn BẮT BUỘC và vào audit. FE `features/admin-vehicles` + `/manage/admin/vehicles`.
> **(D) Đơn thuê toàn hệ thống** — `platform-bookings.*`, **CHỈ ĐỌC** (chuyển trạng thái vẫn của
> shop — ADR 0006 giữ một đường ghi lịch duy nhất); lọc trạng thái/gian hàng/xe, khoảng ngày áp
> lên `createdAt` **hoặc** `pickupAt`, tra SĐT khớp chính xác. FE `features/admin-bookings`.
> **(E) Khách thuê** — `platform-customers.*`: "khách" = user **không** có membership ACTIVE ở
> tenant lẫn platform (loại chủ shop/nhân sự; nhân viên đã nghỉ vẫn là khách). **Masking PII**
> (`common/mask.ts`) ở mọi đường đọc; bỏ che là `POST /platform/{bookings,customers}/:id/contact`
> — quyền riêng + ghi `audit_logs` từng lần, và log **không** chép lại giá trị PII. FE
> `features/admin-customers` + component dùng chung `MaskedContact`.
> **(F) Hai dạng SĐT — cái bẫy lớn nhất của slice này.** `users.phone` lưu `84…` (mọi đường ghi
> đi qua `normalizePhone`), còn `bookings/booking_requests.customer_phone` lưu **thô như shop/khách
> gõ** (`09…`). Ô "tra theo SĐT" so khớp một dạng là gần như luôn trả rỗng, và `maskPhone` che
> thẳng `84…` sẽ lộ ra đúng mã quốc gia (`849****678`) — vô dụng để đối chiếu, lại hiện khác nhau
> giữa hai màn. Đã gom về `common/phone.ts` (`normalizePhone` dời từ `phone-verification.service`,
> thêm `toLocalPhone` + `phoneLookupVariants`): tra cứu so `{ in: [mọi dạng lưu] }` (vẫn khớp
> CHÍNH XÁC, không cho dò tiền tố), che trên dạng nội địa. Test seed SĐT dạng `84…` **đúng như
> production ghi** — seed `09…` sẽ làm test xanh trong khi màn thật không tìm ra ai.
> **Dọn kèm:** `bookingDebt()` (`common/money.ts`) gom công thức công nợ lặp ở 3 nơi ·
> `isZeroMoney()` (`lib/money.ts`) so sánh tiền trên chuỗi thay vì `Number()` (sửa luôn
> `BookingDetailDrawer`) · `USER_STATUS_META` · `BOOKING_DATE_FIELD` về `@xeprime/types` (giá trị
> đi trong query string, web↔api phải chung nguồn) · 4 action + targetType `user` mới vào
> `admin-audit/constants.ts` (không có thì **không lọc được "ai đã xem PII"** — đúng lý do endpoint
> đó tồn tại) · primitive dùng chung `common/pagination.ts` + `hooks/use-url-filters.ts` cho 3
> slice mới.
> **Sửa sau review (`reviewer` agent):** (F) ở trên · index trigram `vehicles` thiếu cột `code`
> khiến CẢ vị từ OR rơi về seq scan (Postgres chỉ BitmapOr khi mọi nhánh có index) · handler-level
> `@RequirePermissions` **ghi đè** cấp class (`getAllAndOverride`) nên 4 handler phải liệt kê lại
> quyền đọc, nếu không role chỉ có `view_pii`/`moderate` thao tác được mà không có quyền xem ·
> `CheckCircleTwoTone twoToneColor="#16a34a"` → token (ADR 0003).
> Verify: **jest 25 suite / 166 test** xanh · types 21 · web vitest 38 · typecheck + lint (api &
> web) sạch · `migrate status`/`migrate diff` sạch · **smoke HTTP thật**: login admin → 3 list →
> ẩn/bỏ ẩn xe (snapshot sàn đi theo, sai bước 409) → reveal SĐT/email (audit ghi đúng, không chép
> PII vào log) → tra SĐT cả 3 dạng `09…`/`84…`/`+84…` đều ra → chủ shop gọi 3 endpoint đều 403 →
> dọn dữ liệu smoke.
>
> **Đã ghi nhận, CHƯA làm (không thuộc slice):** shop gửi duyệt lại xe bị nền tảng ẩn thì reviewer
> **không thấy lý do ẩn** (chỉ nằm trong `audit_logs`) → nên hiện lý do trên phiếu duyệt ·
> `use-url-filters`/`pagination` mới dùng ở 3 slice mới, 10 hook + 19 service cũ vẫn giữ bản copy
> (dời dần khi chạm vào, đừng sửa hàng loạt trong diff không liên quan).

---

## 2.1 Epic Vehicle 360 — ĐÓNG 13/08/2026

Epic ngoài lịch phase (user yêu cầu, chạy sau Phase 7): biến hồ sơ xe từ form CRUD thành trung tâm
quản lý vòng đời tài sản. Đặc tả mục tiêu ở [`docs/design/12_VEHICLE_360_MANAGEMENT.md`](design/12_VEHICLE_360_MANAGEMENT.md);
**ranh giới đã-làm / một-phần / hoãn ở §0 của chính file đó**. Trạng thái nghiệp vụ đối chiếu code ở
`docs/design-briefs/04_FLEET_MANAGEMENT.md` §2.4.

Làm theo 8 wave (commit `f92d8ce` → `3f4bdce` trên `develop`).

**Route đã xong**

| Route | Nội dung |
| --- | --- |
| `/manage/vehicles` | Lưới thẻ xe ở MỌI viewport (bỏ hẳn bảng), thẻ mang cảnh báo + KM từ server |
| `/manage/vehicles/new` | Wizard **4 bước** (`Thông số` gộp vào workspace sửa — có chủ đích), lưu nháp |
| `/manage/vehicles/:id` | Hồ sơ 360: chỉ số, việc cần làm, đơn sắp tới/gần đây, thẻ giấy tờ/nguồn/bảo dưỡng theo quyền |
| `/manage/vehicles/:id/edit?tab=` | 6 tab một route: `information` · `media` · `pricing` · `source` · `documents` · `maintenance`; tab lạ rơi về `information` |
| `/manage/vehicles/:id/pricing` | Giá & chính sách theo xe (cũng nhúng làm tab `pricing`) |
| `/manage/maintenance` | Trung tâm bảo dưỡng toàn đội xe + nhóm việc `Thiếu KM trả` |
| `/manage/shop/policies` | Chính sách thuê mặc định của gian hàng |

Bàn giao **không có route riêng**: vào từ drawer đơn thuê; việc tồn đọng vào từ Trung tâm bảo dưỡng.

**Module backend đã xong** — `modules/vehicles/vehicle-alerts.service.ts` (nguồn DUY NHẤT của cảnh
báo) · `vehicle-source.service.ts` · `vehicle-contracts.service.ts` (lõi file riêng tư dùng chung) ·
`modules/vehicles/documents/` · `modules/vehicles/maintenance/` (+ `maintenance-board.controller.ts`) ·
`modules/bookings/handovers/` (+ `handover-queue.controller.ts`) · `modules/pricing/shop-policies.controller.ts`.

**Bảng mới** — `rental_policies` · `vehicle_source_details` · `vehicle_private_files` ·
`vehicle_documents` (+`_versions`, +`_ocr_jobs`) · `vehicle_maintenance_profiles` ·
`vehicle_odometer_readings` · `vehicle_maintenance_records` (+`_attachments`) · `vehicle_handovers`
(+`_photos`). Schema lên **52 model / 29 migration**.

**Quyền mới** — giấy tờ 4 mức (`vehicles.documents.view` · `view_details` · `view_files` · `manage`) ·
bảo dưỡng/KM 5 mức (`vehicles.maintenance.view` · `manage` · `view_cost` · `view_files` ·
`vehicles.odometer.correct` + `odometer.decrease`) · bàn giao 4 mức (`handovers.view` · `manage` ·
`confirm` · `view_files`). Tách theo **mức thiệt hại nếu bị lạm dụng**, giữ một quyền không kéo theo
quyền kế tiếp. Bảng "quyền nào lộ dữ liệu gì": brief 04 §4.1.

**Luồng đã chạy end-to-end** — tạo/nối lại nháp → gửi duyệt · sửa từng tab độc lập (tab này không
ghi đè field của tab kia, field không gửi không bị null hoá) · 4 hình thức nguồn xe + hợp đồng riêng
tư (signed URL ngắn hạn) · giấy tờ có phiên bản/hạn/lưu trữ · cấu hình + ghi phiếu bảo dưỡng (chiếm
lịch thật qua `OccupancyService`, ADR 0006) · chỉnh KM có lý do + audit, chống tụt KM âm thầm · bàn
giao nhận/trả (xác nhận **idempotent**, `rowVersion` chống ghi đè) · hàng đợi `Thiếu KM trả` (việc và
số đếm dùng CHUNG một vị từ nên biến mất cùng lúc) · cảnh báo xe **một phép tính, hai bề mặt**.

**Kết quả checkpoint (Release Gate 13/08/2026)** — API **190/190** test (10 suite, chạy trên
PostgreSQL thật) · web **1078/1078** (63 file) · `@xeprime/types` **21/21** · typecheck api + web sạch ·
`prisma validate` + `migrate status` sạch (**không cần migration mới**) · `git diff --check` sạch.
Hai lỗi tìm thấy và đã sửa: lệch design token `--xp-focus-ring-width` (`tokens.css` 3px ↔ `theme.ts`
2px từ wave 3) và một test giấy tờ flaky do `asyncUtilTimeout` của testing-library còn ở mặc định 1s.
**Không có visual QA/screenshot** — layout xác minh bằng test + đọc code.

> ⚠️ **Bẫy CI:** các spec API của epic này **tự bỏ qua trong im lặng khi không kết nối được
> PostgreSQL** và vẫn báo xanh. Chạy `pnpm db:up` trước, hoặc cho CI fail-fast khi thiếu DB — nếu
> không, cả mảng backend Vehicle 360 sẽ xanh giả.

**Hoãn có chủ đích (§5)** — provider OCR thật · chữ ký điện tử · trích nợ ngân hàng tự động ·
kế toán/thuế · ~~bản đồ tự tính khoảng cách~~ (**ĐÃ LÀM 24/08** — ADR 0018) · tự động chặn/ẩn xe vì giấy tờ hết hạn · phụ phí quyết
toán chưa nối Finance · trang `/manage/finance/vehicle-obligations`.

➡️ ~~Epic kế tiếp đề xuất: nối quyết toán đơn thuê vào Finance~~ — **ĐÃ LÀM 19/08** (xem đầu file).
Thu cọc, hoàn cọc và chi phí bảo dưỡng nay tự lên sổ Thu-Chi. **Phụ phí vẫn cố ý không sinh phiếu**
(là khoản ĐÒI, không phải tiền đổi tay — phiếu hoàn cọc đã là số ròng); phần **thu `additionalDue`
khi phụ phí vượt cọc** là việc còn lại của mảng này.

➡️ ~~báo cáo tài chính (lãi/lỗ theo xe)~~ — **ĐÃ LÀM 25/08** (xem đầu file): `/manage/finance` nay là
màn báo cáo có biểu đồ, cơ cấu theo danh mục và lãi/lỗ theo xe. **Xuất CSV vẫn chưa** — đó là phần
còn lại của mảng này.

Kế tiếp chọn một trong: nốt §11.1 (**support tickets** · **invoice cho gói**) · retrofit gate SĐT
(§5) · xuất CSV báo cáo tài chính · `/manage/finance/vehicle-obligations` (trả góp / thuê lại /
hoa hồng ký gửi — món cuối của tuyến tiền) · Phase 8 (migration Firestore) · Phase 9 (QA/hardening).

---

## 3. Đã xong — chi tiết đủ để không làm lại

- **Phase 1–2:** `modules/auth` (session cookie ADR 0002; social OAuth do backend chủ trì từ
  26/08/2026 — ADR 0019, `modules/auth/social/`), `modules/rbac`,
  `modules/tenants`, `modules/members`, guards (Auth/TenantScope/Permission), `modules/vehicles`
  (+ submit public review), `modules/platform-admin` (approval task).
- **Phase 3:** `modules/public-listings` — `ListingsService.syncFromVehicle` là **writer DUY NHẤT**
  của `public_listings` (ADR 0008); marketplace join `tenants` lọc `active` (khoá tenant tức thì);
  search tỉnh/loại/ngày/giá; trang shop `/shops/[slug]`; xe đa ảnh (`vehicle_images`) + tiện ích
  (`vehicle_features`).
- **Phase 4:** `modules/calendar` (`/resources`, `/events` đọc `vehicle_occupancies`, `/check-conflict`),
  `OccupancyService` (writer DUY NHẤT, exclusion constraint ADR 0006), `modules/bookings`
  (create/update/transition + reserve occupancy trong tx), `modules/booking-requests`
  (public submit + approve→booking). **29/07:** `modules/phone-verification` (OTP mock/eSMS theo
  `OTP_MODE`, gate `submitPublic`), FE `features/phone-verification` (`PhoneVerifyControl` inline,
  không bắt đăng nhập), check-conflict preview trong `BookingFormDrawer`. Verify: jest 7/7,
  typecheck/eslint/contract sạch.
  - **29/07 (mở rộng passwordless):** OTP thành công **tạo/đăng nhập tài khoản theo SĐT + cấp
    session** (không mật khẩu). `POST /auth/phone/login` (purpose `login`) + tab SĐT ở `/login`;
    `submitPublic` cấp session cho khách vãng lai + trả `authenticated`; `AuthService
    .resolveOrCreateUserByPhone` (idempotent theo `phone @unique`, identity `phone_otp`). Bảo mật:
    `phone_verifications.attempt_count` → `OTP_LOCKED` sau 5 lần sai; partial unique index chống
    double-submit yêu cầu. FE: luồng đặt xe **2 bước bottom-sheet/modal** (`useIsMobile`,
    `RequestBookingFlow`, `OtpCodeInput` auto-submit/paste/one-time-code, safe-area). Chi tiết:
    `docs/guest-booking-passwordless.md`. Migration `20260729160000_add_phone_login`.
  - **30/07 (điều chỉnh theo phản hồi user):** login mặc định **Email/SĐT + mật khẩu** (một ô
    định danh, BE `loginWithPassword` phân nhánh email/`normalizePhone`) + tab OTP; sau OTP-login
    chưa có mật khẩu → **gợi ý đặt mật khẩu có "Bỏ qua"** (`POST /auth/password/set`, `MeDto
    .hasPassword`). Luồng đặt xe đổi **từng bước: ngày giờ → check-availability công khai
    (`POST /public/booking-requests/check-availability`, dùng `OccupancyService.findOverlapping`,
    preview ADR 0006) → tên+SĐT → OTP**, bỏ email/ghi chú, prefill ngày từ "Tìm xe khả dụng".
    Sửa layout luồng đặt xe (bỏ flex-fill/sticky-footer → chuẩn form app). **Đăng xuất** ở
    `MarketHeader`. Verify: jest 85, typecheck/eslint/contract sạch. **Không migration DB.**
- **Phase 5:** `modules/notification` + `modules/review` (+ public review) đầy đủ; `modules/chat`
  (+ `conversations.controller`) đã dựng — realtime Firestore projection bật sau cờ `FIRESTORE_ENABLED`.

---

## 4. Phase 6 — Finance / Thu-Chi / Công nợ / Hợp đồng (ĐÃ XONG, giữ làm phạm vi tham chiếu)

> **Phase 6 đã đóng** (§2). Mục này giữ lại vì nó là bản mô tả phạm vi Finance đầy đủ nhất — dùng khi
> nối quyết toán đơn thuê vào Finance (epic kế tiếp, §2.1). "Việc kế tiếp" thật sự ở §2.1.

Nguồn: build plan §10 + `docs/xeprime_database_design.md` (phần finance). ID char(26) ULID · tiền
`Decimal(14,2)` → string JSON (ADR 0007) · status String + union `@xeprime/types` (ADR 0005) · mỗi
bảng dẫn xuất 1 writer.

### Backend (module mới)
| Module | API |
| --- | --- |
| Finance | `finance_categories` CRUD; `receipts` tạo/duyệt/huỷ (workflow duyệt phiếu) |
| Payments | ghi `payments`; **cập nhật `paid_amount`/công nợ của booking** (transaction) |
| Debts | list đơn còn nợ; tạo phiếu thu gạt nợ |
| Contracts | snapshot hợp đồng từ booking; export tối thiểu |

Bảng: `finance_categories`, `receipts`, `receipt_attachments`, `payments`, `debts`, `contracts`.

### Frontend (đã thay page stub bằng bản thật)
`app/(manage)/manage/{finance,receipts,debts}` nay là page thật. Phạm vi đã làm: Finance dashboard
(doanh thu/cọc/chi phí/lợi nhuận xe), Thu-Chi (thêm/duyệt/huỷ phiếu), Công nợ, Contract view
(xem/in/lưu ảnh). Phân trang/sort/filter server-side + states loading/rỗng/lỗi (quality bar).

### Done khi (§10.4)
Tạo phiếu thu/chi · phiếu cần-duyệt có workflow · booking cập nhật paid/debt đúng · dashboard tài
chính khớp dữ liệu · in/xuất hợp đồng tối thiểu chạy.

### Gợi ý chia slice (end-to-end, không nửa vời)
1. **Thu-Chi lõi**: `finance_categories` + `receipts` + workflow duyệt + FE Thu-Chi.
2. **Payments + Công nợ**: `payments` cập nhật booking paid/debt (tx) + FE Công nợ + dashboard.
3. **Contracts**: snapshot + view/in.

---

## 5. Nợ kỹ thuật / hoãn có chủ đích

| Việc | Ghi chú |
| --- | --- |
| Retrofit gate SĐT cho **mở shop** + **public xe** | Dùng lại `phone-verification` (purpose `shop_register`/`vehicle_public`), ngắn |
| SMS OTP thật | Hiện `OTP_MODE=mock`. eSMS thật cần tài khoản riêng (key prod `vf3zone` ở Secret Manager, **không lấy về local được**) → set `OTP_MODE=esms` + `ESMS_*` |
| Chat realtime | Bật sau cờ `FIRESTORE_ENABLED` + Firestore Security Rules + emulator test (ADR 0009) |
| **Provider OCR thật** (Vehicle 360) | Khung điều phối + màn đối soát đã xong; chưa có provider nào cấu hình → endpoint trả **503 `OCR_NOT_CONFIGURED`**, người dùng nhập tay. Cắm provider = implement `VehicleDocumentOcrProvider` + đổi `useClass`, không phải sửa luồng |
| **Quyết toán phụ phí chưa nối Finance** (Vehicle 360) | Quá giờ, phạt/bồi thường, nhiên liệu, nghĩa vụ nguồn xe ghi nhận được nhưng chưa thành phiếu thu/công nợ — xem epic kế tiếp §2.1 |
| **Chưa có trang nghĩa vụ theo xe** | `/manage/finance/vehicle-obligations` (thiết kế §3.2) chưa dựng; cảnh báo "sắp tới kỳ thanh toán" đã có trên hồ sơ xe |
| **Chưa có writer cho `blocked_range`** | `OCCUPANCY_SOURCE_TYPE` có 3 giá trị, `booking` + `maintenance` đã có writer; `blocked_range` và quyền `vehicles.block_schedule` vẫn treo — chủ xe chưa tự khoá lịch được |
| `operationStatus = maintenance` đặt tay vẫn chỉ là nhãn | Chặn lịch thật đi qua **phiếu bảo dưỡng** (có occupancy). Nhãn đặt tay và availability có thể lệch nhau |
| Rác R2 khi thay ảnh/file | Thay ảnh xe hoặc file riêng tư để lại object mồ côi — chưa có đường xoá |
| **Giá trị `DatePicker` diễn giải theo giờ MÁY, không phải giờ VN** | ~20 chỗ làm `values.x?.toISOString()` trên giá trị picker (đặt xe, bảo dưỡng, banner, gói). Trên máy đặt sai múi giờ, mốc gửi lên lệch đúng phần chênh — người dùng chọn 12:00 mà server nhận 12:00Z thay vì 05:00Z. Không phải sự cố đang chạy (người dùng ở VN), nhưng trái CLAUDE.md §9. Cần một helper "wall-clock → `Asia/Ho_Chi_Minh`" rồi thay cả cụm; đây là lý do `ci.yml` phải ghim `TZ`. Phần HIỂN THỊ đã đúng (`toAppTz`/`fmt.*`) sau khi sửa `rental-busy.ts` ngày 25/08 |
| Page stub `pickup-areas`, `trash` | Vỏ 5-dòng, làm ở phase liên quan sau |
| **RPO 24 giờ** | `pg_dump` hằng đêm ⇒ sự cố lúc 22h mất 19 giờ ghi. Cố ý chưa làm PITR. Khi cần: `pgBackRest` archive WAL vào `/var/backups`, máy công ty vẫn pull như cũ |
| **Bản sao ngoài VPS nằm trên một máy trạm** | Máy đó vừa dùng hằng ngày vừa giữ bản sao. Chuyển sang NAS hoặc ổ ngoài quay vòng trong 1–2 tháng |
| **R2 không được sao lưu** | `pg_dump` chỉ phủ PostgreSQL; ảnh xe và giấy tờ ở R2. Bật Object Versioning cho hai bucket |
| **`apps/mobile` chưa có trong CI** | Đã có code nhưng chưa có job lint/typecheck/test, chưa có `eas.json`. App native KHÔNG deploy lên VPS (`deployment.md` §9.5) |

---

## 6. Đọc context ở đâu (mỗi session mới)

`CLAUDE.md` (workspace) · `docs/decisions/` (ADR — thắng doc cũ) · `docs/CODEMAP.md` (cái gì ở đâu) ·
**file này** · `.claude/skills` + `.claude/agents`. Firebase-code (`../Firebase-code`, ngoài
workspace) chỉ tham chiếu nghiệp vụ, **không sửa**.
