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
| Yêu cầu đặt xe · `/booking-requests` | Quản lý › Đơn thuê › Yêu cầu đặt xe | **Gộp vào "Đơn thuê xe"** (05/11): nhóm Cần xử lý · Chờ khách thanh toán; tab "Đã kết thúc" cũ → ngăn "Không thành đơn" của "Đơn đã kết thúc". Route cũ CHUYỂN TIẾP (`?status=` → nhóm), cả trong phiên hỗ trợ | cột trái "Đơn thuê xe"; thẻ Tổng quan | — (§3.2b) |
| Tất cả đơn thuê · `/bookings` | Quản lý › Đơn thuê › Tất cả đơn thuê | **Vận hành › Đơn thuê xe** — MỘT mục cho cả chuyến (05/11), huy hiệu = chờ duyệt + giao/trả đến hạn | menu; tab mobile "Đơn thuê" | — (§3.2b List · §3.2c Kanban) |
| Đơn đã kết thúc · `/bookings/ended` | — (ngăn Hoàn thành/Đã huỷ của bảng đơn + tab "Đã kết thúc" của hộp thư) | **Nút "Đơn đã kết thúc (n)"** ở đầu "Đơn thuê xe" (05/11); `/bookings?preset=completed|cancelled` và `?status=closed` cũ chuyển tiếp | nút đầu trang; thẻ Tổng quan "Hoàn thành" | — (§3.2b) |
| Chờ giao xe · `/bookings/awaiting-pickup` | Quản lý › Đơn thuê › Chờ giao xe | **Nhóm "Chờ giao xe"** ở cột trái của "Đơn thuê xe" (`/bookings?preset=awaiting_pickup`); route cũ chuyển tiếp (cả trong phiên hỗ trợ); mục ẩn đã gỡ (02/11) | cột trái màn đơn; thẻ Tổng quan | — |
| Khách hàng · `/customers` | Quản lý › Khách hàng | **Vận hành › Danh sách khách hàng** | menu | — |
| Danh sách xe · `/vehicles` | Quản lý › Xe của tôi › Danh sách xe | **Xe & Tài xế › Danh sách xe** (huy hiệu số xe có việc chặn) | menu | Danh sách xong (03/11, §3.5). Chi tiết `/vehicles/[id]` và Chỉnh sửa `/vehicles/[id]/edit` xong (03/11, §3.6) — cả hai tuyến |
| Đăng nhanh xe tự lái (gian hàng) · `/vehicles/register?from=manage` | Menu phụ cạnh nút thêm xe ở Danh sách xe | **Gỡ khỏi Danh sách xe** (chốt 03/11) — màn chỉ còn "Thêm xe mới" → wizard đầy đủ. Route vẫn sống (chủ xe tuyến hoa hồng dùng `?from=account`) | URL | — |
| Tài xế · `/drivers` | Cấu hình › Tài xế | **Xe & Tài xế › Quản lý tài xế** | menu | — (ráp xong 04/11, §3.7) |
| Bảo dưỡng · `/maintenance` | Quản lý › Xe của tôi › Bảo dưỡng | **Xe & Tài xế › Bảo dưỡng** | menu | — (ráp xong 04/11, §3.8) |
| Doanh thu · `/finance` | Kinh doanh › Tài chính › Tổng quan doanh thu | **Doanh thu › Tổng quan doanh thu** | menu | — (ráp xong 04/11, §3.9) |
| Số dư & rút tiền · `/balance` (chỉ CHỦ) | Kinh doanh › Tài chính › Số dư & rút tiền | **Doanh thu › Quản lý ví** | menu | — |
| Thu chi · `/receipts` | Kinh doanh › Tài chính › Giao dịch thu chi | **Doanh thu › Lịch sử giao dịch** — tab "Giao dịch thu chi" | menu | — (ráp xong 04/11, §3.11) |
| Công nợ · `/debts` | Kinh doanh › Tài chính › Công nợ | **Doanh thu › Lịch sử giao dịch** — tab "Công nợ" (`/receipts?view=debts`); `/debts` chuyển tiếp, giữ tham số lọc; mục ẩn đã gỡ (04/11) | nút chuyển đầu màn Lịch sử giao dịch; thẻ "Công nợ khách hàng" (tab Thu chi); thẻ "Khách còn nợ" (Tổng quan doanh thu) | — (ráp xong 04/11, §3.11) |
| Trò chuyện · `/chat` | Kinh doanh › Trò chuyện | **Icon tin nhắn** ở header (popup + "xem tất cả"; số tin chưa đọc trên icon) | header | — |
| Cửa hàng · `/shop` | Gian hàng › Cửa hàng | **Cấu hình › Thông tin cửa hàng** | menu | — |
| Chi nhánh · `/shop/branches` | Cấu hình › Chi nhánh | **Thẻ "Chi nhánh"** trong Thông tin cửa hàng (`/shop?section=branches`); route cũ chuyển tiếp | thẻ của trang Cửa hàng | — (06/11: bảng gọn 7 cột, thao tác bút chì + "…", xem §3.13) |
| Chính sách thuê · `/shop/policies` | Cấu hình › Chính sách thuê | **Cấu hình › Chính sách thuê** | menu | — |
| Thành viên · `/members` | Cấu hình › Người dùng & phân quyền | **Cấu hình › Nhân viên & Phân quyền** (+ trang con "Vai trò & quyền" `/members/roles`) | menu; nút đầu trang | — (ráp xong 09/11, §3.14) |
| Trung tâm hỗ trợ · `/support` | Hỗ trợ › Trung tâm hỗ trợ | **Trợ giúp › Trung tâm hỗ trợ** | menu | — |
| Hỗ trợ & khiếu nại · `/support/cases` | Hỗ trợ › Yêu cầu hỗ trợ | **Trợ giúp › Yêu cầu hỗ trợ** (Trợ giúp thành dropdown 2 dòng — lệch design, đã chốt) | menu | — |
| Tài khoản & bảo mật · `/account` | menu tài khoản ở thẻ người dùng | **Dòng đầu menu hồ sơ** + bấm thẻ đầu menu (icon bánh răng ở header ĐÃ BỎ 09/11) | header | — |
| Cài đặt gian hàng · `/shop` | menu tài khoản | menu hồ sơ, dòng **"Quản lý gian hàng"** (06/11) | header | — |
| Đổi ngôn ngữ | menu tài khoản ở topbar | menu hồ sơ | header | — |
| Đăng xuất | menu tài khoản | menu hồ sơ | header | — |
| Thông báo | chuông ở topbar | **Icon chuông** ở header | header | — |

"Mục ẨN" = `NavLeaf.hidden` trong `constants/nav.ts`: trang vẫn thuộc khối (breadcrumb ra đúng khối,
băng "gói hết hạn" vẫn tra được cờ gói, lọc quyền vẫn chạy) nhưng không vẽ thành dòng menu. Đây là
trạng thái **tạm**, mỗi mục ẩn phải được gỡ khi màn đích của nó ráp xong.

### 2.2 Chủ xe tuyến hoa hồng (Owner Lite)

**Không có design riêng — dùng CHÍNH các màn của gian hàng, ẩn phần không áp dụng** (người dùng chốt
09/11/2026, [ADR 0085](../decisions/0085-unified-partner-ui-and-plan-slot-transitions.md)). Menu là MỘT
cây (`PARTNER_NAV` ở `constants/nav.ts`); cây của tuyến hoa hồng (`COMMISSION_NAV`) SUY từ nó bằng dấu
`tracks` trên từng mục, không viết tay lần hai. Khối không còn dòng nào với người đang xem (vd. Doanh
thu với thành viên không phải chủ) thì vắng hẳn.

| Khối | Dòng | Route |
| --- | --- | --- |
| Tổng quan | (liên kết thẳng) — CÙNG màn `DashboardView` (09/11/2026), xem dưới | `/` |
| Vận hành | Đơn thuê xe · Lịch thuê xe (CÙNG màn với gian hàng, cho chủ lẫn thành viên — 06/11/2026; `/trips` "Chuyến cho thuê" cũ chỉ còn chuyển tiếp) | `/calendar`, `/bookings` |
| Xe & Tài xế | Danh sách xe · Quản lý tài xế | `/vehicles`, `/drivers` |
| Doanh thu | Quản lý ví (chỉ CHỦ) | `/balance` |
| Cấu hình | Hồ sơ chủ xe (chỉ CHỦ) = CÙNG trang Thông tin cửa hàng, mặt tiền cá nhân (09/11/2026) | `/shop` |
| Trợ giúp | Cẩm nang cho thuê xe · Hợp đồng & Chứng từ · Chính sách bảo vệ dữ liệu · Yêu cầu hỗ trợ (ba mục đầu chỉ tuyến này — giữ để không mất tính năng; "Trung tâm hỗ trợ" của gian hàng trỏ vào trang chỉ tuyến gói nên vắng) | `/host-guide`, `/contracts-documents`, `/data-protection`, `/support/cases` |

Vắng ở tuyến này (server chặn bằng `@SubscriptionTrackOnly`): Khách hàng · Bảo dưỡng · Tổng quan doanh
thu · Lịch sử giao dịch · Chính sách thuê (chủ xe cấu hình chính sách trên TỪNG xe — ADR 0085 điều 3) ·
Nhân viên & phân quyền · Trung tâm hỗ trợ. Bốn tab mobile web dùng chung với gian hàng.

Tin nhắn là icon ở header như tuyến gói.

**Trang Thông tin `/shop` — mặt tiền cá nhân** (thay trang "Hồ sơ chủ xe" kiểu cũ ở `/account`, mục lục
trái + tám section — đã gỡ): đầu trang là ảnh tròn + họ tên TÀI KHOẢN (ADR 0054) + "Xem trang chủ xe";
thẻ Địa chỉ nhận xe (không ô giấy phép KD, không link Chi nhánh) · Khai thuế · **Hoá đơn VAT** (gian hàng
đặt nó ở Chính sách thuê) · Gói dịch vụ (phễu nâng cấp); cột phải "Thông tin chủ xe" (ảnh bắt buộc, họ
tên, giới thiệu — `OwnerInfoForm`) + "Hoàn thiện hồ sơ". Vắng: Chủ gian hàng, Chi nhánh, vai, ảnh bìa/logo.
Chỉ CHỦ (`isCommissionOwner`); thành viên và phiên hỗ trợ luôn thấy bản gian hàng. Đăng nhập · mật khẩu ·
xoá tài khoản về "Tài khoản & bảo mật" (`/account`) như mọi tài khoản partner; link cũ
`/account?section=address|vat-invoice|tax|plan` chuyển sang section cùng vai của `/shop`. Menu hồ sơ:
"Quản lý cho thuê" và "Nâng cấp gian hàng" trỏ `/shop` · `/shop?section=plan`.

**Tổng quan** — `DashboardView` cho cả hai tuyến: thẻ doanh thu, biểu đồ, sổ quỹ vắng theo cờ `finance`;
giữ ba thứ của Tổng quan riêng cũ (`OwnerDashboardView`, đã gỡ): "Xe của bạn" thay "Xe trên chợ", ví hiện
thu nhập tháng, lời chào theo tên. Vắng thẻ Gói và thẻ ba bước mở gian hàng. Chủ xe đang đăng ký vẫn thấy
màn tiến trình đăng ký (`OwnerRegistrationView`).

Danh sách xe của tuyến này dùng CHUNG màn với gian hàng từ 03/11/2026 (§3.5). Hai thẻ dẫn đường
"Cẩm nang cho thuê xe" / "Hợp đồng & chứng từ mẫu" đầu màn đã gỡ — cả hai là dòng của khối Trợ giúp.

**"Đơn thuê xe" dùng CHUNG với gian hàng từ 06/11/2026** (chốt với người dùng), thay danh sách thẻ
"Chuyến cho thuê" riêng của chủ xe (07/10/2026, `OwnerTripsView` — đã gỡ). Lý do màn riêng — gian hàng
khi đó có hai màn hộp thư + bảng đơn — mất từ lúc §3.2b gộp chúng. Chủ và thành viên cùng một mục,
cùng List/Kanban, cùng trang chi tiết `/bookings/[id]` (không còn popup).

| Điểm | Quyết định |
| --- | --- |
| Dạng xem mặc định | **List** cho tuyến hoa hồng (1–3 xe — bốn cột Kanban phần lớn trống); nút chuyển giữ nguyên, lựa chọn đã nhớ / `?view=` vẫn thắng (`useRentalsView`) |
| Menu · tab mobile | Mục "Đơn thuê xe" / ô "Đơn thuê" như gian hàng, huy hiệu `RENTALS_WORK`; **Lịch xe hết mang số** (lượt giao/trả đến hạn đã nằm trong số của Đơn). `NAV_BADGE.BOOKING_REQUESTS_PENDING`, `HANDOVERS_DUE` và trục `memberOnly` không còn ai dùng — đã gỡ |
| Link cũ | `/trips` là route CHUYỂN TIẾP ở server (`legacyOwnerTripsTarget`): `?filter=history` → "Đơn đã kết thúc", còn lại → "Đơn thuê xe", từ khoá đi theo. Thông báo, thẻ Tổng quan trỏ thẳng vào nhóm của màn mới |
| Màn trống | Câu của chuyến từ chợ ("Chưa có chuyến thuê nào") + nút "Xem xe của tôi" thay "Tạo đơn thuê" |
| Tự vắng ở tuyến này (đã có từ trước, server chặn thật) | Tạo đơn thuê (`@SubscriptionTrackOnly` ở `POST /bookings`) · mở sổ khách · ô "Đã thu" trong hộp nhận xe + Thu tiền · hai dòng tiền của Chuẩn bị bàn giao · ô chi nhánh (một chi nhánh). SĐT/Zalo/Chat chỉ khi đã có đơn — theo dữ liệu server (ADR 0056 · 0073) |

App Partner (mobile) vẫn có `OwnerTripsScreen` đọc `GET /trips?role=host` — API giữ nguyên, đợt này chỉ đổi web.

### 2.3 Header — các quyết định đã chốt

| Phần | Quyết định |
| --- | --- |
| Icon bánh răng | **ĐÃ BỎ (09/11/2026, người dùng chốt).** Trước đó mở Tài khoản & bảo mật (02/11); nay lối đó là dòng đầu của menu hồ sơ. Header phải còn: tin nhắn · thông báo · vạch ngăn · ảnh đại diện |
| Khối hồ sơ | **09/11/2026: CHỈ ảnh đại diện tròn 40px + chấm trực tuyến** (bỏ tên người, dòng "Gian hàng · Vai", mũi tên — chúng đã nằm ở thẻ đầu menu). **Rê chuột là mở menu**; bấm / Enter / Space / ↓ cũng mở (không bật-tắt), Esc đóng. Tên truy cập của nút vẫn mang tên người · "Gian hàng · Vai" (không email). Thẻ người dùng trong drawer mobile giữ bấm-để-mở |
| Menu hồ sơ | **06/11/2026 — design `24051:85101`** (`PartnerAccountMenu`, header + drawer mobile; khung chung với menu site khách ở `components/account-menu/AccountMenuParts`). Hai biến thể: **gian hàng tuyến gói** — thẻ nền vàng: logo + **dấu tích xanh** (MỌI gian hàng có, tài khoản cá nhân không — dấu nhận diện, KHÔNG phải kết quả xác minh pháp nhân), tên người · vai, dòng "Gian hàng — tên cửa hàng"; dòng "Quản lý gian hàng" (`/shop`, chỉ khi `useShopSettingsAccess`). **Cá nhân (tuyến hoa hồng)** — thẻ xám: ảnh · tên · vai; dòng "Quản lý cho thuê" = Hồ sơ chủ xe (`/account`, chỉ CHỦ), và "Tài khoản & bảo mật" trỏ `/account?section=login`. Bấm thẻ = Tài khoản & bảo mật. Thành viên của chủ xe cá nhân / tài khoản chưa có gói: chỉ "Tài khoản & bảo mật". Dòng **"Giao diện ☀|☾" dựng sẵn nhưng TẮT** (`PARTNER_THEME_SWITCH_ENABLED`) cho tới khi làm dark mode site partner. Chân: Ngôn ngữ VI|EN · Đăng xuất. **Nhãn tuyến/gói** (`AccountTrackBadge`) của menu cũ **đã bỏ** (người dùng chốt) — gói xem ở Thông tin cửa hàng / Hồ sơ chủ xe › Gói dịch vụ; dòng **"Nâng cấp gian hàng →"** (vàng, icon huy chương — 09/11) chỉ cho CHỦ xe tuyến hoa hồng, trỏ vào phễu nâng cấp có sẵn ở Hồ sơ chủ xe › Gói dịch vụ (`/account?section=plan`); đứng trong nhóm có vạch cùng dòng Giao diện. Site quản trị giữ `useAccountMenuItems` (danh tính · Bảo mật · Ngôn ngữ · Đăng xuất) |
| Số đếm trên menu | **Chỉ số "cần xử lý"** — việc ĐẾN HẠN, không phải thống kê (chốt lại 04/11, thay bản 02/11): **05/11 — "Đơn thuê xe" gộp mang MỘT số = chờ duyệt + lượt giao/trả đến hạn (`RENTALS_WORK`), đỏ khi có cái gấp; hai mô tả dưới đây (Yêu cầu / Quản lý đơn) nay là hai thành phần của số đó.** **Yêu cầu đặt xe** = chờ duyệt, đỏ khi có yêu cầu sắp hết hạn trả lời (`GET /dashboard/requests`, `pendingUrgent`) · **Quản lý đơn thuê xe** = lượt giao + trả hẹn tới hết hôm nay, gồm cả lượt quá giờ, mỗi đơn một lần (`pickupsDue + returnsDue` của `GET /dashboard/today`), đỏ khi có lượt quá giờ — KHÔNG còn đếm mọi đơn chờ giao / đang thuê · **Lịch thuê xe** KHÔNG mang số (trùng với Đơn ⇒ khối "Vận hành" đếm đôi) — ở cả hai tuyến từ 06/11, khi tuyến hoa hồng dùng chung màn Đơn · **Danh sách xe** = số XE có ít nhất một việc chặn: giấy tờ quá hạn, quá hạn bảo dưỡng, bị trả về/từ chối/ẩn khi đăng chợ, thiếu KM trả (chốt 03/11; `VEHICLE_ALERT_NEEDS_ACTION_KINDS`, nguồn `GET /vehicles/needs-action-count` — cùng phép tính với chip trên thẻ xe). Tài xế, Bảo dưỡng **chưa làm** — cần định nghĩa "cần xử lý" trước. Không đếm tổng xe/tài xế |
| Số trên mục cấp 1 | Khi dropdown ĐÓNG, tổng số "cần xử lý" của khối hiện cạnh nhãn khối (khuôn `_Badge` của design) — để yêu cầu đang chờ không bị khuất. Màu CẢNH BÁO thay xám của design (04/11, người dùng chốt): cam = chờ xử lý, đỏ = có mục trễ / sắp trễ; tên truy cập được nói thêm "có việc gấp" để màu không là tín hiệu duy nhất. Áp chung cho huy hiệu sidebar/drawer/tab bar (`NavBadge`) |
| Breadcrumb | Dải dưới header (biến thể Details) chỉ ở **trang con** của một mục (`/vehicles/:id`…) và ở **trang của mục ẩn**: biểu tượng khối › mục menu › `<h1>` của trang |
| Màn hẹp | ≤1536: thu khoảng cách khối phải · ≤1366: bỏ dấu +/− · ≤1280: bỏ biểu tượng mục cấp 1 · ≤1024: menu ngang nhường cho nút mở drawer + thanh tab dưới đáy (cùng cây menu) |
| Mục cấp 1 đang chứa trang hiện tại | **Tô như trạng thái Active** (nền vàng nhạt, chữ vàng đậm — 06/11, người dùng chốt, LỆCH design vốn để thường), kể cả ở trang con (`/bookings/:id`…); `aria-current` = `page` khi đúng trang đích của nhãn khối, `true` khi ở trang khác trong khối |
| Bấm nhãn khối | **Đi tới mục đầu tiên còn hiện của khối** (06/11) — "Vận hành" → "Đơn thuê xe" (nên "Đơn thuê xe" đứng đầu dropdown, trên "Lịch thuê xe"). Rê chuột vẫn mở dropdown; bàn phím: Enter đi, ↓ mở dropdown |

## 3. Sổ theo màn

Mỗi màn: route · node design · trạng thái · tính năng phải có mặt khi xong. Thêm dòng khi nhận design.

| Màn | Route | Design | Trạng thái | Phải có khi xong / ghi chú |
| --- | --- | --- | --- | --- |
| Khung chung: header, menu, breadcrumb | — | `23649:27690`, `23661:22492`, `23661:27362`, `23649:11528` | **Xong** 02/11/2026 | Xem §2 |
| Menu hồ sơ (dropdown khối tài khoản ở header) | — | `24051:85101` | **Xong** 06/11/2026, sửa 09/11 (chỉ ảnh + rê chuột, bỏ bánh răng, thêm Nâng cấp gian hàng) | Xem §2.3 "Menu hồ sơ" / "Khối hồ sơ". Còn: bật dòng Giao diện khi làm dark mode |
| Yêu cầu đặt xe | `/booking-requests` → chuyển tiếp | Request `23649:25560` (02/11) | **Gộp** 05/11/2026 vào "Đơn thuê xe" | Xem §3.1 (thẻ/popup còn hiệu lực), §3.2b |
| Đơn thuê xe (gộp) | `/bookings` (+ `/bookings/awaiting-pickup`, `/booking-requests` chuyển tiếp) | section `23874:79920`: List `23973:51952` · Kanban `23895:15181` · Đơn đã kết thúc `23948:87473` · các bước `23898:28955`. Chi tiết đơn: section `23777:53056` | **List + Kanban xong** 05/11/2026 | Xem §3.2b (List), §3.2c (Kanban), §3.3 |
| Đơn đã kết thúc | `/bookings/ended` | Order Done `23948:87473` | **Xong** 05/11/2026 | Xem §3.2b |
| Đơn thuê xe — tuyến hoa hồng | `/bookings` (`/trips` chuyển tiếp) | dùng chung List/Kanban của gian hàng | **Xong** 06/11/2026 | Xem §2.2 — mặc định List, màn trống riêng |
| Tổng quan doanh thu | `/finance` | section `23857:58927`: Theo xe `23813:30723` · Theo khách `23813:38107` | **Xong** 04/11/2026 | Xem §3.9 |
| Quản lý ví | `/balance` (chỉ CHỦ, cả hai tuyến) · `?tab=activity` | section `23948:93534`: `23813:39558` (bảng tổng hợp giao dịch) · `23813:55449` (biến động số dư) · hộp thêm `23948:96973` · hộp đổi `23948:97512` · toast `23948:98047` | **Xong** 04/11/2026 | Xem §3.10 |
| Lịch sử giao dịch (+ Công nợ) | `/receipts`, `/receipts?view=debts` (`/debts` chuyển hướng) | Thu chi `23857:58928` (danh sách `23813:58308` + 4 hộp) · Công nợ `23874:63125` (danh sách `23857:58932` + 2 hộp) | **Xong** 04/11/2026 | Xem §3.11 |
| Khách hàng | `/customers`, `/customers/[id]` | section `23777:54974` (5 frame) | **Xong** 02/11/2026 | Xem §3.4 |
| Danh sách xe | `/vehicles` (cả hai tuyến) | section `23672:25620`: ít xe `23655:38521` · lưới `23649:29724` · danh sách `23655:36959` | **Xong** 03/11/2026 (danh sách) | Xem §3.5 |
| Chi tiết xe | `/vehicles/[id]` (cả hai tuyến, cả modal hồ sơ xe) | section `23672:25621` | **Xong** 03/11/2026 | Xem §3.6 |
| Chỉnh sửa xe | `/vehicles/[id]/edit` (cả hai tuyến; `/vehicles/[id]/manage/<mục>` cũ chuyển hướng) | section `23731:37932` (13 frame) | **Xong** 03/11/2026 | Xem §3.6 |
| Quản lý tài xế | `/drivers` (cả hai tuyến, cả phiên hỗ trợ) | `23737:45750` (3 frame) | **Xong** 04/11/2026 | Xem §3.7 |
| Danh sách bảo dưỡng | `/maintenance` (cả phiên hỗ trợ) | `23733:41941` | **Xong** 04/11/2026 | Xem §3.8 |
| Chính sách thuê | `/shop/policies` (`?type=motorbike`; `/shop/payment-settings` chuyển hướng tới `#deposit-collection`) | `23874:63907` | **Xong** 06/11/2026 | Xem §3.12 (link "Gói & hạn mức" của P3 trỏ `/shop?section=plan` — đã đúng chỗ) |
| Thông tin cửa hàng | `/shop` (+ thanh toán trong khung `/shop/payment/:id`, `/shop/payment/checkout/:id`) | section `23999:111044` (9 frame) | **Xong** 06/11/2026 | Xem §3.13 — kèm hoá đơn gộp (ADR 0083) và giới thiệu có định dạng |
| Nhân viên & Phân quyền | `/members` (+ `/members/roles`; cả phiên hỗ trợ) | section `24035:71005` (3 frame) | **Xong** 09/11/2026 | Xem §3.14 — ADR 0086 |

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
| 8 | "Nhận xe" (Đang thuê) | ✅ | ~~Mở trang chi tiết~~ — **06/11: mở thẳng hộp "Xác nhận đã nhận lại xe"** (§3.2d), cùng hộp với nút trên trang chi tiết; vẫn một luồng |
| 9 | Thanh tiến độ "Đã đi 60% · còn 1 giờ" · "Giao xe hôm nay · 17:00" · "Đã trả xe đúng hạn" · "Khách đã huỷ / Đã quá giờ giao xe" | 🆕 | Backend bổ sung giờ trả thực tế + lý do huỷ |
| 10 | Ảnh xe, thông số, ảnh khách · Nhắn tin/Gọi/Zalo | 🆕 | Backend bổ sung; liên hệ theo dữ liệu server |
| 11 | Tổng tiền + đã thu/còn nợ · tài xế đã gán · nơi giao + tiến độ chuẩn bị bàn giao | 🟡 | **Chỉ trong trang chi tiết** — chốt 02/11. Khi ráp trang chi tiết phải kiểm đủ ba thứ này ở đó |
| 12 | "Gia hạn" trên thẻ dài hạn đang thuê + hộp "Gia hạn thuê xe" + "Thanh toán" (`23807:68543`, `23807:70054`) | ✅ | **Đã dựng 02/11 theo ADR 0077 (Accepted)**: `ExtendBookingDialog` mở từ thẻ (cần `bookings.update`, ẩn trong phiên hỗ trợ) và từ khối "Phụ lục gia hạn" ở trang chi tiết. Lệch design có chủ đích: chỉ +1/2/3/6/9/12 tháng (không +7/+15 ngày); hộp phí tách "chuyển qua XePrime" / "trả thẳng chủ xe" / thuế / phần về Ví điểm + "Miễn phí nền tảng"; màn Thanh toán chỉ có VietQR (không "Ví điện tử" — ADR 0058 chưa mở), nút trái "Huỷ gia hạn", nút phải "Xong" — **không** có "Xác nhận/khách đã chuyển": phụ lục tự lật khi SePay đối soát đủ. Thẻ giữ CẢ "Gia hạn" lẫn "Nhận xe" (design đổi chỗ — nhận xe về vẫn là việc thường ngày). Khách thấy QR ở trang chuyến đang thuê (`TripExtensionPanel`). Chỉ đơn đặt qua chợ (có tài khoản khách) — đơn tự lập ngoài chợ sửa lịch như cũ |
| 13 | Chip "Thuê xe dài hạn" màu hồng | ✅ | Token `--xp-color-pink*` (02/11) |
| 14 | Popup "Tạo đơn thuê → Chọn xe" (`23754:22405`) | 🆕 | Chờ đủ các bước của luồng tạo đơn rồi ráp một lượt (chốt 02/11) |

Tự dựng thêm (design không vẽ): ngăn rỗng / lỗi tải từng nhóm / lỗi cả màn; đơn quá giờ trả (thanh đỏ,
"Quá giờ trả xe …"); trả trễ ("Trả xe trễ hạn"); chờ giao chưa tới ngày ("Giao xe dd/mm · hh:mm");
điện thoại (cột trái thành hàng cuộn ngang, nút cao 44px). "Xử lý giao xe" mở trang chi tiết
đơn; hộp "Sẵn sàng giao xe" CHỈ mở khi bấm nút xác nhận trên trang (03/11 — bỏ lời mời
`?handover=` mở sẵn hộp; tham số đó trên link cũ giờ bị bỏ qua). "Nhận xe" mở thẳng hộp "Xác nhận đã
nhận lại xe" ngay trên thẻ (06/11, §3.2d). Link cũ
`/bookings?status=…` được quy về ngăn tương ứng. `BookingTable` (bảng cũ) đã gỡ.

### 3.2b "Đơn thuê xe" gộp + "Đơn đã kết thúc" — dạng LIST (05/11/2026)

Design: section `23874:79920` (List `23973:51952`, Kanban `23895:15181`, Order Done `23948:87473`, các
bước `23898:28955`: Phê duyệt `23898:25444` · Từ chối `23919:39682` · Huỷ khi chờ thanh toán
`23930:44688` · toast duyệt xong `23930:42529` · Nhận xe `23941:65305` · Gia hạn `23941:62236`).

Code: `features/bookings/components/BookingsListView` (màn gộp) · `BookingHistoryView` (đã kết thúc) ·
khung thẻ chung `rental-card/RentalCard` dùng cho CẢ `BookingRequestCard` (nhóm 1–2) lẫn `BookingCard`
(nhóm 3–4) · `constants/rental-stages.ts` (bốn nhóm) · `rentals-redirect.ts` (link cũ). Backend:
`GET /booking-history` (module `booking-history`, SQL gộp hai bảng xếp theo lúc kết thúc),
`POST /booking-requests/:id/remind-payment`, `GET /booking-requests?sort=urgent`, ba dòng tiền
(`customerTotalAmount`, `holdPaidAmount`, `payAtPickupAmount`) lên DTO danh sách đơn, tìm đơn theo tên xe
/ biển số. Chốt với người dùng 05/11: **làm list trước, kanban đợt sau**.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Cột trái: Tất cả · Cần xử lý · Chờ khách thanh toán · Chờ giao xe · Đang thuê + số đếm | ✅ | Hai nhóm đầu đọc YÊU CẦU, hai nhóm sau đọc ĐƠN; số đếm từ server của cả hai thực thể (một truy vấn một-dòng khi đang xem nhóm của thực thể kia). Thiếu quyền của thực thể nào thì nhóm đó vắng |
| 2 | Ô "Tất cả": bốn nhóm, mỗi nhóm 3 chuyến + "Xem tất cả (n)" | ✅ | Nhóm yêu cầu xếp theo hạn đang chạy (`sort=urgent`), nhóm đơn theo thứ tự ca trực của server |
| 3 | Dải tiêu đề nhóm "6.250.000 đ" (tổng tiền) | — | **Bỏ** (chốt 05/11): hai nhóm yêu cầu chưa lưu giá — phải báo giá từng yêu cầu khi đếm, và chỉ là tạm tính |
| 4 | Nút "Đơn đã kết thúc (n)" + "Tạo đơn thuê" | ✅ | n = đơn hoàn thành + huỷ + yêu cầu không thành đơn, cùng bộ lọc; link mang theo tìm kiếm/chi nhánh/dịch vụ |
| 5 | Nút chuyển List/Kanban · câu "Chỉ kéo được sang bước tiếp theo" | ✅ | Có từ đợt kanban — xem §3.2c |
| 6 | Thẻ: MỘT khuôn cho bốn nhóm (xe · khách · ô lịch · ô tiền) | ✅ | Dải đầu nhóm yêu cầu KHÔNG có `#DH…` (yêu cầu chưa có mã — §3.1 dòng 3) mà là "Gửi lúc"; bấm vào thẻ (chỗ trống) mở chi tiết; mã / "Gửi lúc" là lối vào bằng bàn phím |
| 7 | Ô tiền thẻ đơn | ✅ | Đơn qua chợ: tiền thuê · khách trả · đã giữ chỗ · trả chủ xe khi nhận xe. Đơn tự lập: tiền thuê · đã thu · còn phải thu |
| 8 | "Giữ chỗ · Chưa thanh toán" chép ở cả bốn cột | ⚠️ | Đổi nhãn theo chặng (ADR 0044): dự kiến (chưa duyệt) · chờ khách trả · đã giữ chỗ |
| 9 | Đồng hồ "59:39" ở nhóm Chờ giao xe | ⚠️ | Chặng này không có hạn chót ⇒ câu "Giao xe hôm nay · 17:00" / "Quá giờ giao xe" / "Giao xe 07/11 · 10:00" |
| 10 | Nhóm Chờ khách thanh toán: đồng hồ "Chờ thanh toán" + Huỷ chuyến + **Nhắc khách** | 🆕→✅ | Nhắc khách = thông báo app/web (không SMS), khoảng lặng 15′ tính từ lời nhắc GẦN NHẤT khách nhận (lúc có QR, hai mốc worker, lượt bấm trước), chặn ngay trong câu UPDATE; audit `booking_request.remind_payment`. Trong khoảng lặng nút mờ kèm giờ mở lại. Phiên hỗ trợ không có nút |
| 11 | Hộp Phê duyệt (2 cột + Lợi nhuận chuyến + ô ghi chú + đồng hồ) | ✅ | Lệch có chủ đích: cửa sổ thanh toán ĐỘNG do server tính; huỷ miễn phí tính từ lúc khách TRẢ ĐỦ (ADR 0072); thuế/hoa hồng đọc bảng cộng ví chung (`OwnerPayoutTable`); không có "Chỉnh sửa thông tin khách" (ADR 0060). Dài hạn vẫn đi hộp CHỐT LỊCH riêng |
| 12 | Duyệt xong → toast (thay hộp kết quả cũ) | ✅ | Có QR: "khách có đến {hạn} để thanh toán"; không thu: đơn có ngay + "Xem chi tiết đơn". Bỏ "Nhắc khách" trong toast — khách vừa nhận QR, server sẽ từ chối (khoảng lặng) |
| 13 | Hộp Từ chối: chọn lý do + ghi chú cho khách (bắt buộc) | ✅ | Backend giữ MỘT câu `reason`: chọn lý do là điền sẵn câu mẫu để sửa tiếp |
| 14 | Hộp Huỷ khi chờ thanh toán: nhóm lý do + ghi chú (bắt buộc) + ô đỏ "trừ điểm uy tín" | ✅ | Kèm câu hoàn tiền đã chuyển; dấu "i" giải thích chỉ số |
| 15 | "Xử lý giao xe" / "Nhận xe" | ✅ | "Xử lý giao xe" giữ đường 03/11: mở TRANG chi tiết (Chuẩn bị bàn giao + popup sẵn sàng) — ở CẢ List lẫn Kanban (chốt 05/11). **"Nhận xe" đổi 06/11**: mở thẳng hộp "Xác nhận đã nhận lại xe" (`23941:65305`) ở CẢ List lẫn Kanban — xem §3.2d (thay quyết định "không dựng" của 05/11) |
| 16 | Gia hạn +7/+15 ngày (`23941:62236`) | ⚠️ | Giữ `ExtendBookingDialog` (chỉ +tháng — ADR 0077) |
| 17 | Làm mới nền 30 giây khi tab đang mở | 🆕 | Thẻ tự sang "Chờ giao xe" khi tiền về; làm mới nền không làm mờ/khoá thẻ đang đọc |
| 18 | Menu: hai mục → MỘT "Đơn thuê xe" | ✅ | Huy hiệu `RENTALS_WORK` = chờ duyệt + lượt giao/trả đến hạn (đỏ khi có cái gấp); tuyến hoa hồng dùng cùng huy hiệu từ 06/11 (§2.2). Tab mobile gian hàng: Tổng quan · Lịch xe · Đơn thuê · **Xe** |
| 19 | "Đơn đã kết thúc": Tất cả · Hoàn thành · Đã huỷ · **Không thành đơn** | ✅ | Chốt 05/11: thêm ngăn riêng cho yêu cầu không thành đơn; "Tất cả" gộp hai bảng ở SERVER. Kết cục do server suy (khách huỷ / bạn huỷ / khách không đến / bạn từ chối / quá hạn phản hồi / khách rút / hết hạn thanh toán / xe đã có khách khác nhận / bạn huỷ khi chờ thanh toán). Ô "Trạng thái" mời kết cục của ngăn đang mở. Dòng đơn mở trang chi tiết; dòng yêu cầu mở popup chi tiết yêu cầu (chỉ đọc) |
| 20 | "Xuất Excel" | — | **Ẩn** (chốt 05/11) — chưa làm |

Tự dựng thêm: rỗng từng nhóm / rỗng cả màn / lỗi từng nhóm; khổ hẹp (dải đầu: đồng hồ một dòng, nút chia đều cao 44);
không quyền xem cả hai thực thể ⇒ câu riêng. Link cũ: `/booking-requests?status=…` → nhóm; `?status=closed` →
"Không thành đơn"; `/bookings?preset=completed|cancelled`, `?status=completed|cancelled|no_show` → "Đơn đã kết thúc".

### 3.2c "Đơn thuê xe" — dạng KANBAN (05/11/2026)

Design: Kanban `23895:15181` · các bước `23898:28955` (Step 1 duyệt → toast, Step 3 toast "Ghi nhận thanh
toán", Step 4 nhận xe / gia hạn). Code: `features/bookings/components/board/RentalsBoard` (DnD `@dnd-kit/core`)
· `board/RentalsViewToggle` · luật thả `features/bookings/rentals-board-rules.ts` · dạng xem
`hooks/use-rentals-view.ts` + `lib/rentals-view-memory.ts` · toast tiền về `hooks/use-payment-arrival-toast.tsx`.
Thẻ: CÙNG `BookingRequestCard` / `BookingCard` (cùng hành động, quyền, hộp thoại với List) nhưng khung RIÊNG
`rental-card/RentalBoardCard` dựng theo số đo "_Kanban Item" (`23895:15196`, `23895:15208`): dải đầu ⋮⋮ · mã ·
viên dịch vụ phải; xe ảnh 76×48 + biển số và thông số một dòng; nét đứt; khách ảnh 32 + ba nút liên hệ; ô lịch
nền xám (nhận · trả · hình thức nhận, dài hạn thêm gói); MỘT hàng tiền (Khách trả · Trả khi nhận xe · Giữ chỗ
với viên Dự kiến / Chưa thanh toán / Đã thanh toán theo chặng ngay dưới số — đơn tự lập: Khách trả · Đã thu ·
Còn phải thu; dòng 12); thanh tiến độ 8px; chân thẻ đồng hồ nghiêng trái, nút phải. Sửa 05/11 sau phản hồi
"xấu hơn design": bản đầu dùng lại khung List co hẹp. Thẻ Kanban KHÔNG mang (vẫn ở List + chi tiết): "Xem lịch
xe", nhãn "Khách hàng", dòng thời lượng thuê, mốc "Đã xử lý lúc", dải thông tin thêm. Cái cần biết khi quyết
định vào ⓘ: cạnh tên khách (rủi ro — ⓘ đỏ, khách quen, ghi chú, SĐT tài khoản/email, chưa có hồ sơ) và cạnh
"Hình thức nhận xe" (địa chỉ giao + câu phí giao, lộ trình/điểm đón/điểm đến có tài xế).

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Bốn cột Cần xử lý · Chờ khách thanh toán · Chờ giao xe · Đang thuê | ✅ | Mỗi cột một truy vấn CUỘN VÔ HẠN (`useInfiniteQuery`, 10 thẻ/trang, server-side), cùng bộ lọc, thứ tự tự nhiên của server; gộp trang bỏ trùng. Thiếu quyền của thực thể nào thì cột đó vắng. Không có cột trạng thái trái, không có ô sắp xếp |
| 2 | Tổng tiền đầu cột | — | Bỏ (như §3.2b dòng 3) |
| 3 | Kéo thả thật | ✅ | Chốt 05/11: **1→2** mở hộp Phê duyệt; **3→4** mở trang chi tiết để giao xe (y nút "Xử lý giao xe"); **2→3 KHOÁ** (đơn chỉ ra đời khi đối soát đủ tiền — ADR 0044), kéo qua thì cột hiện câu giải thích; nhảy cóc / đi lùi không làm gì. Thả KHÔNG đổi trạng thái — thẻ ở nguyên cột cho tới khi server xác nhận, bấm Huỷ là thẻ vẫn đó. Không sắp xếp tay trong cột |
| 4 | Tay nắm ⋮⋮ | ✅ | Chỉ ở thẻ có bước kế mà người xem làm được: yêu cầu còn hạn phản hồi + quyền duyệt; thẻ chờ thanh toán + quyền duyệt (để thấy cột kế bị khoá); thẻ chờ giao + quyền bàn giao, ngoài phiên hỗ trợ. Thẻ Đang thuê là cột cuối — không có tay nắm (nhận xe bằng nút) |
| 5 | Bàn phím + trình đọc màn hình | 🆕 | Space/Enter nhấc · ←/→ nhảy thẳng sang cột kế · Space/Enter thả · Esc huỷ; lời thông báo tiếng Việt/Anh |
| 6 | Câu "Kéo thả thẻ để cập nhật trạng thái" ở phụ đề | ⚠️ | Giữ phụ đề chung (kéo chỉ MỞ hộp xác nhận); dòng "⋮⋮ Chỉ kéo được sang bước tiếp theo" cạnh nút chuyển dạng xem, chỉ ở Kanban và chỉ khi có thẻ kéo được |
| 7 | Nút chuyển Kanban / List | ✅ | Chốt 05/11: `?view=` thắng; không có thì lựa chọn GẦN NHẤT của trình duyệt (`localStorage`); chưa chọn bao giờ ⇒ Kanban. Điện thoại (≤640px) LUÔN List, không có nút; tablet cuộn ngang các cột (cột ≥320px để thẻ 294px giữ dòng "Thời gian" một hàng). Chốt 10/11: mỗi cột tự cuộn danh sách thẻ, cột cao gần trọn khung nhìn dưới header dính ⇒ cuộn trang (ngoài cột, hoặc hết cột thì cuộn lan ra trang) đẩy phần tiêu đề + bộ lọc đi để bảng chiếm cả màn. Lề phải cột 16 chứa thanh cuộn (không ăn bề rộng thẻ); thanh mờ khi đứng yên, rõ dần khi cuộn, mờ chậm khi dừng. Thẻ hẹp dưới ~291px (cột ở màn ~1280) thì nhãn "Thời gian"/"Điểm đón" lên trên, giá trị xuống dưới để kỳ thuê vẫn một hàng. Dải tab trạng thái (và mọi `StatusRail`/`SegmentedTabs`/`QueueRail` ở màn hẹp) cuộn được bằng con lăn và kéo chuột, tab đang chọn tự trượt vào khung, mép còn tab khuất thì mờ dần (`useHorizontalScroll`) |
| 8 | Toast "Ghi nhận thanh toán" (Step 3) | 🆕→✅ | Chốt 05/11, cho CẢ List lẫn Kanban, chỉ ở trình duyệt: một truy vấn nền theo dõi tối đa 100 yêu cầu `awaiting_hold`; yêu cầu rời nhóm ⇒ hỏi server, chỉ `converted_to_booking` mới có toast "Khách đã thanh toán cho đơn hàng #…" + "Xem đơn hàng" (cần `bookings.view`); lần tải đầu chỉ ghi mốc; hết hạn/huỷ thì im |
| 9 | Đồng hồ "59:39" / "1d 12:09" ở chân thẻ | ⚠️ | Cột 1–2: đồng hồ hạn của chặng, nhãn chỉ cho trình đọc màn hình. Cột 3–4: câu tình trạng như List (không có hạn chót ở chặng chờ giao) |
| 10 | Hộp Nhận xe trong Kanban (`23941:65305`) · Gia hạn +7/+15 ngày | ✅ / ⚠️ | Hộp Nhận xe đã dựng 06/11 (§3.2d). Gia hạn: như §3.2b dòng 16 |
| 11 | Chuyến kẹt ở một cột (rà luồng 05/11, ADR 0081) | 🟡→✅ | Chốt 05/11, áp cho CẢ List lẫn Kanban — design không vẽ, dựng theo ngôn ngữ thẻ: (a) "Cần xử lý" / "Chờ khách thanh toán" không còn thẻ đã chết theo đồng hồ (server lọc theo mốc, huy hiệu menu đếm cùng điều kiện); (b) thẻ "Chờ giao xe" đã qua ân hạn mà chưa giao có nút **"Khách không đến"** cạnh "Xử lý giao xe" (mở cùng hộp với trang chi tiết); quá cả giờ trả mà chưa xác nhận giao thì câu đỏ "Quá cả giờ trả xe (…) — chưa xác nhận giao xe"; (c) thẻ "Đang thuê" khách đã báo trả xe nói "Khách báo đã trả xe · … — tự hoàn thành …" thay cho "Quá giờ trả"; trang chi tiết có khối cảnh báo + nút **"Khách chưa trả xe"**; (d) hộp Phê duyệt (theo ngày và dài hạn) cảnh báo "Xe chưa về từ chuyến #… — đã quá giờ trả …" kèm link chuyến đang trễ. Gia hạn trên thẻ quá giờ trả: giữ như cũ — chỉ đơn dài hạn qua chợ (ADR 0077), đơn theo ngày không có phụ lục gia hạn |
| 12 | Lưới tiền ba cột + hàng "Giữ chỗ" riêng (design) | ⚠️ | Chốt 05/11 theo phản hồi "text tràn": bỏ ô **Tiền thuê** trên thẻ Kanban (còn ở thẻ List, popup và trang chi tiết), gộp Giữ chỗ + viên trạng thái lên CÙNG hàng với Khách trả · Trả khi nhận xe; ô rộng theo nội dung, thẻ quá hẹp thì ô cuối xuống hàng. Chân thẻ: câu tình trạng không vừa cùng hàng với nút (câu dài, hoặc hai nút "Khách không đến" + "Xử lý giao xe") thì cụm nút xuống hàng dưới, canh phải — không bóp câu thành cột chữ |

Tự dựng thêm: cột trống (câu của chặng) · lỗi từng cột (thử lại) · tải thêm / lỗi tải thêm · lỗi cả bảng · lọc
không ra gì ⇒ một câu chung + "Xoá bộ lọc" · làm mới nền 30 giây TẮT trong lúc đang cầm thẻ · bóng thẻ gọn khi
kéo · cột nhận được viền gold + câu nổi "Thả vào đây để…", cột khoá viền xám, cột khác mờ.

### 3.2e Thẻ gọn mở/thu + bố cục điện thoại (10/11/2026)

Design: "Rental Request - MB" `24117:65745` — dải tab `24117:67234`, thẻ mở `24117:72641`, thẻ thu
gọn `24117:72841`. Người dùng: "trên PC sửa cái card là chủ yếu, bấm mũi tên hiện thêm thông tin,
đóng để thu gọn như collapse của AntD; responsive cho web mobile như design". Code: khung
`rental-card/RentalBoardCard` (dùng cho CẢ cột Kanban trên PC lẫn danh sách trên điện thoại) ·
`BookingsListView` (điện thoại ⇒ thẻ gọn) · `components/navigation/StatusRail.module.css` (dải tab ≤1024).

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Dải đầu hai hàng: (⋮⋮ · mã \| viên trạng thái) rồi (viên dịch vụ \| số vàng 16/600) | ✅ | Số vàng = **Khách trả** (chốt 10/11 — đúng design) |
| 2 | Viên "Chưa cọc" ở góc phải dải đầu | ⚠️ | Chốt 10/11: viên mang trạng thái GIỮ CHỖ theo chặng — Dự kiến · Chưa thanh toán (đỏ như design) · Đã thanh toán (ADR 0044 điều 9 cấm gọi là "cọc"). Đơn tự lập không có viên. Ô "Giữ chỗ" của hàng tiền chỉ còn số |
| 3 | Mũi tên ở hàng xe mở/thu **khối khách + hàng tiền** (design bản 2, 10/11) | 🆕→✅ | Chốt 10/11: **mặc định thu gọn**, mỗi thẻ nhớ riêng trong lúc ở trên màn (không lưu qua lần tải lại). Thu: tròn xám, mũi tên xuống; mở: nền primary-low, mũi tên lên. Trượt chiều cao như AntD Collapse; lúc thu thì vùng đó `inert`. Nút có `aria-expanded` + nhãn "Xem / Thu gọn thông tin khách và tiền chuyến". Nét đứt giữa khách và hàng tiền |
| 4 | Hàng tiền ba ô có vạch ngăn, canh giữa, số 14/500 | ✅ / 🟡 | Chốt 10/11 (đối chiếu bảng cộng ví của Mioto, người đọc là chủ xe): **Giữ chỗ · Thu khi giao xe · Cộng ví** — giữ chỗ + thu khi giao xe = số vàng; cộng ví = `D − T` XePrime ghi vào Ví điểm khi chuyến xong. Bỏ ô "Khách trả" lặp số vàng. API: `ownerPayableAmount` lên `BookingListItemDto` (snapshot) và `BookingRequestPricingDto` (tạm tính / hold / đơn) — chỉ realm partner (ADR 0064 điều 11). Chuyến không thu online: không ô giữ chỗ, không cộng ví. Đơn tự lập: Đã thu · Còn phải thu. Ô rộng theo chữ rồi chia đều phần dư |
| 5 | Tên xe 14/600, biển số nền gray-50 không viền | ✅ | Theo design |
| 6 | Ô lịch LUÔN hiện: "Nhận xe" nhận → trả MỘT dòng + "Địa chỉ nhận" | ✅ / 🟡 | Nhãn trái, giá trị canh phải. Nhãn đổi **"Thời gian"** (chốt 10/11). Thẻ hẹp hơn design (cột Kanban trên màn ≤1440, nội dung thẻ <310px) không chứa nổi bản đầy đủ ở cỡ 14 dù bớt hết đệm (đo: nhãn 57 + khung giờ 215 > 270) ⇒ ở đó **ẩn phần thứ** ("03/11 21h00 → 04/11 10h00") và bớt đệm ngang: thẻ 16→12, ô lịch 12→8, nhãn–giá trị 12→6 (container query trên vỏ thẻ — ngưỡng 362px; `fmt.rentalPointParts`). Đã thử chuỗi chữ số rộng nhất ở thẻ hẹp nhất 294px: vẫn một dòng; điện thoại giữ bản có thứ. Địa chỉ gọn **bỏ cả chữ "Phường/Xã/Thị trấn/Đặc khu"** (`shortAddress`; giữ khi tên là số — "Phường 5"), dài quá thì chỉ xuống dòng ở dấu phẩy. Design bỏ dòng "Hình thức nhận xe" ⇒ chốt 10/11: **nhãn theo hình thức** — "Giao xe tới" (địa chỉ khách) · "Điểm đón" (có tài xế) · "Nhận tại" (khách tự tới: địa chỉ chi nhánh giữ xe, rơi về hồ sơ gian hàng — `pickupPointAddress` mới trên cả hai DTO, quy tắc chung `pickupPointAddressOf` với trang xe công khai). Địa chỉ cắt tỉnh/TP khi nhận ra được (`addressWithoutProvince` ở `@xeprime/domain`, cả tỉnh lặp hai lần và tên trước sáp nhập); bản đầy đủ + phí giao + lộ trình vào ⓘ. Dài hạn thêm dòng Gói; dài hạn chưa duyệt: Gói + Nguyện vọng |
| 7 | Điện thoại: thẻ gọn thay thẻ List | ✅ | ≤640px danh sách vẽ bằng `RentalBoardCard` (không tay nắm — điện thoại vẫn không có Kanban, §3.2c dòng 7). Máy tính dạng List giữ thẻ `RentalCard` cũ |
| 8 | Dải tab Cần xử lý · Chờ thanh toán · Chờ giao xe · Đang thuê xe | ✅ / 🟡 | Kiểu design (nền gray-50, tab chọn nền trắng viền gray-300, chấm 6, chữ 14/600). Chốt 10/11: **giữ tab "Tất cả" đầu tiên + số đếm** (design không vẽ — không bỏ tính năng). Áp cho mọi bề ngang ≤1024 (dải cột trái đã thành hàng ngang từ mốc đó) |
| 9 | Màu viên dịch vụ của design mới (có tài xế hồng · dài hạn tím) | ⚠️ | **Chưa đổi** — `ServiceTypeChip` dùng chung với thẻ List, Đơn đã kết thúc, chi tiết (có tài xế cam · dài hạn hồng, design 02/11). Chờ người dùng chốt có đổi đồng loạt không |
| 10 | Thẻ siêu gọn ẩn trong frame (`24117:69914`: mã · viên · mũi tên / tên xe · đồng hồ / giá) | — | Nằm ngoài khung 390 và các khối đều `hidden` — coi là bản nháp, không dựng |

Không đổi: hành động, quyền, hộp thoại, kéo thả, đồng hồ/câu tình trạng ở chân thẻ, ⓘ cạnh tên khách
(trong phần thu gọn) và ⓘ của dòng địa chỉ.

**Việc cho app Partner (dev mobile làm sau — chưa ai nhận):** màn Đơn thuê của `apps/mobile/manage`
theo cùng frame `24117:65745` (bản 2, 10/11) và các quyết định 1–4, 6, 8 ở trên: dải tab chặng (giữ
"Tất cả" + số đếm), thẻ gọn mặc định thu, mũi tên mở/thu khối khách + hàng tiền, ô lịch luôn hiện
(nhận → trả một dòng, địa chỉ nhãn theo hình thức, cắt tỉnh bằng `addressWithoutProvince`), viên
trạng thái giữ chỗ theo chặng (không chữ "cọc"), số vàng = khách trả, hàng tiền Giữ chỗ · Thu khi giao
xe · Cộng ví (`ownerPayableAmount`). API đã có đủ trường (`pickupPointAddress`, `ownerPayableAmount`)
— bản `apps/mobile/shared/src/api` cần cập nhật kiểu (ADR 0031). Nhãn dùng chung namespace
`Bookings.board.kanban` (`expand` / `collapse`, `money.*`, `schedule.*`, `holdState.*`). Ghi nợ ở
`docs/mobile-module-status.md` §3.1.

### 3.2d Hộp "Xác nhận đã nhận lại xe" (06/11/2026)

Design: thu gọn `23941:64008` · mở rộng `23941:65305` (rộng 556 — **nới lên 720** (`size="lg"`)
theo phản hồi 06/11 "to hơn cho thoáng, đỡ dài"). Code:
`features/handovers/components/ConfirmReturnDialog` — mở từ nút "Nhận xe" ở thẻ (List + Kanban, host ở
`BookingsListView`) và từ nút "Xác nhận đã nhận xe" ở trang chi tiết (`BookingDetailActions`). Backend:
`POST /bookings/:id/settlement/return-preview` (xem trước, không ghi) + `ConfirmHandoverDto.surcharges` /
`collectPayment` (chỉ chiều trả, cần `payments.record`). `ConfirmHandoverDialog` chỉ còn chiều giao.

Chốt với người dùng 06/11: **bấm Xác nhận là coi như đã thu tiền** — ô "Đã thu tiền" BẬT SẴN, bỏ tick là
chưa thu; chỉ áp cho hộp NHẬN lại xe (giao xe giữ như cũ); có ô chọn hình thức thu; phụ phí lưu cùng lượt
xác nhận; hộp mở thẳng từ thẻ.

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề "Xác nhận đã nhận lại xe #mã" + phụ đề · thẻ xe (ảnh, tên, biển số, "Hẹn trả …", viên "Đúng giờ") | ✅ | Viên đổi "Trễ {thời lượng}" (đỏ) khi giờ nhận thực tế sau giờ hẹn |
| 2 | "Thời gian nhận thực tế" + câu "Đúng giờ" | ✅ | **Chốt lại 06/11 (người dùng):** mặc định = lúc khách báo "Đã trả xe" (ADR 0081) nếu có, không thì **giờ hẹn trả trên đơn** (như chiều giao); giờ hẹn còn ở tương lai ⇒ bây giờ. Nút chữ cạnh nhãn **bật qua lại**: đang ở giờ hẹn ⇒ **"Hiện tại"** (về bây giờ); đã lệch giờ hẹn ⇒ **"Đúng giờ"** (về lại giờ hẹn — chỉ khi giờ hẹn đã qua) — thay bản đầu (mặc định bây giờ). Hệ quả đã biết: xe về trễ mà người nhận không bấm "Hiện tại" / không sửa giờ thì hộp báo "Đúng giờ" và không gợi ý phí quá giờ. Không chọn được ngày tương lai; trễ ⇒ viên + câu đỏ "Trễ … so với giờ hẹn" |
| 3 | "Chỉ số Odo (km)" + "Lúc giao: … Đã chạy …" | ✅ | Tuỳ chọn; nhỏ hơn số lúc giao ⇒ câu đỏ ngay dưới ô (server vẫn chặn `HANDOVER_ODOMETER_BELOW_PICKUP`); không có số lúc giao ⇒ KM hệ thống / "không bắt buộc". **Thêm** (design không vẽ): KM thấp bất thường ⇒ cảnh báo + "Số Odo đúng, vẫn xác nhận" (`acknowledgeSuspicious`) — hộp cũ không có lối này |
| 4 | Vùng "Tình trạng, ảnh & ghi chú" · "Không bắt buộc" · "x/N ảnh" — thu gọn sẵn | ✅ | Tự mở khi server có gợi ý quá giờ / vượt km hoặc đã có dòng phụ phí; người dùng bấm thì lựa chọn của họ thắng. N = bộ góc của loại xe (ô tô 5, xe máy 3). **06/11:** người dùng tự đổi giờ nhận (ô giờ, nút Hiện tại / Đúng giờ) thì vùng GIỮ trạng thái đang thấy — không tự bung vì gợi ý quá giờ vừa hiện |
| 5 | "Tình trạng xe": hai ô chọn | ✅ | Bấm lại ô đang chọn là bỏ chọn (tuỳ chọn) |
| 6 | "Ảnh hiện trạng & Odo" — lưới 3 cột | ✅ | Hộp rộng 720 ⇒ mọi góc trên MỘT hàng (`HandoverPhotoGrid variant="row"`, như trang chi tiết) thay cho 3 cột hai hàng — tải ngay vào biên bản trả (presign → R2), cùng luật ảnh với trang; cần `handovers.manage`, thiếu thì chỉ xem |
| 7 | Ghi chú | 🟡→✅ | Design không vẽ ô (tiêu đề có "ghi chú") — ô ghi chú ở cuối vùng, như hộp cũ |
| 8 | "Phụ phí phát sinh": dòng Loại + Số tiền + ✕, "Thêm phụ phí" | ✅ | Ghi CÙNG transaction với biên bản (`SettlementService.addSurchargesWithinTx`); lý do = tên loại (hoặc câu công thức khi lấy từ gợi ý) — sửa câu chi tiết ở thẻ "Phát sinh". Danh mục theo luật cũ (ADR 0075: đơn có tài không có quá giờ / vượt km; một-khoản không trùng). Khoản đã ghi trước đó hiện chỉ-đọc. Tối đa `RETURN_SURCHARGE_DRAFT_MAX` = 10 dòng. Dòng thiếu số tiền chặn gửi. Cần `payments.record` — thiếu thì cả khối ẩn |
| 9 | Gợi ý quá giờ / vượt km | 🆕→✅ | Design không vẽ — server tính theo giờ và Odo ĐANG nhập (`return-preview`), một dòng gợi ý + "Thêm" |
| 10 | Khối tiền: cọc đã nhận · phụ phí phát sinh · đề xuất hoàn cọc | ✅ | Số của SERVER (`return-preview`, ADR 0007) — các khoản nháp cộng vào như đã ghi. Câu "chủ xe hoàn cọc ngoài hệ thống, đánh dấu ở thẻ Phát sinh" (hộp cũ là Alert) chuyển vào ⓘ cạnh "Đề xuất hoàn cọc". Đánh dấu ĐÃ hoàn cọc vẫn ở thẻ Phát sinh |
| 11 | Ô "Đã thu {số} của khách" + hình thức thu | 🆕→✅ | Số = `collectableAmount` = công nợ (gồm phụ phí vượt cọc) trừ `D` đã ở XePrime (`counterDueAmount`, cùng phép với dòng "Thu tiền thuê" của Chuẩn bị bàn giao). Bật sẵn; nộp đúng số đang hiện, server tính lại trong transaction (khoá dòng đơn) — lệch ⇒ 409 `HANDOVER_COLLECT_AMOUNT_CHANGED` kèm số mới, không ghi gì. Ghi qua `BookingPaymentWriter` (lõi chung với hộp Thu tiền), `paidAt` = giờ nhận thực tế, audit `via: return_confirm`. Ẩn khi không còn gì phải thu, thiếu `payments.record`, hoặc gói không có Thu chi (tuyến hoa hồng). Bỏ tick ⇒ câu "đơn hoàn thành với khoản còn nợ …, thu sau bằng nút Thu tiền" |
| 12 | Chân hộp "Hủy" · "Xác nhận đã nhận xe" | ✅ | Nút xác nhận chờ khi số tiền đang được tính lại (ô thu tiền không nộp số cũ) |

Tự dựng thêm: đang tải (khung xương) · lỗi tải ngữ cảnh (thử lại) · lỗi tính quyết toán (cảnh báo + thử lại,
nút chờ nếu có ô thu tiền) · ảnh xe trống · điện thoại (một cột, dòng phụ phí xuống hàng, nút chia đều).
Cảnh báo "Có thông tin chưa bổ sung" của trang chi tiết không còn chạy ở chiều nhận — hộp đã đếm ảnh.

### 3.3 Chi tiết đơn thuê — kiểm kê và quyết định (02/11/2026)

Design: Waiting `23768:29928` · Waiting/Driver `23807:73143` · hộp "Thông tin khách hàng" `23777:49485` ·
hộp "Thu tiền đơn" `23777:52010` · Current `23777:48710` · Done `23777:52626`.

Chốt với người dùng: **giữ toàn bộ tính năng, sắp xếp hợp lý; chỗ design chưa vẽ thì tự dựng trong
ngôn ngữ design.**

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Header: mã + chip trạng thái + "Tạo lúc"; "Xem hợp đồng" · "Lịch sử thu tiền" · "Thu tiền" | ✅ | Chưa có hợp đồng ⇒ nút "Tạo hợp đồng" (đường cũ). "Thu tiền" giữ cổng gói (ADR 0028 7A) |
| 2 | Stepper Đã xác nhận → Chờ giao → Đang thuê → Hoàn thành | 🆕 | **05/11 — theo "Details - Failed" `23948:99504`:** đơn huỷ / khách không đến KHÔNG có thanh bước; viên tiêu đề nói ai huỷ ("Khách hàng đã huỷ" / "Bạn đã huỷ"); banner "Đơn hàng đã huỷ. Lý do: {nhóm lý do — câu gửi khách}" (API thêm `cancellationReasonCategory`, `cancellationReason`) |
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
| 16 | Popup "Sẵn sàng giao xe" thay hộp xác nhận cũ | 🟡 | Chốt 03/11: khung design + ô **Odo** (tuỳ chọn) + vùng "Thêm thông tin" thu gọn (giờ thực tế, tình trạng, ghi chú, link phát sinh khi nhận). Ảnh bỏ khỏi popup (đã chụp trên trang). ~~Nhận xe dùng cùng khuôn "Sẵn sàng nhận lại xe"~~ — **06/11: nhận xe có hộp riêng** "Xác nhận đã nhận lại xe" (§3.2d); popup "Sẵn sàng" chỉ còn cho giao xe, cảnh báo "còn thiếu" của trang cũng chỉ còn ở chiều giao |
| 17 | "Lợi nhuận chuyến" thêm dòng "XePrime hoàn về ví (C)" | ⚠️ | Chốt 03/11: GIỮ bảng hiện tại (A − B = số cộng ví, ADR 0068) — số mẫu của design tự mâu thuẫn; báo designer |
| 18 | Nhãn "Khách quen" trên thẻ khách | 🆕 | API `customerCompletedRentals`; cùng ngưỡng `TENANT_CUSTOMER_RETURNING_MIN_RENTALS` của sổ khách |
| 19 | Hộp "Hủy đơn" / "Ghi nhận khách không đến" theo khuôn "Huỷ yêu cầu thuê xe" (`23930:44688`) | 🟡⚠️ | Chốt 06/11: cùng bộ style `DecisionReasonDialog.module.css` với hai hộp của chặng yêu cầu: hậu quả lên phụ đề, nhãn trên ô, hai nút "Quay lại" · nút đỏ. Viên tóm tắt **giữ biển số + dòng khung giờ** (design chỉ có "khách • xe"). Ô 2 "**Ghi chú cho khách**": huỷ đơn QUA CHỢ thì thông báo huỷ gửi khách mang nguyên câu này (API: `transitionWithinTx`, trước đây chỉ vào audit); đơn tự lập là "Ghi chú nội bộ", no-show là "Lý do". ⚠️ Design đánh `*` cả hai ô — chốt 06/11: **ghi chú chỉ bắt buộc khi chọn "Lý do khác"** (no-show vẫn bắt buộc vì chỉ có mỗi ô đó), áp cả hộp huỷ yêu cầu; API `TransitionBookingDto.reason` theo đúng luật đó, không ghi chú thì khách nhận câu chung. Bỏ mọi dòng gợi ý dưới ô chữ và dưới ô nhóm lý do (nhãn đã nói ai đọc; giải thích chỉ số nằm ở dấu ⓘ của ô đỏ). Ô đỏ "trừ điểm uy tín" + hoàn giữ chỗ chỉ hiện với đơn qua chợ (đơn tự lập không vào mẫu số chỉ số — ADR 0045 điều 3). Giữ cảnh báo "đã thu … không tự hoàn". Viên tóm tắt không gói hàng: tên xe dài xuống dòng trong cột của nó, dấu chấm không bị bỏ lại cuối dòng |
| 20 | Đơn huỷ / khách không đến: "Thu tiền" (header) · "Ghi nhận phát sinh" · "Xác nhận đã thu cọc" · ô "Còn phải thu của khách" | 🟡 | Chốt 09/11: chuyến không diễn ra (đơn đang chạy không huỷ được — ADR 0045 điều 1) nên **ẩn hẳn** cả bốn; "Lịch sử thu tiền" và hoàn lại phần đã thu giữ nguyên. Server chặn ở writer duy nhất `BookingPaymentWriter` + thêm/sửa phát sinh (`assertBookingMoneyOpenWithinTx`, khoá dòng đơn `FOR UPDATE`, 409 `BOOKING_MONEY_CLOSED`); gỡ phát sinh và ghi hoàn cọc vẫn mở. Cọc lỡ thu trên đơn huỷ chuyển "Chờ hoàn cọc" (trước đó kẹt "Đã nhận cọc"). Đơn hoàn tất KHÔNG đổi: thu nốt, phát sinh sau trả xe, ghi bù cọc vẫn làm được. Cùng đợt: sổ công nợ (`SQL_DEBT_SCOPE`) loại cả đơn khách không đến (trước chỉ loại đơn huỷ); số chuyến theo xe/khách và cọc đang cầm giữ phạm vi cũ (`SQL_BOOKING_SCOPE`) |

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
| 9 | Nền/khung (rà lại 04/11) | ✅ | Bảng danh sách trong khung trắng viền `--xp-color-border` bo 12, hàng trắng không zebra (`DataTable framed striped={false}`), phân trang ngoài khung. Chi tiết: dải số liệu không viền + `--xp-elevation-ambient`; thẻ Tổng quan bo 16 + bóng tản; thẻ hồ sơ viền `--xp-color-border`; khối lịch nhận/trả, ô soạn và từng ghi chú nền `--xp-color-bg` (gray-50) bo 10, không viền |

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

**Khổ điện thoại v2 (app Partner + web ≤640, Figma MB `24158:103762` · lọc `24158:105500`, người dùng
chốt 16/11/2026):** thẻ gọn ảnh 63×40 · nút mở/thu số liệu (thu gọn = Tổng doanh thu · Lợi nhuận;
không có `finance.view` ⇒ hai mức giá); GIỮ mã xe, "-N%", "tạm ẩn", việc cần làm, lý do trả về và
hàng nút Lịch · Chỉnh sửa · Chi tiết ở chân thẻ. BỎ dải chỉ số đội xe, chip vận hành và dòng "Hiển
thị x-y"; bỏ nút tài liệu ở đầu trang của design. Tấm Lọc dạng lưới hai cột (`sheetLayout="grid"` web,
`filterLayout="grid"` app) có ô sắp xếp bên trong, chân "Xoá bộ lọc" · "Lưu bộ lọc".

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

**Khổ điện thoại v2 (app Partner + web ≤640, Figma MB `24158:108502` Chi tiết · `24231:108043` Chỉnh sửa,
người dùng chốt 16/11/2026):**
- Chi tiết xe: ảnh bìa trọn bề ngang 246 với ← và ⋮ phủ lên ảnh; ⋮ "Thao tác" gom Chỉnh sửa · Xem lịch
  xe · Xoá (hai nút cuối trang cũ bỏ). Khối tóm tắt trắng (tên 18/28 + nguồn + công tắc "Trên chợ" gọn;
  mã | biển | KM | loại xe; kiểm duyệt + viên vận hành; "Hiệu suất lũy kế" ba cột) và dải tab gạch
  chân nằm TRONG khối đó. Thẻ tab Tổng quan xếp: Việc cần làm → Giá thuê & Chính sách (ba ô giá +
  Giao xe tận nơi) → Lịch thuê sắp tới → Tự động nhận chuyến → Thông số chính → Ảnh → Nguồn xe.
- Chỉnh sửa xe: MỘT màn dải tab gạch chân, nhóm như web (Thông tin chung · Hình ảnh · Giấy tờ · Dịch vụ
  & giá · Chính sách thuê · Bảo dưỡng & KM · Nguồn gốc & tài chính) - KHÔNG tách Điều kiện / Giao nhận
  như Figma (giữ chốt 03/11). Mỗi tab vẫn là một route; `VehicleEditHeader` (←, % hoàn thiện, tab) đứng
  đầu từng màn và đổi tab bằng `replace`, qua `useLeaveGuard` khi form còn dở. Gốc `/edit` chuyển
  hướng sang "Thông tin chung" (hub cũ gỡ khỏi cổng quản lý). Owner Lite giữ hub riêng.
- Web ≤600: tab gạch chân lên đầu, thẻ tóm tắt dưới, nút Hoàn tác · Lưu bám đáy.

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

**Khổ điện thoại v2 (16/11/2026, không có Figma riêng - theo khuôn Đơn thuê / Danh sách xe):** thanh trang
có nút "+" Mời tài xế; dải trạng thái thành `ChipTabs` kèm số đếm; tấm Lọc dạng lưới; thẻ đệm 16, viên
hình thức/trạng thái dạng nhãn, hàng nút compact tràn ngang (nút cuối là nút chính). Chi tiết tài xế:
← + tên + SĐT, dải tab gạch chân.

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

### 3.9 Tổng quan doanh thu — kiểm kê và quyết định (04/11/2026)

Code: `app/(manage)/manage/finance/page.tsx` + `features/finance/components/*` (sửa tại chỗ). Thẻ số
dùng biến thể `tile` mới của `MoneyStat` (`components/data-display`) — sổ Thu-Chi sẽ dùng lại khi
ráp. Biểu đồ vẫn là `RevenueTrendChart` (recharts đã có, không thêm thư viện).

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề + dòng phụ; sáu kỳ xem nhanh (Hôm nay … Năm nay); chi nhánh; khoảng ngày | ✅ | Theo design. Kỳ và chi nhánh vẫn trên URL |
| 2 | Sáu thẻ một hàng: Doanh thu · Chi phí · Lợi nhuận · Dòng tiền ròng (gồm cọc) · Cọc đang giữ · Khách còn nợ | ✅ | Thay ba khối "Kết quả kinh doanh / Dòng tiền quỹ / Tại thời điểm này". Tiền vào/ra gộp thành dòng phụ "Vào … · Ra …" của Dòng tiền ròng. Số phiếu dưới Doanh thu/Chi phí cộng từ cơ cấu theo danh mục (cùng bộ lọc đã loại cọc); chưa về thì chỉ "Đã trừ cọc" |
| 3 | Thẻ bấm được ra sổ đã lọc (Doanh thu, Chi phí, Tiền vào/ra) | 🟡 | **Giữ liên kết + mũi tên** (chốt 04/11): Doanh thu, Chi phí, Dòng tiền ròng (mọi phiếu đã duyệt trong kỳ), Cọc đang giữ, Khách còn nợ. Lợi nhuận không bấm (không có tập phiếu riêng) |
| 4 | Ba dòng ghi chú dưới các khối cũ | 🟡 | Vào dấu ⓘ cạnh nhãn (luật "note thừa bỏ, note cần vào icon"): "lãi tiền mặt theo sổ, chưa trừ khấu hao…" ở Doanh thu, "gồm cọc thu và hoàn" ở Dòng tiền ròng; "không phụ thuộc kỳ" thành chữ "· hiện tại" trên thẻ Cọc. Thẻ vừa bấm được vừa có ⓘ dùng liên kết phủ thẻ (nút không lồng trong `<a>`) |
| 5 | Biểu đồ "Dòng tiền & Lợi nhuận theo thời gian", Ngày/Tuần/Tháng, trục "Đơn vị: triệu đồng" | ✅ | Theo design: cột gradient, trục Y ghi số triệu. Cột tuần ghi khoảng ngày (cắt theo hai đầu kỳ). Màu vai đổi theo design ở `@xeprime/ui`: doanh thu xanh dương · chi phí đỏ · lợi nhuận xanh lá — áp chung mọi biểu đồ tài chính (dashboard, khối tiền hồ sơ xe/khách, app native) |
| 6 | Chú giải màu biểu đồ | 🟡 | **Giữ, gọn** (chốt 04/11): ba chấm màu cạnh nút độ mịn (`RevenueTrendLegend`) |
| 7 | Cơ cấu doanh thu / Cơ cấu chi phí: "Tên · n phiếu  x%" + số tiền + thanh 8px | ✅ | Theo design (thu xanh dương, chi tím như design). Mỗi dòng vẫn là liên kết ra sổ đã lọc đúng danh mục (giữ, chỉ lộ khi rê chuột) |
| 8 | "Hiệu suất kinh doanh": MỘT thẻ, tab Theo xe / Theo khách, "Sắp xếp: …", STT, phân trang | ✅ | Tab trên URL (`?perf=customers`); sắp xếp/trang mỗi tab giữ tham số riêng; chỉ tab đang mở gọi API. Ô sắp xếp đổi theo tab (khách: Doanh thu · Nhiều chuyến — không có "Lợi nhuận" vì bảng khách không có chi phí). **Sửa lỗi cũ**: ô số dòng không có tác dụng (`limit` bị ghim cứng) — nay đọc `limit`/`customerLimit` từ URL |
| 9 | Ảnh xe (tab Theo xe); ảnh + SĐT khách (tab Theo khách) | 🆕 | **Làm** (chốt 04/11): `GET /finance/by-vehicle` trả `mainImageUrl`; `GET /finance/by-customer` trả `phone` + `avatarUrl` **chỉ khi người xem có `customer.view`** (chỉ có `finance.view` thì `null`, dòng phụ vắng hẳn). Route chỉ mở cho tuyến gói nên không vướng ADR 0056. Khách không có ảnh ⇒ chữ cái đầu |
| 10 | Chú thích "Chi phí chung chưa gắn xe" / "Chưa gắn khách nào" | 🟡 | **Giữ** (chốt 04/11): một dòng chữ xám dưới bảng, chỉ khi khác 0 |
| 11 | Bấm dòng xe → hồ sơ xe; tên khách → hồ sơ khách (khi có `customer.view`); thẻ mobile của hai bảng | 🟡 | Giữ nguyên (không đổi hình) |
| 12 | Thuế đã khấu trừ: chọn tháng · dải sáu số · bảng (STT, Mã chuyến, …) · ô giải thích xanh ở cuối | ✅ | Theo design; ô giải thích chuyển từ đầu xuống cuối thẻ, luôn hiện. Thẻ này dùng chung với trang Ví (`PartnerBalanceView`) nên đổi hình ở cả hai. **Sửa lỗi cũ**: các cột viết `render: (row)` làm thẻ mobile của `DataTable` sập (`undefined.bookingCode`) trên điện thoại |

Tự dựng: đang tải (khung chờ trong từng thẻ/khối), lỗi (cảnh báo + thử lại), kỳ không có số liệu
(trạng thái rỗng trong biểu đồ/cơ cấu/bảng), thiếu `finance.view` (thay toàn màn), ≤1280px ba thẻ
một hàng, điện thoại hai thẻ một hàng (dòng phụ được xuống dòng), bảng thành thẻ.

Còn lệch design có chủ ý: phân trang là `DataTable` chuẩn (AntD) như màn Khách hàng; ảnh xe vuông
(`EntityIdentity` của xe), design vẽ tròn.

Khoá mobile: app native dùng chung namespace `Finance.overview` — khoá cũ (`cards.business.*`,
`chart.description`) giữ nguyên, khoá mới của web nằm ở `overview.tiles`/`overview.performance`.

### 3.10 Quản lý ví — kiểm kê và quyết định (04/11/2026)

Code: `app/(manage)/manage/balance/page.tsx` · `features/wallet/components/` —
`PartnerBalanceView` (hai tab trên URL `?tab=`, kỳ `?period=` dùng chung hai tab + thẻ tổng hợp
tháng, trang `?page=`), `WalletStatementPanel` (tab 1), `WalletActivityPanel` (tab 2, mới),
`WalletMonthSummary` (cột phải, mới — các dòng cộng dồn chuyển từ đáy bảng tổng hợp sang),
`WalletSummaryCard` dáng `hero`, `BankAccountList`/`BankAccountForm`/`BankAccountCard` dáng
`partner`/`compact`. API mới: `GET /shop/wallet/activity` (UNION sổ ví + lệnh rút theo kỳ, phân
trang server). `WalletView` từ nay chỉ còn phục vụ khu khách (`/account/balance`).

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| 1 | Thẻ "Rút được ngay" + nút "Rút về ngân hàng" trong thẻ, nền gold loang | ✅ | Theo khung design, nhưng **MỘT con số** (chốt 04/11): bỏ ô "Tổng XePrime phải trả" (chỉ là tổng hai ô kia, bị đọc nhầm); "Đang chờ" thành dòng "… đang được chuyển về ngân hàng" chỉ hiện khi khác 0; ⓘ giải thích số dư gồm gì. Nền: `public/illustrations/wallet/balance-glow.webp` (cắt từ ảnh design, ~2KB); giao diện tối dùng nền gold nhạt |
| 2 | Dòng "Rút tối thiểu …" khi nút khoá · huy hiệu "Đã xác minh" · cảnh báo ví bị khoá | 🟡 | Giữ (chốt 04/11): dòng tối thiểu dưới nút, huy hiệu dưới số, cảnh báo đầu thẻ |
| 3 | Tài khoản nhận tiền: logo 80 · tên · số · ngân hàng; "Đổi tài khoản" gold; ô trống + "Thêm tài khoản" | ✅ | Số tài khoản là số ĐÃ CHE (API không trả số đầy đủ) ⇒ không có nút sao chép (chốt 04/11). Hộp thêm/đổi theo `23948:96973`/`23948:97512`, lưu xong là thông báo góc "Thành công!" (`23948:98047`) |
| 4 | Tab "Tổng hợp giao dịch": chỉ số uy tín · bảng theo chuyến · dòng mở rộng (bảng cộng ví) | ✅ | Giữ bảng cộng ví hiện có (`OwnerPayoutTable`, chốt 03/11). Cột "Thiếu khấu trừ" của design là lỗi chữ ⇒ "Thuế khấu trừ". Cột phí dịch vụ – chủ xe / phí giao xe chỉ hiện khi kỳ có. Bảng hẹp (1024–1440px) cuộn ngang trong thẻ, không xuống dòng giữa số |
| 5 | "Tổng hợp tháng này" ở cột phải | ✅ | Đọc tổng của KỲ đang chọn (tiêu đề "Tổng hợp tháng MM/YYYY"). Bốn dòng design + các dòng chỉ-khi-khác-0 giữ từ bảng cũ (chốt 04/11): khách trả trực tiếp, phí giao xe, phí gói, phí dịch vụ – chủ xe; lời giải thích vào ⓘ |
| 6 | Tab "Biến động số dư": bảng theo tháng, cột trạng thái | 🆕 | API mới `GET /shop/wallet/activity` (chốt 04/11). Thay hai khối cũ "Yêu cầu rút" + "Lịch sử giao dịch": dòng lệnh rút giữ đích chuyển, hạn chuyển / lúc đã chuyển, lý do từ chối / chuyển hụt và nút **Huỷ** khi còn chờ duyệt. Trạng thái của lệnh rút là trạng thái THẬT (6 giá trị), dòng sổ là "Thành công" |
| 7 | Ô ghi chú thuế + "Chi tiết" | 🟡 | "Chi tiết" mở hộp thoại chứa nguyên thẻ "Thuế đã khấu trừ" (`ShopTaxWithheldCard embedded`), mở đúng tháng đang xem (chốt 04/11) — trang này vẫn là chỗ duy nhất không gác theo gói để xem thuế |
| 8 | Tiêu đề trang "Quản lý ví" + mô tả | ✅ | `Wallet.manage.*` (khoá `title.tenant` "Số dư & rút tiền" giữ cho app native) |

Trạng thái tự dựng: đang tải (khung chờ từng khối), lỗi (thông báo + thử lại ở từng thẻ), rỗng (kỳ
chưa có chuyến / chưa có biến động), chỉ-chủ (thành viên gõ URL), máy hẹp (cột phải lên trước rồi
tới tab). `?section=payout` vẫn cuộn tới khối tài khoản nhận tiền.

### 3.11 Lịch sử giao dịch · Công nợ — kiểm kê và quyết định (04/11/2026)

Code: `app/(manage)/manage/receipts/page.tsx` (hai tab) · `features/finance/components/` —
`ReceiptSummaryCards`, `ReceiptTable`, `ReceiptDetailDialog` (thay `ReceiptDetailDrawer`),
`ReceiptFormDialog` (thay `ReceiptFormDrawer`), `CategoryManagerModal`, `FinanceBoard` (khung
"Bảng tổng hợp …" dùng chung hai tab), `DebtsView`, `DebtSummaryCards`, `DebtTable`,
`DebtDetailDialog`. `/debts` chỉ còn `redirect`.

**Tab "Giao dịch thu chi"**

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Tiêu đề "Lịch sử giao dịch" + nút chuyển "Giao dịch thu chi \| Công nợ" | ✅ | MỘT route (chốt 04/11). Đổi tab đi tới URL sạch của tab kia (hai tab lọc khác nhau). Tab Công nợ gác bằng cờ gói `DEBTS` riêng: gói không có ⇒ nút chuyển vắng, `?view=debts` rơi về sổ; chỉ-xem ⇒ băng gia hạn ngay trong tab |
| 2 | Bốn thẻ: Tổng thu (Tiền mặt · CK) · Tổng chi · Cân đối (Thu - Chi) · Công nợ khách hàng | 🟡→✅ | **Bỏ thẻ "Số phiếu đã duyệt"** (chốt 04/11) — tổng số dòng có ở chân bảng. Thẻ Công nợ bấm sang tab Công nợ (theo chi nhánh đang lọc); câu "chỉ cộng phiếu đã duyệt" vào ⓘ |
| 3 | Kỳ nhanh · tìm · Loại · Chi nhánh · "Bộ lọc" (Trạng thái/Danh mục/Nguồn/Hình thức/Khoảng ngày) · chip đang lọc · "Xoá bộ lọc" | ✅ | Trên hàng: Loại + Chi nhánh như design; phần còn lại trong popover. Dòng "chưa gồm N khoản chung" khi lọc chi nhánh (ADR 0052) giữ |
| 4 | Bảng: Phiếu · Loại · Nguồn · Danh mục · Khách hàng · Số tiền · Hình thức · Trạng thái · Thao tác | 🟡→✅ | **Bỏ cột Diễn giải** (chốt 04/11) — đọc ở hộp chi tiết, ô tìm kiếm vẫn tìm theo nó. Thẻ mobile giữ |
| 5 | Thao tác trên dòng | 🟡→✅ | Phiếu chờ duyệt: Huỷ + Duyệt (xác nhận trước); phiếu khác: "Xem chi tiết". **Huỷ phiếu tay ĐÃ duyệt chuyển vào chân hộp chi tiết** (chốt 04/11) — không mất thao tác |
| 6 | Hộp chi tiết phiếu (560px): số tiền + bằng chữ · Thông tin phiếu · Thông tin liên kết · Lịch sử thao tác · Huỷ phiếu + Duyệt phiếu | ✅ | Drawer → hộp giữa màn. Giữ thứ design không vẽ (chốt 04/11): cảnh báo phiếu tự động + lối về đơn/xe, ảnh chứng từ, người huỷ, trạng thái cạnh tiêu đề. Số tiền bằng chữ theo NGÔN NGỮ (`fmt.moneyWords`, thêm `moneyToEnglishWords` ở `@xeprime/domain`) — trước đây giao diện en vẫn đọc tiếng Việt |
| 7 | Hộp tạo phiếu (720px): Phiếu thu \| Phiếu chi · Liên kết với (3 thẻ) · lưới 2 cột · Diễn giải · chứng từ · "Tạo và giữ form để nhập tiếp" | ✅ | Drawer → hộp; toàn bộ nghiệp vụ giữ (chế độ liên kết quyết dữ liệu gửi, chi nhánh chỉ hỏi ở Khoản chung, thẻ đọc lại xe/đơn, tự điền số còn nợ, số tiền bằng chữ dưới ô). Nút gửi nói đúng "Tạo phiếu thu/chi" (design ghi ngược ở frame phiếu thu) |
| 8 | Hộp Danh mục: bảng · sửa/xoá trên dòng · dòng thêm mới · "+ Thêm danh mục" | 🆕→✅ | **Thêm đổi tên** (API `PATCH /finance/categories/:id` đã có). **Lưu từng dòng** bằng ✓, chân hộp chỉ "Đóng" (chốt 04/11). Xoá giờ có xác nhận. Danh mục hệ thống: nhãn "Hệ thống", không nút |
| 9 | Chính tả "Hủy" của design | — | Giữ "Huỷ" như mọi chỗ khác của sản phẩm |

**Tab "Công nợ"**

| # | Hạng mục | Dấu | Quyết định |
| --- | --- | --- | --- |
| 1 | Bốn thẻ: Tổng công nợ (N đơn · M khách) · Nợ quá hạn · Trong hạn thanh toán · Chưa thanh toán | 🆕→✅ | API mới `GET /debts/summary` (`DebtSummaryDto`) — cùng phạm vi tìm/chi nhánh/trạng thái với bảng, KHÔNG theo nhóm hạn đang mở; Quá hạn + Trong hạn = Tổng |
| 2 | Chip Tất cả · Quá hạn · Sắp đến hạn · Chưa thu có số đếm | 🆕→✅ | Số đếm từ `/debts/summary`, chung vị từ với danh sách (`debtGroupSql`) — chip "Quá hạn 11" mở đúng 11 dòng (có test) |
| 3 | Lọc "Trạng thái đơn" · "Sắp xếp: Trễ nhất / Nợ nhiều nhất / Mới nhất" | 🆕→✅ | Tham số `status`, `sort` mới (`DEBT_SORT` ở `@xeprime/types`); sắp xếp không vào huy hiệu lọc, "Xoá bộ lọc" giữ nó |
| 4 | **Định nghĩa "Quá hạn"** | ⚠️→✅ | Trước: chỉ đơn CHƯA hoàn thành qua hạn trả. Nay: **mọi đơn còn nợ đã qua hạn trả**, kể cả đã hoàn thành (design vẽ "Hoàn thành · Quá 19 ngày") — chuyến đã trả xe mà chưa trả đủ tiền là nợ quá hạn rõ nhất. "Quá N ngày" ở client dùng cùng mốc (`overdueDays`, `@xeprime/domain`) |
| 5 | Bảng: Khách (tên + SĐT) · Đơn hàng · Trạng thái đơn · Phương tiện (tên + biển) · Hạn trả (+ "Quá N ngày") · Còn nợ (+ vạch + "Đã trả X / Y") · Xem đơn · Thu tiền | 🆕→✅ | `DebtItemDto.plateNumber` mới. SĐT: route chỉ tuyến gói nên không vướng ADR 0056. Bỏ ba cột Tổng/Đã trả/Còn nợ rời — gộp vào ô Còn nợ như design |
| 6 | "Xem đơn" → hộp CÔNG NỢ gọn (băng còn nợ + Thu tiền · Thanh toán · Xe · Lịch sử thu tiền · Khách + Gọi/Zalo/Nhắn tin · Hợp đồng · Chi tiết đơn thuê) | 🆕→✅ | Thay hộp chi tiết đơn đầy đủ (chốt 04/11). GHÉP từ chính thẻ của trang đơn (`BookingDetailActionsProvider`, `PaymentSideCard`, `VehicleSideCard`, `CustomerSideCard`, `ContactButtons` — nay xuất được, có biến thể có chữ) ⇒ cùng quyền, cổng gói, hộp thu tiền/hợp đồng. Hoàn một khoản thu vẫn ở trang đơn |
| 7 | "Thu tiền" | ✅ | Hộp thu tiền đơn đã ráp (`RecordPaymentModal`) |

Tự dựng: tải (khung chờ trong thẻ, bảng), lỗi (cảnh báo, thử lại — giữ bảng cũ khi refetch hỏng),
rỗng vì chưa có vs rỗng vì lọc, thiếu `finance.view` (thay cả màn), gói không có Công nợ, điện thoại
(thẻ hai cột, chip cuộn ngang, bảng thành thẻ, hộp toàn màn).

**Sửa kèm**: ô số dòng của bảng công nợ không có tác dụng (`limit` không đọc từ URL) — nay đọc.

Nút thao tác trên dòng (cả hai tab) theo design: `actionColumn(..., { variant: 'standard' })` —
nút thường viền nền trắng, nút chính vàng đặc (`Button` mặc định/`primary`); bảng chưa ráp giữ
`'filled'`. Segmented (chuyển tab, kỳ, nhóm công nợ) có khung viền: `components/filter/segmented.module.css`.

Còn lệch design có chủ ý: phân trang là `DataTable` chuẩn; chứng từ trong hộp tạo phiếu
giữ ô tải lên hiện có (`ReceiptAttachmentsField`); hộp chi tiết phiếu chưa có SĐT khách (API chi
tiết phiếu chưa trả — cần cổng `customer.view` như bảng theo khách nếu muốn thêm).

### 3.12 Chính sách thuê — kiểm kê và quyết định (06/11/2026)

Code: `features/rental-policies/components/` — `ShopPoliciesPage` (tab loại xe ở `?type=`) ·
`ShopPolicyForm` (một form, hai API, nút ở cột phải) · `ShopPolicyBlocks` · `ShopPaymentCard` ·
`PoliciesLayout` (cột phải: mục lục + nút) · `TurnaroundBufferField` (dùng chung với màn sửa xe).
Hàng công tắc chung: `components/form/SettingRow`.

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| P1 | Tab Ô tô · Xe máy ở đầu trang, số = tổng xe của loại | ✅ | `SegmentedTabs`; loại xe ở URL `?type=`. Đang sửa dở mà đổi tab thì hỏi bỏ thay đổi. Xe máy cùng bố cục (xe máy chỉ có Tự lái + Dài hạn — cả bốn khối đều áp) |
| P2 | Mục lục cột phải + "Hủy · Lưu thay đổi" | ✅ | Design cập nhật 06/11 dời cột sang PHẢI. Mục lục là anchor, sáng theo vị trí cuộn. Hẹp: cột phải lên đầu, nút bám đáy |
| P3 | Thanh toán & hóa đơn: giữ chỗ · VAT | ✅ | Hai công tắc lưu ngay (không thuộc nút Lưu). **Khoá theo giai đoạn nền tảng ⇒ ẩn hẳn hàng giữ chỗ** (người dùng chốt 06/11 — hiện lại khi nền tảng mở công tắc). Khoá vì tuyến/gói/cấu hình thì tiêu đề + mô tả là lý do khoá; tuyến hoa hồng/thiếu gói kèm link tới **Gói & hạn mức** của trang Thông tin cửa hàng (cập nhật khi ráp trang đó). Câu "khoản giữ chỗ KHÔNG phải tiền cọc" + phạm vi áp dụng vào ⓘ. Thiếu `seller_profile.view` ⇒ vắng hàng giữ chỗ |
| P4 | Thế chấp: lựa chọn thứ 3 design ghi "Cọc tiền" | ⚠️→✅ | Nhãn đúng **Miễn thế chấp** (người dùng xác nhận) |
| P5 | Danh mục tài sản khi chọn Cọc tài sản | 🟡 | Thay chỗ ô tiền cọc |
| P6 | "N xe đang dùng mức cọc này"; số xe dùng chính sách riêng | ✅/🟡 | Số riêng vào ⓘ cạnh dòng đó |
| P7 | Quá giờ: công tắc + phí/giờ + miễn phí tối đa | 🆕→✅ | Công tắc của FORM (`overtimeEnabled` tuỳ chọn trong schema dùng chung — app native không có thì không đổi gì); tắt ⇒ gửi null. **Ô làm tròn bỏ** (người dùng chốt): web luôn gửi `overtimeRoundingMinutes = null` ⇒ quyết toán làm tròn LÊN theo giờ, công thức trong ⓘ. Áp cả màn sửa xe. Số làm tròn cũ còn hiệu lực tới lần lưu kế tiếp; app Partner vẫn còn ô này (dev mobile) |
| P8 | Bảng phí giao xe: bút chì / ✓✗ từng dòng | 🆕 | Không làm — ô sửa thẳng + thùng rác (chốt) |
| P9 | Bán kính giao tối đa | 🟡 | Dưới bảng (như E17) |
| P10 | Thời gian chết giữa hai chuyến ở cấp GIAN HÀNG | 🆕→✅ | **Mặc định gian hàng theo loại xe** (người dùng chốt): bảng `tenant_operation_defaults` (writer `VehicleSettingsService`), `GET/PUT /shop/operation-defaults?vehicleType=` (`tenant.view`/`tenant.update`, phiên hỗ trợ chỉ đọc). `vehicle_operation_settings.turnaround_buffer_minutes` NULL = theo mặc định; dòng cũ giữ số riêng. Màn sửa xe (gian hàng) thêm lựa chọn "Theo gian hàng (X)"; tuyến hoa hồng không có. Chỉ áp lịch giữ MỚI (ADR 0006) |
| P11 | Ưu đãi dài hạn: công tắc "Áp dụng chính sách của gian hàng" | ⚠️ | Design bản cuối đã gỡ ⇒ không công tắc: **có mốc = bật**, xoá hết = tắt (`discountEnabled` theo số mốc). Dữ liệu cũ đang tắt mà còn mốc ⇒ dải cảnh báo "lưu sẽ bật" |
| P12 | Mức giảm %/đ/tháng | ⚠️ | Chỉ % (ADR 0011, như E12) |
| P13 | Hộp "Công thức tính giá gói" + gợi ý giá tháng | ⚠️→✅ | Bỏ hộp; công thức vào ⓘ tiêu đề. **Thay bằng khung "Khách sẽ thấy trên sàn" bên phải** (người dùng chốt 06/11, khuôn khuyến mãi trực tiếp): `LongTermPackagePreview` áp mốc đang nhập lên một giá tháng VÍ DỤ sửa được (mặc định theo loại xe, không lưu). Cùng khung ở màn sửa xe › Dài hạn (gian hàng) với giá tháng THẬT của xe; bảng gói trong hộp gợi ý xanh vì thế chỉ còn ở tuyến hoa hồng. Ở màn sửa xe (gian hàng): hộp gợi ý xanh rút thành MỘT dòng "Giá đề xuất: min – max/tháng" ngay dưới ô (lý do vào ⓘ, giá không rẻ hơn thuê ngày ⇒ dòng đổi màu cảnh báo), hộp công thức dưới bảng mốc bỏ, công thức vào ⓘ tiêu đề (người dùng chốt 06/11) |
| P13b | Thời gian chết: dải xanh "chỉ áp lịch giữ MỚI" + dòng số xe | 🟡 | Vào ⓘ cạnh tiêu đề (người dùng chốt 06/11) |
| P14 | Mốc cũ theo ngày chưa quy đổi | 🟡 | Dải cảnh báo dưới bảng (như cũ) |
| P15 | Thanh "thay đổi chưa lưu" + Hủy bỏ | 🟡 | Thay bằng nút Hủy/Lưu chỉ sáng khi có thay đổi (như màn sửa xe); xác nhận phạm vi trước khi lưu giữ nguyên |

Trạng thái tự dựng: đang tải · lỗi (thẻ thanh toán vẫn dùng được) · chưa có chính sách · chỉ xem
(thiếu `tenant.update`) · phiên hỗ trợ (không nút) · bảng trống · màn hẹp/điện thoại. Lưu: mỗi API chỉ
gửi khi PAYLOAD của nó đổi; lỗi một nửa thì nửa kia vẫn lưu, ô đang sửa giữ nguyên.

### 3.13 Thông tin cửa hàng — kiểm kê và quyết định (06/11/2026)

Code: `features/shop/components/` — `ShopWorkspace` (một form hồ sơ cho cả trang, lưu THEO NHÓM —
`toShopProfilePatch`) · `ShopOwnerSection` · `ShopLegalCard` (+ hộp) · `ShopTaxCard` (+ hộp, form
chung `useSellerTaxForm` với "Hồ sơ chủ xe") · `ShopDisplayCard` (+ hộp, editor) · `ShopMediaButton`.
Gói: `features/subscription/components/ShopPlanSection` · `ShopPlanLaneCard` · `PlanPurchaseDialog`
(hook `useCombinedPlanPurchase`) · `ShopInvoicesCard` · trang thanh toán `InvoiceCheckoutView` /
`CheckoutPaymentView` (`variant: bare | shell`). Khung thẻ chung: `components/layout/InfoCard`.
Editor: `components/form/RichTextField` (TipTap 3.32) · hiển thị `components/data-display/RichText`.

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| S1 | Bố cục: ba thẻ đầu (chủ · địa chỉ & pháp lý · khai thuế) + chi nhánh + gói + hoá đơn; cột phải "Thông tin hiển thị" | ✅ | Theo design. Cột phải dính khi cuộn; ≤1200px lên ĐẦU trang (thứ khách thấy) |
| S2 | Mục lục trái + nút Lưu ở tiêu đề (bản cũ) | 🟡 | Mục lục bỏ (design không còn); `?section=` vẫn cuộn tới đúng thẻ cho link/redirect cũ |
| S3 | Sửa bằng hộp thoại "Cập nhật" | ✅ | **Hộp thoại lưu ngay** đúng nhóm ô của nó (người dùng chốt). Đóng hộp = trả nhóm đó về bản đã lưu |
| S4 | "Hủy · Lưu thay đổi" dưới thẻ hiển thị | ✅ | **Chỉ cho logo/ảnh bìa**: đổi ảnh là xem trước trên thẻ, cặp nút chỉ hiện khi có ảnh chưa lưu (người dùng chốt) |
| S5 | Gỡ logo / ảnh bìa (bản cũ có "Xoá") | 🟡 | Nút ✕ nhỏ trên ảnh khi sửa được — vào cùng luồng "Lưu thay đổi" |
| S6 | Giới thiệu = editor | 🆕→✅ | TipTap, thanh công cụ đúng design (hoàn tác · làm lại · nghiêng · đậm · gạch chân · căn trái/giữa/phải). **Không chèn ảnh** — ảnh dưới đoạn giới thiệu của design bỏ (người dùng chốt). Lưu `tenant_profiles.bio_html` (HTML lọc ở server, `sanitizeShopBioHtml`); `bio` giữ chữ thuần rút từ HTML cho app native / thẻ chủ xe / SEO. Gửi `bio` không kèm `bioHtml` (app, form chủ xe) ⇒ gỡ bản HTML. Site khách (`ShopHeader`) hiện bản định dạng |
| S7 | SĐT / email hiển thị đánh dấu bắt buộc (*) | ⚠️ | Giữ TUỲ CHỌN như luật hiện hành (bỏ trống = gỡ — `shopProfileWithContactSchema`); bắt buộc sẽ chặn gian hàng cũ chưa khai. Chưa đổi — cần chốt nếu muốn bắt buộc |
| S8 | Viên đen "Chủ gian hàng" ở tiêu đề | 🆕→✅ | Hiện **vai của người xem** (`tenantRole`) — frame Staff cũng vẽ "Chủ gian hàng" là chép nhầm; chỉ để đọc |
| S9 | Thẻ Chủ gian hàng: ảnh đại diện | 🆕→✅ | `ShopOwnerAccountDto.avatarUrl` (ảnh tài khoản chủ). "Quản lý tài khoản" chỉ CHÍNH CHỦ thấy (như cũ) |
| S10 | Thẻ Khai thuế: "Tên hộ KD/DN" + MST | ✅ | Cá nhân hiện Tên đầy đủ + Số CCCD (đúng model). Nhãn trạng thái duyệt ở góc khi khác "nháp"; yêu cầu sửa / từ chối kèm ghi chú |
| S11 | Hộp Địa chỉ & pháp lý | ✅ | Giữ `AddressField` (bộ chọn hành chính + gợi ý bản đồ, ADR 0077) và câu "đổi ở đây là đổi chi nhánh mặc định" |
| S12 | "Hoàn thiện hồ sơ" (checklist) | 🟡 | Design không vẽ — đặt dưới thẻ hiển thị, chỉ người sửa được, tự ẩn khi đủ. Logo vẫn là mục CHẶN của tuyến gói |
| S13 | Chi nhánh: tìm · lọc trạng thái · Thêm; dải "chưa có tỉnh/thành · Bổ sung ngay"; cột thao tác bút chì + "…" | ✅ | Lọc trạng thái thành ô chọn (Tất cả · từng trạng thái) thay nút "Chỉ đang hoạt động". "Bổ sung ngay" mở chi nhánh đầu tiên cần sửa |
| S14 | Hộp chi nhánh: "Đặt làm chi nhánh mặc định" | 🆕→✅ | Ô của riêng web, chạy `POST /branches/:id/set-default` SAU khi lưu (cùng đường menu "…"). Vắng trong phiên hỗ trợ. Điện thoại vẫn một số (design vẽ hai dòng — model một số) |
| S15 | Gói: thẻ từng loại xe (đang dùng · hạn · X/Y xe · thanh tiến độ · Gia hạn / Nâng cấp ngay) | ✅ | Hoá đơn đang chờ của loại xe hiện trong thẻ kèm "Thanh toán" (🟡 giữ từ bản cũ) |
| S16 | Bậc TIẾT KIỆM / CƠ BẢN / NÂNG CAO + tính năng khác nhau theo bậc | ⚠️ | **Theo dữ liệu thật** (người dùng chốt): tên + mô tả bậc của admin; gạch đầu dòng = "Tối đa N xe" + tính năng thật. Huy hiệu bạc/vàng/đen theo thứ tự trong làn (chỉ là hình) |
| S17 | Doanh nghiệp: nút "Thanh toán"; Doanh nghiệp + gói ô tô cùng "Đang dùng" | ⚠️ | Không nút Thanh toán (bán bằng tư vấn — ADR 0041 điều 5); đang dùng doanh nghiệp thì hai thẻ làn vắng (ADR 0065). Ô "Kỳ tiếp theo · giá" bỏ — không có dữ liệu giá kỳ |
| S18 | Hộp mua gộp ô tô + xe máy, một kỳ hạn, một thời điểm, MỘT hoá đơn / QR | 🆕→✅ | **Backend phiếu gộp** (người dùng chốt) — ADR 0083: `subscription_checkouts`, mã `XPC…`, `POST/GET /subscription/checkouts`. Một gói ⇒ hoá đơn lẻ như cũ. "Thời điểm áp dụng" chỉ hiện khi loại xe đang chọn có kỳ chạy; `now` chỉ gửi cho loại có kỳ chạy. "Gói hiện tại" vẫn chọn được (để gia hạn đúng bậc) |
| S19 | Trang "Thanh toán hóa đơn" trong khung + breadcrumb | 🆕→✅ | Route mới `/shop/payment/:id` và `/shop/payment/checkout/:id` (dưới lá "Thông tin cửa hàng" ⇒ breadcrumb tự có). Bản trần `/payment/…` giữ cho onboarding (ADR 0040). "Ví điện tử" chỉ có với hoá đơn lẻ (ADR 0058 chưa có đích phiếu gộp). Đếm ngược "Hạn thanh toán" theo `expiresAt` |
| S20 | Bảng "Hóa đơn và thanh toán" | ✅ | Luôn mở (bản cũ gập), phân trang server `?page=`. Mã đối soát của hoá đơn thuộc phiếu = mã `XPC` của phiếu. Cột "Thanh toán" cho hoá đơn còn nhận tiền (🟡) |

Trạng thái tự dựng: đang tải / lỗi cho từng thẻ (thử lại tại chỗ) · chỉ xem (thiếu `tenant.update`:
không bút chì, không đổi ảnh; thiếu `seller_profile.manage`: thẻ thuế không bút chì; thiếu
`subscription.purchase`: không "Nâng cấp / Đổi gói") · phiên hỗ trợ (không nút sửa, không thuế, không
giấy phép KD, không mua gói / hoá đơn chờ) · chủ xe tuyến hoa hồng lạc vào (dựng `SubscriptionWorkspace`
nâng cấp) · gói hết hạn / ân hạn (nhãn đỏ trên thẻ làn) · hẹp (ba thẻ đầu 3 → 2 → 1 cột; cột hiển thị
lên đầu; hộp mua và hộp sửa toàn màn trên điện thoại).

**Soát chữ theo design (09/11/2026)** — sửa ở COMMON để màn sau dùng lại: nút AntD `14px/Semibold`, nút
viền chữ `Text/Gray/medium` (`styles/theme.ts`, có bản tối) · tiêu đề cột `DataTable` `12/18 Medium`
`Text/Gray/medium` · `StatusTag appearance="pill"` + `StatusPill` = viên "_Badge" 14/20 · `InfoCard`/`DialogHeading`: dòng
phụ và nhãn `Text/Gray/low` (`--xp-color-text-tertiary`), chú thích 12/18 `Text/Gray/very-low` · token mới
`--xp-color-warning-high` (`#dc6803`) và `--xp-color-gold-on-dark` (`#fcd34d`). Lưu ý cho màn sau: dòng phụ của design
là `#717680` (tertiary), KHÔNG phải `#414651`; `--xp-font-size-caption` là 10px — chữ 12px dùng `body-sm`.

**Hộp "Mua hoặc gia hạn gói" sửa lại (09/11/2026, người dùng)** — (1) chữ theo design, SỐ theo admin: tên bậc
TIẾT KIỆM · CƠ BẢN · NÂNG CAO + "Phù hợp cho …" là nhãn THEO VỊ TRÍ trong làn (bậc thứ 4+ do admin mở thêm thì
dùng tên/mô tả admin); "Tối đa **N** ô tô", giá, "Gói đề xuất", tính năng, kỳ bán đọc từ `plans.limits`; dòng
tóm tắt "Ô tô - **Cơ bản 5 xe**" ghép nhãn vị trí + `maxVehicles`. Giữ khác design có chủ đích: dòng tính năng
là tính năng thật (không "báo cáo ngắn gọn / chi tiết"); kỳ 1 tháng ghi "Giá gốc" (không "Cơ bản" — trùng tên
bậc); nút "Gói hiện tại" nhạt nhưng VẪN bấm được (đường gia hạn đúng bậc). (2) Lỗi không cuộn tới kỳ hạn: hộp đặt
`bodyScroll="content"` (chế độ cho bố cục nhiều cột tự cuộn) ⇒ thân bị `overflow: hidden`; bỏ đi. Hộp `size="fit"`
rộng 1430 như khung design (`xl` chỉ 1180). (3) Hai BƯỚC đánh số — "1 Chọn gói cho từng loại xe" (gợi ý chọn
được cùng lúc ô tô + xe máy, bấm "Đang chọn" để bỏ) → "2 Chọn kỳ hạn và thời điểm áp dụng"; dải Doanh nghiệp
dời xuống CUỐI (giữa hai bước nó cắt ngang luồng chọn).

**Hộp mua gói thành HAI BƯỚC THẬT (09/11/2026, người dùng · ADR 0084)** — thanh bước "① Chọn gói ─ ② Kỳ hạn
và xác nhận". Bước 1: hai làn + dải Doanh nghiệp, chân hộp tóm tắt gói đã chọn + "Tiếp tục". Bước 2: kỳ hạn
chung (4 thẻ) → "Xác nhận gói": mỗi gói một thẻ (nhãn Mua mới / Gia hạn / Nâng cấp ngay / Đổi gói từ kỳ sau,
hạn mức, thời gian áp dụng, đơn giá × số tháng, thành tiền, cảnh báo kỳ cũ kết thúc khi nâng ngay / số xe
vượt trần khi hạ bậc) — đọc từ `POST /subscription/purchase/preview`, không suy ở client → dòng "Thanh toán
bằng chuyển khoản QR" + cảnh báo thay mã chờ + điều khoản; chân hộp "Quay lại chọn gói" · tổng (của server) ·
"Tạo hoá đơn" (khoá tới khi bản xem trước khớp lựa chọn). BỎ hẳn khối "Thời điểm áp dụng" của design: server
suy (cùng bậc = gia hạn nối tiếp, cao hơn = nâng ngay không bù, thấp hơn = nối tiếp). `PurchaseModal` (một
loại xe, `SubscriptionWorkspace`) bỏ radio thời điểm, hiện cùng kết quả xem trước (`PurchaseOutcome.tsx`).

**Bước 2 gọn lại (09/11/2026, người dùng)** — (1) BỎ hộp ghi chú dưới phiếu ("Hạn mức mới có hiệu lực…" +
cảnh báo "… sẽ kết thúc ngay khi thanh toán xong — phần thời gian còn lại không được hoàn"). Cả hai câu chuyển
vào dấu ⓘ cạnh nhãn lượt mua (`PurchaseOutcomeHint`) — hệ quả về tiền không mất, chỉ không chiếm chỗ. Cảnh báo
số xe vượt trần khi hạ bậc vẫn hiện hẳn (`PurchaseOverCapAlert`, hiếm). `PurchaseModal` giữ bản đầy đủ.
(2) MỘT gói (đa số lượt mua): hai cột — trái "Kỳ hạn thanh toán" thành danh sách ◉ kỳ · tiết kiệm · TỔNG TIỀN
kỳ đó (giá tuyệt đối `tier.terms`, ADR 0041 điều 2), phải là phiếu gói; hết nửa hộp trống. Hai gói giữ bố cục
cũ (hàng 4 nút kỳ hạn + hai phiếu ngang hàng). Màn ≤720px: một cột.

### 3.14 Nhân viên & Phân quyền — kiểm kê và quyết định (09/11/2026)

Code: `features/members/components/` — `MembersPage` (danh sách gộp) · `InviteMemberModal` (+ "Mời lại"
điền sẵn) · `MemberEditDialog` · `MemberDetailDrawer` · `RolePermissionsPage` (ma trận) · `RolePill` ·
`LastActiveText`. Bộ lọc trên URL: `use-roster-filters`. Luật ô ma trận + vai được mời: `@xeprime/types`
(`ROLE_MATRIX_ROWS`, `roleMatrixLevel`, `invitableTenantRoles`). API: `GET /members/roster`,
`GET /members/roles`, `POST /members/:userId/lock|unlock`, `nickname` ở PATCH và lời mời. Toàn bộ quyết
định: ADR 0086; bộ BA: `SPEC-BUS-09` (Drive `01_BUSINESS_ANALYSIS_BA/06_Staff_Roles_Permissions`).

| # | Hạng mục | Mark | Quyết định |
| --- | --- | --- | --- |
| M1 | Bảng: Nhân viên · SĐT · Vai trò (viên màu) · Chi nhánh phụ trách (tên) · Trạng thái · Hoạt động gần nhất · Xem chi tiết + "…" | ✅/🆕 | Theo design. SĐT, hoạt động gần nhất, tên chi nhánh là dữ liệu MỚI của `GET /members/roster` |
| M2 | Lọc Trạng thái | 🆕→✅ | Đang hoạt động · Chờ xác nhận · Đã khoá — lọc ở server. Bộ lọc dời từ state cục bộ lên URL (ADR 0004) |
| M3 | Bảng "Lời mời đang chờ" riêng (bản cũ) | 🟡 | **Gộp vào bảng chính** — dòng "Chờ xác nhận", "Đã mời lúc …"; "…" có Mời lại · Thu hồi lời mời. `PendingInvitesPanel` đã gỡ |
| M4 | Đổi vai / chi nhánh bằng ô chọn ngay trên dòng (bản cũ) | 🟡 | Dời vào hộp **Chỉnh sửa** (design chỉ vẽ dòng menu) — kèm tên gợi nhớ; chỉ gửi trường thật sự đổi |
| M5 | "Tạm khoá" | 🆕→✅ | `POST /members/:userId/lock|unlock`, quyền `members.update_role`. Khoá vì hết gói (`plan_lapsed`) không mở tay — ghi chú dưới viên trạng thái |
| M6 | "Gỡ thành viên" (bản cũ) | 🟡 | Giữ — dòng "Gỡ khỏi gian hàng" trong "…" |
| M7 | "Xem chi tiết" | 🆕→✅ | Ngăn chi tiết chuẩn (`DetailDrawer md`, `?open=`), chỉ đọc — design không vẽ |
| M8 | Dòng của chủ gian hàng | 🟡 | Vẫn hiện, đứng đầu, không thao tác (design không vẽ) |
| M9 | Hộp mời: ô Email + "Gửi lời mời qua SMS" | ⚠️ | **Bỏ** (ADR 0060 điều 8). Giữ bước "sao chép liên kết" sau khi gửi. Thêm "Tên gợi nhớ"; mô tả ngắn cạnh tên vai; quản lý chỉ thấy vai Nhân viên |
| M10 | "+ Vai trò & quyền" (gợi ý tạo vai) | ⚠️ | Nút KHÔNG dấu + ; trang là ma trận CHỈ XEM tính từ quyền thật — không tick, không tạo vai (ADR 0086 điều 1) |
| M11 | "Admin gian hàng" | ⚠️ | Giữ "Chủ gian hàng"; "Nhân viên gian hàng" → "Nhân viên", "Chỉ xem" → "Quan sát viên" (nhãn dùng chung cả app) |
| M12 | Ô "Chi nhánh được giao" chỉ ở cột Nhân viên | ⚠️ | Thành một dòng chú thích chung dưới bảng — mọi vai trừ chủ đều giới hạn chi nhánh được |
| M13 | Ma trận thiếu dòng | 🆕 | Thêm Khách hàng · Bảo dưỡng & KM · Chính sách thuê · Quản lý ví (chỉ chủ) · Yêu cầu hỗ trợ |
| M14 | Ô lệch design có chủ đích | ⚠️ | Nhân viên: "Huỷ đơn, hoàn cọc, phụ phí" + "Sổ thu chi" = Có giới hạn (giữ thu tiền khi giao/nhận xe); Quan sát viên: "Doanh thu & báo cáo" = ✓ (dòng không có thao tác) — khoá ở `role-matrix.test.ts` |

**Đổi lại 09/11/2026 (người dùng chốt — ADR 0087, ghi đè M3/M9 phần mời):** chủ **CẤP tài khoản** cho nhân
viên thay cho mời bằng SĐT. Nút đầu trang là "Thêm nhân viên" (`StaffAccountDialog`: họ tên · tên đăng nhập
tự do, duy nhất toàn site · mật khẩu có "Tạo ngẫu nhiên" · vai · chi nhánh · SĐT liên hệ) → tạo xong hiện
khối thông tin đăng nhập một lần (`StaffCredentials`, có "Sao chép tất cả"). Lời mời cũ còn hạn vẫn là dòng
"Chờ xác nhận", chỉ còn Thu hồi (không Mời lại). Menu "…" thêm **Đặt lại mật khẩu** (chỉ tài khoản do gian
hàng cấp — `ResetPasswordDialog`). Hộp Chỉnh sửa: họ tên (tài khoản do gian hàng cấp) · vai · chi nhánh · SĐT
liên hệ — tên gợi nhớ bỏ khỏi giao diện. **Ngăn chi tiết làm lại** (người dùng chê thiếu): thẻ người · Quyền
truy cập (công tắc khoá/mở có xác nhận, vai + mô tả, chi nhánh, loại tài khoản, tên đăng nhập) · Liên hệ ·
Quyền của vai (cùng phép tính với ma trận) · Hoạt động · Hoạt động gần đây (`GET /members/:userId/activity`);
chân ngăn Chỉnh sửa / Đặt lại mật khẩu / Gỡ. Đăng nhập site partner: một ô "Số điện thoại hoặc tên đăng nhập"
(`PartnerPasswordForm`); tài khoản do gian hàng cấp không qua `AccountPhoneGate`.

Trạng thái tự dựng: đang tải / lỗi + thử lại (bảng và ma trận) · rỗng (có lối mời) · không khớp bộ lọc ·
chỉ xem khi gói hết hạn (không menu ghi) · người bị giới hạn chi nhánh chỉ thao tác dòng nằm gọn trong
phần mình · phiên hỗ trợ (chỉ xem; ma trận mở ở `/admin/tenant-support/:id/members/roles`) · ma trận cuộn
ngang trong khung khi hẹp. Frame danh sách tô menu "Doanh thu" là vẽ nhầm — khối đúng là Cấu hình.

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
| `23874:79920` | Section "Đơn thuê xe" gộp: List `23973:51952` (nhóm `23973:82735`, thẻ `23978:92713`) · Kanban `23895:15181` (nội dung `23898:24586`; thẻ "_Kanban Item" chờ duyệt `23895:15196`, đang thuê `23895:15208`) · Kanban + Tạo đơn `23948:84908` · Đơn đã kết thúc `23948:87473` · các bước `23898:28955` (Phê duyệt `23898:25444`, Từ chối `23919:39682`, Huỷ khi chờ trả `23930:44688`, toast duyệt `23930:42529`, Gia hạn `23941:62236`, Nhận xe `23941:64008` / modal `23941:65305`) |
| `24117:65745` | Đơn thuê xe — điện thoại "Rental Request - MB" (10/11): dải tab `24117:67234` · thẻ mở `24117:72641` · thẻ thu gọn `24117:72841` · thẻ siêu gọn nháp `24117:69914` (không dựng). Chấm tab: đỏ #D92D20 · cam #F79009 · xanh #1570EF · lá #039855 |
| `23948:99504` | Chi tiết đơn — đơn đã huỷ (Failed) · `23930:45292` đang thuê + toast |
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
| `23857:58927` | Section Doanh thu / Tài chính: Tổng quan doanh thu theo xe `23813:30723` (page header `23813:30726`, sáu thẻ `23813:32225`, biểu đồ `23813:32266`, cơ cấu `23813:37042`, hiệu suất `23813:37081`, thuế `23813:38909`) · theo khách `23813:38107` (bảng `23813:38176`) · Quản lý ví `23813:39558` · `23813:55449` |
| `23948:93534` | Section Quản lý ví: tổng hợp `23813:39558` · biến động `23813:55449` · cột phải `23948:94510` (thẻ ví `23948:94474`, tổng hợp tháng `23948:94282`, ghi chú thuế `23948:94298`) · hộp thêm tài khoản `23948:96973` · hộp đổi `23948:97512` · toast `23948:98047` |
| `23857:58928` | Section Lịch sử giao dịch / Thu Chi: danh sách `23813:58308` · chi tiết phiếu `23845:39621` (hộp `23845:40261`) · danh mục `23845:41048` (hộp `23845:41185`) · tạo phiếu thu `23845:42715` (hộp `23845:43494`) · tạo phiếu chi `23857:57950` (hộp `23857:58087`) |
| `23874:63907` | Chính sách thuê: page header `23874:64498` (tab loại xe) · Thanh toán & hóa đơn `23874:68740` · Thủ tục & điều khoản `23979:96566` · Giao nhận xe + thời gian chết `24047:77366` · Ưu đãi dài hạn `24047:77588` · cột phải `24051:80740` |
| `24051:85101` | Menu hồ sơ: biến thể gian hàng `24051:85100` · cá nhân `24051:85102` (tên biến thể trong Figma ĐẢO: "Personal" là gian hàng, "Pro" là cá nhân — đọc theo chữ). Nền vàng thẻ gian hàng → `public/partner/account-card-bg.webp`, dấu tích → `public/partner/verified-shop.svg`. Dòng "Nâng cấp gian hàng" `24051:85746` (icon Award 2 → `public/icons/menu/award.svg`, `LineIcon` `award`) |
| `23999:111044` | Section Thông tin cửa hàng: thường `23999:111274` (tiêu đề `23999:111277`, ba thẻ `23999:111298`, chi nhánh `23999:111349`, gói `23999:111391`, hoá đơn `23999:111432`, cột hiển thị `23999:111472`) · doanh nghiệp `23999:111045` · nhân viên `23999:111476` · hộp mua gói `24024:26537` (trong `23999:115279`) · hộp địa chỉ `23999:111878` · hộp thuế `23999:112100` · hộp chi nhánh `23999:112321` · hộp hiển thị `24047:78679` · trang thanh toán `24051:79507`. Huy hiệu bậc + nền doanh nghiệp đã tải về `public/shops/plans/` |
| `24035:71005` | Section Nhân viên & Phân quyền: danh sách `24035:69458` (menu "…" `24035:69512`) · hộp Mời thành viên `24035:69694` (trong frame `24035:69639`) · Vai trò & quyền `24035:69513` |
| `23874:63125` | Section Lịch sử giao dịch / Công nợ: danh sách `23857:58932` · chi tiết công nợ đơn `23872:60137` (hộp `23872:60767`) · thu tiền đơn `23872:61964` (hộp `23872:62755`) |

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
onboarding  payment/[id]  payment/checkout/[id]  payment-return  receipts  registration  security→account  shop
shop/branches→shop  shop/payment/[id]  shop/payment/checkout/[id]  shop/payment-settings→shop/policies
shop/policies  shop/seller-profile→shop
subscription  support  support/cases  tax  trips  vehicles  vehicles/new  vehicles/register
vehicles/[id]  vehicles/[id]/edit  vehicles/[id]/optimization  vehicles/[id]/pricing
vehicles/[id]/manage/…  (information · images · documents · pricing · handover-time · trip-history ·
self-drive/{pricing,delivery,handover-time,optimization,terms} · with-driver/{pricing,surcharges,
optimization,terms})
công khai: login  register  forgot-password  reset-password
```
