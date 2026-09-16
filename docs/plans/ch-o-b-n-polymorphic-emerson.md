# Tái cấu trúc menu Manage: gộp "Thu cọc qua XePrime" + nhóm mới "Ví & Gói"

## Context

Sidebar `SHOP_NAV` (`apps/web/src/constants/nav.ts`) hiện nhóm mọi thứ không thuộc vận
hành/tài chính-sổ-sách/mặt-tiền vào một rọ "CẤU HÌNH" chung: `Chính sách thuê`, `Gói của
tôi`, `Chi nhánh`, `Tài xế`, `Thu cọc qua XePrime`, `Hồ sơ người bán`, `Người dùng & phân
quyền`. Trong đó ba mục dính tiền (Gói, Thu cọc, tài khoản ngân hàng trong Hồ sơ người bán)
lẫn với cấu hình vận hành thuần (Chi nhánh, Tài xế) — không có ranh giới. Khảo sát thực tế
(ảnh chụp sidebar + đọc `nav.ts`) xác nhận đúng cấu trúc này đang chạy.

Hai vấn đề cụ thể được xác nhận với người yêu cầu:

1. **"Thu cọc qua XePrime"** (`/manage/shop/payment-settings`) là một trang riêng, một mục
   nav riêng, một permission riêng — cho đúng MỘT cái Switch. Nội dung trang còn tự nhận nó
   nói về "cọc" giống trang `Chính sách thuê` (chỉ khác là cọc online XePrime giữ hộ vs cọc
   trực tiếp gian hàng thu tại quầy) — hai màn hình cho cùng một khái niệm mà người dùng
   phải tự suy ra quan hệ. Đã kiểm tra ADR 0032/0027: KHÔNG có ADR nào bắt buộc tách hai màn
   — dòng "hai khái niệm tiền khác nhau, hai màn" chỉ là comment triển khai ở `routes.ts`,
   không phải quyết định kiến trúc. Gộp trang là an toàn, miễn giữ rõ ràng ranh giới hai khái
   niệm tiền trong UI.
2. **Ví điểm** (nghĩa vụ XePrime phải trả chủ xe) và **Gói của tôi** (mua/gia hạn gói thuê
   bao) là hai khoản tiền chủ xe/gian hàng theo dõi thường xuyên nhất, nhưng bị rải: Ví điểm
   nằm ẨN dưới nhánh con "Tài chính" (phải bấm mở), Gói của tôi nằm trong rọ "CẤU HÌNH". Cần
   một điểm vào chung, nổi bật ngang các nhóm khác.

**Không đổi**: route/permission/API của từng tính năng giữ nguyên (Ví điểm vẫn
`ownerOnly` + `TENANT_VIEW`, Gói vẫn `SUBSCRIPTION_VIEW`, công tắc thu cọc vẫn không gác
bằng `feature` theo đúng lý do ở comment hiện tại — ADR 0027 điều 4). Đây là việc dọn **điều
hướng**, không đổi mô hình dữ liệu/tiền (mọi ràng buộc ở CLAUDE.md mục 5 về ví/tiền vẫn giữ
nguyên vì không có bảng/service nào bị đụng).

Không gồm trong lần này: bổ sung UI tra cứu trạng thái cọc theo từng booking ở
`/manage/bookings/[id]` (điểm thiếu đã ghi nhận riêng, để task khác).

## Thay đổi 1 — Gộp "Thu cọc qua XePrime" vào trang "Chính sách thuê"

File chính: `apps/web/src/app/(manage)/manage/shop/policies/page.tsx`

- Thêm một section **tenant-wide** (không thuộc tab theo loại xe) hiển thị
  `DepositToggleCard` (`apps/web/src/features/shop/components/DepositToggleCard.tsx`), dùng
  lại `usePaymentSettings`/`useUpdatePaymentSettings`
  (`apps/web/src/features/shop/hooks/use-shop.ts`) — logic/hooks giữ nguyên, chỉ đổi nơi
  render. Đặt section này TRƯỚC `PolicyWorkspace` (tabs theo loại xe), có heading riêng rõ
  ràng để không bị hiểu nhầm là một phần của form chính sách theo loại xe — vì công tắc này
  không theo loại xe, còn `ShopPolicyForm` thì có.
  - Permission gộp: `PermissionState` hiện tại của trang xét `PERMISSION.TENANT_VIEW`; giữ
    section chính sách như cũ, còn section công tắc cọc tự xét thêm
    `PERMISSION.SELLER_PROFILE_VIEW`/`SELLER_PROFILE_MANAGE` (như trang cũ) và ẨN phần đó
    nếu thiếu quyền — không chặn cả trang.
  - Giữ đúng docblock giải thích tại sao route KHÔNG gác theo `PLAN_FEATURE.ESCROW_HOLD`
    (chuyển comment đó theo xuống section mới).
- Xoá file trang cũ `apps/web/src/app/(manage)/manage/shop/payment-settings/page.tsx` +
  `page.module.css`. Thay bằng một `page.tsx` tối giản chỉ `redirect(ROUTES.MANAGE.SHOP_POLICIES)`
  (Next.js `redirect()` từ `next/navigation`) để không bẻ gãy đường dẫn cũ ai đã bookmark.
- `apps/web/src/constants/nav.ts`: xoá mục lá `shop-payment-settings` khỏi section
  `settings`.
- `apps/web/src/constants/routes.ts`: giữ hằng `SHOP_PAYMENT_SETTINGS` (dùng cho redirect),
  cập nhật comment nói rõ đây giờ là alias-chuyển-tiếp, không phải trang thật.

## Thay đổi 2 — Nhóm nav mới "Ví & Gói"

File chính: `apps/web/src/constants/nav.ts`

- Thêm `NavSection` mới, key `wallet-billing`, `labelKey: 'manageGroups.walletBilling'`,
  đặt SAU section `business` (chat + tài chính sổ sách) và TRƯỚC `storefront` — mạch hành
  trình mới: xem tình hình → vận hành → chăm khách & sổ sách kinh doanh → **tiền của tôi với
  XePrime** → mặt tiền marketplace → cấu hình → hỗ trợ.
- Chuyển leaf `balance` (`manage.balance`, hiện đang lồng trong nhánh `finance` của section
  `business`) ra làm leaf trực tiếp của section mới — giữ nguyên toàn bộ field
  (`ownerOnly: true`, `permission: TENANT_VIEW`, icon `WalletOutlined`). Nhánh `finance`
  trong `business` chỉ còn `finance-overview`/`receipts`/`debts`.
- Chuyển leaf `subscription` (`manage.subscription`, hiện trong section `settings`) ra làm
  leaf trực tiếp của section mới — giữ nguyên `permission: SUBSCRIPTION_VIEW`.
- Cập nhật docblock ở đầu `SHOP_NAV` (dòng giải thích trật tự nhóm) để phản ánh đúng cấu
  trúc mới — không còn đúng nguyên văn "Không mục nào bị xoá so với bản 18-mục..." vì đây là
  một lần đổi cấu trúc tiếp theo, nên viết lại đoạn đó theo đúng thay đổi lần này (nguồn gốc
  lịch sử cũ không cần nhắc lại).

## Thay đổi 3 — i18n (bắt buộc dùng skill `i18n`)

- `packages/domain/messages/{vi,en}/navigation.json`: thêm khoá
  `manageGroups.walletBilling` (vi: "Ví & Gói", en: cân nhắc "Wallet & Plan").
- `packages/domain/messages/{vi,en}/shop.json`: rà lại namespace `Shop.paymentSettings` —
  giữ các khoá `toggle.*`/`forbidden.*` đang dùng lại trong section mới, xoá `title`/`subtitle`
  nếu không còn dùng làm tiêu đề trang (đổi thành tiêu đề section trong `Shop.policies`, hoặc
  giữ nguyên nếu section vẫn cần một dòng subtitle riêng).
- Chạy `pnpm --filter @xeprime/web i18n:check` sau khi sửa để bắt lệch parity vi/en.

## Kiểm chứng

- Không có test nào hiện tham chiếu `SHOP_PAYMENT_SETTINGS`/`shop-payment-settings`/
  `manage.balance`/`manage.subscription` ngoài `nav.ts`/`routes.ts` (đã grep toàn
  `apps/web`) — rủi ro vỡ test thấp, nhưng vẫn chạy lại toàn bộ test của `apps/web` liên
  quan `nav`/`policies`/`payment-settings`/`subscription` sau khi sửa (skill
  `verify-changes`, chỉ scope `apps/web`, không quét cả workspace).
- Build/typecheck/lint theo skill `verify-changes`.
- Chạy dev server, kiểm tay:
  - `/manage/shop/policies` hiện đủ hai section (công tắc thu cọc + tabs chính sách theo
    loại xe), lưu được cả hai độc lập.
  - `/manage/shop/payment-settings` (route cũ) redirect sang `/manage/shop/policies`.
  - Sidebar hiện nhóm "Ví & Gói" chứa đúng "Ví điểm" + "Gói của tôi", section `business`
    không còn "Ví điểm" trong nhánh Tài chính, section `settings` không còn "Thu cọc qua
    XePrime"/"Gói của tôi".
  - Đăng nhập bằng một `shop_manager` (không phải `shop_owner`) để xác nhận "Ví điểm" vẫn
    ẩn đúng theo `ownerOnly` ở vị trí mới.
