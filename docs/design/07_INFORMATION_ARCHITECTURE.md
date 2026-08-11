# 07 — Information Architecture

> Ngày: 04/08/2026 · Chủ sở hữu: Product Director
> Nguồn kỹ thuật: `apps/web/src/constants/routes.ts` · `constants/nav.ts` · `apps/web/src/proxy.ts`.
> Ký hiệu: ✅ đã có · 🟡 có nhưng là stub/chưa đủ · 🆕 đề xuất mới.

---

## 1. Mô hình gốc: hai cánh cửa, một sản phẩm

```
                    xeprime.vn
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   MARKETPLACE  /                    PORTAL  /manage
   khách thuê · công khai · SEO      vận hành · sau đăng nhập · noindex
        │                                 │
   ┌────┴────┐                    ┌───────┴───────┐
   │         │                    │               │
 guest   customer            tenant scope    platform scope
                             (gian hàng)      (nền tảng)
```

**Quy tắc phân định** — điều gì thuộc cánh cửa nào:

| Thuộc marketplace | Thuộc portal |
| --- | --- |
| Mọi thứ khách thuê cần: tìm, xem, đặt, theo dõi chuyến, nhắn tin, hồ sơ cá nhân | Mọi thứ để *kinh doanh* xe: xe, đơn, lịch, tiền, nhân sự, duyệt |
| Không cần đăng nhập để xem | Cần đăng nhập, luôn |
| `/account` — hồ sơ **khách thuê** | `/manage/shop` — hồ sơ **gian hàng** |

> Hai cái trên từng bị nhầm là một. Chúng không phải. Một người có thể có cả hai và chúng không liên quan nhau.

---

## 2. Sitemap — Marketplace

| Route | Trạng thái | Vai trò | Ghi chú |
| --- | --- | --- | --- |
| `/` | ✅ | Trang chủ: hero tìm kiếm, gợi ý xe, địa điểm, gian hàng nổi bật, 4 bước | Static render — **không được phá** (SEO) |
| `/search` | 🆕 | Kết quả tìm kiếm đầy đủ với bộ lọc, tách khỏi trang chủ | Hiện kết quả nằm ngay trên `/`; tách ra để có URL chia sẻ được, phân trang và SEO theo tỉnh/loại xe |
| `/listings/[id]` | ✅ | Chi tiết xe | Cần bổ sung: lịch còn trống (C-02), bảng giá (C-03), chính sách (C-04) |
| `/shops/[slug]` | ✅ | Trang gian hàng công khai | |
| `/trips` | ✅ | Chuyến của tôi + đánh giá sau chuyến | Cần dòng thời gian trạng thái yêu cầu (C-10) |
| `/trips/[id]` | 🆕 | Chi tiết một chuyến: dòng thời gian, hợp đồng, liên hệ shop, khiếu nại | Hiện chỉ có danh sách |
| `/chat` | ✅ | Tin nhắn với gian hàng | |
| `/account` | ✅ | Hồ sơ khách thuê | |
| `/account/saved` | 🆕 | Xe đã lưu | Hoặc **gỡ icon trái tim** đang chết trên thẻ xe (C-05) |
| `/help`, `/terms`, `/privacy` | 🆕 | Trang tĩnh — chân trang hiện trỏ tất cả về `/` | Link chết trong footer là lỗi tin cậy |
| `?auth=login` / `?auth=register` | ✅ | Auth modal trên chính trang đang xem | Không phải route riêng — đúng thiết kế 04/08 |
| `/login`, `/register` | ✅ | Chuyển hướng tương thích về `/?auth=…` | Giữ cho link cũ |

---

## 3. Sitemap — Portal gian hàng

### 3.1 Vấn đề của menu hiện tại

`SHOP_NAV` có **15 mục trong 3 nhóm** (Tổng quan · Quản lý 9 mục · Cài đặt 6 mục), trong đó 4 mục là stub `comingSoon`. Ba vấn đề:

1. Nhóm "Quản lý" gom lẫn ba loại việc khác nhau (điều hành hằng ngày, tài sản, tiền) nên không có nhóm nào tra được nhanh.
2. Tài chính bị chẻ làm ba mục cạnh nhau (**Tài chính · Thu chi · Công nợ**) — người dùng phải nhớ tiền nằm ở mục nào.
3. Menu hứa 4 thứ chưa có.

### 3.2 IA đề xuất — 4 nhóm theo *câu hỏi của người dùng*

| Nhóm | Câu hỏi nó trả lời | Mục |
| --- | --- | --- |
| **Tổng quan** | "Hôm nay tôi phải làm gì?" | `/manage` |
| **Điều hành** | "Xe đang ở đâu, ai đang thuê?" | Lịch thuê xe · Yêu cầu thuê · Đơn thuê · Bàn giao 🆕 |
| **Tài sản & khách** | "Tôi có gì, ai là khách của tôi?" | Xe · Khách hàng 🟡 · Tài xế 🟡 · Khu vực nhận xe 🟡 |
| **Tiền** | "Tháng này lãi hay lỗ, ai còn nợ?" | Tổng quan tài chính · Thu chi · Công nợ · Hợp đồng |
| **Cài đặt** | "Cấu hình gian hàng" | Gian hàng · Người dùng · Gói dịch vụ 🆕 · Thùng rác 🟡 |
| *(ngoài nav)* | | Trò chuyện → icon ở topbar cùng thông báo |

**Ba thay đổi cụ thể**:
- **"Cửa hàng" → "Gian hàng"** (thống nhất từ vựng, `01` §9).
- **Trò chuyện rời khỏi nav** lên topbar cạnh chuông thông báo — nó là kênh liên lạc, không phải một khu vực nghiệp vụ, và ở đó mới thấy được badge chưa đọc mọi lúc.
- **Mục stub không nằm trong nav.** Thay bằng: khi người dùng cần chức năng đó (ví dụ chọn khu vực nhận xe lúc tạo đơn) thì có link "Quản lý khu vực nhận xe" tại chỗ. Menu hứa ít, giao đủ.

### 3.3 Bảng route

| Route | Trạng thái | Ghi chú |
| --- | --- | --- |
| `/manage` | ✅ | Tổng quan — cần đổi thành "việc hôm nay" (S-04) |
| `/manage/login` | ✅ | Công khai, không bị proxy đẩy về `/manage` |
| `/manage/onboarding` | ✅ | Nơi **duy nhất** render form tạo gian hàng |
| `/manage/calendar` | ✅ | Cần bản mobile riêng (`05` §6) |
| `/manage/booking-requests` | ✅ | Yêu cầu thuê từ marketplace |
| `/manage/bookings` · `/manage/bookings/[id]` | ✅ / 🆕 | Chi tiết đang là drawer; cần URL riêng để chia sẻ được |
| `/manage/handovers` | 🆕 | Bàn giao xe có bằng chứng (S-03) |
| `/manage/vehicles` · `/new` · `/[id]` · `/[id]/edit` | ✅ | |
| `/manage/maintenance` | 🆕 | Trung tâm bảo dưỡng/KM toàn đội xe; chi tiết record dùng drawer |
| `/manage/customers` · `/[id]` | 🟡 / 🆕 | Khách hàng **của shop** (S-01) — khác `/manage/admin/customers` |
| `/manage/drivers`, `/manage/pickup-areas`, `/manage/trash` | 🟡 | Stub |
| `/manage/finance` · `/receipts` · `/debts` | ✅ | Gom thành nhóm "Tiền" |
| `/manage/finance/vehicle-obligations` | 🆕 | Kỳ trả góp, thuê lại và quyết toán hợp tác theo xe |
| `/manage/contracts/[id]` | ✅ | Xem/in hợp đồng |
| `/manage/shop` | ✅ | Hồ sơ gian hàng |
| `/manage/members` | ✅ | Người dùng của gian hàng |
| `/manage/settings/rental-policies` | 🆕 | Mặc định cọc, giao nhận, quá giờ và giảm giá của gian hàng |
| `/manage/subscription` | 🆕 | Gói của **chính gian hàng này** + hoá đơn (G-02). Hiện gói chỉ quản lý từ phía nền tảng |

---

## 4. Sitemap — Portal nền tảng

| Route | Trạng thái | Ghi chú |
| --- | --- | --- |
| `/manage` (scope nền tảng) | ✅ | Dashboard nền tảng — chọn theo `platformRole` |
| `/manage/admin` | ✅ | Duyệt hồ sơ. Cần checklist chất lượng (G-04) + hiện lý do ẩn trước đó (G-03) |
| `/manage/admin/tenants` | ✅ | Gian hàng: khoá/mở, gói/hạn |
| `/manage/admin/vehicles` | ✅ | Xe toàn hệ thống, ẩn/bỏ ẩn |
| `/manage/admin/bookings` | ✅ | Đơn toàn hệ thống — **chỉ đọc** |
| `/manage/admin/customers` | ✅ | Khách thuê, PII che sẵn |
| `/manage/admin/staff` | ✅ | Nhân sự nền tảng |
| `/manage/admin/plans` | ✅ | Gói dịch vụ |
| `/manage/admin/audit` | ✅ | Nhật ký hệ thống |
| `/manage/admin/tickets` | 🆕 | Hỗ trợ/khiếu nại (G-01 + C-09) |
| `/manage/admin/invoices` | 🆕 | Hoá đơn gói (G-02) |
| `/manage/admin/reports` | 🆕 | Báo cáo nền tảng (G-05) |

Khu `/manage/admin/*` có layout riêng trả **403 có giải thích** khi thiếu `platformRole` — không đẩy sang onboarding gian hàng.

---

## 5. Quy ước URL

| Loại | Quy ước | Ví dụ |
| --- | --- | --- |
| Bộ lọc, phân trang, khoảng thời gian, tab | **Query param** (ADR 0004) | `/manage/bookings?status=active&page=2&from=2026-08-01` |
| Trạng thái UI tạm (drawer đang mở, chọn nhiều) | Redux/local, **không** vào URL | |
| Định danh bản ghi | Path segment | `/listings/01KZ…` |
| Ý định | Query param | `?auth=login&next=/trips`, `?intent=owner` |
| Nội dung công khai có SEO | Slug | `/shops/gian-hang-demo` |

**`next` luôn phải qua `isSafeNextPath`** (`features/auth/safe-next.ts`): chỉ nội bộ, đúng một `/` đầu, chặn `//evil.example` và URL tuyệt đối.

**Nguyên tắc chia sẻ được**: bất kỳ trạng thái nào người dùng có thể muốn gửi cho đồng nghiệp ("xem đơn này giúp anh") phải có URL. Đây là lý do chi tiết đơn thuê cần `/manage/bookings/[id]` chứ không chỉ là drawer.

---

## 6. Mô hình khái niệm người dùng nhìn thấy

Người dùng không cần biết 35 bảng. Họ cần thấy **sáu** danh từ và quan hệ giữa chúng:

```
GIAN HÀNG ──┬── XE ──── LỊCH (dải thời gian bận)
            │            ▲
            ├── YÊU CẦU THUÊ ──duyệt──► ĐƠN THUÊ ──┬── PHIẾU THU/CHI
            │        ▲                              ├── HỢP ĐỒNG
            │        │                              └── CÔNG NỢ (= tổng − đã trả)
            └── KHÁCH THUÊ ───────────────────────────┘
```

**Hệ quả cho điều hướng chéo** — từ mỗi thực thể phải đi được tới thực thể kề nó **trong một chạm**:

| Đang xem | Phải tới được |
| --- | --- |
| Đơn thuê | Xe · Khách · Lịch · Phiếu thu · Hợp đồng |
| Xe | Lịch của xe · Đơn thuê của xe · Doanh thu của xe |
| Khách | Lịch sử đơn · Công nợ · Cuộc trò chuyện |
| Yêu cầu thuê | Xe · Lịch (kiểm tra trùng) · Khách |

Hiện tại nhiều liên kết trong số này chưa có — đó là lý do người dùng phải quay ra menu và tìm lại từ đầu.

---

## 7. Tìm kiếm và điều hướng nhanh

| Cấp | Cơ chế | Phạm vi |
| --- | --- | --- |
| Trong màn | Ô tìm kiếm của danh sách đó | Chỉ danh sách đang xem |
| Toàn portal | **⌘K / Ctrl+K** 🆕 (X-04) | Nhảy màn hình · tìm đơn theo mã/SĐT · tìm xe theo biển số · tìm khách theo tên/SĐT · hành động nhanh ("Tạo đơn") |
| Marketplace | Hero search | Xe công khai |

⌘K là thứ khiến 15 mục menu không còn là vấn đề: người dùng thành thạo gõ, người mới bấm menu. Không có nó, mọi tính năng mới đều phải giành chỗ trong nav.

---

## 8. Thông báo

Một trung tâm thông báo duy nhất ở topbar, phân loại theo **mức độ cần hành động**:

| Loại | Ví dụ | Hành vi |
| --- | --- | --- |
| Cần xử lý | Yêu cầu thuê mới · đơn quá hạn thu · hồ sơ chờ duyệt | Có badge số, tồn tại đến khi xử lý xong |
| Đã xảy ra | Khách huỷ · xe được duyệt public | Đánh dấu đã đọc là xong |
| Hệ thống | Gói sắp hết hạn | Có ngày hết hạn rõ |

Thông báo luôn **liên kết thẳng tới đối tượng**, không phải tới danh sách chứa nó.

---

## 9. Trần IA — luật giữ sản phẩm không phình

1. Nav gian hàng **tối đa 5 nhóm × 5 mục**. Muốn thêm mục thứ 6 vào một nhóm thì phải bỏ một mục.
2. **Không đưa stub vào nav.** Chức năng chưa có thì không có chỗ trong menu.
3. Tính năng chỉ dùng bởi < 20% gian hàng vào **cài đặt**, không vào nav.
4. Mọi màn hình mới phải trả lời được: nó thuộc nhóm nào, thay thế/gộp với màn nào.
5. Marketplace tối đa **5 tab** ở mobile.

---

## 10. Việc cần làm cho IA

| # | Việc | Mức |
| --- | --- | --- |
| IA-1 | Tách `/search` khỏi trang chủ | P1 |
| IA-2 | Gom 3 mục tiền thành nhóm "Tiền"; đổi "Cửa hàng" → "Gian hàng" | P0 |
| IA-3 | Đưa Trò chuyện lên topbar, bỏ khỏi nav | P1 |
| IA-4 | Gỡ 4 mục stub khỏi nav, thay bằng link tại chỗ | P0 |
| IA-5 | Thêm URL cho chi tiết đơn thuê / khách / chuyến | P1 |
| IA-6 | Bổ sung liên kết chéo theo bảng §6 | P1 |
| IA-7 | ⌘K | P2 |
| IA-8 | Trang tĩnh `/help`, `/terms`, `/privacy` (footer đang trỏ link chết) | P1 |

Liên quan: `03_PRODUCT_GAP_ANALYSIS.md` · `09_PAGE_DESIGN_ORDER.md`.
