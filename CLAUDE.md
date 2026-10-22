# XePrime — Repo dự án

Ngày tạo: 22/07/2026

## 0. Đọc file này trước khi làm bất cứ việc gì

Đây là **repo dự án XePrime** (workspace = thư mục này). Agent không có lịch sử chat trước đó — toàn bộ context nằm ở `docs/` và file này. Source cũ để tham chiếu nghiệp vụ nằm **ngoài** workspace tại `../Firebase-code` (chỉ đọc, không sửa).

## 1. Bản đồ thư mục

| Thư mục | Vai trò | Được sửa? |
| --- | --- | --- |
| `.` (repo này) | Source mới Next.js + NestJS + PostgreSQL + Prisma. Toàn bộ code mới viết ở đây. | ✅ Có |
| `docs/` | Toàn bộ tài liệu phân tích/thiết kế. Đã chuyển từ Firebase-code sang. | ✅ Có |
| `../Firebase-code/` | Source đang chạy production (Vietrent HTML/JS thuần + xeprime-functions Cloud Functions). **Chỉ dùng làm tham chiếu nghiệp vụ**, nằm ngoài workspace. | ❌ KHÔNG sửa |

Git: **thư mục này là repo** (remote `https://github.com/daihanhbvt/xeprime.git`, nhánh `main`) — mở thẳng nó làm workspace. `../Firebase-code` (gồm `Vietrent/` + `xeprime-functions/`) là các repo riêng khác để tham chiếu.

## 2. Tài liệu — đọc theo thứ tự

Nguồn sống (đọc trước, luôn đúng hiện tại):
1. `docs/design/02_PRODUCT_VISION.md` — **sản phẩm, persona và mô hình doanh thu hiện hành**.
2. `docs/completion-roadmap.md` — **đang ở đâu, release gate và việc tiếp theo**.
3. `docs/design/03_PRODUCT_GAP_ANALYSIS.md` — backlog User/Admin/Manage theo hiện trạng source.
4. `docs/decisions/` — **63 ADR (0001–0070; số đã gỡ ghi ở bảng "ADR đã gỡ" của `docs/decisions/README.md`)**; ADR Accepted mới hơn thắng trong đúng phạm vi ghi đè.
5. `docs/CODEMAP.md` — chỉ mục "cái gì nằm ở đâu".
6. File này (CLAUDE.md).
7. `docs/deployment.md`, `docs/backup-and-restore.md`, `docs/third-party-keys.md` — vận hành và dịch vụ ngoài.

Không tạo lại `docs/plans/`, file Word hoặc Excel tracking làm nguồn sự thật (plan mode ghi vào `.claude/plans/`, đã gitignore). Việc ngắn hạn đi qua issue/PR; quyết định lâu dài đi qua ADR; tiến độ chỉ đi vào một roadmap. Lịch sử dọn tài liệu ở `docs/README.md`.

### ⚠️ ADR mới thắng trong phạm vi ghi đè

Không duy trì một danh sách ADR thứ hai trong hướng dẫn này. Chỉ mục trạng thái và quan hệ ghi đè nằm ở `docs/decisions/README.md`; mô hình sản phẩm hiện hành nằm ở ADR 0028.

### Công cụ Claude (`.claude/`)

Kỷ luật code đã đóng gói thành skill/agent — **dùng chúng, đừng tự nhớ luật rời rạc**.

| Loại | Tên | Khi nào |
| --- | --- | --- |
| skill | `frontend-feature` | Trước khi viết bất cứ thứ gì ở `apps/web` |
| skill | `backend-endpoint` | Trước khi thêm/sửa endpoint/module/DTO ở `apps/api` (tài liệu Swagger đi kèm: `docs/api-docs.md` §6) |
| skill | `database-change` | Trước khi đụng `schema.prisma`/migration/seed |
| skill | `i18n` | Trước khi viết BẤT KỲ chữ nào hiện cho người dùng — và khi mở màn hình còn chuỗi tiếng Việt thô thì chuyển luôn màn đó |
| skill | `shared-code` | Khi thấy logic/giá trị lặp lần 2, hoặc code cross-tuyến web↔api |
| skill | `verify-changes` | Trước khi chạy build/lint/test/typecheck — chỉ xác minh phần vừa sửa, không quét cả workspace |
| agent | `navigator` (haiku) | Định vị file/symbol cần đọc mà không quét cả file — tiết kiệm token |
| agent | `reviewer` (opus) | Review diff theo chuẩn senior trước khi commit |
| command | `/commit` | Người dùng gõ tay sau khi review — chạy trọn quy trình Git: cập nhật `develop` → tạo branch → add (theo đường dẫn khi cây làm việc dùng chung) → gộp vào commit chưa push hoặc commit mới → push branch (KHÔNG merge, KHÔNG force). Quy ước ở `docs/git-workflow.md` |

Skill tự kích hoạt theo mô tả; nếu quên thì gọi tay. `navigator` đọc `docs/CODEMAP.md` trước tiên.

**Mức chất lượng:** làm ra **product hoàn thiện**, không phải làm-cho-xong-task. List lớn → phân trang/filter/sort server-side + index (thiếu thư viện thì cài); đủ trạng thái loading/rỗng/lỗi; xử lý edge case; thao tác fail-một-phần bọc transaction. Không để lại bug đi vá sau. Token là thứ yếu so với đúng và đủ.

## 3. Kiến trúc đã chốt — không được tự đổi

| Hạng mục | Quyết định |
| --- | --- |
| Repo | Monorepo pnpm workspace: `apps/web`, `apps/api`, `apps/worker`, `packages/{types,validators,api-client,domain,config,ui}`, `prisma`, `docs` |
| Frontend | Next.js App Router + TS strict, route groups `(public)` `(auth)` `(manage)` `(admin)`, Server Components mặc định |
| Bề mặt sản phẩm | **ADR 0051 · ADR 0053** — web: MỘT Next app, BA SITE theo host, mỗi site một **không gian tài khoản (realm)**: `xeprime.vn` khách (`customer`, `app/(public)`) · `partner.xeprime.vn` gian hàng gói + chủ xe tuyến hoa hồng/Owner Lite (`partner`, `app/(manage)/manage`) · `admin.xeprime.vn` nhân sự nền tảng (`platform`, `app/(admin)/admin`). URL hiển thị KHÔNG mang tiền tố thư mục; đường dẫn dựng qua `apps/web/src/zones/` (chế độ `path` ở dev, `host` ở staging/prod), khu của trang đọc bằng `useZone()`. Cùng SĐT/email/Google ở hai site là HAI tài khoản, mật khẩu riêng. Mobile: HAI Expo project mỏng + một package dùng chung — `apps/mobile/customer` (XePrime `vn.xeprime.mobile`) · `apps/mobile/manage` (XePrime Partner `vn.xeprime.partner`) · `apps/mobile/shared` (ADR 0051 §5). Quyền, tuyến và realm do server quyết. KHÔNG tách thêm Next app/Expo project/BFF/DB khi chưa chạm điều kiện "Cần xem lại" của ADR |
| UI | Ant Design + `@ant-design/nextjs-registry`. Style riêng dùng **CSS Modules + AntD token** — ADR 0003. Design token (`XP_TOKENS` + `tokens.css`) sống ở `@xeprime/ui` — dùng chung web + app native, export gốc platform-free |
| Form | React Hook Form + Yup + `@hookform/resolvers` |
| State | Redux Toolkit = UI/client state · TanStack Query = server data/cache · **URL searchParams = filter/paging** — ADR 0004 |
| Calendar | Custom resource-timeline scheduler: `@tanstack/react-virtual` + `@dnd-kit`, qua abstraction `CalendarScheduler` |
| Backend | NestJS modular monolith (KHÔNG microservices), Express adapter |
| DB | **PostgreSQL 16** + Prisma — ADR 0001. ID `String @id @db.Char(26)` (ULID), snake_case `@@map`/`@map`, tiền `Decimal @db.Decimal(14,2)`, thời gian `@db.Timestamptz(3)`, JSON dùng `jsonb`, status là String (union type ở `packages/types` — ADR 0005) |
| Chống trùng lịch | Bảng `vehicle_occupancies` + `EXCLUDE USING gist` — ADR 0006. **Không** dựa vào check ở tầng app |
| Auth (web) | Site khách/partner: **SĐT + mật khẩu** (định danh email bị SERVER từ chối — `PHONE_LOGIN_REQUIRED`) hoặc Google/Facebook; đăng ký xác minh OTP ngay; **OTP chỉ để xác minh SĐT (đăng ký · quên mật khẩu · cổng xác minh), không bao giờ tạo tài khoản hay cấp phiên** — ADR 0060. Google/Facebook đi qua **OAuth do backend chủ trì** (`GET /auth/social/:provider`, authorization code + PKCE ở server — ADR 0019; realm của luồng ghi trong `oauth_states`, callback quay về đúng site). Site quản trị: email + mật khẩu. Mọi đường đều kết thúc bằng **httpOnly session cookie HOST-ONLY của đúng site**, tên `<SESSION_COOKIE_NAME>_<realm>` — ADR 0002 · 0053. Trình duyệt gọi API ở `/api` CÙNG ORIGIN; realm của request do Caddy gắn theo host kèm `REALM_PROXY_SECRET` (dev: `proxy.ts` + cờ `REALM_HEADER_FROM_CLIENT`) — không bao giờ do client tự khai |
| Hai tuyến ĐĂNG KÝ | Cửa vào lưu ở `tenants.onboarding_state` (`commission` · `package_pending` · `package_active`) — ADR 0040. `POST /tenants` nhận `registrationTrack`; đăng ký cả hai tuyến diễn ra ở SITE PARTNER (`/register` → `/onboarding?track=`); tuyến gói KHÔNG nhận gói hoa hồng tạm và chỉ vào được `/onboarding` của site partner cho tới khi hoá đơn `paid`. Một tài khoản đối tác thuộc tối đa MỘT gian hàng (ADR 0053). Mốc hoàn tất ghi trong CHÍNH transaction bật thuê bao |
| Firebase | **CHỈ** chat realtime (custom token + Firestore projection — ADR 0009) và `apps/worker`. KHÔNG còn nằm trên đường đăng nhập |
| Auth (native) | `Authorization: Bearer <accessToken>` — access token JWT 15 phút, refresh token opaque xoay vòng, phiên thu hồi được theo thiết bị. Endpoint `/auth/mobile/*` — ADR 0017 |
| Client HTTP | `@xeprime/api-client` = **hạ tầng HTTP dùng chung** (client, phong bì `{data,meta}`, phân trang, `ApiClientError`, `AuthTransport`, `queryKeys`) — KHÔNG còn lời gọi theo nghiệp vụ. Web `credentials: 'include'`, native header Bearer; cấu hình ở `apps/web/src/services/api-client.ts` và `apps/mobile/shared/src/lib/api-client.ts` |
| Tầng gọi API theo nghiệp vụ | **Mỗi app một bản, ADR 0031**: native ở `apps/mobile/shared/src/api/<feature>/`; web viết trong chính file api của feature (`apps/web/src/features/<feature>/api.ts`, `services/auth.service.ts`). Sửa một contract dùng chung ⇒ **sửa CẢ HAI bản**, không còn tự đồng bộ |
| Logic nghiệp vụ dùng chung | `@xeprime/domain` — tiền trên chuỗi · múi giờ + thời lượng thuê · lịch bận · nguyện vọng nhận xe. Framework-free, Metro đọc được; `apps/web/src/lib/*` là re-export shim |
| API type | FE import từ `packages/types/src/api.generated.ts` sinh bằng `openapi-typescript` — ADR 0007 |
| RBAC | Role/permission lưu DB, **guard backend là nguồn bảo vệ chính** |
| Thuê dài hạn | **Gói cố định** 1/2/3/6/9/12 tháng; ngày trả = ngày nhận + N **tháng lịch** (server tính, client không gửi); khách nêu nguyện vọng ngày nhận, gian hàng chốt lịch khi duyệt; ưu đãi cam kết thời hạn theo THÁNG, không cộng dồn — ADR 0011 |
| Doanh thu | **Hai tuyến trên MỘT chợ** — ADR 0028 · 0064 · 0065. Mọi đơn, cả hai tuyến: khách trả **phí sàn `S` cố định** theo loại xe (50.000đ ô tô · 30.000đ xe máy, dữ liệu `fee_policies`). Basic Owner: không thuê bao, **hoa hồng `H` lũy tiến theo NGÀY** trừ vào tiền chủ xe (10% ngày 1–2 · 7% ngày 3–7 · 3% ngày 8–30 · 0% từ ngày 31; nấc là dữ liệu `fee_policies.owner_commission_tiers`, `computeTieredOwnerCommission`) + Owner Lite. Gian hàng: gói theo **LOẠI XE** (ADR 0065 — `moto_1/5/10` · `car_1/5/10` · `enterprise_contact` bán bằng tư vấn; tối đa MỘT gói xe máy + MỘT gói ô tô cùng lúc, doanh nghiệp loại trừ cả hai; có một gói hiện hành ⇒ cả gian hàng tuyến gói), `H = 0` + Full Manage. Phí sàn, hoa hồng, thuế, bảo hiểm là các dòng riêng; mode/policy đóng băng vào booking |
| Tiền vào nền tảng | **ĐÃ triển khai trên `develop`** (PR #57): SePay đối soát các khoản vào qua MỘT bảng `bank_transactions`, phân loại đích bằng tiền tố mã (`XPG…` gói · `XPH…` giữ chỗ). Webhook công khai không session có khoá time-safe, idempotent bằng unique DB và trả 200 khi nhận lại giao dịch — ADR 0022/0028. Writer duy nhất: `SepayService`. **MoMo/VNPAY là phương thức BỔ SUNG** (ADR 0058 — Proposed, mặc định tắt): sổ riêng `payment_gateway_orders` (writer `PaymentGatewayService`), tiền áp qua CÙNG `applyBankPaymentWithinTx` của SePay; production từ chối boot nếu bật cổng cho BẤT KỲ luồng nào khi ADR còn Proposed |
| Huỷ của chủ xe | Quyền huỷ theo CHẶNG — ADR 0045 điều 1. `pending_host_approval` dùng **Từ chối** (không chạm tiền); `awaiting_hold` dùng **Huỷ chuyến** (`POST /booking-requests/:id/cancel`: đóng hold, nhả lịch, hoàn phần đã chuyển, ghi trách nhiệm — MỘT transaction); đơn `reserved`/`confirmed` huỷ qua transition kèm `reasonCategory`, hoàn 100%; đơn `active` **KHÔNG huỷ** (`BOOKING_CANCEL_NOT_ALLOWED`) — đường đúng là bàn giao trả xe sớm rồi quyết toán. `booking_cancellations` là writer duy nhất của trách nhiệm, và `responsible_party` do SERVER suy |
| Uy tín gian hàng | BA chỉ số công khai (tỉ lệ phản hồi · thời gian phản hồi · nhận-và-giữ chuyến), cửa sổ 90 ngày, dưới `HOST_METRIC_MIN_SAMPLES` mẫu (hạ 5 → **1** ngày 23/09/2026) thì `null` chứ không phải 0; `0` mẫu thì luôn `null` — ADR 0045 điều 3. **Nguồn tính duy nhất là `HostMetricsService`**; sổ ví dùng cùng phép phân loại, chỉ đổi cửa sổ và ngưỡng |
| Thứ tự đặt xe | **Gửi yêu cầu → DUYỆT → thu tiền giữ chỗ → ĐƠN THUÊ** (ADR 0044). Gửi yêu cầu KHÔNG thu tiền và KHÔNG chiếm lịch, và cần phiên TÀI KHOẢN KHÁCH có SĐT đã xác minh — danh tính người thuê đọc từ tài khoản, không từ payload; khách chưa đăng nhập được mời đăng nhập ở bước Chuyến đi, bản nháp giữ ở `sessionStorage` và KHÔNG tự gửi (ADR 0060). Lượt duyệt (tay hoặc "Đặt ngay", cùng một đường `commitDecision`) mới chốt lịch, chốt giá, giữ xe và phát QR ⇒ `awaiting_hold`. **Đơn thuê ra đời DUY NHẤT khi đối soát xác nhận đủ tiền** — không bao giờ vì một cú bấm hay một lượt quét QR. Khung giờ đã mất ⇒ các yêu cầu còn chờ đóng bằng `slot_taken` |
| Bằng lái khách | **Thuê tự lái / dài hạn cần bằng lái ĐÃ XÁC THỰC của TÀI KHOẢN khách** — ADR 0057. Nộp ảnh mặt trước MỘT lần (`customer_driver_licences`, writer duy nhất `DriverLicencesService`); bộ đọc ảnh (`DriverLicenceReader` — Tesseract chạy NGAY TRONG tiến trình API, không bên thứ ba) chỉ kể lại, `decideFromReading` quyết tự xác thực / tự từ chối — KHÔNG còn chờ người duyệt (ADR 0070), bộ đọc lỗi ⇒ từ chối `reader_unavailable`; bằng quốc tế/nước ngoài tự xác thực khi máy nhận ra đúng là bằng lái (không hạng/hạn — chủ xe đối chiếu lúc giao xe), ảnh không có dấu hiệu bằng lái nào bị từ chối ngay. Cổng ở `submitPublic`: đúng hạng cho loại xe (`licenceClassCoverage`) và còn hạn tới hết ngày cuối chuyến (`licenceTripLastDayKey`). Gửi yêu cầu luôn cần tài khoản khách (ADR 0060), nên cổng soát đúng bằng của tài khoản đó. Công tắc `DRIVER_LICENCE_ENFORCEMENT` |
| Tài xế | **Tài xế là TÀI KHOẢN KHÁCH được bên thuê mời liên kết** — ADR 0063. `drivers` là liên kết (bên thuê ↔ tài khoản khách, `invited/active/suspended/declined/ended`), mời bằng SĐT ĐÃ XÁC MINH; cả gian hàng lẫn chủ xe tuyến hoa hồng dùng được. Chỉ đơn `with_driver` mang tài xế; lượt gán `pending` chờ tài xế nhận ở app/web khách (`/driver/*`) trong hạn `driver_respond_by` = clamp(10%·ΔT, 15′, 60′) — quá hạn thì worker nhả lượt (kết cục `expired`) và báo khẩn gian hàng gán người khác, KHÔNG huỷ đơn (ADR 0066 điều 4). Bên thuê cũng có thể ghi **tài xế ngoài hệ thống** (tên + SĐT trên ĐÚNG đơn, không tài khoản, coi là đã nhận, loại trừ với tài xế liên kết, không chống trùng lịch); đơn thiếu tài xế sát giờ KHÔNG tự huỷ — worker nhắc khẩn một lần ở mốc còn 2 giờ (ADR 0067); chống trùng lịch theo NGƯỜI bằng EXCLUDE `bookings_driver_user_schedule_excl`. Writer duy nhất: `DriversService` |
| Tiền giữ chỗ | **ADR 0064 · ADR 0066.** Khách trả online **tiền giữ chỗ** `= S + H + IV + IP + max(roundVnd(depositPercent% × B), sàn cọc)` (15% tiền thuê `B`, sàn 0 ở chính sách v8), nâng tới đủ `S + H + IV + IP + T` và `holdMinAmount`, kẹp ở tổng khách, RỒI mới trừ mã `P` (`computeCustomerFees`); `D` = phần đó trừ `S + H + IV + IP`. Phần còn lại + phí giao xe `G` trả TRỰC TIẾP chủ xe lúc nhận xe, XePrime không thu hộ. Thuế `T` khấu trừ, nộp thay theo NĐ 117/2025 + 68/2026 (ADR 0068): GTGT + TNCN tách riêng theo LOẠI DỊCH VỤ — tự lái/dài hạn 5% + 2% = 7%, có tài xế 3% + 1,5% = 4,5% (`fee_policies.tax_rates`, v9); chỉ chủ thể cá nhân/hộ kinh doanh, **doanh nghiệp `T = 0`**, chưa có hồ sơ người bán ⇒ coi là cá nhân; cơ sở = tiền thuê `B`, **không gồm phí giao xe**; khấu trừ khỏi tiền chủ xe (`D − T` vào ví), KHÔNG cộng vào tổng khách. Tiền tính ra từ tỷ lệ (`H`, phần giữ chỗ, GTGT, TNCN) đúng tới ĐỒNG (`roundVnd`); chỉ khoản giảm giá theo % làm tròn LÊN 1.000đ; số cấu hình là bội 1.000đ (ADR 0069). Cửa sổ thanh toán và huỷ miễn phí **ĐỘNG theo `ΔT = pickupAt − acceptedAt`** (`holdWindowsFor`): `T_pay` = clamp(30%·ΔT, 15′, 120′) · `T_cancel` = clamp(20%·ΔT, 15′, 2h); cả hai tính XUÔI từ `acceptedAt`, kẹp bởi `pickupAt`, **không gia hạn**, nhắc ở mốc còn 60′ và 15′ (ADR 0044). Hạn chủ xe phản hồi yêu cầu: 240′ nếu `pickupAt − createdAt ≥ 24h`, ngược lại clamp(20%·ΔT, 15′, 240′) (`bookingRequestRespondBy`). Huỷ muộn / no-show: chủ xe nhận TRỌN `D`, XePrime giữ `S + H − P`, `IV + IP` hoàn 100%, không thuế. Mức cọc do nền tảng đặt ở `fee_policies`; gian hàng chỉ có công tắc bật/tắt thu cọc — ADR 0033 |
| Bảo hiểm chuyến | `IV` (vật chất xe) và `IP` (tai nạn người) đều **tuỳ chọn**, khách tự tích, biểu phí THEO NGÀY theo loại xe ở `fee_policies`. Server chỉ cộng khi dòng chính sách bật **và** `INSURANCE_PARTNER` khác `none`; production để `none` cho tới khi có hợp đồng + adapter thật ⇒ ẩn ô tích, không thu đồng nào; dev/staging dùng `MicMockInsurancePartner` phát GCN nhãn **TEST** qua worker. Phát hành ở mốc bàn giao, huỷ trước nhận xe hoàn 100% — ADR 0064 điều 10 · ADR 0032 điều 4 |
| Mã khuyến mãi | **Do NỀN TẢNG tài trợ** — ADR 0046. Chỉ admin nền tảng phát hành (`platform.promo_codes.manage` + `@PlatformOnly()`); gian hàng không có endpoint nào. Mã giảm số khách trả nhưng **KHÔNG bớt tiền gian hàng**: nó chỉ trừ vào khoản khách chuyển ONLINE, SAU phép tính tiền giữ chỗ (`holdAmount = grossOnline − P`, trần tài trợ `D + S + H` — ADR 0064 điều 6), còn `B`, `S`, `H`, `T`, `IV`, `IP`, `D`, `payAtPickup`, `ownerPayable` giữ nguyên. Tính trên tiền thuê SAU khuyến mãi trực tiếp của xe (cộng dồn được); một mã cho một yêu cầu. Lượt dùng GIỮ (lúc gửi) → CHỐT (lúc có đơn) → NHẢ (yêu cầu chết) |
| Số dư | **MỘT ví cho một TÀI KHOẢN** (ADR 0053 điều 8, thay "một người một ví" của ADR 0038) — tài khoản khách: ví `user` (tiền hoàn chuyến đi thuê); tài khoản đối tác là chủ gian hàng: ví thuộc TENANT, giữ nguyên khi nâng gói; nhân viên gian hàng: không có ví. Cùng một người có tài khoản khách và tài khoản đối tác thì có HAI ví, không bao giờ gộp. `wallets`/`wallet_entries`/`withdrawal_requests` là **sổ công nợ phải trả**, hiển thị là **"Ví điểm"** (1 điểm = 1đ): không nạp/chuyển/thanh toán nội bộ, **không hết hạn, không thu hồi**; ledger append-only (sửa bằng dòng đảo); rút về tài khoản ngân hàng qua admin chuyển tay — ADR 0033. `balance` = KHẢ DỤNG, phần đang rút nằm ở `pending_withdraw_amount` |
| Đa ngữ | `next-intl` KHÔNG locale routing; hai ngôn ngữ `vi`/`en` dùng CHUNG url; locale ở cookie `XP_LOCALE` (httpOnly) đọc phía server; tiền luôn VND, múi giờ luôn `Asia/Ho_Chi_Minh` — ADR 0012 |
| Chat | **PostgreSQL là source of truth** (mọi tin/thành viên/đính kèm/đã đọc); Firestore chỉ là projection realtime ~30–50 tin gần nhất; đồng bộ outbox/retry; attachment ở Cloudflare R2 — ADR 0009 |
| Deploy MVP | 1 VPS mỗi môi trường (staging 6GB, production ≥8GB) — `docs/deployment.md` §1 |
| CD | Merge `develop`→`staging`→`main` là deploy tự động. Build ở GitHub Actions → GHCR → VPS chỉ `pull`. Image mang nhãn MÔI TRƯỜNG vì `NEXT_PUBLIC_*` nhúng cứng lúc build ⇒ **không dùng chéo giữa hai môi trường**. Chi tiết: `docs/deployment.md` §9 |
| Env production | Sinh tự động từ GitHub Environment mỗi lần deploy. **Sửa tay trên VPS sẽ bị ghi đè** |
| Sao lưu | `pg_dump` hằng đêm trên VPS (giữ 14 ngày) · máy công ty PULL hằng tuần qua SFTP chỉ-đọc (giữ 12 tuần). KHÔNG dùng cloud object storage, KHÔNG PITR ở giai đoạn này — `docs/backup-and-restore.md` |

## 4. Quyết định package (chốt trong session 22/07/2026)

Tài liệu để mở một số chỗ, đã chốt như sau:

| Vấn đề | Chốt | Lý do |
| --- | --- | --- |
| Validation backend | `class-validator` + `class-transformer` | `@nestjs/swagger` sinh OpenAPI tự động từ decorator. Zod phải thêm lib bắc cầu và Swagger mất chính xác |
| Validation env | `zod` | Type inference tốt hơn joi |
| Validation frontend | `yup` | Bắt buộc theo tài liệu |
| Test runner | Jest cho `apps/api` · Vitest cho `apps/web` | Default của từng hệ sinh thái; Vitest + decorator NestJS là nguồn lỗi không đáng |
| HTTP adapter | Express (không Fastify) | `firebase-admin` + middleware ecosystem hợp Express hơn |
| Icons | Chỉ `@ant-design/icons` | Bỏ `lucide-react` — 2 bộ icon là nợ kỹ thuật |
| Styling | CSS Modules | AntD v5 đã có CSS-in-JS riêng; thêm styled-components là 2 runtime chồng nhau và ép `'use client'` khắp nơi — ADR 0003 |

Bổ sung ngoài tài liệu, đã thống nhất đưa vào base:
`turbo` (task runner monorepo) · `@nestjs/terminus` (health ping DB) · `@nestjs/throttler` + `helmet` (rate limit/CORS theo production checklist) · `nestjs-pino` + `pino-http` (log có cấu trúc + request-id) · `ulid` (sinh ID char(26)) · `husky` + `lint-staged` · `@tanstack/react-query-devtools` · `cookie-parser` (ADR 0002) · `openapi-typescript` (ADR 0007).

> ⚠️ Sửa 29/08/2026: bản trước ghi `@testcontainers/postgresql`. **Gói đó chưa bao giờ được cài và
> không có dòng code nào dùng.** Test `apps/api` chạy trên một Postgres THẬT ở `TEST_DATABASE_URL`
> (`apps/api/test/setup-test-db.ts`); `REQUIRE_DB=1` làm test đỏ khi thiếu DB, không có thì spec tự
> bỏ qua. Đừng đi tìm container.

## 5. Cấm tuyệt đối

- ❌ Sửa source `../Firebase-code/`
- ❌ `redux-saga` ở MVP
- ❌ FullCalendar Premium / Bryntum / bất kỳ thư viện calendar tính phí nào
- ❌ `react-big-calendar` cho màn lịch chính
- ❌ `styled-components` — dùng CSS Modules + AntD token (ADR 0003)
- ❌ Inline style — ngoại lệ duy nhất: CSS custom property cho giá trị chỉ biết lúc runtime (vị trí event bar trên lịch)
- ❌ Hard code role/status/permission/text nghiệp vụ trong component — dùng `packages/types` + `constants/`
- ❌ String literal trần cho status — luôn `BOOKING_STATUS.ACTIVE`, không bao giờ `'active'` (ADR 0005)
- ❌ API tenant-sensitive nhận `tenant_id` từ body/query — backend lấy từ membership/scope
- ❌ Nhét role/permission/tenant_id vào session JWT — quyền luôn đọc từ DB mỗi request (ADR 0002)
- ❌ Nhét quyền/tenant/PII vào access token native — claim chỉ có `sub`/`sid`/`typ`/`aud`/`iat`/`exp` (ADR 0017)
- ❌ Lưu token ở `localStorage`/`AsyncStorage` — refresh token native CHỈ ở Keychain/Keystore (ADR 0017)
- ❌ Ghi refresh token thô vào DB/log/message lỗi — chỉ SHA-256 của nó (ADR 0017)
- ❌ Import `next/*`, `antd`, DOM API, `File`, `XMLHttpRequest`, CSS, hay React UI vào `packages/api-client` / `packages/domain` / `apps/mobile/shared/src/api` — Metro không đọc được, và đó là lý do hai package đó tồn tại
- ❌ Đưa lời gọi theo nghiệp vụ (đường dẫn endpoint, serialize bộ lọc, alias DTO) trở lại `packages/api-client` — nó chỉ còn hạ tầng HTTP (ADR 0031)
- ❌ Sửa một feature ở `apps/mobile/shared/src/api/` rồi coi là xong khi web cũng có bản của feature đó — hai bản KHÔNG tự đồng bộ (ADR 0031)
- ❌ Đọc `process.env` trong package dùng chung — app truyền cấu hình vào (`configureApiClient({ baseUrl })`)
- ❌ Client tự set `approved_public` / `tenant.status` / quyết định lịch trống
- ❌ Module khác `ListingsService` ghi vào `public_listings` (ADR 0008)
- ❌ Module khác `OccupancyService` ghi vào `vehicle_occupancies` (ADR 0006)
- ❌ Dùng `number` cho tiền — `Decimal` ở BE, string ở JSON (ADR 0007)
- ❌ Nhân `số tháng × 30` để suy lịch hay giá gói thuê dài hạn — dùng `addCalendarMonthsVn` / `longTermPackages` (ADR 0011)
- ❌ Tính giá một bậc gói bằng phép NHÂN (đơn giá × số xe × số tháng, rồi trừ %) — giá của mỗi kỳ hạn là con số TUYỆT ĐỐI admin gõ ở `limits.termPrices`; % "tiết kiệm" chỉ là phép so sánh hiển thị và không bao giờ vào một dòng tiền (ADR 0041 điều 2)
- ❌ Đọc hạn mức của một thuê bao từ `plan.limits_json` — đọc `tenant_subscriptions.quota_json` trước, và bằng biểu thức TƯỜNG MINH: `quota ? quota.maxVehicles : limits.maxVehicles`. `?? ` sẽ đọc một `null` nghĩa "không giới hạn" thành "chưa khai" (ADR 0041 điều 3)
- ❌ Cộng trần hai loại xe của tuyến gói thành một con số, hay để gói ô tô che xe máy (và ngược lại) — trần gói đếm THEO LOẠI trong phạm vi của chính gói đó; chỉ trần Owner Lite (tuyến hoa hồng, 3 xe) là TỔNG hai loại (ADR 0065 điều 3 · ADR 0041 điều 4)
- ❌ Cho gian hàng giữ hai gói cùng phạm vi chồng nhau, hay `enterprise_contact` chồng lên gói ô tô/xe máy — gác bằng EXCLUDE ở DB, không bằng `if` ở tầng app; mỗi (tenant, phạm vi) một hoá đơn mở (ADR 0065 điều 2, 6)
- ❌ Cho gian hàng tuyến gói tạo/gửi lên chợ một loại xe mà nó không có gói hiện hành, hay cho xe của loại đó rơi về tuyến hoa hồng — trần loại chưa có gói là 0; một gói hiện hành bất kỳ đưa cả gian hàng vào tuyến gói (ADR 0065 điều 4–5)
- ❌ Dựng lại trần chi nhánh (`maxBranches`) như một hạn mức gói (ADR 0065 điều 1)
- ❌ Cho tenant tự mua một bậc `salesOnly`, hay gán tay nó mà không nhập giá đàm phán — `PLAN_NOT_SELF_SERVE` và `price` bắt buộc (ADR 0041 điều 5)
- ❌ Trưng chênh lệch giá dài hạn ↔ giá ngày như một khuyến mãi, hay hiện `discountPercent` (của TỰ LÁI) khi khách đang chọn dài hạn (ADR 0011)
- ❌ Gọi phí dịch vụ XePrime là thuế/bảo hiểm, hoặc thu bảo hiểm khi chưa có partner + policy + chứng nhận thật — ADR 0028
- ❌ Cộng `IV`/`IP` vào báo giá khi `INSURANCE_PARTNER = none`, tin lựa chọn bảo hiểm client gửi lên khi cổng đóng, hay bật `mic_mock` ở production — cổng ở SERVER; tắt thì ẩn hẳn ô tích (ADR 0064 điều 10)
- ❌ Trả `ownerCommissionAmount` / `ownerNetAmount` / `ownerPayableAmount` / `platformRetainedAmount` / `taxAmount` ra báo giá công khai hay giao diện khách — chỉ bề mặt đối tác và quản trị đọc các dòng phía chủ xe (ADR 0064 điều 11)
- ❌ Dùng một `commissionPercent` để đại diện cả phí dịch vụ, thuế, bảo hiểm và tiền phải trả chủ xe — từng dòng có chủ sở hữu và snapshot riêng (ADR 0028)
- ❌ Đồng nhất `hold_amount` với `platform_service_fee` — chúng có thể bằng nhau ở một policy nhưng không phải quy tắc (ADR 0028)
- ❌ Đọc `booking_holds.purpose` để quyết định phần tiền GIỮ HỘ — một hold chứa tiền của nhiều người (`S` của XePrime, `D` của chủ xe, `IV`/`IP` của hãng bảo hiểm). Tách quỹ đọc từ NĂM CỘT số tiền `D`/`S`/`H`/`IV`/`IP` (ADR 0033 điều 4 · ADR 0064 điều 5)
- ❌ `?? BILLING_MODE.PACKAGE` khi tenant thiếu gói hiện hành — dùng `resolveEffectiveBilling` (4 pha). `unconfigured` KHÔNG phải một tuyến: đường đọc hiển thị chưa xác định, đường ghi tiền từ chối (ADR 0038 điều 1)
- ❌ Phân biệt hai tuyến ĐĂNG KÝ bằng prop component, `?next=`, state router, hay "đã có gói hay chưa" — cả bốn đều chết sau một lần F5. Cửa vào là DỮ LIỆU (`tenants.onboarding_state`), gửi lên bằng `registrationTrack` (ADR 0040 điều 1)
- ❌ Gán gói hoa hồng tạm cho người đăng ký tuyến GÓI — nó biến họ thành chủ xe tuyến hoa hồng ở mọi nơi đọc `billingMode` (khu làm việc, nhãn tài khoản, trần 3 xe). Họ nhận gói THẬT lúc tiền về (ADR 0040 điều 2)
- ❌ Ghi mốc hoàn tất onboarding gói ngoài transaction bật thuê bao, hay mở Manage vì người dùng bấm "Tôi đã chuyển khoản" — kích hoạt là việc của webhook SePay (ADR 0040 điều 3)
- ❌ Lùi `onboarding_state` từ `package_active` về `package_pending`/`commission` khi gói hết hạn, hay mời một gian hàng hết gói vào wizard "Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ" — họ là khách cũ cần gia hạn (ADR 0040 điều 4)
- ❌ Đặt xác minh pháp nhân làm cổng MUA GÓI, hay đánh `verification = verified` vì tiền đã về — thanh toán mở tuyến gói, không mở trục kiểm duyệt (ADR 0040 điều 5 ghi đè ADR 0036 điều 4)
- ❌ Dùng `missingShopProfileRequirements` làm cổng đăng xe, hay bắt chủ xe tuyến HOA HỒNG phải có logo — cổng đăng xe của gian hàng trả phí là `missingPackageShopListingRequirements` (ADR 0040 điều 7)
- ❌ Gộp ví của hai tài khoản (khách + đối tác) của cùng một người, hay ghi tiền hoàn chuyến đi thuê vào ví gian hàng — tiền hoàn LUÔN vào ví của TÀI KHOẢN KHÁCH đã đặt chuyến, qua `resolveRefundWalletOwner` (ADR 0053 điều 8, bỏ ADR 0038 điều 2)
- ❌ Gác ví/tài khoản ngân hàng của gian hàng bằng một khoá `PERMISSION` — permission uỷ quyền được; dùng `@ShopOwnerOnly()` (ADR 0038 điều 3)
- ❌ Để ranh giới hai TUYẾN đi qua `PLAN_FEATURE_ENFORCEMENT` — công tắc đó chỉ gác đợt rollout hạ cấp năng lực. Ranh giới tuyến dùng `@SubscriptionTrackOnly()`, chặn thật ngay (ADR 0038 điều 4)
- ❌ Cho tài khoản đối tác/quản trị đặt xe, hay cho khách đặt xe của chính gian hàng mình — đặt xe chỉ ở realm `customer`; tự đặt xe chặn bằng phép so SĐT ĐÃ XÁC MINH giữa tài khoản khách và chủ/thành viên gian hàng, ở backend (ADR 0053 điều 7). Ẩn nút không phải kiểm soát quyền
- ❌ Cấp phiên hay tạo tài khoản vì một mã OTP đúng, ở bất kỳ endpoint nào — OTP chỉ xác minh SĐT; đăng nhập OTP đã gỡ, route cũ trả 410 `OTP_LOGIN_RETIRED` (ADR 0060)
- ❌ Nhận email làm định danh đăng nhập ở site khách/partner, hay chỉ ẩn ô email ở form mà server vẫn nhận — trả `PHONE_LOGIN_REQUIRED` (ADR 0060)
- ❌ Đọc tên/SĐT/email người thuê từ payload đặt xe — đọc từ tài khoản của phiên; trường cũ trong DTO chỉ còn để app cũ không vỡ và bị bỏ qua (ADR 0060)
- ❌ Đặt bản nháp đặt xe vào URL hay `localStorage`, tự gửi yêu cầu sau khi đăng nhập xong, hay coi `/auth/me` trong cache là "vừa đăng nhập" — khách tự bấm gửi; so `dataUpdatedAt` với mốc mời đăng nhập (ADR 0060)
- ❌ Để `password_reset` trả lời hay đếm cooldown khác nhau giữa số có và không có tài khoản, hay cấp phiên sau khi đặt lại mật khẩu (ADR 0060)
- ❌ Mời thành viên gian hàng bằng email, hay cho nhận lời mời khi SĐT của tài khoản chưa xác minh / khác số được mời (ADR 0060)
- ❌ Cho tenant/user có ví bị xoá cứng (`deleteMany`) — `wallets.owner_*` là `RESTRICT`; gỡ nghĩa vụ tường minh trước
- ❌ Ghi dòng sổ ví ngoài `WalletService` — module khác gọi `creditWithinTx(...)` trong transaction của chính mình (ADR 0033 điều 6)
- ❌ Ghi `customer_driver_licences` ngoài `DriverLicencesService`, hay đánh `verified` khi bộ đọc chưa chạy / bị lỗi — thiếu bộ đọc thì lượt nộp bị từ chối `reader_unavailable` để khách nộp lại, KHÔNG BAO GIỜ tự xác thực; không dựng lại hàng đợi duyệt tay (ADR 0057 · ADR 0070)
- ❌ Ghi `sales_follow_ups` ngoài `PlatformFollowUpsService`, hay để tab "Cần chăm sóc" đổi trạng thái yêu cầu/đơn — nó chỉ ghi kết quả gọi lại, kèm audit (ADR 0070)
- ❌ Suy "lái được ô tô / xe máy" từ một bảng hạng không xét NGÀY CẤP — `B1` mẫu cũ là ô tô, `B1` mẫu 2025 là mô tô ba bánh; dùng `licenceClassCoverage` (ADR 0057 điều 3)
- ❌ Cho điểm hết hạn, thu hồi điểm, hay cộng điểm khuyến mãi vào `wallets.balance` — đó là sổ công nợ phải trả, khuyến mãi (nếu có) là bảng KHÁC (ADR 0033 điều 1)
- ❌ Hiểu `wallets.balance` là tổng nghĩa vụ — nó là phần KHẢ DỤNG; tổng = `balance + pending_withdraw_amount` (ADR 0033 điều 6)
- ❌ Cộng `IV`/`IP`/thuế/hoa hồng vào sai phía: `S`, `IV`, `IP` do KHÁCH trả; `H` và thuế `T` do CHỦ XE chịu và không bao giờ cộng vào tổng khách (ADR 0032 điều 3 · ADR 0064 điều 1)
- ❌ Tính thuế `T`, hoa hồng `H` hay phần 15% tiền giữ chỗ trên phí giao xe `G`, hay đưa `G` vào khoản QR — phí giao xe khách trả TAY cho chủ xe lúc nhận xe (ADR 0064 điều 4, 9)
- ❌ Tính hoa hồng bằng một % phẳng trên cả chuyến, hay làm tròn từng ngày — nấc lũy tiến theo ngày đọc từ `fee_policies`, làm tròn tới ĐỒNG MỘT lần trên tổng (`computeTieredOwnerCommission`, ADR 0064 điều 3 · ADR 0069)
- ❌ Làm tròn một khoản TÍNH RA (hoa hồng, phần giữ chỗ, thuế, phí giao xe theo km) tới 1.000đ — đó là đổi số tiền thật; chỉ số cấu hình và khoản giảm giá theo % (làm tròn LÊN) được dùng bước 1.000đ (ADR 0069)
- ❌ Khấu trừ thuế một mức chung cho mọi chuyến, gộp GTGT với TNCN, hay khấu trừ thuế của chủ thể doanh nghiệp — mức theo loại dịch vụ, hai sắc thuế riêng, chỉ cá nhân/hộ (ADR 0068)
- ❌ Tính `freeCancelUntil` ngược từ `pickupAt`, dùng cửa sổ cố định cho mọi chuyến, hay tính hai cửa sổ ở client — độ dài theo `ΔT = pickupAt − acceptedAt` qua `holdWindowsFor`, cả hai mốc tính XUÔI từ `acceptedAt`, kẹp bởi `pickupAt`, server lưu, client đọc (ADR 0064 điều 7 · ADR 0066 điều 3)
- ❌ Chia đôi khoản huỷ muộn, giữ tiền bảo hiểm khi huỷ, hay ghi thuế cho một chuyến bị huỷ — chủ xe nhận trọn `D`, XePrime `S + H − P`, `IV + IP` hoàn khách (ADR 0066 điều 2)
- ❌ Thêm trạng thái `disputed` / `in_progress` / "chờ xác nhận bàn giao" vào `BOOKING_STATUS` — tranh chấp ở mốc nhận xe là hồ sơ hỗ trợ (`dispute` / `handover_unconfirmed`) hoãn quyết toán; chủ xe xác nhận giao xe ⇒ `active` (ADR 0066 điều 5)
- ❌ Tự huỷ đơn vì chưa có tài xế, hay dựng lại hồ sơ/danh bạ tài xế không tài khoản — tài xế ngoài hệ thống chỉ là tên + SĐT ghi trên MỘT đơn; thiếu tài xế thì nhắc khẩn bên thuê, không huỷ (ADR 0067)
- ❌ Sinh `booking_holds`, phát mã QR hay chiếm `vehicle_occupancies` lúc khách GỬI yêu cầu — chưa ai nhận chuyến thì chưa có giá để chốt và chưa có chỗ nào thuộc về ai (ADR 0044 điều 1)
- ❌ Nói "đặt xe thành công" vì khách quét QR hoặc bấm một nút — đơn thuê chỉ ra đời trong transaction của lượt đối soát xác nhận ĐỦ TIỀN (ADR 0044 điều 2)
- ❌ Dựng một mã QR khi chưa có số tiền chốt (dài hạn chưa chốt lịch, báo giá còn tạm tính) — không thu thì tạo đơn ngay lúc duyệt, KHÔNG có QR giả (ADR 0044 điều 4)
- ❌ Tự gia hạn cửa sổ thanh toán — hết hạn là hết; khách được nhắc hai lần trước đó (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`). `booking_holds.extension_count` là cột LỊCH SỬ, không đường nào ghi nữa (ADR 0044 điều 3)
- ❌ Tạo đơn từ khoản tiền của một yêu cầu đã hết hạn, hay đọc cột `status` thay vì mốc `expires_at` để quyết định nhận tiền — chỗ đó có thể đã thuộc về khách khác (ADR 0044 điều 7)
- ❌ Coi `booking_requests.awaiting_hold` là "khách chưa trả, chưa ai duyệt" — nó ĐỔI NGHĨA ở ADR 0044 thành "đã được nhận, chờ khách trả", và DB bắt buộc nó có `decided_at` (CHECK `booking_requests_awaiting_hold_decided`, ADR 0055)
- ❌ Trả SĐT/email khách cho chủ xe ngoài cổng `hostSeesCustomerContact` — tuyến hoa hồng chỉ thấy khi đã có ĐƠN, kể cả qua sổ khách (`@SubscriptionTrackOnly`) hay một DTO mới (ADR 0056)
- ❌ Dùng lại `hold_paid` / `approved_by_host` / chặng `pending_approval_paid`, hay ghi `decided_*` ở lượt tiền về — luồng thu-trước-duyệt đã gỡ hẳn, DB từ chối hai trạng thái đó; hằng số còn trong `@xeprime/types` chỉ để mobile biên dịch, danh sách cho DTO/UI là `*_LIVE_VALUES` (ADR 0055)
- ❌ Đóng yêu cầu thua cuộc bằng `rejected_by_host` (đổ cho chủ xe) hay `expired` (phạt tỉ lệ phản hồi) — khung giờ đã có người thì dùng `slot_taken` (ADR 0044 điều 6)
- ❌ Gọi khoản chuyển qua QR là "cọc" ở giao diện — nó là **tiền giữ chỗ**, khác hẳn **cọc thế chấp khi nhận xe** của `rental-policies` (ADR 0044 điều 9)
- ❌ Trừ mã khuyến mãi nền tảng vào `bookings.total_amount` hay dùng lại `PRICE_ROW.DISCOUNT` cho nó — đó là doanh thu gian hàng và khuyến mãi của CHỦ XE; hai loại giảm giá cộng dồn được nên chúng phải là hai dòng tiền (ADR 0046 điều 2)
- ❌ Tính `S`/`H`/`T`/`IV`/`IP` trên `B − P` — mã là TÀI TRỢ, không phải một lần hạ giá thuê; hạ mẫu số là để nền tảng tự giảm doanh thu hai lần cho cùng một chương trình (ADR 0046 điều 2)
- ❌ Cho mã lấn vào `IV`/`IP` hay vào `payAtPickupAmount` — bảo hiểm là tiền giữ hộ đối tác, còn phần trả tay là tiền mặt của chủ xe. Trần tài trợ là `D + S + H`, và sàn là `holdMinAmount` (ADR 0046 điều 3 · ADR 0064 điều 6)
- ❌ Hoàn cho khách nhiều hơn số họ ĐÃ CHUYỂN khi huỷ — hoàn cả `P` là biến mã khuyến mãi thành tiền mặt rút được qua cửa sổ huỷ miễn phí (ADR 0046 điều 4)
- ❌ Giữ lượt mã ở bước XEM TRƯỚC, hay khôi phục lượt khi một ĐƠN đã hình thành rồi bị huỷ — cái thứ nhất để một vòng `curl` dùng cạn chiến dịch, cái thứ hai biến mã dùng-một-lần thành mã dùng vô hạn (ADR 0046 điều 6)
- ❌ Gác trần lượt mã bằng `count()` rồi `if` ở tầng app — trần tổng dùng `UPDATE … WHERE reserved_count < total_usage_limit`, trần mỗi khách dùng `pg_advisory_xact_lock` (ADR 0046 điều 6)
- ❌ Tính lại số giảm của một yêu cầu đang chờ theo `promo_codes` HÔM NAY — đọc `booking_requests.promo_snapshot_json`; admin sửa/tắt/xoá mềm giữa chừng không được viết lại lời hứa đã hiện cho khách (ADR 0046 điều 7)
- ❌ Âm thầm bỏ mã rồi để khách trả nhiều hơn, hoặc chặn lượt duyệt vì mã hết đủ điều kiện — nhả lượt, BÁO khách (`PROMO_CODE_DROPPED`), lượt duyệt đi tiếp (ADR 0046 điều 7)
- ❌ Suy "khách hàng mới" từ tên/SĐT tự khai, hay từ số lượt GỬI yêu cầu — đo bằng `customer_user_id` và số yêu cầu đã `converted_to_booking` (ADR 0046 điều 5)
- ❌ Sửa mức giảm/điều kiện/phạm vi của một mã ĐÃ CÓ LƯỢT DÙNG, hay xoá cứng nó — dùng Nhân bản; `promo_redemptions.promo_code_id` là `RESTRICT` (ADR 0046 điều 8)
- ❌ Nhận SĐT ở endpoint xem trước mã, hay cho mã chưa `listed` lọt vào danh sách công khai — danh tính đến từ phiên, và mã riêng chỉ dùng được khi gõ tay (ADR 0046 điều 9)
- ❌ Để client gửi lên `responsibleParty` khi huỷ, hay cho chủ xe chọn nhãn "bất khả kháng" — trách nhiệm do SERVER suy từ scope người thao tác; cho tự khai là xoá ý nghĩa của chỉ số uy tín trong một tuần (ADR 0045 điều 2)
- ❌ Coi nhân viên gian hàng huỷ là một phía khác với chủ xe — uỷ quyền là chuyện nội bộ người bán; với khách, xe bị rút lại vẫn là xe bị rút lại (ADR 0045 điều 2)
- ❌ Ghi đè `decided_at`/`decided_by`/`decision_source` khi huỷ một yêu cầu ở `awaiting_hold` — ba cột đó đang mang lượt NHẬN; ghi đè làm trung vị thời gian phản hồi đo "bao lâu thì huỷ" và biến một lượt tự nhận thành quyết định của người (ADR 0045 điều 3)
- ❌ Lật một đơn `active` sang `cancelled` — xe đang ở ngoài đường với khách; kết thúc sớm phải đi qua bàn giao trả xe + quyết toán tiền/thuế/bảo hiểm (ADR 0045 điều 1)
- ❌ Suy "đã phản hồi" từ `status = rejected_by_host` — dữ liệu cũ do worker `expirePaidAwaitingAccept` (đã gỡ ở ADR 0055) ghi cũng mang status đó dù gian hàng KHÔNG phản hồi, và cố ý để trống `decided_at`. Luôn đọc `decided_at` (ADR 0045 điều 3)
- ❌ Tính `slot_taken`, khách rút trước khi ai quyết, hay `hold_expired` LEGACY (`decided_at IS NULL`) vào mẫu số chỉ số — gian hàng không có cơ hội hoặc không có nghĩa vụ quyết định (ADR 0045 điều 3)
- ❌ Cho một lượt huỷ sinh HAI mẫu (một "đã nhận", một "đã huỷ") — một chuyến hỏng là MỘT lần trừ điểm; nó rời tử số "nhận và giữ", không thêm vào mẫu số (ADR 0045 điều 3)
- ❌ Trộn quyết định của xe "Đặt ngay" vào trung vị thời gian phản hồi, hay hiện nó thành "0 phút" — đó là nhãn `instantBook`, không phải một tốc độ trả lời thủ công (ADR 0045 điều 3)
- ❌ Hiện phần trăm uy tín khi dưới `HOST_METRIC_MIN_SAMPLES` mẫu, hay quy `null` về 0 — "chưa ai hỏi" và "hỏi mà không trả lời" là hai điều khác hẳn nhau (ADR 0045 điều 3)
- ❌ Đọc `HostMetrics` đã chặn ngưỡng để tính ĐIỂM XẾP HẠNG — điểm dùng con số THÔ đã làm mượt Bayes; đọc bản hiển thị biến một gian hàng giữ 3/3 chuyến thành giữ 0/3 (ADR 0045 điều 5)
- ❌ Gắn chỉ số uy tín vào THẺ kết quả tìm kiếm — một trang 48 xe là 48 phép gộp, đúng cái N+1 mà `rank_score` đã tránh (ADR 0045 điều 3)
- ❌ Đổi sort do KHÁCH chọn (giá tăng, giá giảm, mới nhất) theo `rank_score` — điểm chỉ có tiếng nói ở sort MẶC ĐỊNH (ADR 0045 điều 4)
- ❌ Trộn xe mới vào kết quả lúc ĐỌC thay vì cộng điểm khám phá vào `rank_score` — phá phân trang, cùng một xe hiện ở hai trang (ADR 0045 điều 5)
- ❌ Kiểm `HOLD_MAX_OPEN_PER_CUSTOMER` bằng một câu `count` đọc trước transaction — hai lượt duyệt song song cùng đọc rồi cùng ghi; phép kiểm nằm TRONG transaction sau `pg_advisory_xact_lock` (ADR 0045 điều 6)
- ❌ Hồi sinh yêu cầu `slot_taken` khi hold người thắng hết hạn — đó là tạo một chuyến cả hai bên đã quên, ở một mức giá đã cũ. Gửi LỜI MỜI đặt lại trỏ vào chiếc XE, chống trùng bằng `slot_reopened_notified_at` (ADR 0045 điều 6)
- ❌ Nói với khách thua cuộc rằng xe "đã đặt thành công" — lúc đó người thắng còn chưa trả tiền; câu đúng là xe vừa được khách khác nhận và **đang được tạm giữ** (ADR 0045 điều 6)
- ❌ Mua/phát hành bảo hiểm lúc đặt xe, hay gọi HTTP đối tác bảo hiểm bên trong transaction DB — phát hành ở mốc bàn giao, qua job idempotent có retry (ADR 0032 điều 4)
- ❌ Ghi khoản giữ chỗ/tiền giữ hộ vào doanh thu tenant hoặc XePrime trước khi outcome được chốt; dùng bảng/ledger riêng (ADR 0028)
- ❌ Gọi số dư phải trả là "ví điện tử", cho nạp/chuyển/thanh toán nội bộ — ADR 0028
- ❌ Thêm trạng thái "chờ thanh toán" vào `BOOKING_STATUS` — trạng thái chờ tiền sống ở payment/hold/request, không phải vòng đời vận hành xe
- ❌ Thu phần trăm trên một báo giá tạm tính (`estimateNote != null`) hoặc đơn dài hạn chưa chốt giờ nhận
- ❌ Tính mốc huỷ/hoàn ở client hay tính lại policy lúc đọc — mốc và policy được snapshot ở server
- ❌ Đọc `tenants.tenant_type` để quyết định chế độ thu phí — nguồn duy nhất là gói hiện hành (ADR 0014 điều 2 · ADR 0024)
- ❌ Tính lại giá/hoa hồng của một đơn đã tạo — mọi thứ đóng băng lúc tạo (ADR 0024)
- ❌ Nối FK `payments.subscription_id` — sẽ tự sinh phiếu thu cho tenant, biến tiền gói thành thu nhập của chính họ (ADR 0022 điều 6)
- ❌ Khớp giao dịch ngân hàng TỰ ĐỘNG theo số tiền khi không rút được mã — chỉ gợi ý cho admin (ADR 0022)
- ❌ Ghi giao dịch MoMo/VNPAY vào `bank_transactions`, hay đọc kết quả thanh toán từ URL mà cổng chuyển trình duyệt về — chỉ IPN có chữ ký hoặc truy vấn do server gửi mới ghi kết quả, vào `payment_gateway_orders` (ADR 0058)
- ❌ Nhận số tiền / mã đối soát / đích từ client khi mở phiên cổng, hay tự hoàn tiền qua cổng khi chính sách hoàn chưa được quyết (ADR 0058 Q3/Q4)
- ❌ Tự áp một khoản cổng báo thu SAU khi người trực đã đóng lượt — có thể khoản đó đã được hoàn tay; lượt mở lại (`result_after_resolution`) và chỉ người trực ghi nhận, kèm ghi chú + audit (ADR 0058 điều 7)
- ❌ Chống ghi đôi tiền bằng check ở tầng app — luôn bằng constraint DB (`provider_tx_id`, `(ledger, source_type, source_ref_id)`) — ADR 0022/0028
- ❌ Cho số dư nạp tiền / chuyển ngang / thanh toán nội bộ / chi tự động khi chưa có đối tác và release gate — nó chỉ là sổ công nợ phải trả (ADR 0028)
- ❌ Nhét cờ tính năng vào bảng permission, hay suy quyền của một người từ GÓI — hai trục độc lập, kiểm tra nối tiếp (ADR 0027 điều 2)
- ❌ Ẩn menu mà không chặn endpoint ở server — ẩn nút chỉ là trang trí (ADR 0027 điều 4)
- ❌ Để tenant hết hạn gói mất quyền xem TIỀN, chứng từ và chuyến đang chạy của chính họ — ví điểm, hoá đơn, bàn giao, khai thuế KHÔNG nằm sau cờ tính năng nào, ở bất kỳ tuyến nào (ADR 0027 điều 3 · ADR 0038 điều 5)
- ❌ Suy trạng thái cờ tính năng từ PHA thay vì từ TUYẾN — `read_only` chỉ áp khi tenant VẪN ở tuyến gói (hạ bậc, hoặc đang ân hạn); hết ân hạn ⇒ về tuyến hoa hồng và Manage nâng cao là `hidden`, không có chế độ chỉ-xem (ADR 0038 điều 5 ghi đè ADR 0027 điều 3 trong phạm vi HẾT GÓI)
- ❌ Dựng báo cáo tổng hợp thu chi cho bậc cơ bản — chủ xe thấy tiền của TỪNG đơn, sổ tổng hợp là tính năng của gói (ADR 0027 điều 1)
- ❌ Boost xe thuê bao bất chấp độ phù hợp/chất lượng, hoặc không gắn nhãn vị trí tài trợ. Chỉ ưu tiên trong nhóm kết quả tương đương (ADR 0028)
- ❌ Tiền tố ngôn ngữ trong URL (`/en`, `/vi`), `app/[locale]`, hay tham số `?lang=`/`?locale=` — ADR 0012
- ❌ Chuỗi giao diện viết thẳng trong component ở khu ĐÃ i18n hoá — dùng `t()` + `messages/<locale>/*.json`
- ❌ `dayjs.locale(...)` ở bất kỳ đâu — nó đổi trạng thái toàn tiến trình và rò ngôn ngữ giữa các request SSR
- ❌ Hiện `message` tiếng Việt của backend làm chữ chính ở giao diện tiếng Anh — ánh xạ từ MÃ lỗi (ADR 0012)
- ❌ Dịch mã đi trên dây (status/permission/serviceType…) — mã là dữ liệu, chỉ NHÃN mới dịch
- ❌ Sửa tay `.env.production` / `.env.staging` trên VPS — nó bị workflow ghi đè ở lần deploy kế tiếp; đổi giá trị ở GitHub Environment (`docs/deployment.md` §9.2)
- ❌ Thêm biến env mà quên khai ở GitHub Environment — job deploy dừng ngay ở bước "Thiếu giá trị bắt buộc"
- ❌ Deploy image `staging-*` lên production (hoặc ngược lại) — `NEXT_PUBLIC_API_URL` nhúng cứng lúc build, cả site sẽ gọi sang môi trường kia mà nhìn bên ngoài vẫn "chạy"
- ❌ Commit thẳng vào `staging`/`main` — mỗi lần merge vào chúng là một lần DEPLOY (`docs/git-workflow.md`)
- ❌ Đẩy ngược lịch sử git để lùi phiên bản — rollback là Run workflow + `image_tag` (`docs/deployment.md` §9.1)
- ❌ Đưa sao lưu lên cloud object storage, hay để VPS PUSH backup vào mạng công ty — VPS bị chiếm là mất luôn bản sao (`docs/backup-and-restore.md` §2)
- ❌ Tạo microservices sớm
- ❌ `any` tràn lan — nếu bắt buộc phải có comment lý do

## 6. Ba lằn ranh bảo mật xuyên suốt mọi phase

1. **Tenant scope**: backend luôn lấy `tenant_id` từ membership/session, không tin client.
2. **Approval**: public xe / active shop phải đi qua `approval_tasks`; chống trùng lịch bằng constraint DB (ADR 0006), **không** bằng check ở tầng app — `POST /calendar/check-conflict` chỉ là preview cho UX.
3. **Audit**: mọi action admin/platform quan trọng ghi `audit_logs`.

## 7. Đổi tên role so với source cũ

| Firebase cũ | Mới |
| --- | --- |
| `owner` | `shop_owner` |
| `admin` (trong tenant) | `shop_manager` |
| `staff` | `shop_staff` |
| `viewer` | `shop_viewer` |
| super admin whitelist UID | `platform_admin` / `platform_staff` (+ `reviewer`/`support`/`finance_admin` mở sau) |

## 8. Ghi chú kỹ thuật từ Phase 0 (base)

> **Trạng thái hiện tại (đang ở đâu / làm gì tiếp) → `docs/completion-roadmap.md`.**
> Dưới đây là các ghi chú kỹ thuật base **còn giá trị lâu dài** (bẫy version/build) — giữ để không vấp lại.

| Vấn đề | Cách giải |
| --- | --- |
| **Version thực tế** | Next 16.2 · React 19.2 · NestJS 11.1 · Prisma 7.9 · AntD 6.5 · TS 5.9. **KHÔNG dùng TS 7** — `typescript-eslint` peer `<6.1.0`, TS 7 làm chết lint |
| **Prisma 7 bỏ `url` trong schema** | Thêm `prisma/prisma.config.ts` + driver adapter `@prisma/adapter-pg`. `createPrismaClient()` ở `@xeprime/prisma` là factory chung cho service/seed/test. Cần `previewFeatures=["postgresqlExtensions"]` + `experimental.extensions` |
| **`@prisma/client-runtime-utils`** | Phải khai báo tường minh trong `prisma/package.json` deps, nếu không bản compiled `node dist` báo MODULE_NOT_FOUND |
| **rootDir trong tsconfig chung** | `rootDir`/`outDir` phải nằm ở `tsconfig.build.json` của từng package, KHÔNG ở config `extends` (TS resolve tương đối với file khai báo) |
| **`nest build` chỉ emit 1 file** | Tắt `incremental` trong `nest.json` (deleteOutDir không xoá `.tsbuildinfo`) |
| **tsx/esbuild không emit decorator metadata** | `openapi.ts` chạy từ bản compiled (`nest build && node dist/openapi.js`) + `NestFactory.create(AppModule, { preview: true })` để né DB, kèm `dotenv` vì ConfigModule validate env lúc load |
| **pnpm 11 chặn build script** | `pnpm-workspace.yaml`: `onlyBuiltDependencies` + `verifyDepsBeforeRun: false` (không thì `pnpm exec` tự chạy lại install và fail) |
| **`next build` nổ ở `/_global-error`** | `Cannot read properties of null (reading useContext)` — do `.env` đặt `NODE_ENV=development` mà script build nạp chính file đó qua dotenv. Next trộn React dev với React production trong bundle server ⇒ dispatcher null. Script web ghi đè: `dotenv -e ../../.env -v NODE_ENV=production -- next build`. KHÔNG phải bug code app, và không có bản Next nào (16.2.11/16.2.12/16.3.2) sửa được |
| Docker daemon | Bật rồi tắt bất thường; nếu `up` treo là đang kéo image lần đầu. Gặp network/container mồ côi thì `docker compose down --remove-orphans` + xoá network trùng tên |

Base Phase 0 (đã commit `0a76adf`): 11 bảng lõi + `vehicle_occupancies` (schema + constraint từ Phase 0, logic đầy đủ Phase 4 — ADR 0006); API/pages tối thiểu. Chi tiết tiến độ các phase sau: `docs/completion-roadmap.md`.

### Migration & seed (gộp lại 21/08/2026)

| Việc | Trạng thái |
| --- | --- |
| Migration | **Một baseline duy nhất** `prisma/migrations/20260821000000_init/` — gộp 44 migration cũ, đã đối chiếu `pg_dump` với chuỗi cũ. Đọc header của file đó trước khi chạy `migrate dev`: nó cảnh báo các FK tổ hợp `(id, tenant_id)` mà `schema.prisma` không mô tả được và Prisma sẽ sinh lệnh DROP chúng |
| Seed | `prisma/src/seed.ts` + `prisma/src/seed/` — idempotent trên toàn bộ 63 bảng (id tất định từ `seedId`, không xoá-tạo-lại) |
| `SEED_MODE=system` | Dữ liệu nền: quyền, role hệ thống, danh mục thu/chi, gói dịch vụ, banner, danh mục xe + tài khoản `platform_admin`. Tỉnh/xã do migration nạp. Chạy được ở production |
| `SEED_MODE=demo` (mặc định) | Bộ gọn (05/10/2026), mỗi loại ~3 tài khoản: **3 gian hàng tuyến gói** (12 xe · 5 xe · 2 xe — mỗi bậc một gian hàng) + **3 chủ xe cá nhân tuyến hoa hồng** (1 · 2 · 3 xe — `commission-owners.ts`). Tổng: 18 tài khoản (gồm 3 song sinh), 25 xe, 55 đơn |
| Tài khoản demo | nền tảng `admin@xeprime.vn` · `reviewer@`/`finance@xeprime.test` · chủ shop `owner.saigon@`/`owner.hanoi@`/`owner.danang@` · 3 nhân viên `*.saigon@` · chủ xe cá nhân `chuxe.huong@`/`chuxe.tuan@`/`chuxe.son@` · khách `khach.an@`/`khach.binh@`/`khach.cuong@xeprime.test`. Bảng tra: `docs/qa-accounts.md`. Mật khẩu từ env, không in ra stdout |
| Danh tính seed sở hữu | `prisma/src/seed/identities.ts` — `cleanup-test-data.ts` import chính danh sách này làm bộ loại trừ, không chép tay |

> `prisma migrate reset` bị Prisma chặn khi phát hiện agent chạy — người dùng phải tự gõ lệnh đó.

## 8b. Đa ngữ (ADR 0012)

Hai ngôn ngữ `vi` (mặc định) / `en`, **cùng một URL**. Locale ở cookie `XP_LOCALE`, đọc phía
server trước khi render.

| Việc | Ở đâu |
| --- | --- |
| Hằng locale, cookie, bản đồ `Intl` | `apps/web/src/i18n/config.ts` |
| Đọc locale (server) | `src/i18n/locale.ts` · Server Action ghi cookie: `src/i18n/actions.ts` |
| Message — **một gốc dùng chung** | TOÀN BỘ namespace ở `packages/domain/messages/{vi,en}/` — web và app native dùng chung, một khoá một bản dịch. Chia theo TÍNH NĂNG, không theo client: app native dùng lại `bookings`/`vehicles`… như web; `mobile-shell` (cờ `web: false`) chỉ là VỎ app native. Hai bảng gom: `apps/web/messages/<locale>/index.ts` và `apps/mobile/shared/src/i18n/messages.ts` (tập con). Danh sách ở `apps/web/src/i18n/namespaces.ts`; `i18n:check` quét gốc package, canh cả hai bảng gom và CHẶN JSON mọc lại ở gốc web cũ |
| Định dạng tiền/ngày/quãng đường | `useAppFormat()` (client) · `getAppFormat()` (server) |
| Nhãn status/role/enum | `useDomainLabel()` + namespace `Domain` |
| Lỗi API | `useErrorMessage()` + namespace `Errors` (ánh xạ từ MÃ) |
| Bộ đổi ngôn ngữ | `src/components/i18n/LocaleSwitcher.tsx` |

Kỷ luật khi viết chữ mới hoặc chuyển màn hình chưa dịch: skill `i18n`.

Hai lệnh kiểm tra:

```bash
pnpm --filter @xeprime/web i18n:check   # parity vi↔en, ICU, không giá trị rỗng
pnpm --filter @xeprime/web i18n:audit   # quét AST tìm chuỗi giao diện còn thô
```

Việc i18n hoá đi theo đợt: `MESSAGE_NAMESPACES` chỉ liệt kê namespace ĐÃ có nội dung. Khu vực
chưa chuyển vẫn dùng chuỗi tiếng Việt trong mã; `i18n:audit` là bản kiểm kê phần còn lại.

## 9. Convention API

- Success: `{ "data": ..., "meta": ... }`
- Error: `{ "error": { "code": "...", "message": "...", "details": ... } }`
- Pagination: `page`, `limit`, `total`, `hasNext`
- Date/time: lưu **UTC** (`timestamptz`), hiển thị **`Asia/Ho_Chi_Minh`** ở frontend (tài liệu cũ ghi `Asia/Bangkok` — cùng UTC+7, không DST, nhưng dùng đúng tên vùng Việt Nam)
- Tiền: `Decimal` ở BE → **string** trong JSON, không bao giờ `number` (ADR 0007)

## 10. Ghi chú môi trường máy dev

| Thứ | Trạng thái |
| --- | --- |
| Node | v24.18.0 |
| pnpm | 11.1.3 (qua corepack) |
| Docker | CLI + daemon 20.10.13 — **đã chạy** (xác nhận 22/07/2026, `docker version` trả cả client lẫn server) |
| `psql` client | Chưa cài (không bắt buộc nếu dùng Docker: `docker compose exec db psql`) |
| Firebase Admin credential | Chỉ cần khi bật chat realtime (`FIRESTORE_ENABLED=true`). Đăng nhập KHÔNG dùng tới nó nữa (ADR 0019) |
| OAuth client Google/Facebook | Chưa khai thì nút social trả `SOCIAL_NOT_CONFIGURED`; mật khẩu và OTP vẫn chạy. Dev cần thật thì tạo OAuth client Web với redirect URI `http://localhost:4000/auth/social/google/callback` (Google cho phép `http://localhost`) |

## 11. Roadmap sản phẩm

Roadmap 9 phase cũ đã hoàn thành vai trò bootstrap và bị loại khỏi nguồn sống ngày 03/09/2026. Thứ tự hiện hành là:

1. Stabilize/pilot UX.
2. Thu tiền subscription.
3. Marketplace transaction cho Basic Owner.
4. Thu hộ đầy đủ + Số dư chủ xe sau legal/payment gate.
5. Controlled pilot và hardening.
6. Mobile customer parity + public launch.

Chi tiết, trạng thái và gate: `docs/completion-roadmap.md`. Kỷ luật code theo loại việc: `.claude/skills/`.
