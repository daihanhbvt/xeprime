# 03 — Product Gap Analysis

> Ngày: 04/08/2026 · Chủ sở hữu: Product Director
> Đối chiếu **sản phẩm lý tưởng** (`02_PRODUCT_VISION.md`) với **sản phẩm đang có** (`docs/completion-roadmap.md`, code trong `apps/`).
> Mọi mục đều dẫn file/route thật. Không có mục nào là phỏng đoán về code chưa đọc.

---

## 0. Ảnh chụp hiện trạng

| Phase | Nội dung | Trạng thái |
| --- | --- | --- |
| 0–3 | Base · Auth/RBAC/Tenant · Shop approval + Vehicle · Public listing + Marketplace | ✅ |
| 4 | Booking request + Booking + Calendar + gate OTP | ✅ |
| 5 | Notification ✅ · Review ✅ · Chat (dựng, realtime sau cờ `FIRESTORE_ENABLED`) | 🟡 |
| 6 | Finance / Thu-Chi / Công nợ / Hợp đồng | ✅ (đóng milestone "vận hành đủ tiền") |
| 7 | Admin nền tảng | 🟡 lõi + 3 màn giám sát xong; còn support ticket, invoice |
| 8–9 | Migration Firestore · QA/hardening | ❌ |
| — | Kiến trúc auth (modal khách / portal login / onboarding tách route) | ✅ 04/08 |

**Đọc một câu**: bộ xương nghiệp vụ đã đủ và đúng. Khoảng cách còn lại **không nằm ở "thiếu tính năng lớn"** mà ở ba chỗ: (a) những mảnh khiến vòng tiền chưa khép, (b) chất lượng trải nghiệm ở các màn dùng hằng ngày, (c) các trang mới có vỏ.

---

## 1. Cách chấm điểm

**Mức độ**
`P0` — chặn tầm nhìn chặng 2, phải làm · `P1` — làm sản phẩm tốt lên rõ rệt · `P2` — nên có, chưa gấp

**Công sức** `S` ≤ 3 ngày · `M` 1–2 tuần · `L` > 2 tuần

---

## 2. Khoảng trống — Khách thuê (Marketplace)

| # | Khoảng trống | Hiện trạng | Mức | Công | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| C-01 | ~~**Thanh toán / cọc online**~~ · **ĐÃ QUYẾT KHÔNG LÀM 21/08/2026 — [ADR 0013](../decisions/0013-no-online-payment-mvp.md)** | Không có. Cọc ghi tay ở phiếu thu — và đó là thiết kế, không phải thiếu sót | ~~P0~~ → Out of scope | ~~L~~ | Chặn "đặt xe là chắc chắn". Cần chọn cổng (VNPay/Momo/ZaloPay), thiết kế trạng thái tiền-đang-giữ, hoàn cọc. Kéo theo bảng mới ⇒ migration |
| C-02 | **Lịch còn trống ngay trên trang chi tiết xe** | Chỉ biết trống/không sau khi bấm "Tìm xe khả dụng" hoặc ở bước chọn ngày | P0 | M | Đây là điểm rơi lớn nhất của phễu. API đã có (`OccupancyService.findOverlapping`); cần endpoint đọc dải ngày bận công khai + lịch tháng ở `features/marketplace/components/ListingDetailView.tsx` |
| C-03 | **Bảng giá minh bạch trước khi gửi yêu cầu** | Thẻ xe hiện giá/ngày; tổng tiền, phí giao xe, cọc, chính sách huỷ chỉ rõ khi shop báo lại | P0 | M | "Giá đổi ở bước cuối" là lý do số một khách bỏ sàn. Cần khối tính giá: số ngày × đơn giá + phí giao − giảm giá = tổng, và cọc dự kiến |
| C-04 | **Chính sách huỷ & thế chấp hiển thị chuẩn hoá** | Nằm trong mô tả tự do của shop, mỗi nơi viết một kiểu | P0 | M | Chuẩn hoá thành trường có cấu trúc (3–4 mẫu chính sách) để hiển thị và so sánh được ⇒ migration nhỏ |
| C-05 | **Yêu thích / lưu xe** | Có icon trái tim trên thẻ xe nhưng **không có chức năng** | P1 | S | Icon chết còn tệ hơn không có icon. Hoặc làm, hoặc gỡ |
| C-06 | **So sánh xe** | Không có (UI cũ từng có nút "So sánh") | P2 | M | Chờ mật độ xe/tỉnh đủ lớn |
| C-07 | **Tìm theo bản đồ / bán kính** | Chỉ lọc theo tỉnh/thành | P1 | L | Cần toạ độ điểm nhận xe ⇒ migration + thư viện bản đồ |
| C-08 | **Hồ sơ định danh khách (GPLX/CCCD)** | Không có phía khách; shop chụp giấy tờ lúc giao xe | P1 | L | Là điều kiện để mở "đặt xe là chắc chắn" và giảm rủi ro cho shop |
| C-09 | **Khiếu nại / hỗ trợ chuyến** | Không có. Khách chỉ có chat với shop | P1 | M | Ghép với S-01 (ticket) — một hệ, hai lối vào |
| C-10 | **Theo dõi trạng thái yêu cầu thuê** | `/trips` có, nhưng không có dòng thời gian "đã gửi → shop xem → duyệt/từ chối" | P1 | S | Rẻ, giảm mạnh lượng câu hỏi "shop nhận chưa?" |
| C-11 | **Chuẩn ảnh & chất lượng listing** | Đang có thẻ xe dùng ảnh phong cảnh/ảnh chụp màn hình | P0 | M | Xem G-04. Ảnh hỏng phá cả brand lẫn chuyển đổi |
| C-12 | **Upload ảnh thật (R2)** | Ảnh nhập bằng **URL** (`completion-roadmap` §5) | P0 | M | Không thể yêu cầu chủ shop tự đi host ảnh. `modules/storage` presign đã có, thiếu luồng FE + presign cho avatar khách |

---

## 3. Khoảng trống — Gian hàng (Portal vận hành)

| # | Khoảng trống | Hiện trạng | Mức | Công | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| S-01 | **Khách hàng của shop** | `/manage/customers` là **stub 5 dòng**; menu có `comingSoon` | P0 | M | Shop không có nơi xem "khách này thuê 6 lần, còn nợ 2tr, từng trả xe muộn". Đây là tài sản chính của shop và là lý do họ ở lại. Màn 04/08 là của **nền tảng**, không thay thế |
| S-02 | **Vận hành trên điện thoại** | Có `MobileNav` + tab bar, nhưng lịch, bảng đơn, form tạo đơn đều thiết kế cho desktop | P0 | L | Persona chính làm việc ngoài bãi xe. Xem `05_MOBILE_FIRST_GUIDELINES.md` |
| S-03 | **Bàn giao xe có bằng chứng** | Không có: không ảnh tình trạng xe, không số km/xăng lúc giao–nhận, không chữ ký | P0 | L | UI cũ có "KM nhận/trả"; bản mới chưa có luồng bàn giao. Đây là nơi tranh chấp thực sự xảy ra ⇒ migration (bảng handover + ảnh) |
| S-04 | **Nhắc việc trong ngày** | Dashboard có số liệu, không có "hôm nay giao 3 xe, nhận 2 xe, 4 đơn quá hạn thu" | P0 | S | Rẻ nhất trong nhóm P0 và thay đổi thói quen mở app hằng ngày |
| S-05 | **Khu vực nhận xe** | Stub (`/manage/pickup-areas`) nhưng **đã dùng** trong luồng đặt xe | P1 | S | Đang là dữ liệu không quản lý được |
| S-06 | **Tài xế** | Stub. Dịch vụ "có tài xế" đã bán trên sàn | P1 | M | Bán một dịch vụ mà không quản lý được nguồn lực của nó |
| S-07 | **Thùng rác / khôi phục** | Stub, trong khi `deleted_at` đã có ở schema | P1 | S | Xoá nhầm đơn/xe hiện không có đường lùi trên UI |
| S-08 | **Báo cáo & xuất dữ liệu** | Dashboard tài chính có; không xuất được CSV/PDF | P1 | M | UI cũ có "Xuất CSV" — chủ shop cần đưa cho kế toán |
| S-09 | **Nhiều chi nhánh** | Selector "Tất cả chi nhánh" tồn tại trong UI cũ; bản mới chưa có mô hình chi nhánh | P2 | L | Chặng 3. Đừng nửa vời: hoặc mô hình đúng, hoặc bỏ selector |
| S-10 | **Nhắc nợ tự động** | Công nợ có màn hình; không có nhắc | P1 | M | Cần `apps/worker` + template thông báo |
| S-11 | **Onboarding gian hàng mới** | Tạo xong gian hàng là thả vào dashboard rỗng | P1 | S | Checklist 5 bước: thêm xe → ảnh → giá → khu vực nhận → gửi duyệt public |
| S-12 | **Sửa/huỷ đơn có kiểm soát** | Có chuyển trạng thái; chưa có quy tắc "ai được sửa gì sau khi đã thu tiền" | P1 | M | Nguồn thất thoát kinh điển. Cần khoá trường sau thanh toán + lý do sửa vào audit |
| S-13 | **Chat realtime** | Dựng xong, chờ cờ `FIRESTORE_ENABLED` (ADR 0009) | P1 | M | Khách chờ trả lời là khách mất |
| S-14 | **SMS OTP thật** | `OTP_MODE=mock` | P0 | S | Chặn go-live. Chỉ là cấu hình + tài khoản eSMS |

---

## 4. Khoảng trống — Nền tảng

| # | Khoảng trống | Hiện trạng | Mức | Công | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| G-01 | **Support ticket** | Chưa có (§11.1 còn lại) | P1 | M | Gộp với C-09 |
| G-02 | **Hoá đơn cho gói dịch vụ** | Gói/hạn có (ADR 0010), invoice chưa | P1 | M | Cần để thu tiền thuê bao đúng nghĩa |
| G-03 | **Lý do ẩn xe không tới tay reviewer** | Đã ghi nhận: lý do chỉ nằm trong `audit_logs`, shop gửi duyệt lại thì reviewer không thấy | P0 | S | Bug quy trình đã biết. Rẻ, sửa ngay |
| G-04 | **Gate chất lượng khi duyệt public** | Phiếu duyệt là duyệt/từ chối, không có tiêu chí | P0 | M | Checklist: ảnh đạt chuẩn · giá hợp lý · mô tả đủ · giấy tờ. Đây là đòn bẩy chất lượng sàn mạnh nhất |
| G-05 | **Báo cáo nền tảng** | Dashboard tổng quan có; chưa có báo cáo theo tỉnh/hạng shop/thời gian | P2 | M | |
| G-06 | **Impersonate có kiểm soát** | Không có | P2 | M | Support cần để hỗ trợ; **bắt buộc** audit + banner cảnh báo khi đang mượn phiên |

---

## 5. Khoảng trống xuyên suốt (thiết kế & nền tảng)

| # | Khoảng trống | Vì sao quan trọng | Mức | Công |
| --- | --- | --- | --- | --- |
| X-01 | **Dark theme cho portal** | Ops làm ca tối; UI cũ vốn dark. Token đã sẵn kiến trúc | P1 | M |
| X-02 | **Thang màu ngữ nghĩa + màu data-viz** | Đang pha `rgba()` tại chỗ; biểu đồ mượn màu trạng thái gây hiểu nhầm | P1 | S |
| X-03 | **Bảng dữ liệu dùng chung** | Mỗi feature tự dựng bảng + filter; `use-url-filters`/`common/pagination` mới dùng ở 3 slice, 10 hook + 19 service cũ vẫn giữ bản copy | P1 | M |
| X-04 | **Command palette (⌘K)** | 15+ mục menu, nghiệp vụ lặp lại hằng ngày. Đây là thứ khiến Linear nhanh | P2 | M |
| X-05 | **Trạng thái rỗng có dạy việc** | Nhiều màn rỗng chỉ nói "không có dữ liệu" | P1 | S |
| X-06 | **A11y toàn diện** | Đã sửa `TextField` (`useId` + `htmlFor`); chưa rà tổng thể focus/keyboard/contrast | P1 | M |
| X-07 | **PWA / cài lên màn hình chính** | Chủ shop mở app hàng chục lần/ngày | P2 | S |
| X-08 | **Ngân sách hiệu năng** | Chưa có ngưỡng LCP/bundle được theo dõi | P1 | S |
| X-09 | **In ấn ngoài hợp đồng** | Print CSS mới có cho hợp đồng; phiếu thu/biên bản bàn giao cần in | P2 | S |

---

## 6. Nợ trải nghiệm quan sát được trong UI hiện tại

Không phải "thiếu tính năng" — là **cách hiện tại làm sẽ không mở rộng được**:

1. **Hai bản sắc thị giác cùng tồn tại.** Portal cũ (Firebase) là dark, dày, nút màu khối; bản mới là light, thoáng. Người dùng đang chuyển tiếp giữa hai nơi. Phải chốt **một** hệ, và bản mới là hệ đó.
2. **Nút hành động dạng khối màu đặc trong danh sách** (Duyệt xanh / Từ chối đỏ / Gọi / Zalo / Nhắn tin — mỗi hàng 5 khối). Với 50 hàng thì màn hình toàn màu và không còn chỗ nào là quan trọng. Cần: 1 hành động chính + phần còn lại gom vào menu.
3. **Bảng không có thứ bậc thị giác.** Bảng đơn thuê để mọi cột cùng trọng số; mắt không biết bám vào đâu. Cần cột neo (khách + xe), cột số căn phải tabular, trạng thái là chip, meta xuống dòng phụ.
4. **Modal nhiều tab chứa cả một quy trình** (Tạo đơn thuê: Chi tiết / Thanh toán / Dịch vụ / Hình ảnh / Nhật ký). Trên mobile là bất khả dụng. Cần: form một luồng, phần nâng cao mở sau, hoặc trang riêng.
5. **Số tiền không thẳng cột** và trộn nhiều màu (đỏ/xanh/vàng trong cùng một bảng) khiến "còn nợ" và "lỗi" trông giống nhau.
6. **Menu 15+ mục phẳng** trong đó nhiều mục là stub. Menu đang hứa nhiều hơn sản phẩm giao.

---

## 7. Thứ tự đề xuất

### Đợt A — Khép vòng (P0 chặn go-live)
`S-14` SMS thật · `C-12` upload ảnh R2 · `G-03` lý do ẩn xe · `S-04` nhắc việc trong ngày · `X-05` empty state

> Rẻ, phần lớn là `S`, gỡ đúng những chỗ đang chặn.

### Đợt B — Tin cậy của sàn (P0 chuyển đổi)
`C-02` lịch trống trên trang xe · `C-03` bảng giá minh bạch · `C-04` chính sách chuẩn hoá · `C-11`+`G-04` gate chất lượng ảnh/listing

> Đây là đợt làm marketplace thực sự bán được hàng.

### Đợt C — Giữ chân shop (P0 vận hành)
`S-01` khách hàng của shop · `S-02` mobile ops · `S-03` bàn giao có bằng chứng · `X-03` bảng dữ liệu dùng chung

### Đợt D — Tiền và hỗ trợ
~~`C-01` thanh toán online~~ (bỏ — [ADR 0013](../decisions/0013-no-online-payment-mvp.md)) · `G-02` invoice · `G-01`+`C-09` ticket · `S-10` nhắc nợ

### Đợt E — Hoàn thiện
`X-01` dark theme · `S-05`–`S-08` các stub · `X-04` ⌘K · `X-06` a11y · `X-07` PWA

---

## 8. Điều tuyệt đối không được làm khi lấp các khoảng trống

- Không tạo tenant tự động, không gán role shop tự động khi đăng ký user (bài học 04/08).
- Không thêm module ghi vào `public_listings` ngoài `ListingsService` (ADR 0008), hay `vehicle_occupancies` ngoài `OccupancyService` (ADR 0006).
- Không thay ràng buộc DB bằng kiểm tra tầng app cho bất kỳ tính năng lịch nào.
- Không thêm màn hình mới vào nav khi nó còn là stub — trần IA ở `07`.
- Không sửa hàng loạt 10 hook + 19 service cũ trong một diff không liên quan (`completion-roadmap` §5): dời dần khi chạm tới.

Liên quan: `09_PAGE_DESIGN_ORDER.md` (thứ tự thiết kế màn) · `02_PRODUCT_VISION.md` §7 (lộ trình).
