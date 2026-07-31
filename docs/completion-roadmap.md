# XePrime — Completion Roadmap (tiến độ thực tế)

> **Đây là nguồn "đang ở đâu / làm gì tiếp".** Đọc file này đầu mỗi session (cùng `CLAUDE.md`,
> `docs/decisions/`, `docs/CODEMAP.md`). Khi **đóng xong một phase**, cập nhật bảng §2 + mục phase
> tương ứng ở đây — đừng để tiến độ chỉ nằm trong trí nhớ hay plan file global `~/.claude/plans/`.
>
> Cập nhật gần nhất: **31/07/2026**.

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
| 4 | Booking request + Booking + Calendar + **gate verify SĐT** + check-conflict preview | ✅ **Xong 29/07 — CHƯA commit** |
| 5 | Notification ✅ · Review ✅ · Chat (ADR 0009) | ✅ Notification/Review xong · Chat dựng đáng kể (realtime sau cờ `FIRESTORE_ENABLED`) |
| **6** | **Finance / Thu-Chi / Công nợ / Hợp đồng** | ✅ **S1 + S2 + S3 Contracts XONG** — migration đã áp, jest 89/89, verify sạch → **đóng milestone "vận hành đủ tiền"** |
| 7 | Admin platform đầy đủ | ✅ **Lõi XONG 31/07** — approval ✅ · gian hàng khoá/mở ✅ · **dashboard nền tảng ✅ · audit-view ✅ · nhân sự ✅ · gói/hạn (ADR 0010) ✅ (jest 128, CHƯA commit)**. Còn ngoài lõi (§11 build plan): all-vehicles/all-bookings/all-customers view · support tickets · invoice cho gói |
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
> ➡️ Việc kế tiếp: **commit theo lớp (§5)** rồi chọn: phần ngoài lõi Phase 7 (all-vehicles /
> all-bookings / all-customers / support / invoice) · retrofit gate SĐT (§5) · Phase 8 (migration
> Firestore) · Phase 9 (QA/hardening).

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
| **Commit khối 31/07 (Phase 7 lõi)** ⚠️ | Các lớp cũ đã được commit (tới `cab3b61`). CHƯA commit: **Phase 7 lõi 31/07** — 2 migration đã áp (`add_audit_log_indexes`, `add_plans_subscriptions`) + ADR 0010 + toàn bộ code A/B/C/D + sửa 2 test có sẵn + `jest maxWorkers`. User tự commit (có thể tách: A+B+C / D+ADR / test-fix). |
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
