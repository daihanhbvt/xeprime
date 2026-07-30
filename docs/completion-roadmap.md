# XePrime — Completion Roadmap (tiến độ thực tế)

> **Đây là nguồn "đang ở đâu / làm gì tiếp".** Đọc file này đầu mỗi session (cùng `CLAUDE.md`,
> `docs/decisions/`, `docs/CODEMAP.md`). Khi **đóng xong một phase**, cập nhật bảng §2 + mục phase
> tương ứng ở đây — đừng để tiến độ chỉ nằm trong trí nhớ hay plan file global `~/.claude/plans/`.
>
> Cập nhật gần nhất: **29/07/2026**.

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
| **6** | **Finance / Thu-Chi / Công nợ / Hợp đồng** | 🟡 **S1 Thu-Chi + S2 Payments/Công nợ/Dashboard XONG** · còn **S3 Contracts** |
| 7 | Admin platform đầy đủ | 🟡 Một phần (approval + platform-admin có; dashboard/khoá tenant/gói-hạn chưa đủ) |
| 8 | Migration từ Firestore + chạy song song | ❌ Sau |
| 9 | QA / hardening / production | ❌ Sau |

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
| **Commit Phase 4** | Code 29/07 xong + verify, **chưa commit** — user tự commit |
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
