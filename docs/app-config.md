# Cờ quảng bá gói (`isPlanPromotionEnabled`) và mẫu email hướng dẫn gói

Ngày: 12/10/2026 (bỏ realtime 13/10/2026) · Mã: `apps/api/src/modules/app-config/`

## 1. Cờ `isPlanPromotionEnabled`

Một hàng duy nhất ở `platform_app_configs` (`is_plan_promotion_enabled` mặc định `false`, `version`, `updated_at`,
`updated_by`, hotline/Zalo in trong email). Writer duy nhất: `AppConfigService.updatePartner`.

| Endpoint | Ai | Ghi chú |
| --- | --- | --- |
| `GET /app-config/partner` | công khai | `{ isPlanPromotionEnabled, version }`, `Cache-Control: no-store` |
| `GET/PATCH /platform/app-config/partner` | `@PlatformOnly()` + `platform.app_config.manage` | PATCH: audit cùng transaction, `version + 1`; `version` chỉ mang tính thông tin |

## 2. App Partner đọc cờ thế nào

KHÔNG có kênh realtime. `usePartnerAppConfig()` (`apps/mobile/shared/src/features/app-config/`) gọi
`GET /app-config/partner` mỗi lần màn dùng cờ được dựng/focus (`useFocusEffect`) và mỗi lần app quay lại
tiền cảnh (`staleTime: 0`, `refetchOnMount: 'always'`). Đang tải hoặc lỗi ⇒ `false` (ẩn lối mua gói).
Web đọc cùng endpoint khi mở trang.
## 3. Email "Hướng dẫn đăng ký và gia hạn gói trên website"

Chỉ xếp hàng khi `isPlanPromotionEnabled = true`; không bao giờ gửi trong request. Hàng đợi `email_outbox`
(UNIQUE `dedupe_key`, `ON CONFLICT DO NOTHING`) ⇒ mỗi mốc tối đa một thư; `EmailOutboxDispatcher`
(API) gửi và retry.

| Lý do | Nơi xếp | Khoá chống trùng |
| --- | --- | --- |
| `registered` | `POST /tenants` tuyến gói (`package_pending`) | theo tenant |
| `consultation` | `POST /support/plan-consultation` — gửi tới email CỦA TÀI KHOẢN (không tới email người dùng gõ; thiếu ⇒ không gửi), trả `emailedTo` | theo tài khoản + ngày VN (≤ 1 thư/ngày) |
| `expiring` (≤7 ngày) · `expired` · `grace` | worker `subscription-lifecycle` | theo thuê bao + mốc |

Cổng `isPlanPromotionEnabled` + bộ dựng dòng outbox là MỘT hàm dùng chung cho API và worker:
`enqueuePlanGuideEmail` / `enqueuePlanGuideForSubscription` ở `@xeprime/prisma`
(`prisma/src/plan-guide-outbox.ts`). Ngôn ngữ thư: `users` chưa có cột ngôn ngữ ⇒ `vi` trừ khi caller
biết (tư vấn gói nhận `locale` từ app). Dispatcher giao hàng **at-least-once**: tiến trình chết sau
khi SMTP nhận mà trước khi ghi `sent` ⇒ thư có thể đi hai lần.

### Ràng buộc có chủ đích: email đăng ký tuyến gói của WEB cũng theo `isPlanPromotionEnabled`

`isPlanPromotionEnabled` ("quảng bá gói") gác cả danh sách gói + nút "Liên hệ tư vấn" trong app Partner
LẪN thư `registered` khi một gian hàng đăng ký tuyến gói trên WEB partner. Đây là quyết định sản phẩm (spec 12/10/2026): cả bộ thư
hướng dẫn gói bật/tắt bằng MỘT công tắc, để nền tảng mở kênh bán gói một lần cho mọi bề mặt. Hệ quả
cần biết: tắt `isPlanPromotionEnabled` (vd chờ duyệt store) thì người đăng ký trên web cũng KHÔNG nhận thư hướng
dẫn — họ vẫn thấy hướng dẫn và mã chuyển khoản ngay trên màn onboarding. Muốn tách hai kênh thì thêm
một cờ riêng, đừng đọc `isPlanPromotionEnabled` theo bề mặt.

## 4. Quản trị mẫu email

Bảng `plan_guide_email_templates` (vi/en subject + body HTML, `is_active`, `version`, xoá mềm).
Đúng một mẫu bật: partial unique index `… WHERE is_active AND deleted_at IS NULL`. Seed
`SEED_MODE=system` tạo 5 mẫu (id tất định), một mẫu bật. Endpoint dưới
`/platform/plan-guide-email-templates` (list · get · create · update [`expectedVersion`] ·
duplicate · activate · delete [mẫu đang bật ⇒ `PLAN_GUIDE_TEMPLATE_ACTIVE`] · preview · send-test),
mọi thao tác ghi audit.

Biến: `{{recipientName}}` `{{shopName}}` `{{planTable}}` `{{purchaseUrl}}` `{{hotline}}` `{{zalo}}`
`{{zaloUrl}}` `{{expiresAt}}` `{{reminderDays}}` `{{graceDays}}` `{{graceEndsAt}}` `{{commissionPercent}}`
`{{packageCommissionPercent}}` `{{reason}}` `{{assetBase}}`; khối điều kiện `{{#x}}…{{/x}}` ẩn khi biến
trống. Mọi giá trị được escape HTML; subject ép một dòng; URL lạ bị thay.

Nguồn của mỗi con số — tính LÚC DỰNG thư (dispatcher / xem trước), không đóng băng vào outbox; nội
dung mẫu không được chứa số cứng (test quét seed):

| Biến | Nguồn |
| --- | --- |
| `{{zaloUrl}}` | `zaloHref(platform_app_configs partner supportZalo)` (`@xeprime/domain` `contact.ts`) → `https://zalo.me/0…`; chưa khai/không hợp lệ ⇒ `WEB_PARTNER_URL + PARTNER_SUPPORT_PATH`. Dùng cho MỌI "Liên hệ tư vấn" (nút bậc `salesOnly` trong `{{planTable}}`, chip Zalo) |
| `{{reminderDays}}` | `SUBSCRIPTION_RENEWAL_REMINDER_DAYS` — cùng hằng worker dùng để quyết định gửi thư sắp hết hạn |
| `{{graceDays}}` | `parsePlanLimits(plan.limits_json).graceDays` của gói thuộc thuê bao; thư không có thuê bao (chào mừng/tư vấn) ⇒ bậc tự mua đầu tiên; 0 ⇒ trống |
| `{{expiresAt}}` / `{{graceEndsAt}}` | `tenant_subscriptions.ends_at` (payload outbox) / `graceEndsAtFor(ends_at, graceDays)`; ngày dài giờ VN |
| `{{commissionPercent}}` | `FeePoliciesService.findEffective().serviceFeePercent` qua `tripServiceFeePercent(COMMISSION, …)` — cùng nguồn báo giá và `/auth/me`. Không có chính sách ⇒ trống |
| `{{packageCommissionPercent}}` | `tripServiceFeePercent(PACKAGE, …)` = 0 (ADR 0029 điều 2) |

Định dạng %: `10%`, `7,5%` (vi) / `7.5%` (en). `{{planTable}}` dựng bằng `buildPlanPricingCards`
(cùng hộp thoại web), giá cả kỳ lấy nguyên `limits.termPrices` (ADR 0041). Bộ dựng: `apps/api/src/modules/email/plan-guide-email.ts`.
