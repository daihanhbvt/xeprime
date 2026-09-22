---
name: mobile-feature
description: Building or modifying features in the XePrime mobile app (apps/mobile - React Native / Expo). Load this skill before writing mobile code to ensure architecture alignment, API contract reuse, state management, domain rules, offline handling, and native-first UX.
---

# Building Mobile Features the XePrime Way

`apps/mobile` is `apps/web` ported to native — the SAME product, not a second one. Every screen,
rule, status transition, permission check, price calculation and validation message is already
decided in the web app and the ADRs. Your job is to render that on native, not to redesign it.

## 0. Trước khi làm bất cứ đợt ĐỒNG BỘ nào từ `develop`

**Đọc [`apps/mobile/docs/sync-log.local.md`](../../../apps/mobile/docs/sync-log.local.md) trước.**
Đó là sổ ghi "đã soát tới commit nào của `develop`" — thứ `git log` không trả lời được: log nói
commit nào TỒN TẠI, không nói commit nào đã được ĐỐI CHIẾU sang app.

Bỏ qua nó dẫn tới đúng hai lỗi, cả hai đều tốn cả buổi:

- **Soát nhầm** một commit đã port rồi, và viết đè lên bản đúng đang chạy.
- **Bỏ sót** một commit nằm giữa hai đợt, vì nó đã bị merge vào `develop` từ lâu và nhìn như cũ.

Quy trình: `git fetch origin develop` → so với **Mốc đã soát** trong sổ →
`git log --first-parent --oneline <mốc>..origin/develop` → đọc **diff thật** của từng commit
(không đọc tiêu đề) → cập nhật mốc và thêm dòng vào bảng lịch sử **trong cùng đợt làm việc đó**.

Sổ là file CỤC BỘ (gitignore). Nó không theo repo sang máy khác, nên đừng coi việc nó vắng mặt là
"chưa từng đồng bộ" — hỏi lại người dùng.

## 1. Luật bất di bất dịch

* **Không đổi logic nghiệp vụ.** Web yêu cầu một bước duyệt thì mobile có bước đó. Khi mobile
  *có vẻ* cần luật khác, đó là dấu hiệu bạn đọc nhầm luồng web — mở
  `apps/web/src/features/<same-feature>` ra đọc trước khi viết.
* **Đọc feature web trước.** `api.ts`, `types.ts` và các hook của nó LÀ đặc tả. Port chúng, đừng
  suy lại từ tài liệu API.
* **Khác biệt chỉ được nằm ở TRÌNH BÀY và năng lực NỀN TẢNG** — hình dạng điều hướng, vùng chạm,
  máy ảnh/sinh trắc/push, hành vi ngoại tuyến, cuộn vô hạn thay cho phân trang. Không bao giờ ở
  ý nghĩa của dữ liệu hay việc người dùng được phép làm gì.

### ⚠️ Web dùng SESSION COOKIE, app dùng BEARER TOKEN

```
apps/web    →  httpOnly cookie `xp_session`             (ADR 0002)
apps/mobile →  Authorization: Bearer <accessToken>      (ADR 0017)
```

Không ngoại lệ. Hệ quả phải nhớ:

- **Không bao giờ gọi endpoint của web từ app.** `/auth/login` set cookie mà React Native không
  giữ đáng tin — nó *trông như* chạy được, rồi phiên biến mất ở lần mở app sau. Chiều ngược lại
  tệ hơn: `/auth/mobile/*` trả token trong body, và trình duyệt không có `httpOnly` để bảo vệ.
- **Chỉ endpoint PHÁT HÀNH phiên mới có hai bản.** `AuthGuard` đăng ký toàn cục và chấp nhận cả
  hai kênh, nên **mọi API nghiệp vụ đều dùng chung** — đừng đi tìm, và đừng tạo, một bản "mobile"
  cho vehicles, bookings, calendar hay chat.
- **Token không rời khỏi `src/lib/auth-session.ts`.** Feature gọi `apiGet`; header Bearer, lượt
  refresh và lượt thử lại nằm bên dưới. Không đọc token trong component, không đưa vào Redux,
  không ghi ra log.

Bảng endpoint đầy đủ và luồng OAuth: [`references/native-adaptations.md`](references/native-adaptations.md).

Ngoại lệ cố ý thứ hai là URL gốc của API (`EXPO_PUBLIC_API_URL`).

### Clone từ web theo mặc định; chỉ tách ra package khi CẢ HAI app dùng

Port một feature web nghĩa là chép `api.ts`, `types.ts`, hook và helper của nó vào
`apps/mobile/src/features/<same-name>` rồi sửa phần trình bày. Một bản chỉ mobile dùng thì ở lại
`apps/mobile` — đưa vào `packages/*` là tặng nó một người tiêu thụ thứ hai phải chiều (chạy
`pnpm --filter @xeprime/web test` mỗi lần sửa, thêm một bước build trước khi Metro thấy thay đổi)
mà không được lại gì.

Thứ THUỘC VỀ package là thứ nếu không sẽ trôi thành hai sự thật mâu thuẫn: hợp đồng API
(`@xeprime/types`, sinh tự động — ADR 0007), HTTP client và query key (`@xeprime/api-client`),
luật nghiệp vụ và toán tiền/thời gian (`@xeprime/domain`), schema form (`@xeprime/validators`),
design token (`@xeprime/ui`), chuỗi giao diện (`@xeprime/domain/messages`).

> **Quy tắc ngón tay cái: TRÔNG GIỐNG nhau mà lặp thì được; NGHĨA giống nhau mà lặp thì không.**
> Một hàng danh sách viết lại cho native là bình thường; một bản thứ hai của "chuyến này thuê bao
> lâu" thì không.

## 2. Tái dùng trong monorepo

* **Hợp đồng API và kiểu**: luôn import từ `@xeprime/types` (`BOOKING_STATUS`, `VEHICLE_STATUS`,
  `api.generated.ts`). Không tự gõ một DTO, không dùng chuỗi trạng thái trần.
* **Logic dùng chung**: helper domain (`rental-busy.ts`, `long-term.ts`, `money.ts`,
  `datetime.ts`) từ `@xeprime/domain`.
* **API client**: hạ tầng HTTP + query key từ `@xeprime/api-client`; lời gọi theo feature nằm ở
  `apps/mobile/src/api/<feature>/` (ADR 0031 — web giữ bản riêng; đổi một hợp đồng dùng chung
  nghĩa là sửa **CẢ HAI**).
* **Design token**: `XP_TOKENS` trong `@xeprime/ui` là nguồn DUY NHẤT của màu, chữ, bo góc,
  khoảng cách, đổ bóng (ADR 0003). Trên native đọc qua `src/theme/tokens.ts` và
  `src/theme/elevation.ts`. Không viết mã hex hay con số cỡ vào component, và không mở một bảng
  màu riêng: lần trước nó trôi tới mức primary của native là màu đen trong khi web là vàng.
* **Chuỗi giao diện**: gốc message là `@xeprime/domain/messages/{vi,en}`, dùng chung nguyên văn
  với `apps/web` — một khoá, một bản dịch. `src/i18n/messages.ts` chỉ là bảng gom. Khai báo
  namespace mới ở `apps/web/src/i18n/namespaces.ts` rồi chạy
  `pnpm --filter @xeprime/web i18n:check`. `mobile-shell` chỉ dành cho VỎ app native.

```
apps/mobile/src/
├── app/            Expo Router
├── features/       auth · marketplace · bookings · vehicles · handovers ·
│                   calendar · finance · customers · chat · …
├── components/     UI dùng chung (Button, TextField, Card, StatusBadge, …)
├── hooks/          usePermissions, useNetworkState, useAuth
├── services/       Notification, Storage/R2, Camera
├── i18n/           provider use-intl + bảng gom trên @xeprime/domain/messages
└── theme/          bộ chuyển native cho XP_TOKENS
```

## 3. Ranh giới state

| Loại state | Chỗ của nó |
| --- | --- |
| Dữ liệu từ server | **TanStack Query**, khoá từ `queryKeys` dùng chung. Mutation thành công thì invalidate đúng nhánh con; cập nhật lạc quan ở nơi cần phản hồi tức thì (tin nhắn, công tắc) |
| State của form | **React Hook Form + Yup** (`@xeprime/validators`), cục bộ trong màn/tấm trượt. Không đẩy giá trị thô ra state toàn cục |
| State giao diện người dùng CHỌN | **Redux Toolkit** (không Zustand — ADR 0004). Mỗi slice thuộc về feature tạo ra nó |
| Bộ lọc, tìm kiếm của màn | State cục bộ hoặc `route.params` — native không có thanh URL |

Hai điều cấm, vì cả hai đều tạo một sự thật thứ hai:

* **Không để token trong Redux.** Access token nằm trong một biến module ở `src/lib/auth-session.ts`
  (chỉ bộ nhớ, 15 phút); refresh token chỉ ở Keychain/Keystore — ADR 0017. Store thì
  serialize được, soi được, và thường được persist; cả ba tính chất đều sai cho một chứng danh.
* **Không nhân bản dữ liệu server vào Redux.** Hồ sơ, quyền và tenant scope đọc từ
  `useCurrentUser()` (TanStack Query). Chép vào store là tạo một bản cũ đúng vào lúc quyền bị thu hồi.

## 4. Điều hướng — một bản đồ route, một namespace cho mỗi domain

Đường dẫn route sống trong cây `app/`, nên một `router.push('/listings/...')` rải khắp component
là một chuỗi không kiểu, gãy im lặng khi đổi tên file. **Không viết đường dẫn route thẳng trong
component.** Mọi đích đến từ `apps/mobile/src/navigation/routes.ts`:

```ts
export const ROUTES = {
  explore: {
    home: (): Href => '/explore',
    listingDetail: (vehicleId: string, serviceType?: string): Href => ...,
  },
  account: { home: (): Href => '/account', login: (): Href => '/login' },
} as const;
```

* **Một namespace cho mỗi domain** — khớp `src/features/<domain>`. Thêm domain là thêm namespace,
  không phải nối vào một object phẳng: phẳng thì sau hai phase không ai đọc nổi, và không biết
  màn nào thuộc feature nào.
* **Mỗi mục là một HÀM trả `Href`**, không phải hằng chuỗi. Tham số đi qua chữ ký nên không quên
  được, và hình dạng tham số dựng ở đúng một chỗ.
* **Gọi nó ở mọi nơi điều hướng** — `router.push/replace`, `<Redirect>`, `<Link>`,
  `useNavigateOnce()`. Push vẫn đi qua `useNavigateOnce`: bản đồ route quyết định ĐI ĐÂU, hook đó
  quyết định ĐI MẤY LẦN.
* **Thêm màn = thêm file dưới `app/` VÀ thêm mục vào namespace**, trong cùng một thay đổi.

## 5. Ba lằn ranh bảo mật

* **Tenant scope**: luôn để `TenantScopeGuard` phía backend suy ra `tenant_id`. Client không bao
  giờ gửi lên.
* **Không enum chuỗi trần**: `BOOKING_STATUS.ACTIVE`, không bao giờ `'active'`.
* **Tiền**: định dạng bằng helper an toàn chuỗi của `@xeprime/domain` — không bao giờ `number`.
* **PII**: tôn trọng chính sách che số điện thoại và email của khách.
* **Ẩn nút không phải kiểm soát quyền** — server chặn, giao diện chỉ là không mời người dùng vào
  ngõ cụt.

## 6. Tài liệu tham chiếu — đọc khi công việc chạm tới

| Tệp | Nội dung |
| --- | --- |
| [`references/native-adaptations.md`](references/native-adaptations.md) | Lịch (agenda thay cho lưới 2D) · ảnh bàn giao (bẫy `Content-Length` của presign, vì sao KHÔNG dùng `ImagePicker.launchCameraAsync`) · **bảng endpoint đăng nhập web ↔ native đầy đủ** · thông báo đẩy |
| [`references/ui-kit.md`](references/ui-kit.md) | `AppHeader`/`Screen` · **bàn phím che ô nhập cuối — lỗi hay quay lại nhất** · Tamagui cho HÌNH DẠNG, primitive cho TƯƠNG TÁC · token cỡ chữ trong form · chọn control theo số lựa chọn · khung chờ (skeleton) · chuyển động |
| [`references/upkeep.md`](references/upkeep.md) | Chú thích giải thích VÌ SAO · bảng "đổi hình dạng thì phải sửa tài liệu nào" |
| [`apps/mobile/docs/sync-log.local.md`](../../../apps/mobile/docs/sync-log.local.md) | Sổ đồng bộ Web→Mobile — **đọc trước mỗi đợt pull develop** (§0) |

## 7. Kiểm tra trước khi commit

1. `pnpm --filter @xeprime/mobile typecheck` — 0 lỗi.
2. `pnpm --filter @xeprime/mobile lint` — 0 lỗi.
3. `pnpm --filter @xeprime/mobile test` — xanh.
4. **Chạm `packages/*` thì chạy cả suite web**: `pnpm --filter @xeprime/web test`. API client,
   design token và gốc message là dùng chung — một thay đổi trông như chỉ mobile có thể làm đỏ
   1600 test web.
5. **Sửa `packages/types` hoặc `packages/validators` thì build chúng**:
   `pnpm --filter @xeprime/types --filter @xeprime/validators build`. Mobile phân giải từ `dist/`,
   nên thiếu bước này typecheck báo "has no exported member" cho một hàm vừa được thêm thật.
6. **Thêm/đổi chữ hiện cho người dùng**: `pnpm --filter @xeprime/web i18n:check`.
7. Thử đủ 4 trạng thái màn hình: đang tải, có dữ liệu, rỗng, lỗi mạng.
8. Thử bàn phím và safe area trên cả iOS lẫn Android.
9. Đối chiếu hợp đồng API với `@xeprime/types/src/api.generated.ts` — không tự gõ DTO.
10. **Đổi HÌNH DẠNG thì tài liệu mô tả nó đi cùng commit** — bảng ở `references/upkeep.md`.
11. **Vừa đồng bộ từ `develop`**: cập nhật `apps/mobile/docs/sync-log.local.md` (§0).
