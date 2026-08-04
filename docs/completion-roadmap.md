# XePrime — Completion Roadmap (tiến độ thực tế)

> **Đây là nguồn "đang ở đâu / làm gì tiếp".** Đọc file này đầu mỗi session (cùng `CLAUDE.md`,
> `docs/decisions/`, `docs/CODEMAP.md`). Khi **đóng xong một phase**, cập nhật bảng §2 + mục phase
> tương ứng ở đây — đừng để tiến độ chỉ nằm trong trí nhớ hay plan file global `~/.claude/plans/`.
>
> Cập nhật gần nhất: **04/08/2026**.

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
| 9 | QA / hardening / production | ❌ Sau |

> **Việc chèn ngoài phase (29–30/07):** đặt xe passwordless + đăng nhập SĐT + điều chỉnh UX là
> feature do user yêu cầu, KHÔNG nằm trong lịch phase — làm xong nhưng **milestone chưa nhích**
> (S3 Contracts vẫn là việc đóng Phase 6). Ghi ở mục Phase 4 (30/07).
>
> **Cờ `comingSoon` đã dọn (30/07):** `booking-requests` và `members` là **page thật đã xong** —
> đã gỡ cờ trong `constants/nav.ts`. Còn `customers`/`pickup-areas`/`drivers`/`trash`/`admin-*`
> vẫn là stub thật (giữ cờ).
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
>
> ➡️ Việc kế tiếp: **commit khối 04/08** rồi chọn: nốt §11.1 (**support tickets** · **invoice cho
> gói**) · retrofit gate SĐT (§5) · Phase 8 (migration Firestore) · Phase 9 (QA/hardening).

---

## 3. Đã xong — chi tiết đủ để không làm lại

- **Phase 1–2:** `modules/auth` (session cookie ADR 0002, verifier theo `AUTH_MODE`), `modules/rbac`,
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

## 4. Việc kế tiếp — Phase 6: Finance / Thu-Chi / Công nợ / Hợp đồng

Nguồn: build plan §10 + `docs/xeprime_database_design.md` (phần finance). **Bảng chưa tồn tại →
cần migration viết tay** (mẫu `prisma/migrations/*_init`). ID char(26) ULID · tiền `Decimal(14,2)` →
string JSON (ADR 0007) · status String + union `@xeprime/types` (ADR 0005) · mỗi bảng dẫn xuất 1
writer.

### Backend (module mới)
| Module | API |
| --- | --- |
| Finance | `finance_categories` CRUD; `receipts` tạo/duyệt/huỷ (workflow duyệt phiếu) |
| Payments | ghi `payments`; **cập nhật `paid_amount`/công nợ của booking** (transaction) |
| Debts | list đơn còn nợ; tạo phiếu thu gạt nợ |
| Contracts | snapshot hợp đồng từ booking; export tối thiểu |

Bảng: `finance_categories`, `receipts`, `receipt_attachments`, `payments`, `debts`, `contracts`.

### Frontend (thay 7 page stub 5-dòng đang có bằng bản thật)
`app/(manage)/manage/{finance,receipts,debts}` hiện là placeholder. Cần: Finance dashboard
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
| **Commit khối 04/08 (3 màn giám sát)** ⚠️ | Phase 7 lõi đã commit ở `262801b`. CHƯA commit: migration `add_platform_monitoring_indexes` (đã áp) + 5 permission + 3 module BE + 3 feature FE + `common/{mask,money}.ts` + `MaskedContact` + `USER_STATUS_META` + 4 spec mới. User tự commit (có thể tách: quyền+index / 3 slice / helper dùng chung). |
| Trang khách hàng CỦA SHOP (`/manage/customers`) | Màn 04/08 là **của nền tảng** (`/manage/admin/customers`), không thay stub phía shop — shop cần danh sách khách RIÊNG của mình, làm ở phase liên quan |
| Retrofit gate SĐT cho **mở shop** + **public xe** | Dùng lại `phone-verification` (purpose `shop_register`/`vehicle_public`), ngắn |
| SMS OTP thật | Hiện `OTP_MODE=mock`. eSMS thật cần tài khoản riêng (key prod `vf3zone` ở Secret Manager, **không lấy về local được**) → set `OTP_MODE=esms` + `ESMS_*` |
| Chat realtime | Bật sau cờ `FIRESTORE_ENABLED` + Firestore Security Rules + emulator test (ADR 0009) |
| Upload ảnh R2 thật | Ảnh xe/đính kèm hiện nhập bằng URL; upload R2 là follow-up |
| Page stub `drivers`, `pickup-areas`, `customers`, `trash` | Vỏ 5-dòng, làm ở phase liên quan sau |

---

## 6. Đọc context ở đâu (mỗi session mới)

`CLAUDE.md` (workspace) · `docs/decisions/` (ADR — thắng doc cũ) · `docs/CODEMAP.md` (cái gì ở đâu) ·
**file này** · `.claude/skills` + `.claude/agents`. Firebase-code (`../Firebase-code`, ngoài
workspace) chỉ tham chiếu nghiệp vụ, **không sửa**.
