# App native — trạng thái toàn bộ module và nợ kỹ thuật

> Ngày viết: 03/09/2026 · Nhánh `feature/mobile-vehicle-module`
> Nguồn: **`apps/mobile/docs/Mobile Tracking.html` (97 dòng / 12 module)** đối chiếu với **code
> thật trong `apps/mobile`** (cây `app/`, `src/features/`, và các mục còn trống ở `manage-nav.ts`).
>
> Đây là bản đồ "đang ở đâu" của riêng app native. Tiến độ chung của cả dự án vẫn ở
> `docs/completion-roadmap.md`; mức sẵn sàng dùng chung code với web ở
> `docs/mobile-readiness-audit.md`; chi tiết module Vehicle ở `docs/mobile-vehicle-module-status.md`.

---

## 1. Tổng quan

| Module | Dòng | Đã dựng | Còn lại | Ghi chú |
| --- | --- | --- | --- | --- |
| Authentication | 7 | **7** | 0 | Xong trọn, kể cả Bearer + refresh xoay vòng (ADR 0017) |
| Marketplace | 6 | 6 | 0 | Đủ — **MKT-05** dựng 09/09/2026 |
| Booking / Rental | 16 | **16** | 0 (1 phần) | **BKG-14** xem được, chưa in/xuất PDF |
| Vehicle | 13 | 11 | 2 | **VEH-08** bỏ · **VEH-13** hoãn |
| Customer | 4 | **4** | 0 | Xong trọn (07/09) — `docs/mobile-customer-module-status.md` |
| Shop | 9 | **7** | 2 | SHP-01→07 xong (08/09) — `docs/mobile-shop-module-status.md`. SHP-08/09 web chưa có bản để clone |
| Finance | 6 | **6** | 0 | Xong trọn (07/09) — `docs/mobile-finance-module-status.md` |
| Calendar | 3 | 0 | 3 | CAL-03 là ràng buộc CSDL, không phải màn |
| Communication | 7 | 0 | 7 | COM-01 mới là màn rỗng |
| Payment | 4 | 0 | 4 | **Không làm ở giai đoạn này** — ADR 0013 |
| Admin / Management | 13 | 0 | 13 | Toàn bộ P3 |
| System | 9 | 4 | 5 | i18n · hợp đồng API · R2 · test (một phần) |

**Đã đóng trọn bốn module lớn nhất**: Booking/Rental (16 dòng), Vehicle (11/13), Customer (4)
và Finance (6) — cộng lại 37/97 dòng, và là toàn bộ phần nghiệp vụ nặng của cổng quản lý.

---

## 2. Từng module — dựa trên CODE, không chỉ trên tracking

### 2.1 Authentication — 7/7 ✅

Đủ AUTH-01→07. Route: `/login` `/register` `/forgot-password` `/reset-password` `/set-password`
`/auth/callback`. Bearer 15 phút + refresh xoay vòng single-flight + thu hồi theo thiết bị
(`src/lib/auth-session.ts`), RBAC đọc lại từ `/auth/me` mỗi lần.

### 2.2 Marketplace — 5/6

Có: `/explore` (MKT-01) · `/search` (MKT-02, 03) · `/listings/[id]` (MKT-04) · máy báo giá dùng
trong wizard đặt xe (MKT-06).

**MKT-05 — trang gian hàng công khai (xong 09/09/2026).** Route `/shops/[slug]`, trùng địa chỉ
với web nên một liên kết chia sẻ mở được ở cả hai nơi. Hai khối như web: hồ sơ gian hàng rồi
danh sách xe đang cho thuê (native cuộn tải dần thay cho bộ phân trang số trang).

Năm lối vào, đúng năm chỗ web có liên kết: gian hàng nổi bật ở trang chủ · chân mỗi thẻ xe ·
thẻ gian hàng ở trang chi tiết xe · khối gian hàng ở chi tiết chuyến của khách · hàng gian hàng
trong wizard gửi yêu cầu. Thêm một lối chỉ app có, thay cho `target="_blank"` của web: nút
"Xem gian hàng" ở hồ sơ gian hàng trong khu quản lý.

Ảnh bìa và logo dùng `components/ui/ShopCover.tsx` — CÙNG hiện thực với khối danh tính bên khu
quản lý, vì khối đó là bản xem trước của chính trang này.

### 2.3 Booking / Rental — 16/16, một phần chưa trọn

Route đủ: hộp thư yêu cầu · đơn thuê · biên bản giao/nhận · quyết toán · ghi nhận thu tiền ·
tạo đơn tay · chuyến của khách · đánh giá.

**BKG-14 hợp đồng — sửa lại mô tả cũ.** `apps/mobile/README.md` đang ghi "⛔ CHẶN", **không
chính xác**: `features/contracts/ContractScreen.tsx` đã dựng và XEM được hợp đồng (đọc từ
`snapshot`, không đọc lại đơn). Phần thật sự còn thiếu là **in / xuất PDF khổ A4** — cần một
endpoint xuất PDF ở server.

### 2.4 Vehicle — 11/13

Chi tiết ở `docs/mobile-vehicle-module-status.md`. Tóm tắt:

- **VEH-08 (OCR giấy tờ) — BỎ.** Tracking đánh `Blocked` + "Có tương đương web = FALSE": web
  chưa có bản để clone.
- **VEH-13 (giá theo ngày) — HOÃN.** Lối vào duy nhất trên web là ô ngày ở `/manage/calendar`,
  mà app chưa có màn lịch. **Chặn bởi CAL-01.**

### 2.5 Customer — 4/4 ✅

Đủ CUS-01→04 (07/09/2026). Route: `/manage/customers` · `/manage/customers/[id]` · `/account`.
Mục `customers` trong `manage-nav.ts` đã có `href`. Chi tiết, ma trận quyền và phần còn nợ:
`docs/mobile-customer-module-status.md`.

⚠️ **Sửa mô tả cũ về CUS-04.** Bản 03/09 tính CUS-04 là "đã có" vì tab Tài khoản tồn tại; code
thật lúc đó chỉ hiện avatar + tên từ `/auth/me`, **không** có hồ sơ (`/users/me`), không sửa
được tên/ảnh, không có trạng thái xác thực SĐT. Đợt này mới thật sự parity với `AccountView`
bên web.

Đi kèm: dựng `/manage/receipts` ở dạng **sổ Thu-Chi đã lọc sẵn** để hai lối đi từ hồ sơ khách
không thành nút chết. Đó chưa phải FIN-02 — xem §2.7.

### 2.6 Shop — 7/9 ✅

Đủ SHP-01→07 (08/09/2026). Route: `/manage/onboarding` · `/manage/shop` ·
`/manage/shop/branches` · `/manage/shop/policies` · `/manage/members` · `/manage/drivers` ·
`/manage`. Năm mục Shop trong `manage-nav.ts` đã có `href` + cờ gói.

Kèm theo đợt này: **bộ chọn phạm vi chi nhánh** trên thanh trên của cả cổng quản lý
(`BranchScopePill` ở dòng phụ của thanh trên), ghép `branchId` vào đội xe · đơn thuê · yêu cầu
thuê · huy hiệu chờ duyệt.

⚠️ **SHP-08 (khu vực nhận xe) và SHP-09 (thùng rác) KHÔNG làm**: cột "Có tương đương web" của
tracking là `Không` — không có golden master để clone, dựng trước web là tự đặt ra nghiệp vụ.

Chi tiết, ma trận quyền/gói và phần còn nợ: `docs/mobile-shop-module-status.md`.

### 2.7 Finance — 6/6 ✅

Đủ FIN-01→06 (07/09/2026). Route: `/manage/finance` · `/manage/receipts` · `/manage/debts`;
danh mục thu chi là tấm trượt mở từ sổ Thu-Chi; FIN-05/06 vẫn ở màn đơn thuê. Ba mục
`finance-overview` · `receipts` · `debts` trong `manage-nav.ts` đã có `href` + cờ gói.

Chi tiết, ma trận quyền, bốn luật tiền và phần audit FIN-05/06:
`docs/mobile-finance-module-status.md`.

Hai khối dùng chung mở khoá theo: Hồ sơ 360 của xe **giờ CÓ** khối tiền theo kỳ
(`FinanceEntityPanel`, cùng component với tab "Thu chi" của hồ sơ khách), và mọi `ReceiptCard`
đều mở CÙNG một màn chi tiết phiếu.

### 2.8 Calendar — 0/3 ⛔ chặn hai thứ khác

CAL-01 (lịch xe) và CAL-02 (chặn xe) đều chưa dựng. CAL-03 là ràng buộc `EXCLUDE USING gist` ở
CSDL — không phải màn hình, không có việc cho app.

**CAL-01 đang chặn:** VEH-13 (giá theo ngày) và nút "Xem lịch" ở Hồ sơ 360.

### 2.9 Communication — 0/7

COM-01 mới chỉ có màn rỗng (`app/(tabs)/chat.tsx` render `ScreenMessage`). Chưa có danh sách hội
thoại, chưa có tin nhắn, chưa có đính kèm. COM-04 (thông báo trong app) và **COM-07 (push
notification, P0)** chưa bắt đầu.

### 2.10 Payment — 0/4, KHÔNG làm

ADR 0013: **không làm thanh toán trực tuyến ở giai đoạn này**. Cột `API Ready` của cả bốn dòng
đều `FALSE`. Đừng dựng.

### 2.11 Admin / Management — 0/13

Toàn bộ P3, chưa bắt đầu. 12 mục có API sẵn; ADM-13 (ticket hỗ trợ) chưa có API.

### 2.12 System — 4/9

Có: SYS-01 đa ngữ vi/en trên gốc message dùng chung · SYS-03 hợp đồng OpenAPI → type dùng chung ·
SYS-04 R2 (ảnh xe, ảnh bàn giao, tài liệu riêng tư) · SYS-07 bộ test (một phần — xem §3).

Thiếu: SYS-05 trung tâm hỗ trợ · SYS-09 tìm kiếm toàn cục · và ba dòng N/A với app
(SYS-02 responsive web, SYS-06 worker, SYS-08 audit log — đều là chuyện của web/server).

---

## 3. NỢ KỸ THUẬT — gom theo module

### 3.1 Booking / Rental

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| **BKG-14 — in / xuất PDF hợp đồng** | Chặn bởi server | Màn xem đã có. Cần endpoint xuất PDF; hiện chưa có |
| Sửa mô tả sai trong `apps/mobile/README.md` §10 | Nhỏ | Đang ghi BKG-14 "⛔ CHẶN" trong khi màn xem đã chạy |

### 3.2 Vehicle

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| **VEH-13** giá theo ngày | Chặn bởi CAL-01 | ~150 dòng khi có lịch; i18n + query key đã sẵn |
| Đính kèm chứng từ ở **trung tâm** bảo dưỡng | Trung bình | Đã có ở màn từng xe, chưa có ở bảng đội xe |
| **Chưa có test nào** cho module | Cao | Ba chỗ ưu tiên: `publication.ts`, `sensitive-changes.ts`, nhánh `source` của màn giá |
| Ba khu web còn chuỗi thô | Thấp | App đã `t()`; chuyển web sau chỉ là thay chuỗi |

### 3.3 Customer — nợ tab "Thu chi" đã ĐÓNG (07/09, đợt Finance)

Bốn khoản nợ dưới đây đã đóng; giữ lại bảng để người đọc sau biết chúng được giải thế nào.

| Nợ | Đóng thế nào |
| --- | --- |
| **Phiếu trong tab chỉ ĐỌC** | `ReceiptCard` nhận `onPress` + mọc `DetailChevron`, mở `ReceiptDetailSheet` — CÙNG implementation với sổ Thu-Chi |
| **Không tạo / duyệt / huỷ phiếu từ hồ sơ khách** | Giữ nguyên như web: panel không có ba hành động đó. Thao tác đi qua chi tiết phiếu hoặc sổ Thu-Chi |
| **"Xem tất cả N phiếu" dẫn tới màn còn dở** | `/manage/receipts` giờ là FIN-02 đầy đủ; lối vào giữ `tenantCustomerId` và màn đích hiện một viên phạm vi nói rõ đang lọc theo ai |
| Mục `receipts` trong menu chưa có `href` | Đã gắn, cùng `finance-overview` và `debts` |
| Biểu đồ xu hướng dựng bằng `View` | Vẫn vậy — đủ cho hai series cùng thang. Thêm đường lợi nhuận thì lúc đó mới cân nhắc `react-native-svg` |

### 3.4 Nợ chung của app (không thuộc module nào)

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| **Lỗi yup là tiếng Việt cứng** | Trung bình (đang giảm dần) | `@xeprime/validators` gắn chết câu lỗi ở phần lớn schema. Schema nào đã đổi message thành MÃ (`vehicleSourceFormSchema`, `accountProfileSchema`, ba schema Customer từ 07/09) thì đi qua `useValidationResolver` và dịch được ở CẢ HAI client. Phần còn lại vẫn tiếng Việt cứng |
| **Message rich (`<b>`, `<n>`) gọi bằng `t()` trần → in ra NGUYÊN KHOÁ** | Cao | Đã dính hai lần (`overview.odometer`, `source.confirmType.body`). Còn 6 khoá cần soi: `list.row.{bookings,income,profit,loss}`, `overview.plate`, `source.partnership.shopShare` |
| `.expo/types/router.d.ts` sinh SAI khi có Metro khác chạy | Trung bình | `rm -rf .expo/types` → khởi động lại Expo → **rồi mới** typecheck. Đã ghi ở `apps/mobile/README.md` §10 |
| iOS chưa build lần nào | Cao (trước phát hành) | `apps/mobile/README.md` §10 |
| `app.config.ts` chưa tách dev/staging/prod | Trung bình | |
| Chưa có App Links / Universal Links | Trung bình | Link đặt lại mật khẩu trong email mở ở trình duyệt |
| Chưa refetch theo `AppState` / NetInfo | Trung bình | |
| **Push notification (COM-07, P0)** chưa bắt đầu | Cao | Cần cả FCM/APNs lẫn `POST /notifications/device-token` |

---

## 4. Thứ tự nên làm tiếp

Xếp theo **cái gì đang chặn cái gì**, không theo độ khó.

1. **CAL-01 + CAL-02 (Calendar)** — mở khoá VEH-13 và nút "Xem lịch" của Hồ sơ 360. Đang là nút
   thắt duy nhất còn lại của hai module đã xong.
2. **SHP-04 (chính sách thuê mặc định)** — VEH-05 đang cho "đặt lại theo chính sách gian hàng"
   mà không có màn nào để xem chính sách đó.
3. **Làm mịn UI/UX màn danh sách xe + Hồ sơ 360** — đã có phản hồi thực tế (03/09): thẻ xe quá
   cao do chip trạng thái xuống dòng, bảng thông số 17 dòng phần lớn rỗng và nhãn wrap, tiêu đề
   thẻ không nhất quán.
4. **Communication COM-01/04/07** — chat thật + thông báo + push.
5. Admin. *(Customer xong 07/09; Finance xong 07/09; Shop xong 08/09; MKT-05 xong 09/09.)*

---

## 5. Ba luật xuyên suốt — người làm module sau đừng phá

1. **App là bản CLONE NATIVE của web.** Câu chữ, luật nghiệp vụ, điều kiện hiện/ẩn, quyền gác
   từng hành động — lấy 100% từ `apps/web`. Chỉ được khác ở TRÌNH BÀY và năng lực nền tảng.
   Thấy "mobile cần luật khác" là dấu hiệu đọc sai luồng web.
2. **Ba trạng thái phải tách bạch**: đang tải · gọi hỏng · xong-mà-rỗng. Không bao giờ dựng
   `0 km` hay `0 cảnh báo` giả — chưa có thì nói "Chưa có".
3. **Message có thẻ rich BẮT BUỘC đi qua `t.rich`** — `t()` trần sẽ in nguyên khoá lên màn hình.
