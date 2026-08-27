# ADR 0012 — Đa ngữ vi/en: một URL duy nhất, ngôn ngữ lưu ở cookie

Ngày: 19/08/2026 · Trạng thái: Accepted

## Bối cảnh

XePrime cần giao diện tiếng Anh bên cạnh tiếng Việt. Khách nước ngoài thuê xe ở Việt Nam là
nhóm người dùng thật; nhân sự vận hành của gian hàng thì gần như luôn dùng tiếng Việt. Toàn bộ
giao diện hiện có — 349 component, ~78.000 dòng — viết chữ tiếng Việt thẳng trong mã.

Ba ràng buộc quyết định hình dạng của giải pháp:

1. **SEO đã có.** Marketplace công khai (`/`, `/search`, `/listings/:id`, `/shops/:slug`) là lý
   do dự án chuyển sang Next.js. Mọi thay đổi về URL đều là một lần mất index.
2. **Trạng thái tìm kiếm sống trong URL** (ADR 0004): tỉnh, dịch vụ, khoảng ngày, phân trang.
   Một cơ chế đổi ngôn ngữ mà đụng vào URL sẽ đụng luôn vào trạng thái đó.
3. **Giá trị nghiệp vụ đi trên dây là MÃ** (ADR 0005, ADR 0007): `self_drive`, `active`,
   `within_7_days`. Chúng không được dịch, không được đổi theo ngôn ngữ người xem.

## Quyết định

### 1. Hai ngôn ngữ dùng CHUNG một URL — không có tiền tố, không có tham số

`/search?provinceCode=79` là địa chỉ đó ở cả tiếng Việt lẫn tiếng Anh. Cụ thể là **không** có
`/en/...`, **không** có `app/[locale]`, **không** có `?lang=`, và `ROUTES` không mang locale.

Lý do là SEO cộng với bản chất của tính năng. Tiếng Anh ở giai đoạn này là **tuỳ chọn giao
diện**, không phải một phiên bản nội dung riêng để index: dữ liệu do người dùng nhập (tên xe,
tên gian hàng, giới thiệu, đánh giá) vẫn là tiếng Việt ở cả hai chế độ. Sinh ra `/en/listings/:id`
là tạo một URL thứ hai cho cùng một nội dung — trùng lặp, phải khai `hreflang`/canonical, và
chia đôi tín hiệu xếp hạng của trang gốc, để đổi lấy một bản dịch chỉ phủ phần khung.

Hệ quả trực tiếp: `next-intl` chạy **không có locale routing**, và `proxy.ts` KHÔNG đổi một
dòng nào. Toàn bộ hành vi session/`/manage`/safe-next của nó giữ nguyên.

### 2. Ngôn ngữ lưu ở cookie `XP_LOCALE`, đọc PHÍA SERVER

| Thuộc tính | Giá trị | Vì sao |
| --- | --- | --- |
| `path` | `/` | Ngôn ngữ áp cho cả site |
| `sameSite` | `lax` | Điều hướng từ ngoài vào vẫn giữ ngôn ngữ; không cần gửi cross-site |
| `maxAge` | `31536000` (365 ngày) | Tuỳ chọn dài hạn, không phải trạng thái phiên |
| `httpOnly` | `true` | Không JS client nào cần đọc — locale đã có trong HTML server render |
| `secure` | `NODE_ENV === 'production'` | Dev chạy http://localhost |

Thứ tự phân giải: đọc `XP_LOCALE` → kiểm tra với `SUPPORTED_LOCALES` → dùng nếu hợp lệ → rơi về
`vi` nếu thiếu/hỏng/lạ. Cookie là đầu vào từ client nên không bao giờ được tin thẳng.

**Không đọc `Accept-Language` ở giai đoạn này.** Khách lần đầu luôn thấy tiếng Việt. Nhờ vậy
HTML của một URL công khai khi KHÔNG có cookie là xác định — đúng thứ crawler nhận — nên phần
được index không đổi so với trước.

Ngôn ngữ **không** nằm ở Redux, localStorage, query param hay database. Một nguồn duy nhất, đọc
ở server, trước khi render.

### 3. Đổi ngôn ngữ = Server Action + `router.refresh()`

`setLocale(locale)` (`src/i18n/actions.ts`) là bề mặt duy nhất ghi cookie. Nó nhận đúng một
tham số, tự kiểm tra lại giá trị (kiểu TypeScript bị xoá lúc chạy), không nhận tên cookie, không
nhận đích chuyển hướng, không tự redirect.

Client gọi trong một `useTransition`, chờ thành công, rồi mới `router.refresh()`. Đường dẫn,
query, hash, lịch sử trình duyệt và trạng thái client (form đang gõ dở, panel đang mở) giữ
nguyên tuyệt đối. Một `window.location.href = ...` sẽ mất tất cả những thứ đó.

### 4. Mã nghiệp vụ không bao giờ được dịch

`*_LABEL` và `*_STATUS_META` trong `@xeprime/types` **giữ nguyên**: apps/api vẫn dùng chúng cho
email/thông báo, và `color` của meta vẫn là nguồn màu. Web dịch tại chỗ render qua namespace
`Domain` (`domain.json`, 78 nhóm / 335 khoá), lấy `label` tiếng Việt trong meta làm bản dự
phòng cho mã chưa khai báo. `@xeprime/types` KHÔNG phụ thuộc `next-intl`.

Cùng luật đó áp cho lỗi API: FE ánh xạ **mã** (`API_ERROR_CODE`) sang câu, không hiện `message`
tiếng Việt của backend. Mã lạ rơi về một câu chung; chi tiết kỹ thuật đi vào console.

### 5. Định dạng đi qua một cửa duy nhất

`useAppFormat()` / `getAppFormat()` (`src/i18n/use-app-format.ts`, `server-format.ts`) là nơi
duy nhất sinh chuỗi hiển thị từ dữ liệu: tiền, ngày giờ, thời lượng thuê, quãng đường, gói dài
hạn, nguyện vọng nhận xe. Phần TÍNH TOÁN vẫn thuần ở `lib/` và test được; hook chỉ khoác chữ.

Hai điều KHÔNG đổi theo ngôn ngữ, vì đổi là làm sai nghĩa: **tiền luôn VND** và **múi giờ luôn
`Asia/Ho_Chi_Minh`**. Tiền vẫn không đi qua `Number` (ADR 0007) — chỉ ký tự phân tách nhóm được
lấy từ `Intl`.

`dayjs.locale(...)` bị cấm ở mọi nơi: nó đổi trạng thái toàn tiến trình và sẽ rò ngôn ngữ giữa
các request render song song trên server.

## Đánh đổi đã chấp nhận

**Mọi route trở thành dynamic.** Đọc cookie trong `getRequestConfig` khiến Next không prerender
tĩnh được nữa. Đây là cái giá không tránh được của "một URL, hai ngôn ngữ" và được chấp nhận có
ý thức. Giảm nhẹ:

- Cache DỮ LIỆU vẫn nguyên vẹn và vẫn dùng chung giữa hai ngôn ngữ: `fetch(..., { next: { revalidate } })`
  ở `banners`/`catalog` khoá theo URL, không theo ngôn ngữ.
- Nếu sau này đặt CDN/reverse proxy trước web, **`XP_LOCALE` phải nằm trong cache key** (hoặc
  bỏ cache HTML hẳn). Phục vụ HTML tiếng Anh cho một request tiếng Việt là lỗi nghiêm trọng
  nhất mà kiến trúc này có thể gây ra, và nó chỉ xảy ra ở tầng hạ tầng chứ không ở tầng app.
- Không giải quyết bằng cách dịch ở client sau hydrate: HTML đầu tiên phải đã đúng ngôn ngữ,
  nếu không sẽ có pha nhấp nháy và sai lệch hydrate.

**Bó message đi trọn xuống client.** `NextIntlClientProvider` render ở root layout truyền toàn
bộ message của ngôn ngữ ĐANG dùng (không bao giờ cả hai). Với cổng quản lý nặng client-side thì
đây là lựa chọn đúng về độ an toàn: cắt theo route group sẽ khiến một component dùng namespace
không được truyền nổ lúc chạy. Khi khối lượng message tăng, hướng tối ưu là cắt theo route
group ở `(public)`/`(manage)`, không phải cắt theo component.

**Đồng bộ giữa nhiều thiết bị nằm ngoài phạm vi.** Cookie là theo trình duyệt. Muốn theo tài
khoản thì cần một trường trên `users` và một endpoint — chưa làm.

## Ràng buộc kiểm chứng được

- `pnpm --filter @xeprime/web i18n:check` — parity hai chiều, không giá trị rỗng, ICU hợp lệ,
  cùng tập biến giữa hai ngôn ngữ, namespace khớp `namespaces.ts` và hai `index.ts`.
- `pnpm --filter @xeprime/web i18n:audit` — quét AST tìm chuỗi giao diện còn thô.
- `global.d.ts` gắn bó message tiếng Việt vào next-intl ⇒ gõ sai khoá là lỗi typecheck.
- Test: `src/i18n/*.test.ts(x)`, `src/components/i18n/LocaleSwitcher.test.tsx`,
  `src/features/marketplace/search/search-experience.i18n.test.tsx`.

## Hệ quả cho việc đang làm dở

I18n hoá đi theo từng đợt. `MESSAGE_NAMESPACES` chỉ liệt kê namespace ĐÃ có nội dung —
`i18n:check` từ chối namespace rỗng, vì một file rỗng là lời hứa suông rằng khu vực đó đã dịch
xong. Khu vực chưa chuyển vẫn dùng chuỗi tiếng Việt trong mã và vẫn chạy đúng; `i18n:audit` là
bản kiểm kê chính xác phần còn lại.
