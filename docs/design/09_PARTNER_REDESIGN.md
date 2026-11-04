# 09 — Chuẩn hoá giao diện site partner theo design Partner-XePrime

> Bắt đầu: 02/11/2026
> Trạng thái: **Đang làm** — khung chung (menu ngang + header) xong; các màn ráp dần theo §3.
> File Figma: Partner-XePrime `3ky32n5AZKViYsCfoVrEiZ`.
> Quy trình làm từng màn: skill [`figma-redesign`](../../.claude/skills/figma-redesign/SKILL.md).

Tài liệu này là **sổ cái** của đợt chuẩn hoá. Menu đã được nhóm lại và tính năng đã đổi chỗ, nên
trước khi ráp bất kỳ màn nào phải đọc nó để biết:

- tính năng nào **chuyển VÀO** màn đó (phải có mặt ở đó khi ráp xong);
- tính năng nào **chuyển RA** khỏi màn đó (không dựng lại lần hai);
- quyết định nào **đã chốt** với người dùng (không hỏi lại), quyết định nào **còn mở**.

Ai ráp một màn thì cập nhật §2/§3 trong CÙNG thay đổi với code. Cấu trúc menu chính thức (khối, mục,
route) vẫn nằm ở [`07_INFORMATION_ARCHITECTURE.md`](07_INFORMATION_ARCHITECTURE.md) §3.2–3.3; nguồn
trong code là `apps/web/src/constants/nav.ts` (`SHOP_NAV`, `OWNER_LITE_NAV`).

## 1. Luật làm việc (tóm tắt)

1. **Figma quyết định giao diện**: bố cục, nhóm, thứ tự, khoảng cách, chữ, màu, biểu tượng, nhãn (đọc
   nhãn từ CHỮ trong design, không từ tên layer).
2. **Code và ADR quyết định tính năng**: hành động nào có, ai được làm, dữ liệu nào được hiện. Design
   không bao giờ xoá một tính năng hay ghi đè một ADR.
3. Mỗi màn, trước khi code: kiểm kê tính năng hiện có ↔ design, chia bốn nhóm: ✅ có cả hai · 🟡 code có,
   design không có · 🆕 design có, code chưa có · ⚠️ design trái ADR. Hỏi người dùng MỘT lượt cho mọi
   dòng 🟡/🆕/⚠️, kèm đề xuất. **Không code khi còn dòng chưa chốt.**
4. Trạng thái design thường không vẽ (đang tải, rỗng, lỗi, không có quyền, chỉ-xem khi hết gói, khác
   biệt hai tuyến, màn hẹp) thì tự dựng theo phong cách design và liệt kê trong báo cáo.
5. Route cũ không bao giờ chết: tính năng dời chỗ thì để redirect hoặc tab.
6. Site quản trị (`admin.xeprime.vn`) và app mobile giữ khung cũ cho tới khi có design riêng.

Chi tiết từng bước: skill `figma-redesign`.

## 2. Bản đồ menu cũ → mới (chốt 02/11/2026)

Design: Header `23649:27690` (biến thể Default) · `23661:22492` (Details, có breadcrumb) · SubMenu
`23661:27362` · trạng thái mục `23649:11528`.

### 2.1 Gian hàng tuyến gói (Full Manage)

| Tính năng · route | Menu cũ (sidebar) | Bây giờ | Lối vào hiện tại | Còn phải làm |
| --- | --- | --- | --- | --- |
| Tổng quan · `/` | Tổng quan | **Tổng quan** (liên kết thẳng) | menu | — |
| Lịch thuê · `/calendar` | Quản lý › Lịch thuê | **Vận hành › Lịch thuê xe** | menu | — |
| Yêu cầu đặt xe · `/booking-requests` | Quản lý › Đơn thuê › Yêu cầu đặt xe | **Vận hành › Yêu cầu đặt xe** (huy hiệu số chờ duyệt) | menu | — (ráp xong 02/11, §3.1) |
| Tất cả đơn thuê · `/bookings` | Quản lý › Đơn thuê › Tất cả đơn thuê | **Vận hành › Quản lý đơn thuê xe** | menu | Danh sách xong (02/11). Còn trang chi tiết `/bookings/[id]` — chờ design |
| Chờ giao xe · `/bookings/awaiting-pickup` | Quản lý › Đơn thuê › Chờ giao xe | **Ngăn "Chờ giao xe"** ở cột trái của "Quản lý đơn thuê xe" (`/bookings?preset=awaiting_pickup`); route cũ chuyển tiếp (cả trong phiên hỗ trợ); mục ẩn đã gỡ (02/11) | cột trái màn đơn; thẻ Tổng quan | — |
| Khách hàng · `/customers` | Quản lý › Khách hàng | **Vận hành › Danh sách khách hàng** | menu | — |
| Danh sách xe · `/vehicles` | Quản lý › Xe của tôi › Danh sách xe | **Xe & Tài xế › Danh sách xe** (huy hiệu số xe có việc chặn) | menu | Danh sách xong (03/11, §3.5). Chi tiết `/vehicles/[id]` và Chỉnh sửa `/vehicles/[id]/edit` xong (03/11, §3.6) — cả hai tuyến |
| Đăng nhanh xe tự lái (gian hàng) · `/vehicles/register?from=manage` | Menu phụ cạnh nút thêm xe ở Danh sách xe | **Gỡ khỏi Danh sách xe** (chốt 03/11) — màn chỉ còn "Thêm xe mới" → wizard đầy đủ. Route vẫn sống (chủ xe tuyến hoa hồng dùng `?from=account`) | URL | — |
| Tài xế · `/drivers` | Cấu hình › Tài xế | **Xe & Tài xế › Quản lý tài xế** | menu | — (ráp xong 04/11, §3.7) |
| Bảo dưỡng · `/maintenance` | Quản lý › Xe của tôi › Bảo dưỡng | **Xe & Tài xế › Bảo dưỡng** | menu | — (ráp xong 04/11, §3.8) |
| Doanh thu · `/finance` | Kinh doanh › Tài chính › Tổng quan doanh thu | **Doanh thu › Tổng quan doanh thu** | menu | — |
| Số dư & rút tiền · `/balance` (chỉ CHỦ) | Kinh doanh › Tài chính › Số dư & rút tiền | **Doanh thu › Quản lý ví** | menu | — |
| Thu chi · `/receipts` | Kinh doanh › Tài chính › Giao dịch thu chi | **Doanh thu › Lịch sử giao dịch** | menu | — |
| Công nợ · `/debts` | Kinh doanh › Tài chính › Công nợ | Mục **ẨN** của khối Doanh thu; sẽ nằm TRONG một màn Doanh thu theo design mới | thẻ "Công nợ" trên Tổng quan doanh thu; URL; breadcrumb | Chờ design. Khi ráp: đặt đúng chỗ design, gỡ mục ẩn |
| Trò chuyện · `/chat` | Kinh doanh › Trò chuyện | **Icon tin nhắn** ở header (popup + "xem tất cả"; số tin chưa đọc trên icon) | header | — |
| Cửa hàng · `/shop` | Gian hàng › Cửa hàng | **Cấu hình › Thông tin cửa hàng** | menu | — |
| Chi nhánh · `/shop/branches` | Cấu hình › Chi nhánh | **Section "Chi nhánh"** trong Thông tin cửa hàng (`/shop?section=branches`); route cũ chuyển tiếp | section của trang Cửa hàng | Khi ráp màn Thông tin cửa hàng: bảng chi nhánh đang hẹp trong cột trang (phải cuộn ngang mới thấy Số xe/Trạng thái) |
| Chính sách thuê · `/shop/policies` | Cấu hình › Chính sách thuê | **Cấu hình › Chính sách thuê** | menu | — |
| Thành viên · `/members` | Cấu hình › Người dùng & phân quyền | **Cấu hình › Nhân viên & Phân quyền** | menu | — |
| Trung tâm hỗ trợ · `/support` | Hỗ trợ › Trung tâm hỗ trợ | **Trợ giúp › Trung tâm hỗ trợ** | menu | — |
| Hỗ trợ & khiếu nại · `/support/cases` | Hỗ trợ › Yêu cầu hỗ trợ | **Trợ giúp › Yêu cầu hỗ trợ** (Trợ giúp thành dropdown 2 dòng — lệch design, đã chốt) | menu | — |
| Tài khoản & bảo mật · `/account` | menu tài khoản ở thẻ người dùng | **Icon bánh răng** ở header + menu hồ sơ | header | — |
| Cài đặt gian hàng · `/shop` | menu tài khoản | menu hồ sơ (giữ nguyên) | header | — |
| Đổi ngôn ngữ | menu tài khoản ở topbar | menu hồ sơ | header | — |
| Đăng xuất | menu tài khoản | menu hồ sơ | header | — |
| Thông báo | chuông ở topbar | **Icon chuông** ở header | header | — |

"Mục ẨN" = `NavLeaf.hidden` trong `constants/nav.ts`: trang vẫn thuộc khối (breadcrumb ra đúng khối,
băng "gói hết hạn" vẫn tra được cờ gói, lọc quyền vẫn chạy) nhưng không vẽ thành dòng menu. Đây là
trạng thái **tạm**, mỗi mục ẩn phải được gỡ khi màn đích của nó ráp xong.

### 2.2 Chủ xe tuyến hoa hồng (Owner Lite)

Design chưa vẽ riêng. Đã chốt: **cùng header, cùng sáu khối**, mỗi khối ít dòng hơn. Khối không còn
dòng nào với người đang xem (vd. Doanh thu với thành viên không phải chủ) thì vắng hẳn.

| Khối | Dòng | Route |
| --- | --- | --- |
| Tổng quan | (liên kết thẳng) | `/` |
| Vận hành | Lịch thuê xe · Chuyến cho thuê (chỉ CHỦ; thành viên thấy Yêu cầu đặt xe + Quản lý đơn thuê xe) | `/calendar`, `/trips` (`/booking-requests`, `/bookings`) |
| Xe & Tài xế | Danh sách xe · Quản lý tài xế | `/vehicles`, `/drivers` |
| Doanh thu | Quản lý ví (chỉ CHỦ) | `/balance` |
| Cấu hình | Hồ sơ chủ xe (chỉ CHỦ — gộp hồ sơ, trang chủ xe, khai thuế, gói) | `/account` |
| Trợ giúp | Cẩm nang cho thuê xe · Hợp đồng & Chứng từ · Chính sách bảo vệ dữ liệu · Yêu cầu hỗ trợ | `/host-guide`, `/contracts-documents`, `/data-protection`, `/support/cases` |

Tin nhắn là icon ở header như tuyến gói.

Danh sách xe của tuyến này dùng CHUNG màn với gian hàng từ 03/11/2026 (§3.5). Hai thẻ dẫn đường
"Cẩm nang cho thuê xe" / "Hợp đồng & chứng từ mẫu" đầu màn đã gỡ — cả hai là dòng của khối Trợ giúp.

### 2.3 Header — các quyết định đã chốt

| Phần | Quyết định |
| --- | --- |
| Icon bánh răng | Mở **Tài khoản & bảo mật** của NGƯỜI đăng nhập (`/account`; chủ xe tuyến hoa hồng: "Hồ sơ chủ xe"). "Cấu hình" trên menu là cài đặt của CỬA HÀNG. Điện thoại: ẩn icon, vào qua menu hồ sơ |
| Khối hồ sơ | Bố cục design (ảnh tròn + chấm trực tuyến · tên người · mũi tên), nhưng **dòng 2 là "Gian hàng · Vai"** thay cho email: không lộ liên hệ khi chia sẻ màn hình, và đăng nhập site partner là SĐT. Chủ xe cá nhân chỉ hiện vai |
| Menu hồ sơ | `useAccountMenuItems` — một bộ cho header, drawer mobile và topbar site quản trị: danh tính · Tài khoản & bảo mật · Cài đặt gian hàng (tuyến gói) · Ngôn ngữ · Đăng xuất |
| Số đếm trên menu | **Chỉ số "cần xử lý"** — việc ĐẾN HẠN, không phải thống kê (chốt lại 04/11, thay bản 02/11): **Yêu cầu đặt xe** = chờ duyệt, đỏ khi có yêu cầu sắp hết hạn trả lời (`GET /dashboard/requests`, `pendingUrgent`) · **Quản lý đơn thuê xe** = lượt giao + trả hẹn tới hết hôm nay, gồm cả lượt quá giờ, mỗi đơn một lần (`pickupsDue + returnsDue` của `GET /dashboard/today`), đỏ khi có lượt quá giờ — KHÔNG còn đếm mọi đơn chờ giao / đang thuê · **Lịch thuê xe** của gian hàng KHÔNG mang số (trùng với Đơn ⇒ khối "Vận hành" đếm đôi); chủ xe tuyến hoa hồng không có bảng đơn nên số giao/trả đến hạn gắn ở Lịch xe · **Danh sách xe** = số XE có ít nhất một việc chặn: giấy tờ quá hạn, quá hạn bảo dưỡng, bị trả về/từ chối/ẩn khi đăng chợ, thiếu KM trả (chốt 03/11; `VEHICLE_ALERT_NEEDS_ACTION_KINDS`, nguồn `GET /vehicles/needs-action-count` — cùng phép tính với chip trên thẻ xe). Tài xế, Bảo dưỡng **chưa làm** — cần định nghĩa "cần xử lý" trước. Không đếm tổng xe/tài xế |
| Số trên mục cấp 1 | Khi dropdown ĐÓNG, tổng số "cần xử lý" của khối hiện cạnh nhãn khối (khuôn `_Badge` của design) — để yêu cầu đang chờ không bị khuất. Màu CẢNH BÁO thay xám của design (04/11, người dùng chốt): cam = chờ xử lý, đỏ = có mục trễ / sắp trễ; tên truy cập được nói thêm "có việc gấp" để màu không là tín hiệu duy nhất. Áp chung cho huy hiệu sidebar/drawer/tab bar (`NavBadge`) |
| Breadcrumb | Dải dưới header (biến thể Details) chỉ ở **trang con** của một mục (`/vehicles/:id`…) và ở **trang của mục ẩn**: biểu tượng khối › mục menu › `<h1>` của trang |
| Màn hẹp | ≤1536: ẩn chữ khối hồ sơ · ≤1366: bỏ dấu +/− · ≤1280: bỏ biểu tượng mục cấp 1 · ≤1024: menu ngang nhường cho nút mở drawer + thanh tab dưới đáy (cùng cây menu) |
| Mục cấp 1 đang chứa trang hiện tại | Design không tô (biến thể Details để "Vận hành" ở trạng thái thường) — làm theo design; vị trí trang nói bằng dòng sáng trong dropdown và breadcrumb |

## 3. Sổ theo màn

Mỗi màn: route · node design · trạng thái · tính năng phải có mặt khi xong. Thêm dòng khi nhận design.

| Màn | Route | Design | Trạng thái | Phải có khi xong / ghi chú |
| --- | --- | --- | --- | --- |
| Khung chung: header, menu, breadcrumb | — | `23649:27690`, `23661:22492`, `23661:27362`, `23649:11528` | **Xong** 02/11/2026 | Xem §2 |
| Yêu cầu đặt xe | `/booking-requests` | Request `23649:25560` (cập nhật 02/11: chip dịch vụ, đồng hồ, nút Từ chối) | **Xong** 02/11/2026 | Xem §3.1 |
| Quản lý đơn thuê xe | `/bookings` (+ `/bookings/awaiting-pickup`) | All Request `23790:45293` (ô "Tất cả", nhóm theo trạng thái) · All Request - Done `23797:49689` (một trạng thái, phân trang). Chi tiết đơn: section `23777:53056` | **Xong** 02/11/2026 (danh sách + chi tiết) | Xem §3.2, §3.3 |
| Một màn Doanh thu (chưa rõ màn nào) | `/finance` hoặc `/receipts` | chờ design | Chưa làm | Nhận **Công nợ** (`/debts`); gỡ mục ẩn `debts`; giữ thao tác thu nợ |
| Khách hàng | `/customers`, `/customers/[id]` | section `23777:54974` (5 frame) | **Xong** 02/11/2026 | Xem §3.4 |
| Danh sách xe | `/vehicles` (cả hai tuyến) | section `23672:25620`: ít xe `23655:38521` · lưới `23649:29724` · danh sách `23655:36959` | **Xong** 03/11/2026 (danh sách) | Xem §3.5 |
| Chi tiết xe | `/vehicles/[id]` (cả hai tuyến, cả modal hồ sơ xe) | section `23672:25621` | **Xong** 03/11/2026 | Xem §3.6 |
| Chỉnh sửa xe | `/vehicles/[id]/edit` (cả hai tuyến; `/vehicles/[id]/manage/<mục>` cũ chuyển hướng) | section `23731:37932` (13 frame) | **Xong** 03/11/2026 | Xem §3.6 |
| Quản lý tài xế | `/drivers` (cả hai tuyến, cả phiên hỗ trợ) | `23737:45750` (3 frame) | **Xong** 04/11/2026 | Xem §3.7 |
| Danh sách bảo dưỡng | `/maintenance` (cả phiên hỗ trợ) | `23733:41941` | **Xong** 04/11/2026 | Xem §3.8 |
| Thông tin cửa hàng | `/shop` | chờ design | Chưa làm | Đã nhận section **Chi nhánh** (02/11). Giữ mọi section: hiển thị · chủ gian hàng · địa chỉ & pháp lý · khai thuế · chi nhánh · gói & hạn mức |

### 3.1 Yêu cầu đặt xe — kiểm kê và quyết định (02/11/2026)

Code: `features/booking-requests/components/BookingRequestsView` + `BookingRequestCard` (sửa tại chỗ,
không dựng thẻ thứ hai). Hộp duyệt/duyệt dài hạn/từ chối/huỷ, popup chi tiết yêu cầu, popup chi tiết
đơn, hồ sơ xe/khách dạng overlay: giữ nguyên.

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| 1 | Ba tab Cần xử lý · Chờ khách thanh toán · Đã kết thúc (nhãn cũ "Đã đóng") + số đếm | ✅ | Theo design (dạng nút gộp) |
| 2 | Tìm kiếm · lọc chi nhánh · lọc dịch vụ · phân trang | ✅ | Theo design; phân trang giữ |
| 3 | Dải đầu thẻ: mã · chip dịch vụ · Gửi lúc · Đã xử lý lúc | ✅ | Mã `#DH…` chỉ khi yêu cầu đã thành ĐƠN — yêu cầu không có mã riêng |
| 4 | Đồng hồ hạn phản hồi ("Chờ xác nhận: mm:ss") | ✅ | Dải đầu thẻ (design cập nhật 02/11). Trạng thái khác: nhãn trạng thái ở cùng chỗ |
| 5 | Nút **Từ chối** · nút **Huỷ chuyến** (`awaiting_hold`) | ✅ | Nút viền cạnh "Xác nhận yêu cầu"; Huỷ chuyến cùng chỗ khi đang chờ khách trả, kèm hạn thanh toán |
| 6 | Quá hạn phản hồi: không còn nút, câu giải thích | 🟡 | Câu giải thích đứng ở chỗ hai nút |
| 7 | Thông tin phụ: ghi chú khách, địa chỉ giao + câu phí giao, lộ trình/điểm đón/điểm đến (có tài xế), cảnh báo khách rủi ro, lý do từ chối, SĐT tài khoản khác SĐT liên hệ, email, "chưa có hồ sơ khách" | 🟡 | Dải cuối thẻ, chỉ hiện khi có dữ liệu (chốt 02/11) |
| 8 | SĐT · Gọi · Zalo · Nhắn tin | ⚠️→✅ | Theo DỮ LIỆU server: tuyến hoa hồng chưa có đơn thì server không trả SĐT/`chatOpen` ⇒ nút vắng hẳn (ADR 0056 · 0073). Phiên hỗ trợ không nhắn tin (ADR 0050) |
| 9 | "Đã giữ chỗ" ở Chi tiết thanh toán | ⚠️ | Đổi nhãn theo chặng: chưa đủ tiền ⇒ "Tiền giữ chỗ (dự kiến)"; tiền về đủ ⇒ "Đã giữ chỗ" (ADR 0044) |
| 10 | Nhãn "Tạm tính" của báo giá ước lượng · dài hạn chưa chốt lịch (gói + nguyện vọng) | 🟡 | Giữ trong ô Yêu cầu thuê / Chi tiết thanh toán |
| 11 | Thông số xe "4 chỗ · Số tự động · Điện" | 🆕 | Backend bổ sung trường thông số vào DTO yêu cầu; dòng chữ qua `useListingSpecSummary` |
| 12 | Kanban (`23746:51015`) | — | Frame chốt không còn nút chuyển ⇒ không làm |
| 13 | Đường sang đơn đã tạo · "Xem chi tiết đơn" | ✅ | Đã có đơn ⇒ mở chi tiết ĐƠN; chưa có ⇒ chi tiết YÊU CẦU |
| 14 | Popup "Chi tiết yêu cầu thuê xe" (`23807:65661`) | ✅ | Ráp 02/11: hai cột theo design, GIỮ lịch, lộ trình, SĐT tài khoản, Zalo, email, rủi ro, ghi chú, lý do từ chối, dấu vết, Huỷ chuyến |
| 15 | Nút "Chỉnh sửa" khách trong popup | ⚠️ | Thành "Xem hồ sơ" (mở sổ khách) — danh tính người đặt không sửa được (ADR 0060), chốt 02/11 |
| 16 | Viên "Khách quen" | 🆕 | ≥ 1 chuyến HOÀN THÀNH ở chính gian hàng (`customerIsRegular`), hiện ở popup và thẻ — chốt 02/11 |
| 17 | "Phí giao nhận", "Đã thu", "Đặt cọc tài sản", "Còn lại (phải thu)" ở popup | 🟡 | Chưa có trên dữ liệu YÊU CẦU (là số của đơn) — popup hiện bộ dòng tiền của thẻ, dòng cuối tô vàng như design. Ráp lại khi làm trang chi tiết đơn |

### 3.2 Quản lý đơn thuê xe — kiểm kê và quyết định (02/11/2026)

Code: `features/bookings/components/BookingsListView` (+ `BookingTable` → thẻ). Trang chi tiết
`/bookings/[id]` CHƯA ráp (chờ design "Details - Waiting/Current").

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| 1 | Cột trái: Tất cả · CẦN XỬ LÝ (Chờ giao xe · Đang thuê) · ĐÃ KẾT THÚC (Hoàn thành · Đã huỷ) + số đếm | 🆕 | Là bộ lọc trạng thái trên URL; backend trả số đếm theo nhóm. "Chờ giao xe" = nhóm việc `awaiting_pickup` cũ |
| 2 | `/bookings/awaiting-pickup` | — | Chuyển tiếp sang mục Chờ giao xe; gỡ mục ẩn `bookings-awaiting-pickup` |
| 3 | Ô "Tất cả": nhóm theo trạng thái, "3 chuyến gần nhất" | 🆕 | Mỗi nhóm vài chuyến + link sang mục ở cột trái; phân trang chỉ ở chế độ một trạng thái |
| 4 | Ô lọc "Trạng thái" | — | Bỏ (trùng cột trái) — chốt 02/11 |
| 5 | Khách không đến (`no_show`) | 🟡 | Trong nhóm "Đã huỷ", nhãn "Khách không đến" — chốt 02/11 |
| 6 | Tìm kiếm · chi nhánh · dịch vụ · sắp xếp · phân trang · nút Tạo đơn thuê · `?create=1` từ hồ sơ khách | ✅ | Giữ |
| 7 | "Xử lý giao xe" (Chờ giao) · "Xem chi tiết" | ✅ | Mở trang chi tiết |
| 8 | "Nhận xe" (Đang thuê) | ✅ | Mở trang chi tiết ở bước bàn giao trả xe — không dựng luồng thứ hai |
| 9 | Thanh tiến độ "Đã đi 60% · còn 1 giờ" · "Giao xe hôm nay · 17:00" · "Đã trả xe đúng hạn" · "Khách đã huỷ / Đã quá giờ giao xe" | 🆕 | Backend bổ sung giờ trả thực tế + lý do huỷ |
| 10 | Ảnh xe, thông số, ảnh khách · Nhắn tin/Gọi/Zalo | 🆕 | Backend bổ sung; liên hệ theo dữ liệu server |
| 11 | Tổng tiền + đã thu/còn nợ · tài xế đã gán · nơi giao + tiến độ chuẩn bị bàn giao | 🟡 | **Chỉ trong trang chi tiết** — chốt 02/11. Khi ráp trang chi tiết phải kiểm đủ ba thứ này ở đó |
| 12 | "Gia hạn" trên thẻ dài hạn đang thuê + hộp "Gia hạn thuê xe" + "Thanh toán" (`23807:68543`, `23807:70054`) | ✅ | **Đã dựng 02/11 theo ADR 0077 (Accepted)**: `ExtendBookingDialog` mở từ thẻ (cần `bookings.update`, ẩn trong phiên hỗ trợ) và từ khối "Phụ lục gia hạn" ở trang chi tiết. Lệch design có chủ đích: chỉ +1/2/3/6/9/12 tháng (không +7/+15 ngày); hộp phí tách "chuyển qua XePrime" / "trả thẳng chủ xe" / thuế / phần về Ví điểm + "Miễn phí nền tảng"; màn Thanh toán chỉ có VietQR (không "Ví điện tử" — ADR 0058 chưa mở), nút trái "Huỷ gia hạn", nút phải "Xong" — **không** có "Xác nhận/khách đã chuyển": phụ lục tự lật khi SePay đối soát đủ. Thẻ giữ CẢ "Gia hạn" lẫn "Nhận xe" (design đổi chỗ — nhận xe về vẫn là việc thường ngày). Khách thấy QR ở trang chuyến đang thuê (`TripExtensionPanel`). Chỉ đơn đặt qua chợ (có tài khoản khách) — đơn tự lập ngoài chợ sửa lịch như cũ |
| 13 | Chip "Thuê xe dài hạn" màu hồng | ✅ | Token `--xp-color-pink*` (02/11) |
| 14 | Popup "Tạo đơn thuê → Chọn xe" (`23754:22405`) | 🆕 | Chờ đủ các bước của luồng tạo đơn rồi ráp một lượt (chốt 02/11) |

Tự dựng thêm (design không vẽ): ngăn rỗng / lỗi tải từng nhóm / lỗi cả màn; đơn quá giờ trả (thanh đỏ,
"Quá giờ trả xe …"); trả trễ ("Trả xe trễ hạn"); chờ giao chưa tới ngày ("Giao xe dd/mm · hh:mm");
điện thoại (cột trái thành hàng cuộn ngang, nút cao 44px). "Xử lý giao xe"/"Nhận xe" mở trang chi tiết
đơn; hộp "Sẵn sàng giao/nhận xe" CHỈ mở khi bấm nút xác nhận trên trang (03/11 — bỏ lời mời
`?handover=` mở sẵn hộp; tham số đó trên link cũ giờ bị bỏ qua). Link cũ
`/bookings?status=…` được quy về ngăn tương ứng. `BookingTable` (bảng cũ) đã gỡ.

### 3.3 Chi tiết đơn thuê — kiểm kê và quyết định (02/11/2026)

Design: Waiting `23768:29928` · Waiting/Driver `23807:73143` · hộp "Thông tin khách hàng" `23777:49485` ·
hộp "Thu tiền đơn" `23777:52010` · Current `23777:48710` · Done `23777:52626`.

Chốt với người dùng: **giữ toàn bộ tính năng, sắp xếp hợp lý; chỗ design chưa vẽ thì tự dựng trong
ngôn ngữ design.**

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Header: mã + chip trạng thái + "Tạo lúc"; "Xem hợp đồng" · "Lịch sử thu tiền" · "Thu tiền" | ✅ | Chưa có hợp đồng ⇒ nút "Tạo hợp đồng" (đường cũ). "Thu tiền" giữ cổng gói (ADR 0028 7A) |
| 2 | Stepper Đã xác nhận → Chờ giao → Đang thuê → Hoàn thành | 🆕 | Đơn huỷ / khách không đến: bước cuối đỏ "Đã huỷ"/"Khách không đến" + banner lý do (tự dựng) |
| 3 | "Chuẩn bị bàn giao" x/N | 🆕 | SERVER suy từ dữ liệu có sẵn, không bảng mới: giấy tờ (CCCD/GPLX đã đối chiếu, hoặc GPLX tài khoản đã xác thực) · thu tiền thuê (còn phải thu = 0) · cọc (đã ghi nhận) · hợp đồng (đã tạo) · ảnh (biên bản giao nháp đủ 5 ảnh) · tài xế (đơn có tài, đã nhận). Tuyến hoa hồng ẩn 2 dòng tiền. Chỉ hiện trước khi giao xe. **03/11 — tự động + tay:** giấy tờ · hợp đồng · ảnh · tài xế đánh dấu tay được bằng vòng tròn của dòng (bảng `booking_handover_checks`, `PUT /bookings/:id/handover-prep`, quyền `handovers.manage`, audit `booking.prep_check/uncheck`, ghi "Đánh dấu tay · ai · lúc nào"); hai dòng TIỀN không đánh dấu tay — "Xác nhận đã thu" ghi phiếu thu thật (dòng cọc có nút thu cọc riêng). Sửa suy tự động: giấy tờ phải còn hạn tới ngày cuối chuyến; cọc xong khi thu ĐỦ; ảnh chỉ đếm 5 ô chuẩn; tiền thuê = công nợ − `D` (phần chủ xe đã có trong tiền giữ chỗ online) |
| 4 | "Chuyến đi & thời gian thuê" + tiến độ + câu tình trạng | ✅ | Dùng `rentalProgress` như thẻ danh sách |
| 5 | "Phát sinh": chi phí phát sinh + "Ghi nhận phát sinh" · cọc theo đơn · cọc đã nhận + "Xác nhận đã thu cọc" | ✅ | = `SettlementCard` dựng lại; danh sách phụ phí, KM vượt, đề xuất/đánh dấu hoàn cọc, sửa hoàn cọc ở cùng thẻ |
| 6 | "Thông tin bàn giao" tab Trước giao / Sau nhận, 5 ô ảnh | ✅ | Slot ảnh đã khớp `HANDOVER_PHOTO_SLOT`; tải ảnh = bổ sung biên bản (nháp hoặc đã xác nhận) |
| 7 | "Lợi nhuận chuyến" | ✅ | = `OwnerPayoutTable` |
| 8 | Cột phải: thẻ xe (hình thức, nhận xe, trả xe) · Tài xế · Khách hàng (+ Khách quen) · Thanh toán · Huỷ đơn · Khách không đến · CTA bàn giao | ✅ | Lộ trình/điểm đến (có tài) + ghi chú đơn + link "Xem xe" đặt ở thẻ xe; dòng giảm giá/phụ phí/thu khác/thu vượt/còn nợ chỉ hiện khi khác 0 |
| 9 | "Chỉnh sửa" khách → hộp Tên · SĐT · Tiền cọc · Ghi chú | ✅ | = form Sửa đơn sẵn có (đúng 4 trường) |
| 10 | Hộp "Thu tiền đơn" | ✅ | = `RecordPaymentModal` |
| 11 | Banner hoàn thành "Số tiền … đã cộng vào ví điểm" | 🆕 | Chỉ khi đơn có `ownerPayableAmount > 0` |
| 12 | Bảo hiểm chuyến · Phụ lục gia hạn · Bổ sung ảnh sau bàn giao · Lịch sử tiền | 🟡 | Giữ — thẻ dưới "Lợi nhuận chuyến" / tab ảnh / nút header |

**Cập nhật design 03/11/2026** — Waiting `23845:49956` · cảnh báo thiếu `23845:51599` · popup "Sẵn sàng giao xe" `23845:53852` (modal `23845:54382`):

| # | Hạng mục | Loại | Quyết định |
| --- | --- | --- | --- |
| 13 | Stepper có mốc giờ dưới mỗi bước | 🆕 | API thêm `confirmedAt` (lượt nhận yêu cầu / lúc lập đơn) + `holdPaidAt`. ⚠️ Design ghi "Đã nhận cọc lúc…" ⇒ dựng "Đã nhận tiền giữ chỗ lúc…" (ADR 0044 điều 9: khoản QR không phải cọc). Bước 3/4: "Cần giao/Đã giao lúc", "Khách trả/Đã nhận lại lúc". Stepper vào cột chính |
| 14 | Chuẩn bị bàn giao 2 cột; Chuyến đi \| Phát sinh cạnh nhau; ảnh bàn giao 1 hàng có ảnh thu nhỏ, tab ở đầu khối | ✅ | `SettlementCard` gọn thành "Phát sinh" (link "Ghi nhận phát sinh" · "Xác nhận đã thu cọc"), giữ danh sách phát sinh, vượt km, hoàn cọc khi có dữ liệu; `HandoverPhotoGrid variant="row"` + URL ký tự làm mới; nhãn góc theo design (Mặt trước/Mặt sau/Bên trái/Bên phải) |
| 15 | Bấm "Xác nhận đã giao/nhận xe" khi còn thiếu → toast "Có thông tin chưa bổ sung" + "Vẫn tiếp tục", nháy viền đỏ chỗ thiếu | 🆕 | Một nguồn đếm thiếu `handover-readiness.ts` (checklist + góc ảnh trống). Giao: việc chưa xong + góc ảnh trước giao; nhận: góc ảnh sau nhận. Không chặn — "Vẫn tiếp tục" mở popup. Popup chỉ mở qua nút xác nhận, vào trang (kể cả từ thẻ danh sách) không mở sẵn |
| 16 | Popup "Sẵn sàng giao xe" thay hộp xác nhận cũ | 🟡 | Chốt 03/11: khung design + ô **Odo** (tuỳ chọn) + vùng "Thêm thông tin" thu gọn (giờ thực tế, tình trạng, ghi chú, link phát sinh khi nhận). Ảnh bỏ khỏi popup (đã chụp trên trang). Nhận xe dùng cùng khuôn "Sẵn sàng nhận lại xe" |
| 17 | "Lợi nhuận chuyến" thêm dòng "XePrime hoàn về ví (C)" | ⚠️ | Chốt 03/11: GIỮ bảng hiện tại (A − B = số cộng ví, ADR 0068) — số mẫu của design tự mâu thuẫn; báo designer |
| 18 | Nhãn "Khách quen" trên thẻ khách | 🆕 | API `customerCompletedRentals`; cùng ngưỡng `TENANT_CUSTOMER_RETURNING_MIN_RENTALS` của sổ khách |

### 3.4 Khách hàng — kiểm kê và quyết định (02/11/2026)

Design: Users List `23777:53057` · Details Overview `23777:54975` · History `23797:54015` · Revenue
`23797:55706` · Docs `23797:62633`.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | 6 ô số liệu danh sách | 🆕 | API tổng mới (khách, lượt thuê, doanh thu, nợ · số khách nợ, khách quen, cần lưu ý/từ chối); tiền ẩn khi thiếu `finance.view` |
| 2 | Bảng: STT · khách (avatar, dòng phụ) · số lần thuê + "n đơn đang chạy" · còn nợ · lần thuê cuối · trạng thái · "Xem hồ sơ" · chọn số dòng | ✅ | Dòng phụ là **SĐT** (email nếu có) — chốt 02/11. Trạng thái là nhãn suy: Từ chối phục vụ > Cần lưu ý > Đã lưu trữ > Còn nợ > Khách quen > Chưa phân loại |
| 3 | Nút "Thêm khách hàng" | — | **Bỏ** — chốt 02/11: khách vào sổ tự động khi đặt xe / lập đơn. Form chỉ còn để SỬA |
| 4 | Chi tiết: header + "Sửa hồ sơ" + "Tạo đơn thuê"; 7 ô số liệu; 4 tab | ✅ | Rủi ro + Lưu trữ/Khôi phục vào menu "…" cạnh "Sửa hồ sơ" |
| 5 | Tổng quan: banner còn nợ + Thu tiền · Đơn thuê hiện tại · Tiến trình đơn thuê · Ghi chú vận hành | 🆕 | Làm đợt này. Tab "Ghi chú" cũ thành thẻ "Ghi chú vận hành" |
| 6 | Lịch sử thuê: tìm · trạng thái · thời gian + xem nhanh đơn dưới bảng | 🆕 | Bộ lọc ở server |
| 7 | Thu chi: biểu đồ doanh thu Tuần/Tháng/Quý/Năm · khoản phải thu · bảng chi tiết phải thu · "Xem sổ Thu/Chi" | 🆕 | API tổng hợp mới; danh sách phiếu thu cũ giữ dưới |
| 8 | Giấy tờ: thẻ theo loại (CCCD, GPLX, Hộ chiếu, Khác) · Chủ thẻ · Số · Thời hạn · Trạng thái · Xoá / Xác nhận đối chiếu / Thay / Tải lên | 🆕 | Migration thêm "chủ thẻ" + "số giấy tờ". 03/11: tải lên là MỘT cú bấm — bấm/kéo ảnh vào ô ảnh của thẻ (AntD `Upload.Dragger`) là tải ngay đúng loại, không hộp nhập thông tin; chủ thẻ/số/hạn điền sau qua "Sửa thông tin"; "Thay" mang theo chủ thẻ + số, bỏ thời hạn |

### 3.5 Danh sách xe — kiểm kê và quyết định (03/11/2026)

Code: `features/vehicles/components/VehiclesListView` — MỘT màn cho hai tuyến (`scope="shop"` qua
`ManageVehiclesPage`, `scope="owner"` qua `AccountVehiclesView`; cả hai là vỏ mỏng để route và phiên
hỗ trợ giữ nguyên import). Thẻ: `VehicleManagementCard` (lưới) · `VehicleWideCard` (`stacked` = ít
xe, `row` = danh sách) · mảnh chung `VehicleCardParts` · hàng mobile `VehicleListRow`.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề + dòng phụ · nút "Thêm xe mới" | ✅ | Theo design. Gian hàng → wizard `/vehicles/new`; chủ xe tuyến hoa hồng → luồng đăng xe `?from=account` (vắng trong phiên hỗ trợ — luồng tạo-và-gửi-duyệt không mở cho phiên, ADR 0050 §13). Màn rỗng giữ nút "Thêm xe đầu tiên" |
| 2 | Bộ lọc: tìm · chi nhánh · loại xe · dịch vụ · vận hành · trạng thái · "Sắp xếp: …" | ✅ | Ô cao 40 (hình thái mặc định `FilterBar`, như màn Đơn thuê). Tuyến hoa hồng: tìm + dịch vụ + vận hành (chốt 03/11). Giữ chip "đang lọc" gỡ được. ≤1500px: ô thứ 5 vào nút "Bộ lọc" (`inlineFieldLimit`) để không tràn dòng |
| 3 | Hai kiểu ít / nhiều xe | 🆕 | **Dưới 3 xe** (`VEHICLE_LIST_FEW_THRESHOLD`) = thẻ ngang to 2 thẻ/hàng. Đếm TỔNG xe của chi nhánh đang chọn (`fleet-summary`), KHÔNG theo ô lọc khác — gõ tìm kiếm không làm bố cục nhảy (chốt 03/11). Chưa có tổng ⇒ khung chờ; đếm hỏng ⇒ suy từ trang khi không lọc, đang lọc thì giữ bố cục đông |
| 4 | Frame hàng ngang `23655:36959` | 🆕 | Chế độ **"Danh sách"** cho đội xe từ 3 xe: nút chuyển Lưới/Danh sách cạnh ô sắp xếp, `?view=list` trên URL, đổi kiểu không về trang 1 (chốt 03/11). Thẻ ít xe không có nút chuyển |
| 5 | Nhãn kiểm duyệt có biểu tượng ("Đã kiểm duyệt"), viên vận hành nhãn dài ("Sẵn sàng vận hành") ở thẻ ít xe; viên gọn ("Sẵn sàng" · "Chờ duyệt") phủ ảnh ở lưới, dưới danh tính ở danh sách | ✅ | Nhãn riêng của thẻ (`Vehicles.list.review*`, `operation.*`) — nhãn `Domain` dùng chung (admin, mobile) giữ nguyên |
| 6 | Chip việc cần làm · lý do bị trả về · chip "Chủ xe tạm ẩn" | 🟡 | **Giữ** (chốt 03/11) — chỉ hiện khi có; nằm trên hàng trạng thái |
| 7 | Dòng "Ô tô · Tự lái · Có tài xế" ở thẻ lưới | 🟡 | **Giữ** (chốt 03/11) — design lưới chỉ vẽ "mã • biển" |
| 8 | Số đơn "Đang chạy" | 🟡 | **Bỏ** (chốt 03/11) — chip vận hành "Đang thuê" đã nói; ô đó thành "Chuyến đã đi" |
| 9 | Menu phụ "Đăng nhanh xe tự lái" (gian hàng) | 🟡 | **Bỏ khỏi màn này** (chốt 03/11) — xem §2.1 |
| 10 | Nút Lịch · Chỉnh sửa · Chi tiết (nút chính vàng CUỐI) | ✅ | Tuyến hoa hồng: "Quản lý xe" thay "Chỉnh sửa" (từ 03/11 mở màn sửa chung `/vehicles/:id/edit`), cùng cổng `vehicles.update`. Không có Xoá |
| 11 | Huy hiệu "8" trên menu Danh sách xe | 🆕 | Số xe có việc chặn — §2.3 |
| 12 | Hai thẻ Cẩm nang / Chứng từ của tuyến hoa hồng | 🟡 | **Bỏ** (chốt 03/11) — đã là dòng của khối Trợ giúp |

Tự dựng (design không vẽ): ô trắng bo 16 cho rỗng / không kết quả / lỗi; khung chờ theo bố cục; dòng
"Hiển thị x-y của N xe" + phân trang dưới danh sách; thẻ trong một hàng cao bằng nhau, hàng nút dồn
đáy; số liệu tải hỏng / thiếu `finance.view` (cột tiền vắng, không số 0 giả); KM chưa có = "—", gọi
hỏng = "Không rõ"; lỗ tô đỏ; 1366 lưới 4 cột (sàn thẻ 270px); thẻ ngang tự xuống hàng theo bề rộng
thật (`@container`); điện thoại giữ dải chỉ số + chip một chạm + hàng ngang, nút cùng kiểu desktop.

**Màn dùng chung dữ liệu xe — tự cập nhật sau thao tác ghi** (mọi key dưới nhánh `vehicles` của
`queryKeys`, kể cả `needsActionCount` nằm dưới `vehicles › alerts`):

| Thao tác ghi | Làm mới |
| --- | --- |
| Thêm / sửa / xoá / gửi duyệt / bật-tắt hiện trên chợ (`use-vehicle-mutations`) | `vehicles.all` (danh sách, tổng xe, thống kê, cảnh báo, huy hiệu menu, Hồ sơ xe) + `marketplace` |
| Giấy tờ xe · bảo dưỡng · bàn giao · lịch (khoá ngày) · chi nhánh · giá & chính sách | `vehicles.all` hoặc `vehicles.alertsAll` (đã có từ trước) |
| Đơn thuê: tạo / chuyển trạng thái / gán tài xế / sửa (`use-booking-mutations`) | **thêm 03/11** `vehicles.all` — "Đang thuê", "Chuyến đã đi", doanh thu theo xe |
| Thu tiền / hoàn (`use-payments`) · phiếu thu chi (`use-receipt-mutations`) | **thêm 03/11** `vehicles.all` — tổng doanh thu / chi phí / lợi nhuận trên thẻ |
| Thông báo realtime (admin duyệt/trả xe, đơn đổi trạng thái — `notification-refresh`) | **thêm 03/11** `vehicles.all` |

### 3.6 Chi tiết xe + Chỉnh sửa xe — kiểm kê và quyết định (03/11/2026)

Design: section Chi tiết `23672:25621` (5 frame) · section Chỉnh sửa `23731:37932` (13 frame). Chỉ
vẽ tuyến gói, một xe ô tô đủ ba dịch vụ. Code hiện có: Hồ sơ 360 (`Vehicle360Overview` +
`Vehicle360Cards` + `Vehicle360Aside`, dùng chung trang · modal · hai tuyến) và màn sửa
(`VehicleEditWorkspace` — menu trái 10 mục; tuyến hoa hồng là không gian `/vehicles/[id]/manage/*`).

Người dùng duyệt 03/11/2026: mọi dòng làm theo cột "Quyết định"; bốn dòng đã hỏi ghi rõ câu trả lời.
Thứ tự giao: trang Chi tiết trước (**xong 03/11**), rồi Chỉnh sửa (**xong 03/11**).

Đã làm ở trang Chi tiết: hàng nút ở tiêu đề (`VehicleDetailActions`, modal đặt trên thẻ xe) · thẻ xe
dùng `VehicleStatusBadges` của danh sách · khung thẻ chung `Panel` (`Vehicle360Cards`) · công tắc tự
nhận dùng chung hook `useAutoAcceptToggle` với màn sửa (`vehicle-manage/hooks/use-auto-accept-toggle.ts`) ·
thư viện ảnh theo góc (ảnh bìa dữ liệu cũ lấp ô mặt trước; quá 10 ô thì "+N") · cột phải: Giá thuê &
Chính sách · Lịch thuê sắp tới · Hoạt động gần đây · Lối tắt.

**Chi tiết xe `/vehicles/[id]`**

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| D1 | Nút đầu trang: Xoá (biểu tượng) · Chỉnh sửa · Xem lịch xe | ✅ | Theo design (nay nằm trong menu ⋮). Xoá có hộp xác nhận, gác `vehicles.delete` |
| D2 | Thẻ xe: ảnh · tên · nguồn · vận hành · mã · biển · KM · dịch vụ · kiểm duyệt · công tắc "Trên chợ" · Hiệu suất lũy kế (chuyến, đơn đang chạy, sao, số lượt đánh giá) | ✅ | Theo design, dùng lại mảnh của thẻ danh sách (`VehicleCardParts`) |
| D3 | Lý do bị trả về / từ chối / tạm ẩn (banner) | 🟡 | Dòng đỏ ngay dưới thẻ xe, như thẻ danh sách |
| D4 | "Việc cần làm" (cảnh báo server + việc "Gửi duyệt" — lối DUY NHẤT gửi duyệt lại) | 🟡 | Thẻ đầu tab Tổng quan, chỉ hiện khi có việc |
| D5 | Thẻ "Giấy tờ" (đếm quá hạn / sắp hạn) | 🟡 | Bỏ thẻ: cảnh báo giấy tờ đã nằm trong "Việc cần làm" (có link xử lý) |
| D6 | "Lối tắt" (đơn của xe · thu chi của xe · lịch · trung tâm bảo dưỡng…) | 🟡 | Thẻ nhỏ cuối cột phải, chỉ các link không có ở chỗ khác |
| D7 | "Đồng bộ lại hiển thị công khai" (chỉ phiên hỗ trợ) | 🟡 | Nút cạnh "Chỉnh sửa", chỉ trong phiên hỗ trợ |
| D8 | Giá thuê & Chính sách: ngày thường · cuối tuần · giờ · giao xe | ✅ | Theo design + thêm dòng giá có tài xế / giá tháng / khuyến mãi khi xe có |
| D9 | Thông số chính (6 ô) + Số KM hiện tại + "Nhập dữ liệu" | ✅ | "Nhập dữ liệu" mở hộp điều chỉnh KM (gác quyền + tuyến gói) |
| D10 | Thư viện ảnh theo góc (ô trống có dấu +) · "Thêm/Sắp xếp ảnh" | ✅ | Theo design |
| D11 | Nguồn xe & Tài chính (hình thức · ngày mua · giá trị xe) | ✅ | Theo design; tuyến hoa hồng không có |
| D12 | Tối ưu nhận chuyến — công tắc ngay trên thẻ | ✅ | Công tắc thật (mỗi dịch vụ có thiết lập một công tắc) |
| D13 | Tab Tài chính (design để trống) | ✅ | Giữ `FinanceEntityPanel` hiện có |
| D14 | Tab Tiện ích xe — chia 4 nhóm | 🆕 | **Danh sách phẳng** hai cột (chốt 03/11) — danh mục tiện ích chưa có nhóm; thêm nhóm là việc sau (cột nhóm ở catalog + màn Danh mục admin) |
| D15 | Mô tả xe (đang ở tab Thông số) | 🟡 | Khối "Mô tả" cuối tab Tiện ích xe |
| D16 | Tab Bảo dưỡng & số KM | ✅ | Cùng component với màn sửa |
| D17 | Lịch thuê sắp tới · Hoạt động gần đây | ✅ | Theo design |

**Chỉnh sửa xe `/vehicles/[id]/edit`**

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| E1 | Menu trái 3 nhóm: Hồ sơ xe (Thông tin chung · Hình ảnh · Giấy tờ) · Hình thức cho thuê (Dịch vụ xe · Điều kiện · Giao nhận) · Vận hành nâng cao (Bảo dưỡng & KM · Nguồn gốc & tài chính) | ✅ | Theo design. `?tab=` cũ vẫn mở đúng mục mới (bí danh) |
| E2 | Số trên menu: "Hình ảnh: 1 thiếu", "Giấy tờ: 2/3" | 🆕 | Ảnh: số góc bắt buộc còn thiếu (`missingVehicleImageTypes`). Giấy tờ: số loại cốt lõi đã có / 3 (đăng ký · đăng kiểm · bảo hiểm) |
| E3 | Cột phải: ảnh · tên · nguồn · vận hành (đổi tại chỗ) · loại chỗ · giá · KM · **Hoàn thiện %** | 🆕 | % = điều kiện gửi duyệt đã đạt / điều kiện áp dụng (`applicablePublishRequirements`) — cùng phép tính với cổng gửi duyệt |
| E4 | Thẻ đầu màn sửa hiện tại (kiểm duyệt · công tắc "Trên chợ" · mã · biển số) | 🟡 | Dời vào thẻ cột phải |
| E5 | Nút "Hoàn tác · Lưu thay đổi" ở cột phải | ✅ | Nút của MỤC đang mở (mỗi mục vẫn lưu riêng như nay); mục tự lưu (ảnh, giấy tờ, bảo dưỡng) thì ẩn hai nút. Rời mục khi chưa lưu vẫn hỏi |
| E6 | Thông tin chung: tên · mã · biển · chi nhánh · hãng · dòng · năm · màu · số chỗ · kiểu dáng (ô hình) · nhiên liệu · hộp số · tiêu thụ · dung tích · tiện ích | ✅ | Theo design |
| E7 | Loại xe (ô tô/xe máy) · dịch vụ · phân khúc xe máy · kích thước · khối lượng · công suất · tiêu thụ nội/ngoại thành · mô tả · thông báo khoá trường khi xe đã duyệt | 🟡 | Giữ trong Thông tin chung: thêm thẻ "Thông số nâng cao" và "Mô tả" sau Tiện ích |
| E8 | Dịch vụ xe: ba tab dịch vụ (chấm xanh/đỏ = bật/tắt) · công tắc dịch vụ · "Tự động đồng ý nhận chuyến" | ✅ | Theo design. Luật tự nhận chi tiết (khoảng đặt trước, thời lượng tối thiểu, tuyến ưu tiên, khả năng tài xế) mở ra dưới công tắc |
| E9 | Tự lái: giá ngày thường ("Giá thị trường" trong design) · cuối tuần · giờ · khuyến mãi · thế chấp · hạn mức km · quá giờ | ✅ | Nhãn giữ "Giá ngày thường" — "giá thị trường" là giá tham khảo, không phải giá của xe |
| E10 | Có tài xế: nội thành · liên tỉnh khứ hồi · liên tỉnh 1 chiều · phân khúc chuyến ưu tiên | ✅ | Theo design |
| E11 | Có tài xế: **phụ phí** ngoài giờ · chờ đợi · đường dài · lưu trú qua đêm | ⚠️ | **Bỏ** (chốt 03/11, theo ADR 0075). Giữ dòng tiền công tài xế ghi nhận + phân khúc chuyến ưu tiên |
| E12 | Khuyến mãi ở có tài xế · dài hạn; giảm theo "đ"; mốc ưu đãi dài hạn theo "đ/tháng" | 🆕/⚠️ | **Theo ADR** (chốt 03/11): khuyến mãi chỉ ở Tự lái, chỉ theo %; dài hạn chỉ có mốc ưu đãi theo % (ADR 0011) |
| E13 | Dài hạn: giá tháng · gợi ý giá · mốc ưu đãi 1/2/3/6/9/12 tháng | ✅ | Theo design (mốc chỉ theo %) |
| E14 | "Áp dụng chính sách của gian hàng" vẽ ở 6 khối | 🆕 | Dữ liệu chỉ có MỘT công tắc cho cả xe (cọc · km · quá giờ · giao xe · ưu đãi dài hạn); giấy tờ/điều khoản không có bản gian hàng. Một công tắc ở đầu "Dịch vụ xe"; khối khác hiện dòng "Đang theo chính sách gian hàng" |
| E15 | Điều kiện: giấy tờ bắt buộc · phương thức đối chiếu · khách xác nhận điều khoản · điều khoản (tự lái & dài hạn; có tài xế + mẫu hợp đồng) | ✅ | Theo design |
| E16 | Giao nhận: công tắc giao tận nơi · khung giờ giao/nhận · thời gian chết giữa hai chuyến | ✅ | Theo design |
| E17 | Bán kính giao xe · bảng phí giao theo km | 🟡 | Dưới công tắc giao tận nơi |
| E18 | Hình ảnh: ô theo góc · ảnh bìa · xoá · thay · tải lên | ✅ | Theo design (section tự lưu như nay) |
| E19 | Giấy tờ: danh sách · hạn · trạng thái · Xem · Thay file · ⋮ · ghi chú OCR · Thêm loại giấy tờ | ✅ | Theo design |
| E20 | Bảo dưỡng: KM hiện tại + điều chỉnh tay (lý do) · chu kỳ thay nhớt · lịch sắp tới · lịch sử (hộp) | ✅ | Theo design (04/11): lịch sắp tới là ô có viền (tên · ngày dự kiến · Odo · garage · chi phí · mã phiếu chi · ghi chú) + thùng rác/bút; "Xem lịch sử bảo dưỡng" mở hộp danh sách phiếu đã hoàn tất/đã huỷ; "Thêm lịch bảo dưỡng" cuối thẻ. **Chỉ MỘT "Ngày dự kiến"** (bỏ kết thúc dự kiến) và **không giữ chỗ lịch xe** — người dùng chốt 04/11, ADR 0079. "Hoàn tất" (ghi KM, dời mốc nhớt) không có trong design → giữ dạng nút chữ cạnh hai biểu tượng |
| E21 | Thùng rác cạnh từng lần điều chỉnh KM | ⚠️ | Không xoá: sổ KM là nhật ký có kiểm toán (sửa bằng một lần điều chỉnh mới). Bỏ biểu tượng |
| E22 | Thùng rác cạnh lịch bảo dưỡng | ✅ | Là "Huỷ lịch" (hỏi lại trước), bản ghi vào lịch sử với nhãn "Đã huỷ" |
| E23 | Nguồn gốc & tài chính: 4 hình thức · khoản vay · hợp đồng · ghi chú | ✅ | Hình thức thứ 4 design ghi "Cọc tiền" → dùng nhãn đúng "Hợp tác chia doanh thu"; ô hiện theo hình thức (thuê lại: chủ xe + tiền thuê; hợp tác: % chia) |
| E23b | Nguồn gốc & tài chính — bố cục (04/11) | ✅ | Theo design `23730:32702`: bốn thẻ hình thức 2×2, icon tròn bên trái, không chấm radio; các khối thông tin + "Hợp đồng" cùng khuôn thẻ của màn sửa xe (ô tệp có icon · dung lượng · tải về/gỡ dạng biểu tượng). **Bỏ dải vàng "Hình thức sở hữu xe: …" đầu trang** (người dùng chê: dải nói hình thức đã lưu, thẻ sáng lại là thẻ vừa bấm → không biết xe đang thuộc gì): hình thức ĐÃ LƯU mang nhãn "Đang áp dụng" ngay trên thẻ của nó; chọn thẻ khác thì hiện dòng "Đổi từ X sang Y — chưa lưu" + nút "Giữ X". Nút "Cập nhật" trong thẻ hình thức của design KHÔNG làm: trùng nút "Lưu thay đổi" cột phải (E5). Công thức chia doanh thu vào ⓘ cạnh tiêu đề điều khoản |
| E24 | Tuyến hoa hồng | 🟡 | **Cùng giao diện** (chốt 03/11): chi tiết + chỉnh sửa dùng chung; URL `/vehicles/[id]/manage/<mục>` cũ chuyển hướng. Chủ xe không có nhóm Vận hành nâng cao, tab Tài chính, Nguồn xe, Hiệu suất (như nay); "Lịch sử chuyến" là mục riêng của chủ xe |

Trạng thái tự dựng (design không vẽ): đang tải · lỗi · không tìm thấy · không quyền · chỉ xem (phiên
hỗ trợ, thiếu `vehicles.update`) · dịch vụ đang tắt · xe máy · màn hẹp/điện thoại.

Đã làm ở màn Chỉnh sửa (03/11/2026) — `VehicleEditWorkspace` + `features/vehicles/components/edit/`:

- **Nút cột phải** "Hoàn tác · Lưu thay đổi" lưu MỌI form đang dở của mục (`edit-actions.tsx`:
  mỗi form đăng ký, mỗi form vẫn ghi đúng endpoint của nó). Mục không có form (Giấy tờ, Bảo dưỡng,
  Lịch sử chuyến) không có hai nút; Bảo dưỡng giữ nút "Lưu" của thẻ chu kỳ nhớt như design.
  **Đính chính E5**: Hình ảnh KHÔNG tự lưu (xếp/tải xong mới lưu) — nó dùng nút cột phải như design vẽ.
- **Nhóm "Hình thức cho thuê" có HAI mục thay ba của design** (người dùng chốt 03/11 — lệch design):
  - **Dịch vụ & giá** (`?tab=self-drive|with-driver|long-term`): công tắc dịch vụ · tự nhận chuyến ·
    giá + khuyến mãi theo từng dịch vụ (ưu đãi dài hạn ở tab Dài hạn).
  - **Chính sách thuê** (`?tab=policy`, gộp "Điều kiện" + "Giao nhận"): mọi thứ áp cho CẢ XE. Một thẻ
    phẳng (hàng cách vạch như design) chứa công tắc "Áp dụng chính sách của gian hàng" (E14 — MỘT
    công tắc cho cả bộ chính sách, đặt ngay trên phần giao xe) · giao xe tận nơi · cọc · hạn mức km ·
    quá giờ; rồi thời gian chuẩn bị xe; rồi giấy tờ & điều khoản (hai khối, xe máy không có khối Có
    tài xế — điều khoản không có bản của gian hàng nên công tắc không áp).
  - `?tab=conditions|handover|operations|handover-time|*-terms` và `/manage/<mục>` cũ đều về
    "Chính sách thuê". Tuyến hoa hồng không có công tắc (sửa thẳng).
- **Form giá** tách logic ra `useVehiclePricingForm`; vẫn MỘT lệnh `PUT /vehicles/:id/pricing` trọn
  gói chia ra hai mục. Lưu trượt vì ô lỗi ở tab khác cùng mục thì tự mở tab đó; ô lỗi ở mục KIA thì
  nhắc mở mục kia. Tải giá lỗi chỉ chặn phần giá — công tắc dịch vụ/tự nhận vẫn dùng được.
- **Bố cục phẳng của khối chính sách** (`PolicyFlatLayout`): không thẻ lồng thẻ; dòng nhắc trùng với
  công tắc/lựa chọn ngay cạnh bị bỏ ("Không thu cọc…", "Không giới hạn quãng đường…", "Đang theo
  chính sách gian hàng" ở từng khối, "Áp cho mọi dịch vụ"); công thức quá giờ/vượt km, tóm tắt bậc
  giao xe và phạm vi thời gian chuẩn bị đi vào icon ⓘ. Trang chính sách gian hàng giữ bố cục thẻ.
- **Gỡ (ADR 0078)**: khung giờ giao/nhận xe (cả hệ thống — xe nhận/trả mọi giờ) và phí giao xe
  theo km (mỗi bậc một phí trọn gói; bậc theo km cũ quy đổi `perKm × toKm`).
- **Tuyến hoa hồng** (E24): `workspaceVehiclePaths` trỏ chi tiết + sửa về route chung; `isCommissionPage`
  nhận `/vehicles/<id>/edit`; `/vehicles/<id>/manage/[[...section]]` (cả bản phiên hỗ trợ) chuyển
  hướng theo `editTabOfLegacyManageSection`. Giữ đúng bộ ô cũ của chủ xe (không tên/chi nhánh/thông
  số nâng cao, lưu `manageInformationValuesToInput`), thẻ **Địa chỉ xe hiện tại** (sửa chi nhánh tại
  chỗ, bản đồ tĩnh, cảnh báo chi nhánh giữ nhiều xe), điểm đánh giá + số chuyến ở thẻ tóm tắt, thành
  viên chỉ có quyền xem vẫn mở được ở dạng chỉ-xem. Gỡ `VehicleManageWorkspace` · Header · Sidebar ·
  `sections/*` (trừ Ảnh, Lịch sử chuyến) · `navigation.ts` · `VehicleEditHeader` · `VehicleInfoAside` ·
  `VehiclePricingWorkspace`.
- **Breadcrumb** "Danh sách xe › Chi tiết xe › Chỉnh sửa xe": `ManagePageHeader` nhận `parent`.
- **Công tắc "Trên chợ" + "Xem trang xe" ở góc phải đầu trang** (người dùng chốt 03/11 — lệch design,
  design đặt cuối thẻ tóm tắt): `VehicleEditMarketBar`. Bỏ dòng nhắc "bốn ô đã khoá" ở thẻ tóm tắt —
  từng ô bị khoá đã tự nói điều đó. Bật lại chợ mà chạm cổng mặt tiền gian hàng tuyến gói
  (`SHOP_LISTING_REQUIREMENTS_MISSING`, gần như luôn là thiếu logo — bước tạo gian hàng không đòi
  logo, ADR 0040 điều 6–7) hiện HỘP THOẠI nói thiếu gì + nút "Tải logo" tới hồ sơ gian hàng, thay
  cho toast "chưa gửi xe duyệt được" (áp cả trang chi tiết xe, cùng component).
- Khoá chữ cũ `Vehicles.edit.*` / `VehicleManage.*` GIỮ NGUYÊN — app mobile vẫn đọc chúng.
- Ba mục Giấy tờ · Bảo dưỡng · Nguồn gốc dùng lại component hiện có trong khung mới; bố cục bên
  trong chưa chỉnh từng chi tiết theo design (thẻ nguồn xe dạng ô có icon, bảng giấy tờ). Riêng thẻ
  "Lịch bảo dưỡng sắp tới" + hộp lịch sử bảo dưỡng đã theo design (04/11, xem E20).

### 3.7 Quản lý tài xế — kiểm kê và quyết định (04/11/2026)

Code: `features/drivers/components/DriversPage` (dùng chung với phiên hỗ trợ, ADR 0050) · thẻ
`DriverCard` · nút tiền công `DriverWageSettingsButton` (thay thẻ `DriverWageSettingsCard`) · dải số
`components/data-display/SummaryStrip` (tách từ dải số Khách hàng, có chế độ bấm-để-lọc). Ngăn chi
tiết 3 tab (`DriverDetailDrawer`), hộp sửa, hộp mời: giữ nguyên chức năng.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề + dòng phụ · "Mời tài xế mới" · hộp mời (SĐT, tên, hình thức hợp tác, ghi chú, khối "Lưu ý") | ✅ | Theo design. Hộp mời nhãn trên ô, "Lưu ý" cuối form; "Mời lại" dùng cùng hộp, điền sẵn |
| 2 | Lọc Chi nhánh · Loại xe · Dịch vụ | 🆕 | **Bỏ** (chốt 04/11) — tài xế không gắn chi nhánh/xe/dịch vụ trong mô hình (ADR 0063) |
| 3 | Lọc Vận hành · Sắp xếp | 🆕 | **Làm** (chốt 04/11): `operation=on_trip\|idle` (cùng tập đơn với "Chuyến đang gán") · `sort=newest\|name_asc\|status` — server, `GET /drivers` |
| 4 | Dải 6 số: Tất cả · Đang liên kết · Đang chờ xác nhận · Cần đối chiếu giấy tờ · Tạm khoá · Đã từ chối/Kết thúc | 🆕 | **Làm** (chốt 04/11): `GET /drivers/summary` (áp cùng bộ lọc chung), mỗi ô là lối lọc ghi CÙNG tham số với ô "Trạng thái". "Cần đối chiếu" = liên kết còn mở chưa có bằng xác thực còn hạn HOẶC tên trên bằng lệch tên mời (`licenceCheck=needed`, so bằng `holderNameDiffers`). "Tất cả" = liên kết còn mở |
| 5 | Tên đăng nhập "huutrong013" | 🆕 | **Bỏ** (chốt 04/11) — tài khoản không có username; ô đó hiện "Tài khoản: <tên hiển thị>" khi khác tên đã mời |
| 6 | Trạng thái "Hết hạn lời mời" | 🆕 | **Bỏ** (chốt 04/11) — lời mời tài xế không có hạn |
| 7 | Nút "Nhắc lại lời mời" | 🆕 | **Không làm** (chốt 04/11) — thẻ đang chờ có "Chỉnh sửa thông tin" + "Xem chuyến" như thẻ khác |
| 8 | Thẻ: ảnh · tên · SĐT · hình thức · trạng thái · khối Bằng lái (trạng thái, hạng, tên trên bằng, hạn, loại / "Chưa cập nhật") · Chuyến đang gán · "Chỉnh sửa thông tin" · "Xem chuyến" · menu "…" (Thu hồi lời mời / Ngừng hợp tác) | ✅ | Theo design. Bằng lệch tên ⇒ nhãn "Cần đối chiếu" + câu nhắc. "Tạm khoá" tô đỏ như design (meta chung giữ xám cho admin/mobile). Không ảnh, không số bằng (ADR 0063) |
| 9 | Mức tiền công/ngày chung (ADR 0075) | 🟡 | Nút viền cạnh "Mời tài xế mới" ("Tiền công: …/ngày", tooltip giải thích; chưa đặt ⇒ sắc cảnh báo; chỉ xem ⇒ không bấm được) |
| 10 | Tiền công + số chuyến theo tháng, bộ chọn tháng | 🟡 | Dòng "Tiền công MM/YYYY" trên thẻ (bấm mở tab Chuyến & tiền công); bộ chọn tháng cuối hàng lọc, cùng `month` với ngăn chi tiết |
| 11 | Rút chuyến 90 ngày + thời gian bị loại khỏi "Đặt ngay" (ADR 0074) | 🟡 | Dòng cảnh báo trên thẻ, chỉ khi có |
| 12 | Tạm khoá / Mở khoá · Xem chi tiết | 🟡 | Vào menu "…" cạnh Thu hồi / Ngừng hợp tác |
| 13 | Mời lại tài xế đã kết thúc · "Tài xế ngừng / Bạn kết thúc" · "Đã mời lại" | 🟡 | Thẻ đã đóng: nút chính "Mời lại" thay "Chỉnh sửa"; dòng lịch sử dưới viên trạng thái |
| 14 | Ngăn chi tiết 3 tab | 🟡 | Giữ — bấm ảnh/tên mở Tổng quan; "Xem chuyến" mở tab Chuyến & tiền công |
| 15 | "N chuyến" đang gán trên thẻ → đơn nào | 🆕 | Bổ sung 04/11 (người dùng báo bấm vào không thấy chuyến): tab Tổng quan có panel "Chuyến đang gán (N)" — mã đơn (mở chi tiết đơn) · xe · thời gian · trạng thái đơn · tài xế đã nhận/chờ nhận. Nguồn `overview.current` (cùng tập đơn với `activeBookingCount`, sớm nhất trước, tối đa 20). Tab Chuyến & tiền công vẫn chỉ là chuyến ĐÃ KẾT THÚC trong tháng |

Tự dựng (design không vẽ): khung chờ 4 thẻ; rỗng / không kết quả (nút xoá bộ lọc) / lỗi trong ô
trắng bo 16; "Hiển thị x-y của N tài xế" + phân trang; không quyền xem ⇒ `PermissionState`; khối bằng
lái "Đang đọc ảnh"; lưới 4 cột sàn 300px (1280 ⇒ 3 cột, điện thoại 1 cột); số đếm hỏng ⇒ dải ẩn,
danh sách vẫn chạy. Huy hiệu menu "Quản lý tài xế" vẫn **chưa làm** (§2.3).

### 3.8 Danh sách bảo dưỡng — kiểm kê và quyết định (04/11/2026)

Code: `features/vehicle-maintenance/components/MaintenanceBoardPage` · danh sách hàng
`MaintenanceBoardList` (thay bảng `MaintenanceBoardTable` + thẻ mobile riêng) · dải chip
`MaintenanceBoardTabs`. Hộp lên/sửa lịch, hoàn tất, cập nhật ODO (`MaintenanceBoardDialogs`) và hàng
đợi "Thiếu KM trả" (`MissingReturnKmQueue`): giữ nguyên.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề "Danh sách bảo dưỡng" + dòng phụ | ✅ | Theo design |
| 2 | Lọc: tìm · chi nhánh · hạng mục · khoảng thời gian · "Sắp xếp: Gần đến hạn" | ✅ | Hàng cao 40; sắp xếp tách khỏi ô lọc (không vào huy hiệu lọc, "Xoá bộ lọc" giữ nó) — hằng `MAINTENANCE_BOARD_SORT` dùng chung API/web |
| 3 | Hàng xe: vạch màu · ảnh · tên · biển · bảo dưỡng gần nhất · Odo + mốc tiếp theo · viên chu kỳ + KM còn/quá + thanh + "% chu kỳ" · ô lịch · "Cập nhật ODO" · "Lên lịch ngay"/"Lên lịch"/"Sửa lịch" · "…" | ✅ | Theo design. Sắc: đỏ quá hạn · cam sắp đến hạn · xanh dương trong chu kỳ · xám chưa đủ dữ liệu. Ô lịch: viền đứt khi chưa có lịch (đỏ khi quá hạn), nền xanh khi có phiếu ("Đã lên lịch \| ngày" / "Đang bảo dưỡng \| từ ngày" + hạng mục) |
| 4 | Dải tab có số đếm (Tất cả · Quá hạn · Sắp đến hạn · Đang bảo dưỡng · Thiếu dữ liệu KM · Lịch sắp tới · Thiếu KM trả) | 🟡 | **Giữ** dạng chip dưới hàng lọc (chốt 04/11); "Thiếu KM trả" vẫn đổi sang bảng biên bản, ẩn khi thiếu `handovers.view` |
| 5 | Nội dung menu "…" | 🟡 | Xem chi tiết xe · Hoàn tất · Hủy lịch (chốt 04/11). **Sửa lỗi cũ**: "Hủy lịch" trước đây mở nhầm hộp lên lịch — nay hỏi lại rồi gọi đúng `POST …/records/:id/cancel` |
| 6 | Khoá ghi khi gói ở chỉ-xem (ADR 0027) · phiên hỗ trợ không lên/dời lịch (ADR 0050) | 🟡 | Giữ: nút ghi khoá kèm tooltip; "Xem chi tiết xe" không bao giờ khoá |

Tự dựng: xe chưa có KM ("Chưa có số KM" + "Cập nhật ODO để theo dõi chu kỳ", không "0 km"); chưa có
mốc / chưa đặt chu kỳ; rỗng / không kết quả / lỗi / không quyền trong ô trắng bo 20; khung chờ 5 hàng;
"Hiển thị x-y của N xe" + phân trang; 1280–1440 vẫn một hàng (thu khoảng cách cột, ảnh 112×64),
≤1180 xếp ba tầng, điện thoại một cột. Huy hiệu menu "Bảo dưỡng" vẫn **chưa làm** (§2.3).

## 4. Node Figma đã dùng

Ghi lại để phiên sau khỏi tốn lượt đọc lại.

| Node | Là gì |
| --- | --- |
| `23649:27690` | Header, biến thể Default |
| `23661:22492` | Header, biến thể Details (có dải breadcrumb `23659:20986`) |
| `23661:27362` | SubMenu: 4 dropdown (Vận hành · Xe & Tài · Doanh thu · Cấu hình) |
| `23649:11528` | Trạng thái mục menu (Main · Sub Menu · Child × Default/Active/Hovered) |
| `23649:25560` | Màn Yêu cầu đặt xe (Request) — thẻ `23649:25607` |
| `23790:45293` | Màn Đơn thuê xe, ô "Tất cả" — cột trái `23790:46261`, page header `23790:45296`, thẻ đang thuê `23797:48619` |
| `23797:49689` | Màn Đơn thuê xe, một ngăn (Hoàn thành) có phân trang `23797:50995` |
| `23746:51015` | Tab List/Kanban của màn Yêu cầu (frame chốt 02/11 không còn dùng) |
| `23777:53056` | Section Chi tiết đơn: chờ giao `23845:49956` (03/11, thay `23768:29928`) · cảnh báo thiếu `23845:51599` · popup sẵn sàng giao `23845:53852` (modal `23845:54382`) · chờ giao có tài xế `23807:73143` · hộp Thông tin khách `23777:49485` · hộp Thu tiền đơn `23777:52010` · đang thuê `23777:48710` · hoàn thành `23777:52626` |
| `23777:54974` | Section Khách hàng: danh sách `23777:53057` (dải số liệu `23777:53832`) · Tổng quan `23777:54975` · Lịch sử thuê `23797:54015` · Thu chi `23797:55706` · Giấy tờ `23797:62633` |
| `23807:68543` · `23807:70054` | Hộp Gia hạn thuê xe · Thanh toán gia hạn (ADR 0077) |
| `23746:50954` | Nút chuyển (`_switch`) Active yes/no |
| `23672:25621` | Section Chi tiết xe: Tổng quan `23670:3440` (thẻ xe `23797:53034`, tab `23672:4701`, thẻ "Nhóm thông tin" `23670:3504`, cột phải `23672:25630`) · Thông số `23672:3988` · Tài chính (trống) `23672:5931` · Tiện ích `23672:4755` · Bảo dưỡng & KM `23672:6379` |
| `23731:37932` | Section Chỉnh sửa xe: Thông tin chung `23683:17598` · Ảnh `23707:25596` · Giấy tờ `23713:7609` · Tự lái `23713:21048` · Có tài xế `23716:27912` · Dài hạn `23716:29056` · Điều kiện `23721:30416` · Giao nhận `23721:31485` · Bảo dưỡng `23724:10374` (hộp thêm KM `23731:39262`, thêm lịch `23724:29202`, lịch sử `23724:32002`) · Nguồn gốc & tài chính `23730:32702` |
| `23672:25620` | Section Danh sách xe: ít xe `23655:38521` (thẻ `23655:38951`) · lưới `23649:29724` (thẻ `23655:36682`, page header + hàng lọc `23649:30744`) · danh sách `23655:36959` (hàng `23655:38389`) |
| `23737:45750` | Section Quản lý tài xế: danh sách `23737:41945` (thẻ `23737:43826`, dải số `23737:44163`; menu "…" đang mở vẽ ngay trong frame này) · hộp Mời tài xế mới `23737:45751` |
| `23733:41941` | Section Danh sách bảo dưỡng: frame `23754:28662`, hàng xe `23754:29574` |
| `I23661:27390;23649:28221` | Icon xe của dòng "Danh sách xe" — xuất qua instance cha trả nhầm icon tài liệu |

Icon menu: tải từ các node trên, chuẩn hoá về khung 24px (cấp 1, dòng dropdown), 20px (nút header),
12px (+/−), 16px (mũi tên) ở `apps/web/public/icons/menu/`, vẽ qua `LineIcon`. Mục chưa có icon trong
design (Trung tâm hỗ trợ, Yêu cầu hỗ trợ, các mục Owner Lite) chọn trong cùng bộ: `PARTNER_NAV_ICON`
ở `apps/web/src/components/icons/nav-icons.tsx`.

## 5. Rà soát cuối — BẮT BUỘC trước khi đóng đợt

Người dùng dặn (02/11/2026): tính năng dời chỗ **rất dễ bị quên**. Khi mọi màn đã ráp xong, làm đủ
danh sách này và ghi kết quả vào đây trước khi coi đợt là xong.

- [ ] Không còn mục `hidden` nào trong `SHOP_NAV` / `OWNER_LITE_NAV` (mỗi mục đã về màn đích).
- [ ] Mọi dòng §2 có cột "Còn phải làm" là "—".
- [ ] Mọi dòng §3 ở trạng thái Xong, mọi dòng 🟡/🆕/⚠️ đã có quyết định và đã làm.
- [ ] Đi qua TỪNG route dưới đây bằng tài khoản tuyến gói (`0902000001`), nhân viên, và chủ xe tuyến
      hoa hồng (`0913000004`): vào được bằng cú bấm từ menu/header/màn khác (không chỉ gõ URL), và mọi
      hành động của màn cũ vẫn còn.
- [ ] So từng màn với bản kiểm kê tính năng đã ghi khi ráp nó.
- [ ] Phiên hỗ trợ gian hàng ở site quản trị (ADR 0050) vẫn mở đủ các màn đọc của gian hàng.
- [ ] Cập nhật `07_INFORMATION_ARCHITECTURE.md` §3 và `docs/CODEMAP.md` cho khớp.

Route của site partner (02/11/2026, từ `apps/web/src/app/(manage)/manage`):

```text
/  account  balance  bank-accounts→balance  booking-requests  bookings(?preset=)  bookings/[id]
bookings/awaiting-pickup→bookings?preset=awaiting_pickup  calendar  chat  contracts-documents  contracts/[id]  customers  customers/[id]
data-protection  debts  drivers  finance  host-guide  invites/[token]  maintenance  members
onboarding  payment/[id]  payment-return  receipts  registration  security→account  shop
shop/branches→shop  shop/payment-settings→shop/policies  shop/policies  shop/seller-profile→shop
subscription  support  support/cases  tax  trips  vehicles  vehicles/new  vehicles/register
vehicles/[id]  vehicles/[id]/edit  vehicles/[id]/optimization  vehicles/[id]/pricing
vehicles/[id]/manage/…  (information · images · documents · pricing · handover-time · trip-history ·
self-drive/{pricing,delivery,handover-time,optimization,terms} · with-driver/{pricing,surcharges,
optimization,terms})
công khai: login  register  forgot-password  reset-password
```
