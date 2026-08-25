# XePrime — Second-Pass Audit: đối chiếu Excel ↔ code, và mức sẵn sàng cho Mobile

> Ngày: 21/08/2026 · Baseline: `XePrime_Project_Tracking.xlsx` (audit ngày 20/08/2026, commit `133b894`)
> Đối chiếu với: `chore/repo-commit-command` @ `a4db14b`
> **Không sửa code. Không refactor. Không commit.** Toàn bộ tài liệu này là phân tích + kế hoạch.

---

## Context — vì sao có tài liệu này

Anh đã có một bản audit codebase (file Excel) đang dùng làm baseline quản lý tiến độ. Sắp có
React Native developer tham gia, mobile sẽ clone gần hết flow của web. Câu hỏi không phải
"code có gì" — Excel đã trả lời rồi — mà là **ba câu khác**:

1. Excel còn đúng không, hay code đã trôi khỏi nó?
2. Cái gì web đang giữ riêng mà lẽ ra phải dùng chung, để mobile không viết lại lần hai?
3. Trước khi mobile dev gõ dòng đầu tiên, Leader phải chốt và chuẩn bị những gì?

Kết luận ngắn: **Excel còn đúng gần như tuyệt đối**, nên phần lớn giá trị của lần rà này nằm ở
câu 2 và 3 — hai câu Excel gần như không đụng tới.

### Giới hạn của lần rà này (nói trước để không hiểu nhầm)

| Đã làm | Chưa làm |
| --- | --- |
| Đọc mã, `git diff` baseline→HEAD, đếm/grep có bằng chứng | **Không chạy ứng dụng** |
| Quét 921 file TS/TSX ở `apps/*` + `packages/*` tìm file mồ côi | **Không chạy vitest / jest** (jest cần Docker + PostgreSQL) |
| Đối chiếu 97 dòng Excel với đường dẫn + số dòng thật | **Không chạy lại `i18n:audit`** — con số 2.993 lấy nguyên từ Excel |
| Kiểm tra tất cả 12 ADR, 195 endpoint, 63 model | Không mở trên thiết bị thật |

Hai con số trong Excel tôi **không tự xác minh lại được** mà không chạy lệnh: `vitest 1609/1612`
và `i18n:audit 2.993 chuỗi`. Chúng nằm trong Master Action Plan như việc cần chạy lại.

---

## 1. Executive Summary

**1. Audit Excel còn chính xác không?** — Còn, gần như 100%.
Từ baseline `133b894` tới `HEAD`, đúng **2 commit / 5 file / 255 dòng thêm**, và **không có một
dòng mã ứng dụng nào**: chỉ `.claude/commands/commit.md`, `.gitignore`, `CLAUDE.md`,
`docs/README.md`, `docs/git-workflow.md`. Working tree chỉ có `apps/web/next-env.d.ts` (file Next
tự sinh) + chính file Excel chưa commit.

**2. Bao nhiêu feature cần đổi status?** — **0 / 97.** Tôi spot-check 12 khẳng định rủi ro nhất
(gồm mọi thứ Excel đánh Blocked/Bug/Not Started) — tất cả **VERIFIED**, đúng tới từng số dòng.

**3. Có feature mới không?** — Một, rất nhỏ: `GET /health` (`modules/health/health.controller.ts`)
không có trong 97 dòng. Ngoài ra là **6 phát hiện mới không phải feature** mà là rủi ro/nợ Excel
chưa bắt (mục 2.3) — trong đó 2 cái quan trọng thật.

**4. Có bao nhiêu shared module hiện tại?** — **4 package**, nhưng chỉ 2 có nội dung:
`@xeprime/types` (20 module, 64 permission, 48 mã lỗi, 83 nhóm status, ADR 0011 tính tháng lịch),
`@xeprime/validators` (yup schema xe/nguồn/giấy tờ/bảo dưỡng/shop/chi nhánh/tài khoản/auth).
`@xeprime/ui` **rỗng hoàn toàn** (`export {}`), `@xeprime/config` chỉ có tsconfig/eslint.

**5. Có bao nhiêu thứ đáng lẽ shared?** — Khoảng **8.400 dòng** logic không phụ thuộc nền tảng
đang nằm trong `apps/web`, cộng **1.596 khoá message × 2 ngôn ngữ** và **131 design token**.
Con số then chốt: 4.386 dòng `api.ts` + `types.ts` + `schema.ts` + `constants.ts` của 39 feature
**không import một dòng `next/*` hay `antd` nào** (đúng 1 ngoại lệ, là type-only).

**6. Có duplication nguy hiểm không?** — Có **2 cái thật sự nguy hiểm**:
- **Nhãn nghiệp vụ có hai nguồn**: 166 `label:` tiếng Việt trong `packages/types` **và** 353 nhãn
  trong `messages/{vi,en}/domain.json`. Mobile sẽ là bản sao thứ ba.
- **Thông báo là văn xuôi tiếng Việt lưu trong CSDL**: 18 chỗ ở backend ghi thẳng `title`/`body`
  tiếng Việt vào bảng `notifications`; `NotificationBell.tsx:88-89` in ra nguyên xi, không qua
  `t()`. Giao diện tiếng Anh vẫn hiện tiếng Việt, và **push notification của mobile sẽ đẩy đúng
  chuỗi đó ra màn hình khoá điện thoại**. Excel (COM-04) chỉ ghi "5 chuỗi chưa i18n" — đây là
  vấn đề cấu trúc, không phải 5 chuỗi.

**7. Mobile dev bắt đầu ngay được không?** — **Chưa.** Một chặn cứng ở tầng kỹ thuật, hai chặn
ở tầng quyết định:
- `AuthGuard` **chỉ đọc cookie**, cố ý không đọc `Authorization: Bearer`
  (`apps/api/src/common/guards/auth.guard.ts:17-18`). App native không có trình duyệt để giữ
  cookie `SameSite=Lax` một cách đáng tin. **ADR 0002 đã chốt sẵn lời giải** ("App native sau này:
  cho AuthGuard chấp nhận thêm nguồn `Authorization: Bearer <session jwt>`") — chỉ là chưa ai làm.
- **Chưa có ADR nào về mobile.** Tài liệu duy nhất nói về native là
  `docs/xeprime_build_plan_nextjs_nestjs_prod.md:751` — và nó ghi ngược lại: *"Native mobile app |
  Chưa làm, ưu tiên PWA responsive"*.
- ~~**PAY-01 chưa có quyết định.**~~ **ĐÃ CHỐT 21/08/2026 — [ADR 0013](decisions/0013-no-online-payment-mvp.md):
  KHÔNG làm thanh toán trực tuyến.** Luồng đặt xe của mobile kết thúc ở "đã gửi yêu cầu → gian hàng
  duyệt", giống hệt web. Không thiết kế bước thanh toán, không trạng thái "chờ thanh toán".

**8. Blocker lớn nhất?** — Theo thứ tự: (1) đường vận chuyển session cho native; (2) quyết định
thanh toán; (3) push notification — không có `device_tokens`, không có FCM sender, và nội dung
thông báo đang là tiếng Việt cứng; (4) vòng đời phiên: không refresh, không sliding renewal,
không bảng thu hồi phiên → mất máy là không revoke được, và 7 ngày là đăng xuất im lặng.

**9. Năm việc Leader nên làm trước** — xem mục 12; tóm tắt: ~~chốt PAY-01~~ (xong, ADR 0013) · viết ADR mobile ·
duyệt việc mở Bearer cho AuthGuard · duyệt tách 2 package dùng chung · ký eSMS + cấp SMTP.

**10. Nếu chỉ có 1 tuần?** — Làm đúng 3 việc, bỏ hết phần còn lại:
`Bearer auth (1–2 ngày)` → `tách @xeprime/api-client + @xeprime/domain (2–3 ngày)` →
`ADR mobile (song song — PAY-01 đã chốt ở ADR 0013)`. Ba việc này biến "mobile dev ngồi chờ"
thành "mobile dev clone được ngay đợt 1". i18n, push, PDF, test đều **không** nên nhét vào tuần đó.

---

## 2. Audit Delta — Excel ↔ code hiện tại

### 2.1 Delta ở tầng repo

```
git log --oneline 133b894..HEAD
  a4db14b chore(repo): make /commit push the branch after commit
  2b1f6ba chore(repo): add /commit git workflow command

git diff --stat 133b894..HEAD
  .claude/commands/commit.md | 181 +++++
  .gitignore                 |   6 ++
  CLAUDE.md                  |   1 +
  docs/README.md             |   2 +
  docs/git-workflow.md       |  65 +++
  5 files changed, 255 insertions(+)
```

**Không có `apps/`, không có `packages/`, không có `prisma/`.** Kết luận thẳng: mọi khẳng định của
Excel về mã nguồn vẫn đúng nguyên văn. Không cần re-audit 97 dòng.

> Có một nhánh `codex/vehicle-card-redesign` (worktree `.codex-worktrees/`) nằm ngoài `develop` —
> ngoài phạm vi lần rà này, nhưng Leader nên biết là nó tồn tại và chưa merge.

### 2.2 Spot-verification 12 khẳng định rủi ro nhất

| ID | Excel nói | Code hiện tại | Delta | Audit Valid? |
| --- | --- | --- | --- | --- |
| SYS-03 | 195 endpoint sinh từ OpenAPI | `packages/types/src/api.generated.ts` — đếm được đúng **195** đường dẫn | — | **VERIFIED** |
| PAY-02 | `webhooks = Record<string, never>` tại dòng 3396 | `api.generated.ts:3396` đúng nguyên văn | — | **VERIFIED** |
| — | 63 model Prisma | `prisma/schema.prisma` — **63** `model`, 2.405 dòng | — | **VERIFIED** |
| SHP-07 / BUG-03 | 2 thẻ KPI chết ở dòng 66 và 74 | `DashboardView.tsx:66` `value="—"`, `:74` `value="—"` | — | **VERIFIED** |
| FIN-01 / BUG-10 | 4 chỗ inline hex | `manage/finance/page.tsx:47,52,60,69` — `#389e0d`, `#cf1322`, `#d48806` | — | **VERIFIED** |
| SHP-08/09 / BUG-11 | PlaceholderPage 5 dòng, `nav.ts:288/319` | Cả hai `page.tsx` đúng **5 dòng**; `nav.ts:288` và `:319` còn `comingSoon: true` | — | **VERIFIED** |
| VEH-09 / BUG-09 | API sửa chi phí có, UI chưa gọi | `api.generated.ts:1254` có `/vehicles/{id}/maintenance/records/{recordId}/cost`; `features/vehicle-maintenance/api.ts` **0 caller** | — | **VERIFIED** |
| VEH-08 | OCR provider chủ động reject | `ocr-provider.ts` — `OcrNotConfiguredProvider.extract()` reject `"OCR provider chưa được cấu hình"` | — | **VERIFIED** |
| PAY-01 | Grep 12 từ khoá cổng thanh toán = 0 | Grep lại `vnpay\|momo\|zalopay\|stripe\|payos\|onepay\|napas\|paypal\|payment_gateway\|paymentIntent\|checkout_url` trên `apps/*/src`, `packages/*/src`, `prisma` → **0** | — | **VERIFIED** |
| COM-07 | Không có FCM / device token | Grep `device_token\|deviceToken\|fcm\|push_subscription` → **0**; 63 model không có bảng nào | — | **VERIFIED** |
| MKT-02 / BUG-04 | 3 test đỏ ở `search-experience.test.tsx` | File tồn tại, chưa sửa (không có commit nào chạm) — **chưa chạy lại test** | — | **UNCHANGED (chưa chạy)** |
| SYS-01 / BUG-05 | 2.993 chuỗi chưa i18n | Mã web không đổi ⇒ con số không đổi — **chưa chạy lại `i18n:audit`** | — | **UNCHANGED (chưa chạy)** |

**Kết quả: 97/97 dòng = UNCHANGED. Không dòng nào phải đổi status.**
Hai dòng cuối là "chưa chạy lệnh xác nhận", không phải "nghi ngờ sai".

### 2.3 Phát hiện MỚI không có trong Excel

Không tạo ID mới trong hệ thống hiện có — dưới đây là **đề xuất**, Leader chốt rồi mới thêm vào file.

| # | Suggested ID | Suggested Module | Nội dung | Bằng chứng | Đề xuất status |
| --- | --- | --- | --- | --- | --- |
| N1 | **SYS-10** | System | `GET /health` (readiness probe, `@nestjs/terminus`) — không có trong 97 dòng | `apps/api/src/modules/health/health.controller.ts:8,21`; `api.generated.ts` có path `/health` | Done · P2 · Out of Scope cho UI |
| N2 | **BUG-21** | System | **`i18n:audit` không quét `packages/`** — 112 chuỗi tiếng Việt cứng nằm trong `@xeprime/validators` (98 ở `index.ts`, 12 ở `auth.ts`, 2 ở `phone.ts`) mà con số 2.993 **không** tính | `apps/web/scripts/i18n-audit.mjs:33` — `SRC_ROOT = <web>/src`, không có root nào khác | Open · High · nợ i18n bị **báo thiếu** |
| N3 | **BUG-22** | System | **Nhãn nghiệp vụ có hai nguồn sự thật**: 166 `label:` tiếng Việt trong `packages/types` (432 chuỗi VN tổng) song song 83 nhóm / 353 nhãn trong `messages/{vi,en}/domain.json` | `packages/types/src/status/*.ts` (`*_META.label`) vs `apps/web/messages/vi/domain.json` | Open · High · **rủi ro cho mobile** |
| N4 | **BUG-23** | Communication | **Thông báo là văn xuôi tiếng Việt lưu trong DB.** 18 chỗ backend ghi `title`/`body` tiếng Việt; FE in nguyên xi | `settlement.service.ts:313` (`Số tiền hoàn ${formatVnd(...)}`), `bookings.service.ts:357,772`; `NotificationBell.tsx:88-89` render `{n.title}`/`{n.body}` không qua `t()` | Open · **High** · chặn i18n thật + chặn push đa ngữ |
| N5 | **BUG-24** | Authentication | **Vòng đời phiên chưa đủ theo chính ADR 0002 §5**: không sliding renewal, **không có bảng phiên** ⇒ `sid` được ký nhưng không revoke được thiết bị nào | Không có `model Session/UserSession` trong 63 model; grep `sliding\|renew\|reissue` ở `apps/api/src` = 0 | Open · Medium (Web) · **High (Mobile)** |
| N6 | **BUG-25** | System | **CSRF chưa triển khai** dù ADR 0002 §3 và `session.service.ts:65-66` đều nói cần khi web ≠ origin API | Grep `csrf\|csurf\|x-xsrf` ở `apps/api/src` → chỉ có comment, không có middleware | Open · Medium · chỉ liên quan web |
| N7 | **BUG-26** | System | **Hai bộ format tiền khác nhau, cả hai đều lên màn hình**: BE `formatVnd` → `1.234.567đ` (luôn vi-VN); FE `formatMoneyVnd` → `1.234.567 ₫` / `1,234,567 ₫` theo locale | `apps/api/src/common/money.ts:29` vs `apps/web/src/lib/money.ts:24` | Open · Low · lộ ra ở thông báo |
| N8 | **BUG-27** | System | **2 file mã chết** (xem mục 9) | `AutoCompleteField.tsx`, `PhoneVerifyControl.tsx` | Open · Low |

**N3 và N4 là hai cái đáng để Leader đọc kỹ** — chúng không phải bug lẻ, chúng là thứ mobile sẽ
nhân đôi nếu không chặn trước.

---

## 3. Shared Map — cái gì đang shared, cái gì nên shared

### 3.1 Trạng thái 4 package hiện có

| Package | Nội dung thật | Mobile dùng được ngay? |
| --- | --- | --- |
| `@xeprime/types` | 20 module: 83 nhóm status + META màu · 64 permission + map role→permission mặc định · 48 mã lỗi + envelope `{data,meta}` · ADR 0011 (`addCalendarMonthsVn`, `longTermPackageAmounts`, gói 1/2/3/6/9/12) · `normalizeVnPhone` · danh mục 34 tỉnh + alias · hằng upload (MIME, 10MB) · `api.generated.ts` 195 endpoint | ✅ **Có** — emit CommonJS (`packages/config/tsconfig/lib.json`), Metro đọc được |
| `@xeprime/validators` | Yup: `vehicleFormSchema`, `vehicleSourceFormSchema`, `vehicleDocumentFormSchema`, `maintenanceProfile*`, `odometerCorrection*`, `bookingPeriodSchema(+MinDays)`, `registerShopSchema`, `branchFormSchema`, `shopProfileSchema`, `accountProfileSchema`, `login/register/forgot/resetSchema` | ⚠️ **Có, nhưng** — 112 message lỗi là tiếng Việt cứng (N2) |
| `@xeprime/ui` | Design token (`XP_TOKENS`, 131 token) + `tokens.css`. Export gốc là TS thuần — **luật ranh giới**: component web (nếu có sau này) đi subpath riêng | ✅ **Có** — token đọc được từ RN; màu dùng nguyên, kích thước qua `toPx()` |
| `@xeprime/config` | tsconfig (base/lib/nest/nextjs) + eslint | ⚠️ Thiếu preset cho RN |

### 3.2 Bảng Shared Map

| Domain | Vị trí hiện tại | Web dùng | Mobile cần | Shared now? | Should share? | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| Status union + màu | `packages/types/src/status/` (83 nhóm) | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Role / permission (64) | `packages/types/src/rbac.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Mã lỗi API (48) + envelope | `packages/types/src/api.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Type endpoint (195) | `packages/types/src/api.generated.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Gói thuê dài hạn / tháng lịch | `packages/types/src/long-term.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Chuẩn hoá SĐT VN | `packages/types/src/phone.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Danh mục tỉnh/thành | `packages/types/src/province.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Hằng upload (MIME/size) | `packages/types/src/upload.ts` | ✅ | ✅ | **Có** | Giữ nguyên | — |
| Yup schema form | `packages/validators/src/` | ✅ | ✅ | **Có** | Giữ + gỡ chữ VN | P1 |
| **HTTP client + envelope + `ApiClientError`** | `packages/api-client/src/client.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 | — |
| **Query key TanStack** | `packages/api-client/src/query-keys.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 | — |
| **`api.ts` của 39 feature** | `apps/web/src/features/*/api.ts` (2.168 dòng) | ✅ | ✅ | ❌ | **Nên** | **P0** |
| **`types.ts` của feature** (alias từ `components['schemas']`) | `apps/web/src/features/*/types.ts` (801 dòng) | ✅ | ✅ | ❌ | **Nên** | **P0** |
| **`constants.ts` của feature** | `apps/web/src/features/*/constants.ts` (730 dòng) | ✅ | ✅ | ❌ | **Nên** (trừ 1 file, xem 5.1) | P1 |
| **`schema.ts` của feature** | `apps/web/src/features/*/schema.ts` (687 dòng) | ✅ | ✅ | ❌ | **Nên** (trừ phần dính `Dayjs`) | P1 |
| **Hook dữ liệu TanStack** | `apps/web/src/features/*/hooks/` (3.566 dòng, 75 import `@tanstack/react-query`) | ✅ | ✅ | ❌ | **Nên** — chỉ 7 file dính `next/*`/`antd` | P1 |
| **Tiền: format/cộng trừ trên chuỗi** | `packages/domain/src/money.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 | — |
| **Lịch bận / xung đột khoảng thuê** | `packages/domain/src/rental-busy.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 — luật an toàn, có test đi kèm | — |
| **Nguyện vọng nhận xe dài hạn** | `packages/domain/src/long-term.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 | — |
| **KM còn lại tới mốc bảo dưỡng** | `apps/web/src/lib/odometer.ts` | ✅ | ✅ | ❌ | Nên | P2 |
| **Nhãn xe `Tên (biển số)`** | `apps/web/src/lib/vehicle-label.ts` | ✅ | ✅ | ❌ | Nên | P2 |
| **Link `tel:` / Zalo** | `apps/web/src/lib/contact.ts` | ✅ | ✅ | ❌ | Nên | P2 |
| **Múi giờ + đếm thời lượng thuê** | `packages/domain/src/datetime.ts` | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 | — |
| **Bó message vi/en** — TOÀN BỘ 21 namespace | `packages/domain/messages/{vi,en}/` (2.172 khoá) | ✅ | ✅ | **Có** ✅ | Xong 24/08/2026 — dùng chung trọn bộ; `i18n:check` canh parity trên gốc package | — |
| **Ánh xạ mã lỗi → câu** | `apps/web/src/i18n/use-error-message.ts` | ✅ | ✅ | ❌ | Nên (tách phần thuần khỏi hook React) | P1 |
| **Design token** (131 token) | `packages/ui/src/tokens/` (`XP_TOKENS`) | ✅ | ✅ (giá trị, không phải CSS) | **Có** ✅ | Xong 24/08/2026 — vào `@xeprime/ui` (export gốc platform-free) thay vì package `@xeprime/tokens` mới, vì `packages/ui` rỗng và đã khai sẵn export `./styles.css` | — |
| **Menu + quyền của menu** | `apps/web/src/constants/nav.ts` | ✅ | ⚠️ một phần | ❌ | Chỉ phần map quyền→mục | P2 |
| **`usePermissions`** | `apps/web/src/hooks/use-permissions.ts` | ✅ | ✅ | ❌ | Nên | P1 |
| Filter sống ở URL | `apps/web/src/hooks/use-url-filters.ts` | ✅ | ❌ (mobile không có URL) | ❌ | **Không** — mobile cần bản khác cùng interface | — |
| Upload lên R2 | `apps/web/src/services/upload.ts` | ✅ | ⚠️ contract có, transport khác | ❌ | Tách: presign **shared**, `File`/`XHR` **không** | P1 |
| Firestore chat projection | `apps/web/src/features/chat/lib/firebase-client.ts` | ✅ | ✅ (SDK khác) | ❌ | Contract shared, client riêng | P2 |
| Component (37.292 dòng tsx) | `apps/web/src/components` + `features/*/components` | ✅ | ❌ | — | **Không bao giờ** | — |
| CSS Module | rải khắp `features/` | ✅ | ❌ | — | **Không** | — |

### 3.3 Con số tóm tắt

```
Đang shared thật     : packages/types + packages/validators
Nên shared, chưa     : ~8.400 dòng TS thuần logic trong apps/web
                       + 1.596 khoá message × 2 ngôn ngữ
                       + 131 design token
Không thể shared     : 37.292 dòng .tsx + toàn bộ .module.css
```

**Bằng chứng cho con số "không phụ thuộc nền tảng"** — tổng hợp mọi import không tương đối trong
4.386 dòng `api.ts`/`types.ts`/`schema.ts`/`constants.ts` của cả 39 feature:

```
80  @xeprime/types        10  yup                 2  @xeprime/validators
36  @/services/api-client  3  @/lib/datetime      2  @/services/upload
 2  dayjs                  1  @/i18n/use-app-format · @/i18n/keys · @/constants/routes
 1  @/components/form/SelectField   ← DUY NHẤT một chỗ rò UI (type-only)
```

Không có `next/*`. Không có `antd`. Không có `react-dom`. Đây là lý do việc tách khả thi và rẻ.

---

## 4. Duplication Risk — thứ mobile chắc chắn sẽ viết lại

| # | Hạng mục | Web hiện có (PATH) | Rủi ro nếu mobile tự viết | Nên share ở đâu | Prio |
| --- | --- | --- | --- | --- | --- |
| D1 | **Nhãn status/enum** | `packages/types/src/status/*.ts` (166 `label:` VN) **+** `apps/web/messages/{vi,en}/domain.json` (83 nhóm / 353 nhãn) | Đã có **2** nguồn; mobile thành **3**. Một trạng thái đọc ra ba tên khác nhau ở ba nơi | `@xeprime/domain` (bó message) — `packages/types` chỉ giữ MÃ + MÀU | **P0** |
| D2 | **Câu lỗi API** | `apps/web/messages/*/errors.json` ánh xạ từ 48 mã ở `packages/types/src/api.ts` | Mobile hiện `error.message` tiếng Việt của backend — đúng thứ ADR 0012 §4 cấm | `@xeprime/domain` | **P0** |
| D3 | **Lớp gọi API + bóc envelope** | `apps/web/src/services/api-client.ts:90-135` | Mobile bóc `{data}` sai một chỗ là hỏng im lặng; xử lý `code` lệch nhau ⇒ hai app phản ứng khác nhau trước cùng một lỗi | `@xeprime/api-client` | **P0** |
| D4 | **Xung đột lịch bận phía client** | `apps/web/src/lib/rental-busy.ts:87-96` (`rangeBusyConflict`, nửa mở `[)` khớp đúng exclusion constraint) | Mobile cảnh báo khác web ⇒ khách chọn được khoảng mà server sẽ từ chối 409. **Đây là luật an toàn, không phải tiện ích** | `@xeprime/domain` | **P0** |
| D5 | **Query key / invalidation** | `apps/web/src/services/query-keys.ts` (269 dòng) | Cache mobile không invalidate đúng nhánh ⇒ màn hình cũ sau khi ghi | `@xeprime/api-client` | P1 |
| D6 | **Filter → query params** | `filtersToParams()` trong từng `features/*/api.ts` | Mobile gõ lại tên tham số ⇒ lọc "gần đúng", lệch phân trang | `@xeprime/api-client` | P1 |
| D7 | **Yup schema + message lỗi** | `packages/validators` (đã shared) + `features/*/schema.ts` (687 dòng chưa shared) | Ràng buộc form lệch backend; và message VN cứng ⇒ app tiếng Anh báo lỗi tiếng Việt | `@xeprime/validators` (khoá message thay vì câu) | P1 |
| D8 | **Định dạng tiền** | `apps/web/src/lib/money.ts:24` vs `apps/api/src/common/money.ts:29` — **đã lệch sẵn** (`1.234.567 ₫` vs `1.234.567đ`) | Mobile thành bản thứ ba | `@xeprime/domain` | P2 |
| D9 | **Nguyện vọng nhận xe dài hạn** | `apps/web/src/lib/long-term.ts:37` — docblock ghi rõ "một hàm duy nhất vì đây là chỗ dễ nói khác nhau nhất" | Mobile phân loại kiểu khác ⇒ ngụ ý mức chắc chắn khác về lịch (ADR 0011) | `@xeprime/domain` | P1 |
| D10 | **Công thức tiền của một đơn** | `apps/api/src/common/booking-money.ts` (TS + SQL, một nguồn) | Thấp — server tính, client chỉ đọc. **Giữ nguyên ở backend** | — | — |
| D11 | **`usePermissions`** | `apps/web/src/hooks/use-permissions.ts` | Menu mobile hiện mục mà API trả 403 | `@xeprime/api-client` (hook thuần React, chạy cả RN) | P1 |
| D12 | **Design token** | `apps/web/src/styles/theme.ts` (131 token, lấy từ Figma `14:2`) | Mobile tự lấy màu từ Figma ⇒ hai bảng màu trôi khỏi nhau | `@xeprime/tokens` | P2 |

---

## 5. Code đang nằm sai chỗ

### 5.1 Rò tầng (đã xác minh, mỗi cái đúng một chỗ)

| PATH | Vấn đề | Ghi chú |
| --- | --- | --- |
| `apps/web/src/features/vehicles/constants.ts:13` | `import type { SelectFieldOption } from '@/components/form/SelectField'` — module hằng số phụ thuộc một component UI | Type-only nên không kéo runtime, nhưng nó là **điểm rò duy nhất** trong 4.386 dòng logic sạch. Tách package sẽ vấp đúng chỗ này |
| `apps/web/src/services/api-client.ts` | Hợp đồng API (envelope + 48 mã lỗi + lớp `ApiClientError`) sống trong app web | Đây là hợp đồng **giữa hai tầng**, không phải chi tiết của web |
| `apps/web/src/lib/{money,rental-busy,long-term,odometer,contact,vehicle-label}.ts` | 763 dòng luật nghiệp vụ thuần trong app web | Không có một import UI nào |
| `apps/web/messages/{vi,en}/{domain,errors,common}.json` | Từ vựng nghiệp vụ + câu lỗi (dùng chung mọi client) nằm trong app web | `domain` + `errors` là **hợp đồng**, `vehicles.json` mới là chuyện riêng của web |
| `apps/web/scripts/i18n-audit.mjs:33` | Chỉ quét `<web>/src` | ⇒ 112 chuỗi VN ở `packages/validators` vô hình (N2) |
| `packages/ui/src/index.ts` | ~~Package rỗng tên `ui`~~ **ĐÃ ĐỔI 24/08/2026** | Nay chứa design token (export gốc platform-free) — **RN dùng được và NÊN dùng**. Component web nếu có sau này đi subpath riêng |

### 5.2 Cái KHÔNG sai chỗ (để không sửa nhầm)

- `apps/api/src/common/phone.ts` — chỉ re-export `@xeprime/types`. Đúng.
- `apps/api/src/common/booking-money.ts` — dùng `Prisma.Decimal` + `Prisma.sql`, đúng là của server.
- `features/*/hooks/*-filters.ts` phụ thuộc `next/navigation` — đúng ADR 0004 (filter sống ở URL).
  Mobile cần bản khác, **không phải** kéo cái này ra.
- `features/vehicle-maintenance/schema.ts` giữ `Dayjs` ngoài `@xeprime/validators` — lý do đã ghi
  trong `packages/validators/src/index.ts`, hợp lý.
- `features/catalog/test-catalog.ts` — fixture, 4 test dùng. Không phải mã chết.

---

## 6. API Readiness cho Mobile

| Domain | API Ready | Web đang dùng | Mobile ready | Vấn đề |
| --- | --- | --- | --- | --- |
| **Auth / session** | ✅ 14 endpoint | ✅ | ✅ | Hai đường: cookie (web) + `Authorization: Bearer` (native — ADR 0017). Bốn endpoint mới `/auth/mobile/{session,login,refresh,logout}` |
| **Session lifecycle** | ⚠️ | ✅ | ✅ | Native: access 15′ + refresh xoay vòng + revoke theo thiết bị (`native_auth_sessions`). **Web vẫn** JWT 7 ngày, không refresh/sliding/revoke — ADR 0017 cố ý không đụng |
| **RBAC** | ✅ `GET /auth/me`, `/rbac/my-permissions` | ✅ | ✅ | Quyền đọc từ DB mỗi request (ADR 0002) — mobile hưởng nguyên |
| **Marketplace công khai** | ✅ 13 endpoint `/public/*` | ✅ | ✅ | Có phân trang + facet. Khu chín nhất |
| **Booking request (khách)** | ✅ | ✅ | ⚠️ | Cổng OTP bắt buộc, mà OTP đang mock (COM-06) |
| **Booking vận hành** | ✅ 20 endpoint | ✅ | ✅ | — |
| **Calendar** | ✅ 6 endpoint | ✅ | ✅ (API) / ❌ (UI) | API ổn; timeline ngang phải **thiết kế lại**, không port |
| **Vehicles** | ✅ 33 endpoint | ✅ | ✅ | — |
| **Customers** | ✅ 15 endpoint | ✅ | ✅ | Có kiểm soát PII theo quyền |
| **Finance** | ✅ receipts/debts/finance | ✅ | ✅ | — |
| **Upload (R2)** | ✅ presign 6 nhóm | ✅ | ⚠️ | Contract ổn; `services/upload.ts` dùng `File` + `XMLHttpRequest` — RN cần adapter |
| **Chat** | ✅ + Firestore projection | ✅ | ✅ | ADR 0009: PG là nguồn sự thật, có fallback REST polling. Mobile dùng chung projection |
| **Notification** | ⚠️ | ✅ polling 60s | ❌ | Không push, không `device_tokens`; **nội dung là tiếng Việt cứng trong DB** (N4) |
| **Payment online** | ❌ | ❌ | ❌ | Không tồn tại. Chưa có ADR |
| **Hợp đồng** | ⚠️ | ✅ in trình duyệt | ❌ | Không có PDF phía server ⇒ app không chia sẻ/lưu được |
| **Tìm kiếm toàn cục** | ❌ | ❌ (cố ý) | ❌ | `Topbar.tsx:27` — chưa có API |
| **Health** | ✅ `GET /health` | — | ✅ | — |

**Nền tảng chung — điểm mạnh thật sự cho mobile:**
- Envelope `{data, meta}` / `{error:{code,message,details}}` nhất quán, ép ở `response.interceptor.ts`
  và `all-exceptions.filter.ts`; `api-client.ts:127-135` **ném lỗi nếu endpoint quên bọc** — hợp đồng
  không trôi được.
- `PaginationMeta { page, limit, total, hasNext }` chuẩn hoá ở `packages/types/src/api.ts`.
- 48 mã lỗi ổn định ⇒ mobile nhánh theo mã, không theo câu.
- Rate limit `ttl: 60_000, limit: 120` (`app.module.ts:82`) — mobile phải biết để không retry mù.
- CORS không phải vấn đề với RN (CORS là cơ chế của trình duyệt).

---

## 7. Mobile Blockers

### P0 — chặn cứng, mobile dev không bắt đầu được nếu chưa xong

| ID | Blocker | Bằng chứng | Lời giải đã có sẵn? |
| --- | --- | --- | --- |
| ~~**P0-1**~~ **ĐÃ ĐÓNG** 24/08/2026 | ~~AuthGuard chỉ nhận cookie~~ | `auth.guard.ts` nay nhận hai nguồn; `common/optional-user.ts` cũng vậy | ✅ [ADR 0017](decisions/0017-native-bearer-auth.md) — Bearer access token 15′ + refresh xoay vòng, bảng `native_auth_sessions`. Khác dự kiến của ADR 0002 ở một điểm: **không** dùng lại session JWT 7 ngày (không thu hồi được) |
| ~~**P0-2**~~ **ĐÃ ĐÓNG** 24/08/2026 | ~~Chưa có ADR về mobile~~ | — | ✅ [ADR 0017](decisions/0017-native-bearer-auth.md). Hai dòng trong `xeprime_build_plan_nextjs_nestjs_prod.md` (`:81`, `:751`) nói "chưa build native" nay **đã lạc hậu** — ADR thắng tài liệu cũ (CLAUDE.md §2) |
| ~~**P0-3**~~ **ĐÃ GỠ** | ~~PAY-01 chưa có quyết định nghiệp vụ~~ | Đã chốt 21/08/2026 | ✅ [ADR 0013](decisions/0013-no-online-payment-mvp.md) — không làm; luồng mobile dừng ở "đã gửi yêu cầu" |
| **P0-4** | **Hợp đồng client chưa đóng gói được** — `api.ts` của 38 feature còn lại vẫn trong `apps/web` | mục 3.2 | ⚠️ **Nền đã xong** 24/08/2026: `@xeprime/api-client` (client + `AuthTransport` + query key + feature `auth`) và `@xeprime/domain` (tiền · ngày giờ · lịch bận · nguyện vọng nhận xe). Còn lại: chuyển từng feature theo §14.1 bước 3–4 |

### P1 — nên xong trước khi mobile chạm vào luồng tương ứng

| ID | Blocker | Chặn luồng nào | Bằng chứng |
| --- | --- | --- | --- |
| P1-1 | Không refresh / sliding / revoke phiên — **chỉ còn WEB** | Web. Native đã có refresh + revoke theo thiết bị (ADR 0017); ADR đó cố ý không đụng vòng đời cookie của web | N5 |
| P1-2 | **COM-07 push** — không `device_tokens`, không FCM sender | Thông báo. Không push thì app native gần như vô nghĩa với chủ shop | Excel COM-07 + grep = 0 |
| P1-3 | **N4 — thông báo là tiếng Việt cứng trong DB** | Push + chuông. Phải sửa **trước** khi làm push, nếu không push ra tiếng Việt vĩnh viễn | `settlement.service.ts:313`, `NotificationBell.tsx:88-89` |
| P1-4 | **COM-06 eSMS** | BKG-01 — khách THẬT không đặt được xe trên mọi client | Excel BUG-01 |
| P1-5 | Message lỗi VN cứng trong `@xeprime/validators` | Mọi form mobile ở tiếng Anh | N2 |
| P1-6 | **BKG-14 chưa có PDF phía server** | Hợp đồng — app không có `Ctrl+P` | Excel BUG-12 |
| P1-7 | **AUTH-04 chưa có Apple Sign-In** | **Chặn phát hành iOS** (không chặn dev) | `firebase-social-auth.ts:106-115` |
| P1-8 | D1/D2 — nhãn + câu lỗi hai nguồn | Mọi màn hình mobile | N3 |

### P2 — làm song song được, không chặn

- Nợ i18n 2.993 (+112 ở validators) — cổng quản lý.
- BUG-03 (2 thẻ chết dashboard), BUG-04 (3 test đỏ), BUG-09 (nút sửa chi phí), BUG-10 (inline hex).
- Vùng trống test: `features/bookings`, `features/chat`, `features/dashboard`, `features/account`,
  `apps/worker` — 0 file test.
- **CAL-01 thiết kế lại lịch cho màn dọc** — việc của designer, chạy song song từ hôm nay được.
- BUG-25 CSRF (chỉ web), BUG-26 format tiền, BUG-27 mã chết.

### P3 — để sau

VEH-08 OCR · SYS-09 tìm kiếm ⌘K · SHP-08 pickup areas · SHP-09 thùng rác · PAY-04 hoá đơn gói ·
ADM-13 support ticket · toàn bộ ADM-01→13 trên mobile.

---

## 8. Docs Audit

| Tài liệu | Phân loại | Vấn đề cụ thể |
| --- | --- | --- |
| `docs/decisions/0001–0012` | **KEEP** | 12 ADR, còn đúng. Nguồn sự thật tốt nhất của dự án |
| `CLAUDE.md:22` | **UPDATE** · **DOCUMENTATION DRIFT** | Ghi *"9 ADR (0001–0009)"* — thực tế **12 ADR**. Bảng ngay dưới đã liệt kê 0011/0012, và ADR 0010 (billing) **không có trong bảng** dù `packages`/`docs` đều dẫn chiếu |
| `docs/README.md` | **UPDATE** · **DRIFT** | Ghi *"8 ADR"* (thực tế 12) · ghi `design/` "11 tài liệu" (thực tế 15) · **không nhắc `docs/design-briefs/` (532K, 13 file) và `docs/implementation/` (648K, 15 file)** — hai thư mục tài liệu **lớn nhất repo** không có trong mục lục |
| `docs/xeprime_build_plan_nextjs_nestjs_prod.md:81,751` | **OUTDATED** · **DRIFT nghiêm trọng** | *"Native mobile app — Chưa làm, ưu tiên PWA responsive"*. Đây là **tài liệu duy nhất** trong `docs/` nói về native, và nó nói ngược với kế hoạch tuyển RN dev |
| `docs/design/05_MOBILE_FIRST_GUIDELINES.md` | **KEEP** (nhưng dễ hiểu nhầm) | Tên gợi ý "mobile" nhưng nội dung là **responsive web** (`useIsMobile ≤ 640px`). Mobile dev đọc nhầm sẽ tưởng đã có hướng dẫn native |
| `docs/completion-roadmap.md` | **UPDATE** | Tuyên bố `vitest 1533/1533 (103 file)`; Excel đo 20/08 ra **1.612 test / 109 file / 3 đỏ**. Header ghi "Cập nhật gần nhất: 17/08" trong khi mục mới nhất là 19/08 |
| `docs/CODEMAP.md` | **KEEP** | Khớp code. **Thiếu**: chưa có dòng nào cho `packages/api-client`/`domain` (chưa tồn tại) — nhớ thêm khi tách |
| `docs/claude-i18n-prompt.txt` | **DELETE CANDIDATE** | 24K, **không file `.md` nào tham chiếu**. Là prompt one-off còn sót |
| `docs/plans/*.md` (5 file) | **UNKNOWN** | 4/5 tên bị mã hoá hỏng dấu tiếng Việt (`ph-n-t-ch-trang-vast-nygaard.md`, `y-l-m-n-h-nh-cached-thacker.md`…). 120K. Là plan cũ, không ai tra cứu được bằng tên |
| ~~`docs/design-briefs/` (532K) · `docs/implementation/` (648K)~~ | **ĐÃ CHO NGHỈ HƯU 21/08/2026** | 24 file / ~11.900 dòng đã xoá: ảnh chụp 04–06/08, 0 mã nào dẫn `design-briefs`, 11/14 brief chưa từng được duyệt, spot-check ra 6 khẳng định sai. Giữ lại đúng [`design-token-map.md`](design-token-map.md) vì `theme.test.ts` cưỡng chế nó. Lý do đầy đủ ở [`README.md`](README.md) §Đã xóa |
| `docs/xeprime_database_design.md`, `_screen_spec_`, `_overall_user_flow_`, `_fe_base_stack_calendar` | **KEEP (tham chiếu)** | Đã đánh dấu đúng là "ADR thắng khi mâu thuẫn" |

**Kết luận docs**: không có tài liệu nào sai về nghiệp vụ. Drift nằm ở **mục lục và số đếm**, cộng
một mâu thuẫn chiến lược thật (native vs PWA) cần ADR mới xoá bỏ.

---

## 9. Dead Code

Quét toàn bộ **921 file** `.ts`/`.tsx` ở `apps/web/src`, `apps/api/src`, `apps/worker/src`,
`packages/types/src`, `packages/validators/src`; loại file entry của framework
(`page`/`layout`/`route`/`index`/`middleware`/`main`) và file test.

**Kết quả: đúng 2 file mồ côi / 921.** Đây là mức sạch bất thường — không có `TODO`/`FIXME`/`HACK`
nào trong toàn bộ mã nguồn.

| PATH | TYPE | EVIDENCE | CONFIDENCE | RECOMMENDATION |
| --- | --- | --- | --- | --- |
| `apps/web/src/components/form/AutoCompleteField.tsx` (63 dòng) | Component export nhưng không ai import | Grep `AutoCompleteField` toàn `apps/web`: chỉ 3 hit, **đều nằm trong chính file đó** | **Cao** | Xoá, hoặc giữ có chủ ý và ghi lý do vào docblock |
| `apps/web/src/features/phone-verification/components/PhoneVerifyControl.tsx` (118 dòng) + `.module.css` | Như trên | Grep `PhoneVerifyControl`: 4 hit, đều trong chính file | **Cao** | Xoá cùng file CSS. Kiểm tra xem có phải bản cũ của luồng OTP đã thay bằng `RequestBookingFlow` không |

**Không phải mã chết** (đã kiểm tra, để không xoá nhầm):
- `features/catalog/test-catalog.ts` — 4 file test dùng.
- `packages/ui/src/index.ts` — hết rỗng từ 24/08/2026: export design token (`./tokens`), docblock ghi luật ranh giới nền tảng.
- Token `@deprecated` trong `styles/theme.ts` (9 cái) — alias trỏ `var()` về token canonical, có
  đích gỡ ghi ở `docs/design-token-map.md`.
- `getErrorMessage()` ở `api-client.ts:168` `@deprecated` — vẫn được khu chưa i18n dùng; xoá khi
  `i18n:audit` về 0.
- `API_ERROR_CODE.DELIVERY_QUOTE_REQUIRED` — đã nghỉ hưu nhưng cố ý giữ cho log/audit cũ.

---

## 10. Đối chiếu với sheet Mobile Tracking

Dùng nguyên 97 dòng của sheet. Toàn bộ `Mobile Status = Not Started` (đúng — repo không có dòng
mã mobile nào). Cột thêm dưới đây là kết luận của lần rà này.

| Nhóm | ID | Web | API Ready | Shared sẵn | Mobile bắt đầu được? | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| **Bắt đầu được ngay sau khi xong P0** | MKT-01→06, BKG-15, CUS-04, AUTH-01/02/06/07 | Done | TRUE | types ✅ / api-client ❌ | ✅ sau P0-1 + P0-4 | Bearer + tách package |
| | BKG-01, BKG-16 | UI Refinement | TRUE | ✅ | ✅ (demo mock OTP) | Khách THẬT chờ COM-06 |
| **Chờ 1 việc nhỏ** | AUTH-03 | Functional Review | TRUE | ✅ | ⚠️ | COM-06 eSMS |
| | AUTH-04 | Done | TRUE | ✅ | ⚠️ | Apple Sign-In cho iOS |
| | AUTH-05 | Functional Review | TRUE | ✅ | ⚠️ | COM-05 SMTP |
| **Web Done, Mobile phải thiết kế lại** | CAL-01, CAL-02 | UI Refinement | TRUE | ✅ | ❌ thiết kế trước | Timeline ngang không vừa màn dọc |
| | BKG-09 | UI Refinement | TRUE | ✅ | ❌ | Camera native + offline, không clone `<input file>` |
| | AUTH-01 (màn) | Done | TRUE | ✅ | ⚠️ | Web là **modal** trên marketplace, mobile cần màn độc lập |
| **Web chưa Done nhưng mobile chạy song song được** | SHP-07 | Bug Fix | FALSE | ✅ | ✅ | Sửa BUG-03 là API đủ (`useFinanceSummary` đã có) |
| | Toàn bộ khu UI Refinement (nợ i18n) | UI Refinement | TRUE | ✅ | ✅ | Nợ i18n là chuyện của web, **không chặn** mobile — nhưng mobile sẽ phải tự dịch nếu không tách `@xeprime/domain` |
| **Mobile nên CHỜ web** | VEH-04→13, FIN-01→04, CUS-01→03, SHP-01→06 | UI Refinement | TRUE | ✅ | ⏸ | Không chặn kỹ thuật, chỉ là thứ tự ưu tiên (đợt 3) |
| **Mobile KHÔNG cần clone** | CAL-03, COM-02, COM-05, COM-06, SYS-02→04, SYS-06→08 | — | — | — | N/A | Hạ tầng dùng chung |
| **Không có gì để clone — xây mới cả hai đầu** | COM-07 (push), PAY-01→03, ADM-13, SYS-09, SHP-08/09, VEH-08 | Not Started | FALSE | — | ❌ | Chờ quyết định / chờ backend |
| **Có API nhưng thiếu đầu ra cho mobile** | BKG-14 | UI Refinement | TRUE | ✅ | ⚠️ | Cần endpoint xuất PDF |

**Đọc bảng này một câu**: mọi thứ `API Ready = TRUE` (85/97) đều **sẵn sàng ở tầng hợp đồng**;
cái chặn không phải backend thiếu endpoint, mà là **đường vận chuyển session** và **lớp client
chưa đóng gói**.

---

## 11. Mobile Onboarding Plan

> Anh nói **mobile chưa cần làm gì lúc này** — nên phần này là *thứ tự để dùng khi bắt đầu*, không
> phải việc phải chạy ngay. Việc phải làm ngay nằm ở mục 12–13, và **toàn bộ nằm ở phía
> Leader / Backend / Web / Shared**.

### Phase 0 — Setup (chưa chốt stack, đây là ràng buộc thật khi chốt)

Tôi **không** đề xuất Expo hay bare RN ở đây vì anh chưa cần quyết. Nhưng bốn ràng buộc dưới đây
là thật và bất kỳ lựa chọn nào cũng phải trả lời được:

1. **pnpm workspace + symlink**: `apps/*` đã có trong `pnpm-workspace.yaml` nên `apps/mobile` tự
   được nhận. Nhưng Metro **không theo symlink mặc định** — cần `watchFolders` + bật symlink.
   Đây là chỗ tốn nửa ngày nếu không biết trước.
2. **Package dùng chung emit CommonJS** (`packages/config/tsconfig/lib.json` giải thích lý do:
   `apps/api` chạy thẳng trên Node). Metro đọc được CJS ⇒ `@xeprime/types` và `@xeprime/validators`
   dùng ngay được, **không cần đổi build**. Đây là tin tốt.
3. **Firebase**: web dùng `firebase` JS SDK (Auth + Firestore cho chat). Mobile cần quyết dùng JS
   SDK hay `@react-native-firebase` — và **FCM push bắt buộc phải là native module**.
4. **Camera + offline** cho BKG-09 (biên bản giao/nhận xe) là thứ duy nhất mobile làm **tốt hơn**
   web. Đáng đầu tư, và nên nằm ở đợt sớm để chứng minh giá trị của app native.

Cần thêm: `packages/config/tsconfig/react-native.json` (chưa có).

### Thứ tự triển khai (theo dependency thật, không theo module)

| Đợt | Nội dung | Feature ID | Vì sao đợt này |
| --- | --- | --- | --- |
| **1** | Auth + Marketplace + Đặt xe + Chuyến của tôi | AUTH-01→04, AUTH-07, MKT-01→06, BKG-01, BKG-15, BKG-16, CUS-04 | Khu **đã i18n xong**, có `@media`, 16 file test, ổn định nhất. Trùng khớp với đề xuất của Excel |
| **2** | Vận hành đơn của gian hàng + **camera biên bản** | BKG-02/03, BKG-05→12, VEH-01→03, FIN-05, FIN-06, SHP-07 | Giá trị native rõ nhất (chụp ảnh tại điểm hẹn). Cần P1-2 push xong trước |
| **3** | Cấu hình shop + tài chính + sổ khách | VEH-04→13, SHP-01→06, FIN-01→04, CUS-01→03 | Nhập liệu nhiều — desktop vẫn hơn; mobile chỉ cần xem/sửa nhanh |
| **4** | Lịch (thiết kế lại) | CAL-01, CAL-02 | **Không port.** Cần bản thiết kế màn dọc trước khi code |
| **5** | Quản trị nền tảng | ADM-01→13 | P3. Admin ngồi laptop |
| **Xây mới** | Push · Apple Sign-In · Camera native · PDF hợp đồng | COM-07, AUTH-04, BKG-09, BKG-14 | Không có gì để clone |

---

## 12. Leader Action Plan

### LEADER — việc chỉ anh quyết được

| # | Việc | Vì sao không hoãn được | Đầu ra |
| --- | --- | --- | --- |
| ~~L1~~ ✅ **XONG 21/08** | ~~Chốt PAY-01~~ → **Không** ([ADR 0013](decisions/0013-no-online-payment-mvp.md)) | Quyết định luôn kiến trúc mobile (luồng đặt xe kết thúc ở đâu), schema (`Payment` hiện chỉ ghi sổ tay), và cả pháp lý | ADR 0014 hoặc một dòng "không làm ở MVP" trong roadmap |
| L2 | **Viết ADR 0013 — Mobile native** | Hiện tại tài liệu duy nhất nói về native là `build_plan:751` và nó ghi *"chưa làm, ưu tiên PWA"*. Mobile dev vào đọc sẽ mâu thuẫn với chính việc họ được thuê | ADR: stack, phạm vi (khách? shop? cả hai?), quan hệ với PWA hiện có, chiến lược auth |
| L3 | **Duyệt mở Bearer cho AuthGuard** | ADR 0002 đã chốt sẵn giải pháp — anh chỉ cần duyệt cho làm, **không cần ADR mới** | Ticket cho backend |
| L4 | **Duyệt tách 2 package dùng chung** | Không tách thì mobile viết lại ~8.400 dòng, và mỗi dòng viết lại là một chỗ để hai app nói khác nhau | Duyệt kế hoạch ở mục 14 |
| L5 | **Ký eSMS.vn + cấp SMTP** | COM-06 chặn khách THẬT đặt xe trên **mọi** client; COM-05 chặn quên mật khẩu | Credential vào `.env` |
| L6 | Chốt ngưỡng cảnh báo giấy tờ sắp hết hạn (BUG-18) | Quyết định nghiệp vụ, không phải việc của dev | Một con số |
| L7 | Quyết định về BUG-11: ẩn 2 menu placeholder trước demo | 30 giây, tránh sếp bấm nhầm | — |

### WEB DEV

| # | Việc | Prio |
| --- | --- | --- |
| W1 | Chạy lại `pnpm --filter @xeprime/web test` + `i18n:audit` để **chốt số** cho baseline | P0 (nửa giờ) |
| W2 | Sửa BUG-03 (2 thẻ chết) bằng `useFinanceSummary()` đã có | P1 |
| W3 | Sửa BUG-04 (trùng `role="tabpanel"`) — lỗi trợ năng thật | P1 |
| W4 | Hỗ trợ tách package: đổi import, giữ barrel re-export để không vỡ 37k dòng UI | P0 khi L4 duyệt |
| W5 | Trả nợ i18n theo thứ tự roadmap: `components/form` + `manage-common` → `vehicles` (529) → `booking-requests` → `rental-policies` | P2, chạy nền |
| W6 | BUG-09 nút "Sửa chi phí" · BUG-10 gỡ inline hex · BUG-27 xoá 2 file chết | P2 |

### MOBILE DEV — bắt đầu được ngay cả khi P0 chưa xong

| # | Việc | Không cần gì cả |
| --- | --- | --- |
| M1 | Đọc `packages/types/src/api.generated.ts` (195 endpoint) — hợp đồng đầy đủ | ✅ |
| M2 | Đọc `docs/decisions/` 12 ADR + `docs/CODEMAP.md` | ✅ |
| M3 | Chạy web local, đi hết 12 luồng demo ở sheet "Demo & Meeting" để hiểu nghiệp vụ | ✅ |
| M4 | Dựng skeleton `apps/mobile` + xác minh Metro đọc được `@xeprime/types` qua symlink pnpm | ✅ (chứng minh ràng buộc Phase 0 số 1 và 2) |
| M5 | Cùng designer làm bản thiết kế lại CAL-01 cho màn dọc | ✅ |

### BACKEND

| # | Việc | Prio | Ghi chú |
| --- | --- | --- | --- |
| B1 | `AuthGuard` đọc thêm `Authorization: Bearer <session jwt>` | **P0** | ADR 0002 đã chốt. Sửa đúng `auth.guard.ts:36` + cập nhật docblock `:17-18` + `bootstrap.ts:63` |
| B2 | Bảng phiên + sliding renewal + `DELETE /auth/sessions/{id}` | P1 | Hoàn thành ADR 0002 §5. Mất điện thoại phải revoke được |
| B3 | `device_tokens` + `POST /devices` + FCM sender | P1 | COM-07 |
| B4 | **Chuyển notification sang khoá + tham số** thay vì văn xuôi VN | **P1, làm TRƯỚC B3** | Bảng `notifications` **đã có** `type` + `dataJson` + `targetType` — hạ tầng có sẵn, chỉ là 18 chỗ đang ghi sẵn câu. Không sửa trước thì push ra tiếng Việt vĩnh viễn |
| B5 | `GET /contracts/{id}/pdf` | P1 | BKG-14 |
| B6 | Cấu hình eSMS + SMTP khi có credential | P1 | Code đã sẵn, chỉ thiếu env |
| B7 | CSRF double-submit token | P2 | ADR 0002 §3, chỉ liên quan web |

### SHARED

| # | Việc | Prio |
| --- | --- | --- |
| S1 | Tạo `@xeprime/api-client` | **P0** |
| S2 | Tạo `@xeprime/domain` (message vi/en + luật nghiệp vụ thuần) | **P0** |
| S3 | Đổi message lỗi trong `@xeprime/validators` từ câu VN sang **khoá message** | P1 |
| S4 | Mở rộng `i18n:audit` quét cả `packages/` | P1 |
| S5 | `@xeprime/tokens` (131 design token, không phụ thuộc AntD/CSS) | P2 |
| S6 | `packages/config/tsconfig/react-native.json` | P2 |
| S7 | ~~Đổi tên `@xeprime/ui` → `@xeprime/web-ui`~~ — **giải quyết khác, 24/08/2026**: token nằm ở export gốc và gốc đã platform-free (`tsconfig` extends `lib.json` ⇒ DOM API fail typecheck); component web sau này đi qua subpath `@xeprime/ui/react` | ✅ |

---

## 13. Master Action Plan

| ID | Category | Task | Current State | Target | Owner | Prio | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~MA-01~~ | Leader | ~~Chốt PAY-01 có/không thanh toán online~~ | ✅ **DONE 21/08** — [ADR 0013](decisions/0013-no-online-payment-mvp.md) | ADR hoặc quyết định ghi vào roadmap | Leader | ~~P0~~ | — | DONE |
| MA-02 | Leader | ADR 0013 — Mobile native (stack, phạm vi, auth) | `build_plan:751` nói ngược | ADR merged | Leader | **P0** | — | TODO |
| MA-03 | Backend | `AuthGuard` nhận `Authorization: Bearer` | `auth.guard.ts:36` chỉ đọc cookie | Cả hai nguồn, cùng một session | Backend | **P0** | MA-02 | TODO |
| MA-04 | Shared | Tạo `@xeprime/api-client` (client + query key + api/types của feature) | Nằm trong `apps/web` | Package độc lập, web import ngược | Web + Mobile | **P0** | L4 duyệt | TODO |
| MA-05 | Shared | Tạo `@xeprime/domain` (message vi/en + luật nghiệp vụ thuần) | `apps/web/messages` + `apps/web/src/lib` | Package độc lập | Web | **P0** | L4 duyệt | TODO |
| MA-06 | Web | Chạy lại vitest + i18n:audit, chốt số baseline | 1609/1612 và 2.993 (đo 20/08) | Số của hôm nay | Web | **P0** | — | TODO |
| MA-07 | Backend | Notification: khoá + tham số thay cho văn xuôi VN | 18 chỗ ghi câu VN vào DB | `type` + `dataJson`, client dịch | Backend | **P1** | MA-05 | TODO |
| MA-08 | Backend | `device_tokens` + FCM sender + `POST /devices` | Không tồn tại | Push chạy được | Backend | **P1** | MA-07 | BLOCKED bởi MA-07 |
| MA-09 | Backend | Bảng phiên + sliding renewal + revoke | ADR 0002 §5 chưa làm | Revoke được từng thiết bị | Backend | **P1** | MA-03 | TODO |
| MA-10 | Leader | Ký eSMS.vn, cấp SMTP | `.env` thiếu `OTP_MODE`, `ESMS_*`, `SMTP_*` | Chạy provider thật | Leader | **P1** | — | TODO |
| MA-11 | Shared | Message lỗi validators → khoá message | 112 chuỗi VN cứng | i18n được | Web | **P1** | MA-05 | TODO |
| MA-12 | Backend | `GET /contracts/{id}/pdf` | Chỉ in trình duyệt | Endpoint trả PDF | Backend | **P1** | — | TODO |
| MA-13 | Web | BUG-03 nối 2 thẻ dashboard vào `useFinanceSummary()` | `DashboardView.tsx:66,74` = `"—"` | Có số thật | Web | **P1** | — | TODO |
| MA-14 | Web | BUG-04 trùng `role="tabpanel"` | 3 test đỏ | Xanh + đúng trợ năng | Web | **P1** | — | TODO |
| MA-15 | Mobile | Skeleton `apps/mobile` + xác minh Metro đọc symlink pnpm | Không có mã mobile | Import được `@xeprime/types` | Mobile | **P1** | MA-02 | TODO |
| MA-16 | Design | Thiết kế lại CAL-01 cho màn dọc | Timeline ngang, `AppShell.tsx:36` ẩn bottom-nav | Bản thiết kế duyệt | Design | **P1** | — | TODO |
| MA-17 | Shared | `i18n:audit` quét cả `packages/` | `i18n-audit.mjs:33` chỉ quét web/src | Con số nợ i18n đúng thật | Web | **P1** | — | TODO |
| MA-18 | Docs | Sửa drift: ADR 9→12 (`CLAUDE.md:22`), 8→12 (`docs/README.md`), index `design-briefs/` + `implementation/` | Sai số đếm, thiếu 1,1MB tài liệu | Mục lục đúng | Leader/Web | **P1** | — | TODO |
| MA-19 | Docs | Đánh dấu `build_plan:81,751` là **superseded** bởi ADR 0013 | Nói ngược kế hoạch hiện tại | Có ghi chú superseded | Leader | **P1** | MA-02 | BLOCKED bởi MA-02 |
| MA-20 | Backend | Apple Sign-In | Chỉ Google + Facebook | Đủ 3 provider | Backend + Mobile | **P2** | MA-02 | TODO |
| MA-21 | Web | Trả nợ i18n theo đợt (2.993 + 112) | 36 khu vực | Về 0 | Web | **P2** | MA-17 | IN PROGRESS |
| MA-22 | Web | BUG-09 nút sửa chi phí · BUG-10 inline hex · BUG-11 ẩn 2 menu | Đã xác minh còn nguyên | Xong | Web | **P2** | — | TODO |
| MA-23 | Web | Bịt vùng trống test (bookings, chat, dashboard, account, worker) | 0 file test | Có test cho luồng chính | Web | **P2** | — | TODO |
| MA-24 | Shared | `@xeprime/tokens` (131 token) | `apps/web/src/styles/theme.ts` | Package độc lập | Web | **P2** | MA-16 | TODO |
| MA-25 | Backend | CSRF double-submit token | Chỉ có comment | Có middleware | Backend | **P2** | — | TODO |
| MA-26 | Web | Xoá 2 file mã chết (`AutoCompleteField`, `PhoneVerifyControl`) | 181 dòng không ai gọi | Xoá | Web | **P3** | — | NEEDS REVIEW |
| MA-27 | Docs | Xoá `docs/claude-i18n-prompt.txt`; đổi tên 4 plan file hỏng dấu | 144K không tra cứu được | Dọn | Web | **P3** | — | NEEDS REVIEW |
| MA-28 | Shared | ~~Đổi tên `@xeprime/ui` → `@xeprime/web-ui`~~ | Viết khi package còn rỗng; nay export gốc đã platform-free | Giải quyết bằng ranh giới compiler, không đổi tên | Web | **P3** | MA-04 | **DONE 24/08/2026** |
| MA-29 | Excel | Thêm 8 dòng đề xuất (SYS-10, BUG-21→27) sau khi Leader duyệt | Chưa có trong file | Excel cập nhật | Leader | **P2** | — | NEEDS REVIEW |

---

## 14. Kế hoạch tách package dùng chung (chi tiết, để thực thi sau khi duyệt)

**Nguyên tắc xuyên suốt: không đụng vào `apps/web/src/features/*/components/*.tsx`.** 37.292 dòng
UI phải không biết là có gì thay đổi. Cách đạt được: mỗi file bị chuyển đi để lại **một dòng
re-export** tại chỗ cũ, nên mọi `import { fetchBookings } from './api'` vẫn chạy.

### 14.1 `@xeprime/api-client` (P0)

**Mục tiêu**: một client duy nhất, hai app (rồi ba) dùng chung, không ai bóc `{data}` lần thứ hai.

```
packages/api-client/
  src/
    client.ts        ← từ apps/web/src/services/api-client.ts (190 dòng)
    query-keys.ts    ← từ apps/web/src/services/query-keys.ts (269 dòng)
    upload.ts        ← phần presign của services/upload.ts (KHÔNG lấy uploadToR2)
    transport.ts     ← MỚI: interface đường vận chuyển session
    features/
      bookings/{api.ts, types.ts}
      booking-requests/{...}
      ... 39 feature
  package.json       deps: @xeprime/types, @tanstack/react-query (peer)
  tsconfig.build.json  → CommonJS như các package khác
```

**Thay đổi bắt buộc duy nhất trong mã chuyển đi** — `client.ts` đang hardcode hai thứ của trình duyệt:

| Dòng hiện tại | Vấn đề với RN | Cách sửa |
| --- | --- | --- |
| `api-client.ts:13` `process.env.NEXT_PUBLIC_API_URL` | RN không có `NEXT_PUBLIC_*` | `configureApiClient({ baseUrl })` gọi một lần lúc khởi động |
| `api-client.ts:100` `credentials: 'include'` | RN không có cookie jar đáng tin | Interface `AuthTransport`: web trả `{ credentials: 'include' }`, mobile trả `{ headers: { Authorization: 'Bearer ...' } }`. **Một client, hai adapter** — đúng chữ trong ADR 0002 |

Phụ thuộc: **MA-03 (Bearer) phải xong trước hoặc song song**, nếu không adapter mobile không có gì để cắm.

**Thứ tự chuyển** (mỗi bước tự chạy được, verify được, không phải "big bang"):

1. Tạo package rỗng + `client.ts` + `transport.ts`. `apps/web/src/services/api-client.ts` trở thành
   `export * from '@xeprime/api-client'` + gọi `configureApiClient()` với web transport.
   → 36 file `api.ts` không phải sửa dòng nào.
2. Chuyển `query-keys.ts` y hệt cách trên (67 chỗ import qua `@/services/query-keys`).
3. Chuyển `features/*/types.ts` (801 dòng) — thuần alias `components['schemas']`, rủi ro gần bằng 0.
4. Chuyển `features/*/api.ts` (2.168 dòng) theo **từng feature một**, không chuyển hàng loạt.
   Bắt đầu bằng `trips` + `marketplace` (khu chín nhất, 16 file test bảo vệ).
5. Chuyển `features/*/hooks/*` **trừ 7 file** dính `next/*`/`antd`
   (`approvals`, `booking-requests`, `calendar`, `marketplace` — các `*-filters.ts`;
   `auth/use-portal-logout.ts`; `branches/use-branches.ts`; `locations/use-admin-locations.ts`).
   Bảy file này **ở lại `apps/web`** — chúng là ADR 0004 (filter sống ở URL), mobile cần bản khác.
6. `usePermissions` + `useCurrentUser` (hook React thuần, chạy trên RN).

### 14.2 `@xeprime/domain` (P0)

**Mục tiêu**: chấm dứt việc nhãn nghiệp vụ có hai nguồn (D1), và cho mobile dùng lại 1.596 khoá
message thay vì dịch lần hai.

```
packages/domain/
  messages/
    vi/{domain,errors,common}.json    ← chuyển từ apps/web/messages/vi/
    en/{domain,errors,common}.json
  src/
    labels.ts        ← domainMessageKey + type DomainGroup (từ apps/web/src/i18n/domain.ts)
    errors.ts        ← ánh xạ mã → khoá (phần thuần của use-error-message.ts)
    money.ts         ← apps/web/src/lib/money.ts (250 dòng)
    rental-busy.ts   ← apps/web/src/lib/rental-busy.ts (112 dòng) ★ luật an toàn
    long-term.ts     ← apps/web/src/lib/long-term.ts (53 dòng)
    odometer.ts      · vehicle-label.ts · contact.ts
    datetime.ts      ← apps/web/src/lib/datetime.ts (dayjs + Asia/Ho_Chi_Minh)
```

**Chỉ chuyển 3 namespace** (`domain`, `errors`, `common`) — chúng là **từ vựng chung**.
17 namespace còn lại (`vehicles`, `bookings`, `marketplace`…) là **chữ của màn hình web**, ở lại
`apps/web/messages/`. Mobile sẽ có bó riêng của nó cho màn hình của nó.

Ràng buộc phải giữ: `pnpm i18n:check` hiện đối chiếu parity vi↔en qua
`apps/web/src/i18n/namespaces.ts`. Sau khi tách, **script phải quét cả hai nơi** — nếu không,
3 namespace chuyển đi sẽ mất lưới bảo vệ parity. Đây là việc bắt buộc trong cùng bước, không phải
việc dọn sau.

**Đồng thời** (nếu không làm cùng lúc thì tách xong vẫn còn hai nguồn): gỡ `label:` tiếng Việt khỏi
`packages/types/src/status/*.ts`, chỉ giữ MÃ + MÀU. Chỗ nào ở backend đang dùng `*_META.label`
(`bookings.service.ts:772`) chuyển sang khoá message theo MA-07.

### 14.3 Cái KHÔNG tách (ghi ra để không ai làm nhầm)

| Không tách | Lý do |
| --- | --- |
| `apps/web/src/hooks/use-url-filters.ts` + 7 hook `*-filters.ts` | ADR 0004: filter sống ở URL. Mobile không có URL — cần **bản khác cùng interface**, không phải bản dùng chung |
| `apps/web/src/services/upload.ts` — `uploadToR2` | Dùng `File` + `XMLHttpRequest`. Chỉ tách phần gọi presign |
| `apps/api/src/common/booking-money.ts` | `Prisma.Decimal` + `Prisma.sql` — của server, và server phải là nơi duy nhất tính |
| `packages/ui` | React DOM + AntD. RN không dùng được, mãi mãi |
| 17 namespace message của màn web | Chữ của màn hình web, không phải từ vựng chung |
| `features/vehicle-maintenance/schema.ts` | Giữ `Dayjs` — lý do đã ghi trong `packages/validators/src/index.ts` |

### 14.4 Ước lượng và rủi ro

| Bước | Dòng chuyển | Rủi ro | Vì sao thấp |
| --- | --- | --- | --- |
| 14.1 bước 1–2 | 459 | Thấp | Re-export giữ nguyên mọi import hiện có |
| 14.1 bước 3 | 801 | Rất thấp | Thuần type alias, `tsc` bắt hết |
| 14.1 bước 4 | 2.168 | Thấp–TB | Chuyển từng feature; `marketplace`/`trips` có 16 file test |
| 14.1 bước 5 | ~3.100 | TB | Phải tách đúng 7 file ở lại |
| 14.2 | ~1.100 + message | TB | Chỗ dễ sai nhất là **`i18n:check` parity**, phải sửa cùng lúc |

**Verify sau mỗi bước** (theo skill `verify-changes`, chỉ quét phần vừa sửa):

```bash
pnpm --filter @xeprime/api-client run typecheck    # package mới
pnpm --filter @xeprime/web run typecheck           # web còn biên dịch được
pnpm --filter @xeprime/web test                    # 109 file test là lưới an toàn
pnpm --filter @xeprime/web i18n:check              # sau bước 14.2 — parity vi↔en
pnpm --filter @xeprime/api run typecheck           # nếu bước đó chạm packages/types
```

Không chạy `pnpm typecheck` cả workspace ở giữa chừng — chậm và nhiễu.

---

## 15. Cách kiểm chứng tài liệu này

Mọi con số trong đây tái lập được bằng lệnh đọc-thuần:

```bash
# Delta so với baseline audit
git log --oneline 133b894..HEAD && git diff --stat 133b894..HEAD

# 195 endpoint · 63 model
grep -cE '^\s+"/[a-z0-9{}/_-]+":' packages/types/src/api.generated.ts
grep -cE "^model " prisma/schema.prisma

# Logic không phụ thuộc nền tảng trong apps/web
find apps/web/src/features -name "api.ts" -o -name "types.ts" -o -name "schema.ts" -o -name "constants.ts" | xargs wc -l
grep -rlE "from '(next/|antd|@ant-design)" apps/web/src/features --include="api.ts" --include="types.ts" --include="schema.ts"   # → rỗng

# Nhãn VN trong package dùng chung (nợ i18n bị báo thiếu)
grep -rc "label: '" packages/types/src/status/*.ts
node -e "const c=o=>Object.values(o).reduce((n,v)=>n+(typeof v==='object'?c(v):1),0);console.log(c(require('./apps/web/messages/vi/domain.json')))"

# Auth chỉ nhận cookie
sed -n '17,18p;36p' apps/api/src/common/guards/auth.guard.ts

# Thông báo là văn xuôi VN trong DB
sed -n '313p' apps/api/src/modules/bookings/settlement/settlement.service.ts
sed -n '88,89p' apps/web/src/features/notifications/components/NotificationBell.tsx
```

**Việc còn phải chạy để chốt baseline** (MA-06): `pnpm --filter @xeprime/web test` và
`pnpm --filter @xeprime/web i18n:audit`. Bộ Jest của API cần Docker + PostgreSQL.

---

## Cập nhật file này khi nào

Đây là **nguồn sống**, không phải ảnh chụp một lần: mỗi khi một blocker ở mục 7 đóng lại thì sửa
ngay dòng đó, đừng để nó nói sai như `xeprime_build_plan` đã từng.

Ba con số cần đo lại khi đọc, đừng tin số in sẵn: kết quả test (xem
[`completion-roadmap.md`](completion-roadmap.md) §0), số chuỗi chưa i18n
(`pnpm --filter @xeprime/web i18n:audit`), và số dòng logic còn kẹt trong `apps/web` (mục 3.3).

Đổi chỗ ngày 21/08/2026 từ `docs/plans/xeprime-second-pass-elegant-neumann.md` — nó nằm ở
`docs/plans/` chỉ vì plan mode ghi vào đó, còn nội dung là báo cáo phải cập nhật, không phải plan
một lần dùng.
