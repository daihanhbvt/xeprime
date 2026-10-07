# 08 — UX/UI Guidelines

> Cập nhật: 06/10/2026 · Chủ sở hữu: Product + Creative Director
> Người đọc: designer và kỹ sư frontend. **Đây là tài liệu UX/UI duy nhất** — nguyên tắc, mẫu tương
> tác, responsive, ràng buộc kỹ thuật và checklist duyệt màn hình đều ở đây.
> Quy tắc viết code của kỹ sư (state, styling, data fetching, cấu trúc feature) ở skill
> [`.claude/skills/frontend-feature`](../../.claude/skills/frontend-feature/SKILL.md); chữ giao diện ở
> skill [`.claude/skills/i18n`](../../.claude/skills/i18n/SKILL.md). Tài liệu này không chép lại chúng.
> Thương hiệu, màu, chữ, từ vựng: [`01_BRAND_GUIDE.md`](01_BRAND_GUIDE.md). Ai vào site nào, menu gì:
> [`07_INFORMATION_ARCHITECTURE.md`](07_INFORMATION_ARCHITECTURE.md).

Cùng một vấn đề luôn được giải bằng cùng một cách. Khi cần lệch khỏi mẫu, ghi lý do vào PR.

---

## 0. Tám nguyên tắc

Mỗi nguyên tắc có một **phép thử** để phân xử khi hai thiết kế đều "trông ổn". Nguyên tắc chỉ có giá
trị khi nó loại được một lựa chọn hấp dẫn.

| # | Nguyên tắc | Nghĩa là | Phép thử |
| --- | --- | --- | --- |
| 1 | **Câu trả lời trước, công cụ sau** | Màn hình trả lời câu hỏi của người mở nó ở dòng đầu, trước bộ lọc/tab/bảng. Tổng quan site partner mở ra là "Hôm nay giao 3 xe, nhận 2 xe, 4 đơn quá hạn thu", không phải dãy KPI tháng. Một câu trả lời, không phải sáu | Che nửa dưới màn hình — người dùng có biết làm gì tiếp không? |
| 2 | **Một sự thật, hiện một lần** | Mỗi con số có một nguồn tính và một cách hiển thị. "Còn nợ" ở bảng, drawer, màn công nợ và hợp đồng là cùng phép tính (server), cùng định dạng (`useAppFormat()`/`getAppFormat()`); nhãn trạng thái qua `StatusTag`. Được có nhiều góc nhìn, nhưng cùng một con số | Mở hai màn cùng chứa giá trị đó — có khác nhau một chữ nào không? |
| 3 | **Không màn hình nào là ngõ cụt** | Đủ năm trạng thái (§1.4). Rỗng thì dạy việc, lỗi thì nói bước tiếp theo, thiếu quyền thì nói ai cấp. "Không có dữ liệu" là câu bị cấm | Cho server trả 500 và đăng nhập `shop_viewer` — màn còn dùng được và tự giải thích không? |
| 4 | **Tiền không được mơ hồ** | Tiền là `Decimal` ở backend, **string** trong JSON (ADR 0007): thiết kế không giả định phép tính ở client. Cột tiền canh phải, `tabular-nums`, `0 đ` thay ô trống, "Còn nợ" kèm cách ra (`Tổng 5.600.000 − Đã trả 0`). Đỏ dành cho *quá hạn*, không cho mọi khoản còn nợ | Chỉ vào một số tiền bất kỳ — bấm được để thấy nó từ đâu ra không? |
| 5 | **Niềm tin được chứng minh, không tuyên bố** | Ảnh thật đạt chuẩn (`01` §6), lịch trống ngay trên trang xe, bảng giá từng dòng, hồ sơ gian hàng có số liệu thật, chính sách huỷ/thế chấp là trường có cấu trúc. Không huy hiệu "uy tín"/"5 sao" khi chưa có dữ liệu; chỉ số uy tín dưới ngưỡng mẫu hiện "chưa đủ dữ liệu", không hiện 0% (ADR 0045) | Bỏ mọi tính từ khỏi trang — khách còn đủ căn cứ để quyết định không? |
| 6 | **Quyền hạn là nội dung, không phải bộ lọc hiển thị** | Hành động không có quyền thì ẩn khỏi khu chính; đi thẳng URL thì gặp 403 có giải thích + ai cấp quyền, không màn trắng, không màn onboarding. Guard backend là nguồn bảo vệ; UI chỉ phản ánh | Đăng nhập `shop_viewer` đi hết một luồng — có chỗ nào bí mà không hiểu vì sao? |
| 7 | **Giao diện không hứa cái hệ thống không bảo đảm** | Chống trùng lịch nằm ở constraint DB (ADR 0006) ⇒ `check-conflict` chỉ là xem trước; UI phải chịu được bước cuối bị từ chối. "Đặt xe thành công" chỉ khi đơn thật sự ra đời sau đối soát đủ tiền (ADR 0044) | Hai người cùng đặt một xe một khung giờ — người thua nhận câu giải thích đúng không? |
| 8 | **Không ai bị ép trở thành người khác** | Khách thuê không có gian hàng là trạng thái hợp lệ vĩnh viễn: không form tạo gian hàng, không "hồ sơ chưa hoàn thiện". Lời mời làm chủ xe là một **lối sang site partner** với tài khoản partner riêng (ADR 0053) — tự nguyện, đặt đúng chỗ, không phải bức tường. Chủ xe không phải học khái niệm của nền tảng | Tạo tài khoản khách mới, chỉ làm việc của khách 10 phút — có bị hỏi về gian hàng lần nào không? |

**Khi nguyên tắc mâu thuẫn**, thứ tự phân xử: an toàn dữ liệu & quyền (6, 7) → chính xác thông tin
(2, 4) → hoàn thành được việc (1, 3, 8) → vẻ đẹp. Ví dụ: hiện đủ SĐT khách trong bảng thì tra nhanh hơn
(1) nhưng phạm PII (6) ⇒ che mặc định, có nút bỏ che, mỗi lần bỏ che ghi audit — đúng như `MaskedContact`.

**Không phải nguyên tắc ở đây:** "tối giản" (mật độ cao là đúng ở màn vận hành), "nhất quán" (là hệ quả
của dùng chung token/component; marketplace và khu vận hành *nên* khác nhịp), "đẹp" (không đo được —
thay bằng rõ, nhanh, đáng tin).

---

## 1. Khuôn trang và trạng thái

Mọi màn hình là một trong bốn khuôn dưới đây. Không có khuôn thứ năm.

### 1.1 Danh sách

```
┌──────────────────────────────────────────────────────┐
│ Tiêu đề trang                      [Hành động chính] │
│ Câu trả lời: "41 đơn · 1 đang thuê · còn thu 44tr"   │ ← nguyên tắc 1
├──────────────────────────────────────────────────────┤
│ [Tìm kiếm]  [Lọc ▾] [Khoảng ngày]      [đã lọc: 2 ✕] │ ← ghi vào URL
├──────────────────────────────────────────────────────┤
│ Bảng (desktop) / Thẻ (mobile — §2.4)                 │
├──────────────────────────────────────────────────────┤
│ 1–20 / 341                          ‹ 1 2 3 ›  20/tr │
└──────────────────────────────────────────────────────┘
```

Hợp đồng bắt buộc:
1. Lọc/sắp xếp/phân trang **ở URL** (ADR 0004) và **xử lý ở server**, có index tương ứng. Không có
   ngoại lệ "danh sách này chắc ít dòng". Bộ lọc chi nhánh cũng nằm trên từng màn và trên URL (ADR 0052).
2. Có dòng tóm tắt trả lời câu hỏi của màn; dải chỉ số và số trên tab cùng phạm vi lọc với bảng.
3. Bộ lọc đang áp hiện thành chip gỡ được từng cái + "Xoá bộ lọc".
4. Cột số căn phải, `tabular-nums`; trạng thái là chip; ngày một định dạng (§7).
5. Chọn nhiều + hành động hàng loạt **chỉ khi** nghiệp vụ cần (duyệt hồ sơ, đánh dấu đã đọc).

### 1.2 Chi tiết

Ba lớp theo thứ tự: **danh tính** (bản ghi gì, trạng thái gì) → **hành động** → **dữ liệu**. Có URL
riêng — drawer là *cách hiển thị*, không phải lý do để không có URL. Dòng thời gian/nhật ký ở cuối,
thu gọn mặc định.

### 1.3 Biểu mẫu

Một cột. Nhóm trường có tiêu đề. Nút chính dưới cùng bên phải (desktop) / dính đáy (mobile). Form > 8
trường hoặc có nhánh ⇒ **wizard** từng bước. Chi tiết ở §6.

### 1.4 Năm trạng thái — bắt buộc thiết kế đủ, ở cả bản mobile

| Trạng thái | Quy tắc |
| --- | --- |
| **Đang tải** | Skeleton đúng hình dạng nội dung. Spinner toàn trang chỉ khi chưa biết layout. Chuyển < 300ms thì không hiện gì (nhấp nháy tệ hơn chờ) |
| **Có dữ liệu** | Trạng thái mặc định |
| **Rỗng** | Một câu + một hành động. Phân biệt **rỗng thật** ("Chưa có đơn thuê nào. Tạo đơn đầu tiên, hoặc chờ yêu cầu từ chợ xe.") với **rỗng do lọc** ("Không có đơn khớp bộ lọc" + Xoá lọc) |
| **Lỗi** | Chuyện gì + bước tiếp theo + Thử lại. Giữ nguyên dữ liệu người dùng đã nhập (§5) |
| **Thiếu quyền / năng lực** | Nói cần quyền hay gói gì và ai cấp được. Không màn trắng, không màn onboarding |

### 1.5 Bảng điều khiển

Hàng đầu là **việc cần làm hôm nay**, không phải KPI. KPI hàng hai, biểu đồ hàng ba. Mỗi thẻ số liệu
bấm được → danh sách đã lọc sẵn tạo ra con số đó (nguyên tắc 4).

---

## 2. Responsive và mobile

**Vì sao mobile là mặt trận chính:** khách chốt xe trên điện thoại; chủ xe trả lời "xe còn không" khi
đang ở bãi; nhân viên giao/nhận xe ở điểm hẹn. Nhập liệu hàng loạt, đối soát cuối ngày và duyệt hồ sơ
thì trên laptop. ⇒ **Site khách: mobile-first tuyệt đối. Site partner: mobile-first cho luồng hiện
trường, desktop-first cho nhập liệu hàng loạt. Site quản trị: desktop-first.** Cả ba đều phải dùng
được ở mọi kích thước — không có màn "chỉ desktop".

### 2.1 Breakpoint

Một hệ duy nhất, nguồn `XP_BREAKPOINTS` / token `--xp-bp-*` ở `packages/ui` (hook `useIsMobile`,
`useIsTablet`). Không viết media query rời như `@media (max-width: 768px)` trong một `.module.css` lẻ.

| Tên | Dải | Bố cục |
| --- | --- | --- |
| `mobile` | ≤ 640px | 1 cột · thanh tab dưới đáy · bottom sheet · bảng → thẻ |
| `tablet` | 641–1024px | 2 cột · sidebar thu gọn (icon) · drawer |
| `desktop` | 1025–1440px | Bố cục đầy đủ · bảng thật |
| `wide` | > 1440px | Nội dung giới hạn 1440px, canh giữa; không kéo bảng ra vô tận |

Hỗ trợ từ 360px rộng; Chrome/Edge/Safari/Firefox hai phiên bản gần nhất, iOS Safari 16+, Chrome
Android 110+. Không hỗ trợ IE.

### 2.2 Vùng chạm

| Yếu tố | Tối thiểu |
| --- | --- |
| Vùng chạm bất kỳ | **44 × 44px** (kể cả icon 20px) |
| Khoảng cách giữa hai vùng chạm | 8px |
| Hàng trong danh sách | Cao ≥ 56px |
| Nút chính trong sheet | Cao 48px, rộng hết khung |
| Ô nhập | Cao 44px, chữ **≥ 16px** (dưới 16px iOS tự phóng to trang) |

Hành động chính ở **1/3 dưới** màn hình (vùng ngón cái). Hành động phá huỷ không đặt ở chỗ dễ chạm
nhầm. Mọi thanh dính đáy cộng `env(safe-area-inset-bottom)`.

### 2.3 Điều hướng mobile

| Site | Thanh tab dưới đáy |
| --- | --- |
| Khách | Khám phá · Tin nhắn · Chuyến · Tài khoản (chưa đăng nhập: Đăng nhập) |
| Partner — tuyến gói | Tổng quan · Lịch · Yêu cầu · Đơn thuê · Thêm |
| Partner — Owner Lite | Tổng quan · Xe · Yêu cầu · Đơn thuê · Thêm |
| Quản trị | Tổng quan · Kiểm duyệt · Tài chính · Đơn thuê · Thêm |

"Thêm" mở drawer chứa phần menu còn lại, nhóm theo `07`. Tab cần đăng nhập ở site khách mở **modal
đăng nhập** kèm `next` về đúng tab. Thanh tab ẩn trong luồng nhiều bước (gửi yêu cầu thuê, tạo đơn) —
thay bằng thanh hành động của luồng. Không hamburger ở site khách. Nút "quay lại" về màn trước trong
luồng, không về trang chủ.

### 2.4 Bảng → thẻ

Bảng nhiều cột không tồn tại ở mobile.

```
Hàng bảng (desktop)                 Thẻ (mobile)
┌─────────────────────────────┐     ┌────────────────────────────┐
│ Mã | Khách | Xe | Thời gian │     │ Nguyễn Văn A   [Đang thuê] │  ← neo + trạng thái
│ | Tổng | Đã trả | Còn | TT  │  →  │ VF3 Plus · 43B-336.92      │  ← dòng phụ
└─────────────────────────────┘     │ 05/07 08:00 → 08/07 20:00  │
                                    │ Còn nợ      1.520.000 đ    │  ← số quan trọng nhất
                                    │              [Thu tiền] ⋯  │  ← 1 hành động chính
                                    └────────────────────────────┘
```

1. Đúng **một** giá trị neo (tên khách hoặc tên xe) ở dòng đầu, 16px, weight 600.
2. Trạng thái là chip ở góc phải dòng đầu.
3. Tối đa **4 dòng thông tin**; cái thứ 5 thuộc màn chi tiết.
4. Đúng **một** nút chính; phần còn lại vào `⋯`.
5. Số tiền quan trọng nhất in đậm, canh phải, tabular.
6. Chạm vào thẻ = mở chi tiết.

Không cuộn ngang bảng, không thu nhỏ chữ để nhét cột, không ẩn cột mà không nói.

### 2.5 Lịch trên mobile

Lịch xe × ngày là màn quan trọng và khó chuyển thể nhất. **Không co lịch desktop lại.**

| Chế độ | Mô tả | Khi nào |
| --- | --- | --- |
| **Agenda ngày** (mặc định mobile) | Theo mốc giờ trong ngày: giao xe nào, nhận xe nào, xe nào đang chạy | Mở app buổi sáng |
| **Theo xe** | Chọn 1 xe → dòng thời gian 14 ngày của xe đó | Khách hỏi "xe X còn trống không" |
| **Lưới nén** | Lưới xe × ngày, cột ngày 32px, cuộn hai chiều, cột xe dính trái | Chỉ khi người dùng chủ động chọn |

Kéo-thả **tắt** ở mobile: chạm giữ để chọn, rồi dùng bảng hành động ("Dời lịch", "Đổi xe").

### 2.6 Nội dung trên màn nhỏ

- Tiêu đề trang ≤ 24 ký tự; rút gọn có nghĩa, không cắt ngang từ.
- Tên xe/khách dài: ellipsis **một dòng** ở danh sách, hiện đủ ở chi tiết.
- Bàn phím đúng loại: `inputMode="numeric"` cho tiền/km, `type="tel"` cho SĐT,
  `autoComplete="one-time-code"` cho OTP (như `OtpCodeInput`).
- Một trường một dòng ở mobile, kể cả ngày và giờ. Bàn phím không được che nút gửi.

---

## 3. Trang, drawer, modal hay sheet

| Dùng | Desktop | Mobile | Khi | Không dùng khi |
| --- | --- | --- | --- | --- |
| **Trang** | ✅ | ✅ | Quy trình dài, cần chia sẻ bằng link, cần SEO | Xác nhận nhanh |
| **Drawer phải** | ✅ | → toàn màn hình | Xem/sửa chi tiết trong ngữ cảnh danh sách | Quy trình nhiều bước |
| **Modal** | ✅ | → bottom sheet | Xác nhận, form ≤ 5 trường | Bất cứ thứ gì cần cuộn nhiều |
| **Bottom sheet** | → modal giữa | ✅ | Chọn nhanh, xác nhận, hành động ngắn | Nội dung dài |

**Luật cứng:** không lồng modal trong modal, không lồng sheet trong sheet — luồng cần lồng thì là
trang hoặc wizard. Sheet: kéo xuống để đóng, có nút đóng rõ, khoá cuộn nền, trả focus về nơi mở.

Mẫu chuẩn cho form dài là luồng gửi yêu cầu thuê của khách (thời gian → còn trống → thông tin → OTP).
Tạo đơn thủ công ở site partner dùng lại chính giao diện đó (`StaffBookingDialog`); sửa đơn là
`DialogForm` một cột.

---

## 4. Hành động

| Cấp | Hình thức | Tối đa trên một màn |
| --- | --- | --- |
| Chính | Nút gold đặc, chữ đen ấm | **1** |
| Phụ | Nút viền | 2 |
| Cấp ba | Link chữ hoặc mục trong `⋯` | không giới hạn |
| Phá huỷ | Chữ đỏ trong `⋯`, luôn xác nhận | 1 |

**Trong hàng/thẻ danh sách:** đúng một nút chính, phần còn lại vào `⋯` (`RowActions`).

> Hiện trạng 06/10/2026: thẻ yêu cầu đặt xe (`BookingRequestCard`) vẫn bày Nhắn tin · Gọi · Zalo
> cạnh Duyệt/Từ chối. Chuẩn: `[Duyệt]` + `⋯` chứa phần còn lại — còn lệch.

**Xác nhận phá huỷ** nêu rõ hậu quả và phạm vi:
- ❌ "Bạn có chắc không?"
- ✅ "Huỷ đơn DH0003 (Lê Minh Cường, Mazda3, 07–14/08)? Lịch xe sẽ được giải phóng và khách được hoàn 100% số đã chuyển."
- Không hoàn tác được **và** chạm tiền ⇒ bắt chọn lý do hoặc gõ xác nhận.

Hành động bị chặn theo chặng nghiệp vụ thì **ẩn**, không thay bằng dòng giải thích luật nội bộ (ví dụ:
đơn `active` không có nút Huỷ — đường đúng là bàn giao trả xe sớm, ADR 0045 điều 1).

---

## 5. Lỗi

Mã lỗi là hợp đồng API (`API_ERROR_CODE` ở `@xeprime/types`); câu chữ là hợp đồng UX. Web ánh xạ **từ mã**
qua `useErrorMessage()` + namespace `Errors` (`packages/domain/messages/{vi,en}/errors.json`) — ADR 0012.
Không hiện mã trần, và không hiện `message` tiếng Việt của backend làm chữ chính (sai ở giao diện
tiếng Anh). Mã mới ⇒ thêm câu vi + en vào `Errors` (skill `i18n`).

Câu tốt nói **chuyện gì đã xảy ra + bước tiếp theo**, và mang theo lối đi tiếp:

| Tình huống (mã ví dụ) | Lối đi tiếp phải có |
| --- | --- |
| Hết phiên (`UNAUTHENTICATED`) | Mở đúng cửa đăng nhập của site đó (modal ở site khách, trang ở partner/quản trị) |
| Thiếu quyền (`FORBIDDEN`) / sai tuyến (`SUBSCRIPTION_TRACK_ONLY`) | Nói thiếu quyền/năng lực gì và ai cấp; với tuyến: lối tới gói |
| Không tìm thấy (`NOT_FOUND`) | Đường về danh sách |
| Trùng lịch (`BOOKING_SCHEDULE_CONFLICT`, từ constraint DB) | Nút mở lịch xe đó / chọn khung khác |
| Chạm trần xe (`PLAN_LIMIT_REACHED`) | Liên kết gói / nâng cấp |
| Tự đặt xe của mình (`CANNOT_BOOK_OWN_VEHICLE`) | Giải thích, không gợi ý lách |
| Sai bước trạng thái (`INVALID_STATUS_TRANSITION`) | Tải lại để thấy trạng thái mới nhất |
| Mạng/timeout (`CLIENT_NETWORK_ERROR`, `CLIENT_TIMEOUT`) | Thử lại; dữ liệu đã nhập vẫn giữ |

**Nơi hiển thị:** lỗi một trường → dưới trường. Lỗi một thao tác → cạnh nút vừa bấm hoặc trong hộp
thoại đang mở. Lỗi nền (làm mới ngầm) → toast. **Không dùng toast cho lỗi cần người xử lý.** Thao tác
ghi thất bại không bao giờ đóng form và làm mất dữ liệu.

---

## 6. Biểu mẫu

- Nhãn nằm trên ô, luôn hiện. Placeholder là ví dụ, không phải nhãn.
- Đa số trường bắt buộc ⇒ đánh dấu trường **không** bắt buộc.
- Kiểm tra khi rời ô (`onBlur`), báo lại khi gõ tiếp. Không báo đỏ ở ký tự đầu.
- Schema Yup dùng chung ở `@xeprime/validators`; thông điệp lỗi viết ở đó, không viết lại trong màn.
- **Chống double-submit**: nút vào trạng thái đang gửi + chặn ở tầng xử lý (mẫu `AuthPanel`).
- Rời trang khi còn thay đổi chưa lưu ⇒ hỏi lại.
- Ô tiền: phân cách nhóm khi gõ, đơn vị `đ` cố định bên phải, không cho nhập chữ.
- Ô SĐT: nhận `09…`, `84…`, `+84…` và tự chuẩn hoá.
- Form dài chia bước: mỗi bước một câu hỏi, có chỉ báo tiến độ, quay lại không mất dữ liệu.

---

## 7. Ngày, giờ, tiền, số

Mọi định dạng đi qua `useAppFormat()` (client) / `getAppFormat()` (server) — theo ngôn ngữ đang chọn,
tiền luôn VND, múi giờ luôn `Asia/Ho_Chi_Minh` (ADR 0012). Không format tại chỗ, không gọi
`dayjs.locale(...)`.

| Loại | Định dạng (vi) | Ghi chú |
| --- | --- | --- |
| Ngày | `05/07/2026` · `05/07` khi cùng năm | |
| Ngày giờ | `05/07 08:00` | |
| Khoảng | `05/07 08:00 → 08/07 20:00 · 3 ngày` | Số ngày là thứ người dùng cần |
| Tương đối | "12 phút trước" | Chỉ cho nhật ký/thông báo |
| Tiền | `1.520.000 đ` | Luôn có đơn vị; 0 là `0 đ` |
| Tiền rút gọn | `1,5 tr` | **Chỉ** ở thẻ KPI tổng quan, có giá trị đầy đủ khi hover/bấm. Không rút gọn ở màn tài chính |
| SĐT | `0908 157 925` | Che sẵn ở màn nền tảng: `090****925` |
| Biển số | `43B-336.92` in hoa | |
| Mã đơn | rút gọn + nút copy | Không bắt đọc chuỗi 26 ký tự |

---

## 8. Trạng thái nghiệp vụ

Trạng thái là dữ liệu: giá trị ở `packages/types/src/status/` (ADR 0005), nhãn vi/en ở namespace
`Domain`, hiển thị qua `StatusTag`. **Mockup không đặt tên trạng thái mới**, không tự chọn màu cho trạng
thái. Màu chọn theo **vai trò ngữ nghĩa** `STATUS_COLOR` (`packages/types/src/status/meta.ts`):
`NEUTRAL` · `INFO` · `PROCESSING` · `SUCCESS` · `WAITING` · `WARNING` · `DANGER` · `SPECIAL` · `ACCENT`.

Đơn thuê có **năm** trạng thái (ADR 0047): `reserved` "Chờ giao xe" · `active` "Đang thuê" ·
`completed` "Hoàn thành" · `cancelled` "Đã huỷ" · `no_show` "Khách không đến". `confirmed` đã bỏ
(chỉ còn trong enum cho mobile cũ); `in_progress` **không** phải trạng thái đơn thuê (nó là trạng thái
của yêu cầu hỗ trợ). Trạng thái "chờ khách thanh toán" sống ở **yêu cầu đặt xe** (`awaiting_hold`),
không bao giờ ở đơn thuê.

Chip trạng thái: chữ + nền nhạt + viền cùng tông. **Không chấm màu đơn lẻ** — người mù màu không đọc
được, và không màu nào tự nói được nghĩa.

> Điểm cần Creative Director chốt: `STATUS_COLOR.WAITING` đang là preset `gold` (vd `reserved`),
> trong khi `01` §3.2 quy định màu ngữ nghĩa không bao giờ là gold.

---

## 9. Quyền hạn trên giao diện

| Tình huống | Cách làm |
| --- | --- |
| Vai trò không bao giờ dùng chức năng | **Ẩn** khỏi nav và khỏi màn |
| Có quyền xem, không có quyền sửa | Hiện dạng chỉ đọc, ghi "Bạn chỉ có quyền xem" |
| Năng lực gói ở `read_only` (hạ bậc, ân hạn) | Hiện, chỉ đọc, kèm lối gia hạn/nâng gói |
| Bị chặn bởi trạng thái dữ liệu, không phải quyền | Nút disabled + tooltip nói điều kiện ("Cần duyệt hồ sơ xe trước"). Không bao giờ disable mà không nói lý do |
| Đi thẳng URL không có quyền | Trang 403 có giải thích + đường về |
| Nhân sự nền tảng trong phiên hỗ trợ gian hàng (ADR 0050) | Băng phiên luôn hiện (gian hàng · chế độ · thời gian còn lại · Thoát); hành động ngoài capability của phiên thì ẩn |

**PII:** mặc định che (`MaskedContact`). Nút bỏ che nói rõ hành động được ghi lại: *"Xem số đầy đủ (ghi
vào nhật ký hệ thống)"*; sau khi bỏ che, hiện ai xem lúc nào.

---

## 10. Phản hồi sau thao tác

| Loại thao tác | Phản hồi |
| --- | --- |
| Lưu nhanh (đổi tên, đánh dấu) | Toast 3 giây, có "Hoàn tác" nếu được |
| Tạo bản ghi | Chuyển tới bản ghi hoặc hiện nó trong danh sách với nhấn nháy nhẹ |
| Thao tác tiền | **Không** toast. Hiện trạng thái mới ngay trên màn: số dư/công nợ cập nhật + dòng vừa tạo |
| Hàng loạt | Tóm tắt: "Đã duyệt 8/10. 2 hồ sơ lỗi:" + lý do |
| Dài (> 2s) | Tiến trình tại chỗ, không khoá cả màn |

**Không optimistic update** cho: đặt/dời lịch, duyệt yêu cầu, thu/hoàn tiền, duyệt hồ sơ, chuyển trạng
thái đơn — chúng có thể bị constraint DB từ chối (nguyên tắc 7). Optimistic được phép cho: đánh dấu đã
đọc, yêu thích, đổi bộ lọc.

---

## 11. Khả năng tiếp cận (WCAG 2.1 AA)

- Mọi ô nhập có `<label>` gắn đúng `id` (chuẩn: `components/form/TextField.tsx` dùng `useId()`).
- Đi hết mọi luồng bằng bàn phím. Modal/drawer: bẫy focus, `Esc` đóng, trả focus về nơi mở.
- Vòng focus nhìn thấy được, tương phản ≥ 3:1. Không `outline: none`.
- Icon-only có `aria-label` + tooltip.
- Không dùng **chỉ** màu để truyền nghĩa.
- `aria-live` đúng mức: `polite` cho toast, `assertive` cho lỗi chặn.
- Tôn trọng `prefers-reduced-motion`.
- `<html lang>` theo ngôn ngữ đang chọn (`vi`/`en`, cookie `XP_LOCALE`) — không gắn cứng.

---

## 12. Chữ trong giao diện

- Mọi chữ hiện cho người dùng có bản **vi và en**, cùng một URL (ADR 0012). Không chuỗi viết thẳng
  trong component; mã đi trên dây (status, permission…) không dịch — chỉ nhãn được dịch.
- **Nút là động từ**: "Tạo đơn", "Thu tiền", "Gửi duyệt" — không "OK", "Submit".
- **Tiêu đề là danh từ**: "Đơn thuê", không "Quản lý đơn thuê".
- Câu ngắn, một ý một câu. Không "hệ thống", không "vui lòng liên hệ quản trị viên" mà không nói ai.
- Viết tắt chỉ khi phổ thông: SĐT, CCCD, GPLX, VND được; "KH", "PT", "TT" thì không.
- Tiếng Việt không đổi số nhiều: "3 đơn". Bản tiếng Anh dùng ICU plural.
- Từ vựng chốt (gian hàng, yêu cầu thuê, đơn thuê, tiền giữ chỗ ≠ cọc thế chấp…): `01` §9.
- Tính năng chưa mở thì **ẩn hẳn**, không đặt dòng giải thích cơ chế nội bộ vào chỗ đó.

---

## 13. Ràng buộc kỹ thuật khi thiết kế

Để một bản thiết kế không đề xuất thứ kiến trúc đã chốt là không làm — và để cùng một ý tưởng được
diễn đạt theo cách rẻ hơn nhiều lần. Hệ công nghệ đầy đủ: `CLAUDE.md` §3–5.

### 13.1 Hệ UI

Ant Design 6 + CSS Modules + token `--xp-*` (ADR 0003). Component AntD đã có thì dùng nguyên hình dạng
của nó — vẽ một select "đẹp hơn" là viết lại từ đầu. Icon **chỉ** `@ant-design/icons`. Font Be Vietnam
Pro (+ Playfair chỉ ở hero). Không inline style (ngoại lệ: CSS custom property cho giá trị chỉ biết lúc
chạy, như vị trí thanh sự kiện trên lịch). Lịch là component tự dựng — không thư viện lịch trả phí.

### 13.2 Bảo đảm nghiệp vụ thiết kế không được đè lên

| Ràng buộc | ADR | Ý nghĩa với thiết kế |
| --- | --- | --- |
| Chống trùng lịch bằng constraint DB | 0006 | `check-conflict` chỉ là xem trước; không màn nào "sửa lịch trực tiếp" ngoài luồng đơn/khoá lịch |
| Xe lên chợ đi qua duyệt; một writer cho `public_listings` | 0008 · 0049 | Không có nút "đăng lên sàn" đi tắt; công tắc hiển thị của chủ xe là trục riêng (0048) |
| Tenant scope lấy từ membership; một tài khoản partner một gian hàng | 0053 | Không bộ chọn gian hàng, không bộ chuyển scope |
| Quyền đọc từ DB mỗi request | 0002 | Không cache quyền ở client để "ẩn nhanh hơn" |
| Mỗi site một tài khoản; chỉ realm khách đặt xe | 0053 | Không vẽ nút đặt xe ở site partner/quản trị; không vẽ "chuyển sang tài khoản khác" như một nút chuyển vai |
| Tiền là string trong JSON | 0007 | Không giả định phép tính tiền ở client |
| Duyệt trước, thu tiền giữ chỗ sau | 0044 | Không QR lúc khách gửi yêu cầu; QR có cửa sổ 120′, không gia hạn; khung giờ mất ⇒ "xe vừa được khách khác nhận và đang được tạm giữ" |
| Tiền giữ chỗ = cọc · phí phía khách · bảo hiểm xe · bảo hiểm người; phần còn lại trả trực tiếp chủ xe | 0032 · 0033 | Checkout tách `tổng chuyến` · `chuyển ngay` · `trả khi nhận xe`; không vẽ luồng XePrime thu hộ phần còn lại; không gọi khoản QR là "cọc" |
| Mã khuyến mãi do nền tảng tài trợ | 0046 | Chỉ trừ vào khoản chuyển online; không hiện như giảm giá của gian hàng; mã bị rút thì báo khách |
| Bảo hiểm phát hành tại bàn giao | 0032 | Tách khoản phí đã thu khỏi chứng nhận đã phát hành; huỷ trước chuyến hoàn 100% bảo hiểm |
| Owner Lite không bắt buộc bằng chứng giao nhận | 0032 | Không đưa checklist/ảnh/odo/nhiên liệu bắt buộc vào luồng chủ xe 1–3 xe |
| Hỗ trợ gian hàng bằng phiên có lý do, không giả danh | 0050 | Dùng lại màn partner dưới site quản trị + băng phiên; không thiết kế bản Manage riêng cho admin |
| PII che mặc định, bỏ che ghi audit | — | Không bảng hiện SĐT đầy đủ sẵn |
| Chat: PostgreSQL là nguồn thật, Firestore là bản chiếu | 0009 | Không tính năng chat dựa vào năng lực riêng của Firestore |

### 13.3 Cùng một mong muốn, hai cách diễn đạt

| Mong muốn | Cách **đắt** | Cách **rẻ** |
| --- | --- | --- |
| Danh sách đẹp hơn | Bảng riêng cho từng màn | Bảng dùng chung + biến thể cột |
| Lọc mạnh hơn | Panel lọc giữ state riêng | Lọc ghi vào URL, backend lọc (`use-url-filters`) |
| Thấy nhiều dữ liệu hơn | Tải hết rồi cắt ở client | Phân trang server + index |
| Chuyển cảnh mượt | Animation chuyển trang toàn cục | Skeleton đúng hình dạng |
| Thêm một trường vào màn | Thêm cột + migration | Kiểm tra DTO đã có chưa (thường là có) |
| Biểu tượng riêng cho từng trạng thái | Bộ icon mới | Chip màu + nhãn từ `Domain` |
| Ảnh xe đẹp | Ép chủ xe tự chỉnh ảnh | Kiểm tỉ lệ/kích thước lúc upload + placeholder có thương hiệu |
| Trang nhanh hơn | Tối ưu sau khi xong | Giữ Server Component, đẩy `'use client'` xuống lá |

### 13.4 Đừng phá render tĩnh của site khách

Một provider bọc cả cây `(public)` mà đọc `useSearchParams` sẽ kéo toàn bộ chợ xe vào Suspense và mất
render tĩnh ⇒ mất SEO và tốc độ trang chủ. Cách đúng đang dùng: `AuthModalProvider` không đọc search
params; phần đọc URL là leaf `AuthUrlSync` trong Suspense riêng. Mọi đề xuất kiểu "thanh trạng thái
toàn trang", "banner cá nhân hoá trên mọi trang công khai", "giỏ so sánh nổi" phải hỏi trước: *nó có
buộc trang chủ thành động không?* Có thì thiết kế lại thành đảo client nhỏ.

### 13.5 Ngân sách hiệu năng

Đo trên 4G tiết chế, thiết bị tầm trung:

| Chỉ số | Ngưỡng | Cái gì phá nó |
| --- | --- | --- |
| LCP trang chủ, trang xe | ≤ 2.5s | Ảnh hero nặng, font thứ ba, client component ở layout |
| INP | ≤ 200ms | |
| CLS | ≤ 0.1 | Ảnh không đặt tỉ lệ, nội dung chèn sau khi tải |
| JS client cho route chợ xe | ≤ 180KB gzip | Kéo cả AntD hay thư viện biểu đồ vào trang công khai |
| Ảnh thẻ xe | ≤ 80KB (WebP/AVIF, `next/image`) | |
| Truy vấn danh sách | Có index tương ứng | Lọc/sắp theo trường chưa index ⇒ phải có migration (index trigram cho ô tìm `ILIKE` nằm trong baseline `20260821000000_init`) |

### 13.6 Việc gì cần migration

Báo trước, vì chúng chậm và khó lùi: trường/bảng mới; lọc hoặc sắp xếp theo trường chưa index; tìm
theo khoảng cách/bản đồ cần index không gian; một **dòng tiền mới** — sổ tiền (`bank_transactions`,
`booking_holds`, ví, lệnh rút, đối soát) đã có, nhưng dòng tiền mới cần cả migration lẫn ADR (chủ sở
hữu, snapshot, idempotency, audit).

**Không** cần migration: đổi bố cục, đổi copy (vẫn phải đủ vi/en), gom/tách màn, thêm bộ lọc trên
trường đã có, sắp theo trường đã index, chuyển bảng thành thẻ ở mobile, dark theme (thêm bộ giá trị
token).

### 13.7 Khi thiết kế cần cái mới

| Cần | Ai duyệt | Yêu cầu |
| --- | --- | --- |
| Token mới | Creative Director | Thêm vào `packages/ui/src/tokens/index.ts` **và** `packages/ui/src/styles/tokens.css`, ánh xạ AntD ở `apps/web/src/styles/theme.ts` — `theme.test.ts` đỏ nếu lệch (`docs/design-token-map.md`) |
| Trạng thái nghiệp vụ mới | Product Director | `packages/types/src/status/` + nhãn vi/en ở `Domain` + vai trò màu (ADR 0005) |
| Quyền mới | Product Director | `packages/types/src/rbac.ts` + seed + guard backend |
| Thư viện mới | Product Director | Vấn đề, chi phí bundle, phương án không dùng thư viện |
| Trường dữ liệu mới | Product Director | Migration + DTO + sinh lại contract OpenAPI |
| Mục mới trong nav | Product Director | Nói mục nào gộp/bỏ (`07` §7) |
| Quyết định lâu dài | Product owner | ADR mới ở `docs/decisions/` |

---

## 14. Checklist duy nhất — duyệt một màn trước khi giao

**Nội dung & luồng**
- [ ] Dòng đầu trả lời câu hỏi của người mở màn; tối đa một điểm nhấn gold
- [ ] Đủ năm trạng thái (§1.4), vẽ cả bản mobile
- [ ] Đúng một hành động chính; phá huỷ có xác nhận nêu hậu quả
- [ ] Lỗi nói được bước tiếp theo; không mất dữ liệu khi thao tác ghi thất bại
- [ ] Không hứa điều hệ thống không bảo đảm; không optimistic cho lịch/tiền/duyệt

**Dữ liệu & quyền**
- [ ] Danh sách: lọc/sắp/phân trang ghi rõ tham số URL, xử lý server-side, có index
- [ ] Trạng thái/vai trò khớp `@xeprime/types`, nhãn từ `Domain`; không tên trạng thái mới
- [ ] Tiền/ngày qua `useAppFormat`/`getAppFormat`, tiền thẳng cột, đủ đơn vị
- [ ] Nêu rõ hành động nào cần quyền/năng lực gói nào; PII che mặc định
- [ ] Đúng site và đúng tài khoản (`07`); không nút đặt xe ngoài site khách

**Responsive**
- [ ] Dùng được một tay ở 375px; không cuộn ngang ngoài ý muốn; xoay ngang không vỡ
- [ ] Vùng chạm ≥ 44px; ô nhập chữ ≥ 16px; safe area ở mọi thanh dính đáy; bàn phím không che nút gửi
- [ ] Bảng đã thành thẻ theo §2.4

**Hệ thống**
- [ ] Component AntD dùng đúng hình dạng; mọi màu/khoảng cách/bo góc là token `--xp-*`
- [ ] Icon có trong `@ant-design/icons`
- [ ] Đánh dấu chỗ nào Server Component, chỗ nào đảo client; không phá render tĩnh của `/`
- [ ] Nêu đề xuất nào cần migration (§13.6)
- [ ] Mọi chữ có bản vi + en; đi hết bằng bàn phím, có nhãn cho mọi ô; tương phản AA ở mọi trạng thái
