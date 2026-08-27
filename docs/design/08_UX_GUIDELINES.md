# 08 — UX Guidelines

> Ngày: 04/08/2026 · Chủ sở hữu: Product + Creative Director
> Đây là thư viện mẫu tương tác: **cùng một vấn đề luôn được giải bằng cùng một cách**. Khi cần lệch khỏi mẫu, phải ghi lý do vào PR.

---

## 1. Bốn khuôn trang

Mọi màn hình trong sản phẩm là một trong bốn khuôn dưới đây. Không có khuôn thứ năm.

### 1.1 Danh sách (list)

```
┌──────────────────────────────────────────────────────┐
│ Tiêu đề trang                      [Hành động chính] │
│ Câu trả lời: "41 đơn · 1 đang thuê · còn thu 44tr"   │ ← nguyên tắc 1
├──────────────────────────────────────────────────────┤
│ [Tìm kiếm]  [Lọc ▾] [Khoảng ngày]      [đã lọc: 2 ✕] │ ← ghi vào URL
├──────────────────────────────────────────────────────┤
│ Bảng (desktop) / Thẻ (mobile)                        │
│ …                                                    │
├──────────────────────────────────────────────────────┤
│ 1–20 / 341                          ‹ 1 2 3 ›  20/tr │
└──────────────────────────────────────────────────────┘
```

**Hợp đồng bắt buộc của mọi màn danh sách**:
1. Lọc/sắp xếp/phân trang **ở URL** (ADR 0004) và **xử lý ở máy chủ**. Không có ngoại lệ "danh sách này chắc ít dòng".
2. Có dòng tóm tắt trả lời câu hỏi của màn.
3. Bộ lọc đang áp hiển thị thành chip gỡ được từng cái + "Xoá bộ lọc".
4. Cột số căn phải, `tabular-nums`; trạng thái là chip; ngày ở định dạng thống nhất.
5. Đủ 5 trạng thái (§4).
6. Chọn nhiều + hành động hàng loạt **chỉ khi** nghiệp vụ thật sự cần (duyệt hồ sơ, đánh dấu đã đọc). Không thêm checkbox theo thói quen.

### 1.2 Chi tiết (detail)

Ba lớp, theo đúng thứ tự: **danh tính** (là bản ghi gì, trạng thái gì) → **hành động** → **dữ liệu**.
Có URL riêng. Drawer là *cách hiển thị*, không phải lý do để không có URL.
Dòng thời gian/nhật ký nằm cuối, thu gọn mặc định.

### 1.3 Biểu mẫu (form)

Một cột. Nhóm trường có tiêu đề. Nút chính dưới cùng bên phải (desktop) / dính đáy (mobile).
Form > 8 trường hoặc có nhánh ⇒ chuyển sang **wizard** từng bước.

### 1.4 Bảng điều khiển (dashboard)

Hàng đầu là **việc cần làm hôm nay**, không phải KPI. KPI ở hàng hai. Biểu đồ ở hàng ba.
Mỗi thẻ số liệu bấm được → dẫn tới danh sách đã lọc sẵn tạo ra con số đó (nguyên tắc 4: tiền phải truy nguồn).

---

## 2. Drawer, modal, sheet hay trang

| Dùng | Khi | Không dùng khi |
| --- | --- | --- |
| **Trang** | Quy trình dài, nội dung cần chia sẻ bằng link, cần SEO | Xác nhận nhanh |
| **Drawer phải** | Xem/sửa chi tiết trong ngữ cảnh danh sách | Quy trình nhiều bước |
| **Modal** | Xác nhận, form ≤ 5 trường | Bất cứ thứ gì cần cuộn nhiều trên desktop |
| **Bottom sheet** | Bản mobile của modal/drawer, chọn nhanh | Nội dung dài |

**Luật cứng**: không lồng modal trong modal, không lồng sheet trong sheet. Nếu một luồng cần lồng, nó phải là trang hoặc wizard.

> Việc cần sửa: "Tạo đơn thuê" hiện là modal 5 tab (Chi tiết / Thanh toán / Dịch vụ / Hình ảnh / Nhật ký). Đó là một quy trình, không phải một hộp thoại ⇒ chuyển thành wizard hoặc trang, theo mẫu đã đúng của luồng đặt xe khách.

---

## 3. Hành động

| Cấp | Hình thức | Số lượng tối đa trên một màn |
| --- | --- | --- |
| Chính | Nút gold đặc | **1** |
| Phụ | Nút viền | 2 |
| Cấp ba | Link chữ hoặc mục trong `⋯` | không giới hạn |
| Phá huỷ | Chữ đỏ trong `⋯`, luôn cần xác nhận | 1 |

**Trong hàng của danh sách**: đúng **một** nút chính, phần còn lại vào `⋯`.
> Việc cần sửa: hàng yêu cầu thuê hiện có 5 khối màu (Duyệt / Từ chối / Gọi / Zalo / Nhắn tin). Chuẩn mới: `[Duyệt]` + `⋯` chứa phần còn lại.

**Xác nhận phá huỷ**: nêu rõ **hậu quả và phạm vi**, không hỏi chung chung.
- ❌ "Bạn có chắc không?"
- ✅ "Huỷ đơn DH0003 (Lê Minh Cường, Mazda3, 07–14/08)? Lịch xe sẽ được giải phóng và khoản đã thu 0 đ giữ nguyên."
- Hành động không hoàn tác được **và** ảnh hưởng tiền ⇒ bắt gõ xác nhận hoặc chọn lý do.

---

## 4. Năm trạng thái — bắt buộc thiết kế đủ

| Trạng thái | Quy tắc |
| --- | --- |
| **Đang tải** | Skeleton đúng hình dạng nội dung. Spinner toàn trang chỉ dùng khi chưa biết layout. Chuyển trang < 300ms thì không hiện gì (nhấp nháy tệ hơn chờ) |
| **Có dữ liệu** | Trạng thái mặc định |
| **Rỗng** | Một câu giải thích + một hành động. Phân biệt **rỗng thật** ("Chưa có đơn thuê nào") với **rỗng do lọc** ("Không có đơn khớp bộ lọc" + nút xoá lọc) |
| **Lỗi** | Nói chuyện gì + bước tiếp theo + nút Thử lại. Giữ nguyên dữ liệu người dùng đã nhập |
| **Thiếu quyền** | Nói cần quyền gì và ai cấp được. Không phải màn trắng, không phải onboarding |

---

## 5. Lỗi — bảng dịch từ mã sang tiếng người

Mã lỗi là hợp đồng API (`@xeprime/types`); câu chữ là hợp đồng UX. Không hiển thị mã lỗi trần cho người dùng.

| Mã | Hiển thị |
| --- | --- |
| `UNAUTHENTICATED` (401) | "Phiên đăng nhập đã hết. Đăng nhập lại để tiếp tục." + mở đúng cửa (modal cho khách, trang cho portal) |
| `FORBIDDEN` (403) | "Tài khoản của bạn không có quyền *{tên quyền}*. Liên hệ chủ gian hàng để được cấp." |
| `NOT_FOUND` | "Không tìm thấy {đối tượng}. Có thể nó đã bị xoá." + đường về danh sách |
| Trùng lịch (409, từ `23P01`) | "Xe *{tên}* đã có lịch trong khung *{giờ}*. Chọn khung khác hoặc xe khác." + nút mở lịch xe đó |
| `PLAN_LIMIT_REACHED` | "Gói *{tên gói}* cho phép tối đa {n} xe. Nâng gói để thêm xe." + liên kết gói |
| `OTP_LOCKED` | "Đã nhập sai mã 5 lần. Thử lại sau {thời gian} hoặc dùng cách đăng nhập khác." |
| Sai bước trạng thái (409) | "Đơn này đang ở trạng thái *{X}* nên không thể *{hành động}*. Tải lại để xem trạng thái mới nhất." |
| Mạng/500 | "Không kết nối được máy chủ. Dữ liệu bạn nhập vẫn được giữ." + Thử lại |

**Nơi hiển thị**: lỗi của một trường → dưới trường đó. Lỗi của một thao tác → cạnh nút vừa bấm hoặc trong hộp thoại đang mở. Lỗi nền (làm mới ngầm) → toast. **Không dùng toast cho lỗi cần người xử lý** — toast biến mất.

---

## 6. Biểu mẫu

- Nhãn nằm trên ô, luôn hiện. Placeholder là ví dụ, không phải nhãn.
- Trường bắt buộc: đánh dấu trường **không** bắt buộc thay vì đánh dấu trường bắt buộc, nếu đa số là bắt buộc.
- Kiểm tra hợp lệ khi rời khỏi ô (`onBlur`), báo lỗi lại khi gõ tiếp. Không báo đỏ ngay ký tự đầu tiên.
- Schema Yup ở `@xeprime/validators` dùng chung FE/BE — thông điệp lỗi viết ở đó, không viết lại trong component.
- **Chống double-submit**: nút vào trạng thái đang gửi + chặn ở tầng xử lý (mẫu `AuthPanel.run()` đang làm đúng).
- Rời trang khi form còn thay đổi chưa lưu ⇒ hỏi lại.
- Ô tiền: hiện dấu phân cách nhóm khi gõ, đơn vị `đ` cố định bên phải, không cho nhập chữ.
- Ô SĐT: chấp nhận `09…`, `84…`, `+84…` và tự chuẩn hoá — người dùng không cần biết hệ thống lưu dạng nào.

---

## 7. Ngày, giờ, tiền, số

| Loại | Định dạng | Ghi chú |
| --- | --- | --- |
| Ngày | `05/07/2026` · rút gọn `05/07` khi cùng năm | |
| Ngày giờ | `05/07 08:00` | Múi giờ hiển thị luôn là `Asia/Ho_Chi_Minh` |
| Khoảng | `05/07 08:00 → 08/07 20:00 · 3 ngày` | Số ngày là thứ người dùng thật sự cần |
| Tương đối | "12 phút trước" chỉ cho nhật ký/thông báo | Không dùng cho dữ liệu nghiệp vụ |
| Tiền | `1.520.000 đ` | Luôn có đơn vị; 0 hiển thị `0 đ`, không để trống |
| Tiền rút gọn | `1,5 tr` | **Chỉ** ở thẻ KPI tổng quan, phải có giá trị đầy đủ khi hover/bấm |
| Số điện thoại | `0908 157 925` | Che sẵn ở màn nền tảng: `090****925` |
| Biển số | `43B-336.92` in hoa | |
| Mã đơn | `bk_4nfg…` rút gọn + copy được | Không bắt người đọc chuỗi 26 ký tự |

Mọi định dạng đi qua helper chung (`lib/money.ts`, `lib/datetime.ts`) — **không** format tại chỗ trong component.

---

## 8. Trạng thái nghiệp vụ

Nhãn và màu đọc từ `@xeprime/types` (ADR 0005) qua `StatusTag`. Thiết kế **không** được đặt tên trạng thái mới trong mockup.

| Nhóm nghĩa | Màu |
| --- | --- |
| Chờ xử lý (`pending_*`) | Cam (warning) |
| Đang diễn ra (`active`, `in_progress`) | Xanh dương (info) |
| Hoàn tất (`completed`, `approved`, `paid`) | Xanh lá (success) |
| Kết thúc tiêu cực (`cancelled`, `rejected`, `no_show`) | Đỏ (error) |
| Không hoạt động (`draft`, `hidden`, `removed`) | Trung tính |

Chip trạng thái: chữ + nền nhạt + viền cùng tông. **Không dùng chấm màu đơn lẻ** — người mù màu không đọc được, và không có màu nào tự nói được nghĩa của nó.

---

## 9. Quyền hạn trên giao diện

| Tình huống | Cách làm |
| --- | --- |
| Vai trò không bao giờ dùng chức năng | **Ẩn** khỏi nav và khỏi màn |
| Có quyền xem, không có quyền sửa | Hiện ở dạng chỉ đọc, có ghi chú "Bạn chỉ có quyền xem" |
| Bị chặn bởi trạng thái, không phải quyền | Nút disabled + tooltip nói điều kiện ("Cần duyệt hồ sơ xe trước") |
| Đi thẳng vào URL không có quyền | Trang 403 có giải thích + đường về |

**Không bao giờ** disable một nút mà không cho biết lý do.

**PII**: mặc định che (`MaskedContact`). Nút "xem đầy đủ" phải cho biết hành động này được ghi lại: *"Xem số đầy đủ (ghi vào nhật ký hệ thống)"*. Sau khi bỏ che, hiện ai xem lúc nào.

---

## 10. Phản hồi sau thao tác

| Loại thao tác | Phản hồi |
| --- | --- |
| Lưu nhanh (đổi tên, đánh dấu) | Toast 3 giây, có "Hoàn tác" nếu có thể |
| Tạo bản ghi | Chuyển tới bản ghi đó hoặc hiện nó trong danh sách với nhấn nháy nhẹ |
| Thao tác tiền | **Không** dùng toast. Hiện trạng thái mới ngay trên màn: số dư/công nợ cập nhật + dòng phiếu vừa tạo |
| Thao tác hàng loạt | Tóm tắt kết quả: "Đã duyệt 8/10. 2 hồ sơ lỗi:" + danh sách lý do |
| Thao tác dài (> 2s) | Nút hiện tiến trình tại chỗ, không khoá cả màn hình |

**Không optimistic update** cho: đặt/dời lịch, thu tiền, duyệt hồ sơ, chuyển trạng thái đơn — những thao tác này có thể bị ràng buộc DB từ chối (nguyên tắc 7).

---

## 11. Khả năng tiếp cận (mục tiêu WCAG 2.1 AA)

- Mọi ô nhập có `<label>` gắn `htmlFor` đúng `id` (đã sửa ở `components/form/TextField.tsx` bằng `useId()` — dùng làm chuẩn).
- Đi hết được mọi luồng bằng bàn phím. Modal/drawer: bẫy focus, `Esc` đóng, trả focus về nơi mở.
- Vòng focus nhìn thấy được, tương phản ≥ 3:1. Không `outline: none`.
- Icon-only phải có `aria-label`.
- Không dùng **chỉ** màu để truyền nghĩa — luôn kèm chữ hoặc icon.
- Thông báo động dùng `aria-live` đúng mức (`polite` cho toast, `assertive` cho lỗi chặn).
- Tôn trọng `prefers-reduced-motion`.
- Ngôn ngữ trang `lang="vi"`.

---

## 12. Chữ trong giao diện

- **Nút là động từ**: "Tạo đơn", "Thu tiền", "Gửi duyệt" — không phải "OK", "Submit".
- **Tiêu đề là danh từ**: "Đơn thuê xe", không phải "Quản lý đơn thuê xe" (đang ở portal thì đương nhiên là quản lý).
- Câu ngắn. Một ý một câu.
- Không dùng "hệ thống", "vui lòng liên hệ quản trị viên" mà không nói ai.
- Không viết tắt trừ khi phổ thông ở Việt Nam: SĐT, CCCD, GPLX, VND được; "KH", "PT", "TT" thì không.
- Số nhiều tiếng Việt không đổi dạng — viết "3 đơn", đừng cố dịch "3 orders".

---

## 13. Checklist duyệt một màn hình

- [ ] Trả lời được câu hỏi của người dùng ở dòng đầu
- [ ] Đủ 5 trạng thái
- [ ] Danh sách: lọc/phân trang ở URL, xử lý server-side
- [ ] Đúng 1 hành động chính
- [ ] Thao tác phá huỷ có xác nhận nêu rõ hậu quả
- [ ] Lỗi nói được bước tiếp theo
- [ ] Tiền/ngày đúng định dạng, đi qua helper chung
- [ ] Trạng thái lấy từ `@xeprime/types`
- [ ] Có bản mobile
- [ ] Đi hết bằng bàn phím, có nhãn cho mọi ô
- [ ] Không có màu ngoài token

Liên quan: `06_DESIGN_PRINCIPLES.md` · `05_MOBILE_FIRST_GUIDELINES.md` · `10_IMPLEMENTATION_CONSTRAINTS.md`.
