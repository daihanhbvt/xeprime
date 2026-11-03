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
| Danh sách xe · `/vehicles` | Quản lý › Xe của tôi › Danh sách xe | **Xe & Tài xế › Danh sách xe** | menu | — |
| Tài xế · `/drivers` | Cấu hình › Tài xế | **Xe & Tài xế › Quản lý tài xế** | menu | — |
| Bảo dưỡng · `/maintenance` | Quản lý › Xe của tôi › Bảo dưỡng | **Xe & Tài xế › Bảo dưỡng** | menu | — |
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

### 2.3 Header — các quyết định đã chốt

| Phần | Quyết định |
| --- | --- |
| Icon bánh răng | Mở **Tài khoản & bảo mật** của NGƯỜI đăng nhập (`/account`; chủ xe tuyến hoa hồng: "Hồ sơ chủ xe"). "Cấu hình" trên menu là cài đặt của CỬA HÀNG. Điện thoại: ẩn icon, vào qua menu hồ sơ |
| Khối hồ sơ | Bố cục design (ảnh tròn + chấm trực tuyến · tên người · mũi tên), nhưng **dòng 2 là "Gian hàng · Vai"** thay cho email: không lộ liên hệ khi chia sẻ màn hình, và đăng nhập site partner là SĐT. Chủ xe cá nhân chỉ hiện vai |
| Menu hồ sơ | `useAccountMenuItems` — một bộ cho header, drawer mobile và topbar site quản trị: danh tính · Tài khoản & bảo mật · Cài đặt gian hàng (tuyến gói) · Ngôn ngữ · Đăng xuất |
| Số đếm trên menu | **Chỉ số "cần xử lý"**: Yêu cầu đặt xe (chờ duyệt) · **Quản lý đơn thuê xe** = Chờ giao xe + Đang thuê · **Lịch thuê xe** = lượt giao + nhận hôm nay (chốt 02/11; nguồn `GET /dashboard/today`). Danh sách xe, Tài xế, Bảo dưỡng **chưa làm** — cần định nghĩa "cần xử lý" trước. Không đếm tổng xe/tài xế |
| Số trên mục cấp 1 | Khi dropdown ĐÓNG, tổng số "cần xử lý" của khối hiện cạnh nhãn khối (cùng kiểu huy hiệu design) — để yêu cầu đang chờ không bị khuất. Design không vẽ chi tiết này; bỏ được nếu người dùng muốn |
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
