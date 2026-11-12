# ADR 0086 — Nhân viên & phân quyền: ma trận vai trò chỉ xem tính từ quyền thật, quyền mặc định mới, danh sách gộp lời mời, tạm khoá thành viên

Ngày: 09/11/2026 · Trạng thái: **Accepted** (09/11/2026 — người dùng chốt khi đối chiếu design Figma
Partner-XePrime section `24035:71005` với tính năng hiện có) · Liên quan: [0002](0002-auth-session-cookie.md),
[0027](0027-feature-tiers-basic-owner-vs-shop.md) điều 3–4, [0038](0038-owner-track-split-and-unified-wallet.md)
điều 3, [0050](0050-platform-tenant-support-context.md), [0052](0052-branch-filter-per-screen.md) (phân quyền
theo chi nhánh), [0053](0053-separate-account-realms.md) điều 6,
[0060](0060-phone-login-and-account-required-booking.md) điều 8, [0076](0076-revocable-web-sessions-login-lockout.md),
[0085](0085-unified-partner-ui-and-plan-slot-transitions.md) điều 6 · Đặc tả BA: `SPEC-BUS-09`

> **Một phần bị ghi đè bởi ADR 0087** ([0087](0087-shop-issued-staff-accounts.md), 09/11/2026): điều 4, 5 phần mời — mời bằng SĐT
> thay bằng chủ gian hàng cấp tài khoản nhân viên; dòng lời mời cũ chỉ còn Thu hồi.

## Bối cảnh

Màn Nhân viên & phân quyền của site partner (tính năng của GÓI — cờ `members`, `@SubscriptionTrackOnly()`)
có design mới. Đối chiếu với code và ADR thấy:

1. **Design vẽ màn "Vai trò & quyền" như một màn cấu hình** (nút "+ Vai trò & quyền", mô tả "Cấu hình cho
   từng phân quyền…"). Thực tế gian hàng có bốn vai cố định (`shop_owner` · `shop_manager` · `shop_staff` ·
   `shop_viewer`), quyền là 55 khoá trong `role_permissions` mà guard đọc mỗi request (ADR 0002). Chủ gian
   hàng không có chỗ nào để biết mỗi vai làm được gì — phải đoán từ tên vai.
2. **Một ô của design là một CHÙM khoá**, không phải một khoá: "Giao xe & nhận lại xe" là
   `handovers.manage` + `handovers.confirm`, và việc thu tiền lúc giao xe còn cần `payments.record`. Ô "có
   giới hạn" của design có khi là phạm vi chi nhánh (trục theo NGƯỜI — ADR 0052), có khi là một luật
   (quản lý chỉ mời nhân viên). Một lưới tick không biểu diễn được các nghĩa đó.
3. **Quyền mặc định lệch vận hành**: nhân viên trực chi nhánh không duyệt được yêu cầu đặt xe, không xem
   được gói (không biết vì sao xe không lên chợ); quan sát viên — vai hợp với kế toán — không xem được
   doanh thu. Ngược lại, quản lý mời được người khác làm quản lý ⇒ tự nhân đôi quyền mà chủ không quyết.
4. **Design còn hai chỗ trái ADR**: ô Email trong hộp mời (ADR 0060 — không mời bằng email) và ô "Gửi lời
   mời qua SMS" (ADR 0060 điều 8 — liên kết trả cho người mời, không gửi tin; SMS tốn tiền).
5. Danh sách hiện tại tách bảng lời mời riêng, đổi vai bằng ô chọn ngay trên dòng, không có hoạt động gần
   nhất, không khoá được một người mà không gỡ hẳn — trong khi trạng thái `locked` đã tồn tại cho khoá hệ
   thống khi hết gói (ADR 0085 điều 6).

## Quyết định

### 1. "Vai trò & quyền" là bảng CHỈ XEM, ô tính từ quyền thật ở server

- Trang con `/members/roles` (breadcrumb "Nhân viên & Phân quyền > Vai trò & quyền"), mở từ nút
  **"Vai trò & quyền"** (không dấu +) ở danh sách. Không ô tick, không nút lưu, không tạo vai.
- Dữ liệu: `GET /members/roles` → `[{ roleKey, memberCount, permissions[] }]` cho bốn vai, đọc từ
  `role_permissions` thật. Mỗi cột vai hiện số người.
- Mỗi dòng là một chùm khoá (`ROLE_MATRIX_ROWS` ở `@xeprime/types`: khoá XEM + khoá THAO TÁC). Ô tính bằng
  hàm thuần `roleMatrixLevel` dùng chung web và app: dòng sở hữu (ví) ⇒ chỉ chủ; có đủ khoá thao tác ⇒
  **Toàn quyền** (✓); có một phần ⇒ **Có giới hạn** (✓ cam); có đủ khoá xem ⇒ **Chỉ xem** (👁), hoặc Toàn
  quyền nếu dòng không có khoá thao tác nào; còn lại ⇒ **Không có quyền** (-). Đổi một dòng
  `role_permissions` là ô đổi theo — không có bảng chép tay nào lệch được khỏi guard.
- 17 dòng, 5 nhóm: VẬN HÀNH (Xem đơn thuê & lịch xe · Xác nhận/Từ chối yêu cầu đặt xe · Giao xe & nhận lại
  xe · Huỷ đơn, hoàn cọc, phụ phí · Khách hàng) · XE & TÀI XẾ (Xem xe & tài xế · Thêm/sửa/ẩn xe, tài xế ·
  Bảo dưỡng & KM) · DOANH THU (Doanh thu & báo cáo · Sổ thu chi & công nợ · Quản lý ví (chỉ chủ)) · CẤU HÌNH
  (Thông tin hiển thị, địa chỉ & thuế · Chi nhánh · Chính sách thuê · Gói & thanh toán · Nhân viên & phân
  quyền) · TRỢ GIÚP (Yêu cầu hỗ trợ). Năm dòng design thiếu là Khách hàng, Bảo dưỡng & KM, Quản lý ví,
  Chính sách thuê, Yêu cầu hỗ trợ.
- Một dòng chú thích chung dưới bảng: Quản lý, Nhân viên, Quan sát viên có thể bị giới hạn theo chi nhánh
  phụ trách (đặt khi mời / chỉnh sửa) — thay cho chữ "Chi nhánh được giao" chỉ ở cột Nhân viên của design.

**Vì sao không cho tick / tạo vai:** một dòng là chùm khoá (bỏ tick một dòng là gỡ nhiều khoá cùng lúc và
có thể chặn bước giữa của một luồng); "có giới hạn" là phạm vi theo người hoặc một luật, không phải trạng
thái tick; quyền phụ thuộc nhau (`bookings.update` vô nghĩa khi thiếu `bookings.view`); ví (`@ShopOwnerOnly`)
và cờ gói không uỷ được. Hạ tầng vai tuỳ biến (`roles.tenant_id`, `tenant_memberships.role_id`) vẫn chừa
cho tương lai — mở bằng ADR riêng, không bằng cách biến bảng giải thích thành bảng cấu hình.

### 2. Quyền mặc định mới — áp cho mọi gian hàng bằng migration; quản lý chỉ mời Nhân viên

| Vai | Thêm | Lý do |
| --- | --- | --- |
| `shop_staff` | `booking_requests.approve` | Người trực chi nhánh là người biết xe có sẵn; phạm vi chi nhánh vẫn giới hạn yêu cầu họ thấy |
| `shop_staff` | `subscription.view` | Biết gói và số suất để hiểu vì sao xe không lên chợ; mua vẫn là việc của chủ |
| `shop_viewer` | `finance.view` | Vai của kế toán / đối tác: doanh thu, sổ thu chi, công nợ, tổng hợp thuế — chỉ xem |

- Migration idempotent thêm ba dòng vào `role_permissions` của vai hệ thống; `DEFAULT_TENANT_ROLE_PERMISSIONS`
  sửa cùng để seed khớp DB. Không khoá nào bị thu hồi. Vì guard đọc DB, thay đổi có hiệu lực ngay cho cả
  web lẫn app Partner, không ai phải đăng nhập lại.
- **Khác design có chủ đích:** Nhân viên GIỮ `payments.record` + `receipts.create` — "Giao xe & nhận lại xe"
  ✓ cần thu tiền, quyết toán lúc giao/nhận xe. Ô "Huỷ đơn, hoàn cọc, phụ phí" của Nhân viên vì thế là
  "Có giới hạn - chỉ thu tiền khi giao, nhận xe". Thông tin THUẾ (CCCD/MST — `seller_profile.view`) KHÔNG
  mở cho Nhân viên và Quan sát viên.
- **Trần mời theo vai** (`invitableTenantRoles`): chủ mời mọi vai trừ chủ; quản lý chỉ mời `shop_staff`;
  vai khác không mời ai. Server là chốt — `MEMBER_ROLE_NOT_INVITABLE`; giao diện chỉ lọc ô chọn theo cùng
  hàm. `members.invite` nói "được mời", không nói "được mời ai".

### 3. Tên và màu vai

"Chủ gian hàng" giữ nguyên (design ghi "Admin gian hàng" — dễ lẫn với quản trị nền tảng, và ví thuộc chủ);
"Quản lý gian hàng" giữ; "Nhân viên gian hàng" → **"Nhân viên"**; "Chỉ xem" → **"Quan sát viên"**. Màu viên:
Chủ đen/vàng · Quản lý xanh dương · Nhân viên cam · Quan sát viên tím.

### 4. Hộp "Mời thành viên": SĐT · Vai trò · Chi nhánh phụ trách · Tên gợi nhớ — không email, không SMS

- **Số điện thoại*** · **Vai trò*** (mỗi vai một mô tả ngắn; quản lý chỉ thấy Nhân viên) · **Chi nhánh phụ
  trách** (mặc định toàn bộ; người bị giới hạn chỉ chọn trong phần của mình) · **Tên gợi nhớ** (tuỳ chọn,
  ≤ 60 ký tự — `tenant_invites.display_name`; hiện thay tên khi lời mời còn chờ; nhận lời mời thì chép sang
  `tenant_memberships.display_name_in_tenant`).
- Bỏ ô Email (ADR 0060) và ô "Gửi lời mời qua SMS" (ADR 0060 điều 8). Giữ bước sau khi gửi: hiện liên kết
  mời để sao chép — chỉ hiện một lần, hạn 7 ngày. Luật "một số một link sống" và điều kiện nhận lời mời
  của ADR 0060 điều 8 giữ nguyên.

### 5. Lời mời đang chờ gộp vào bảng chính — server ghép và phân trang

- `GET /members/roster?q&roleKey&status&page&limit`: thành viên `active`/`locked` + lời mời `pending` còn
  hạn trong MỘT danh sách; `status` ∈ `active` (Đang hoạt động) · `pending` (Chờ xác nhận) · `locked` (Đã
  khoá); tìm theo tên (gồm tên gợi nhớ), email, SĐT. Bảng lời mời riêng bị bỏ.
- Dòng lời mời: trạng thái "Chờ xác nhận", cột hoạt động "Đã mời lúc <ngày>"; menu ⋮: **Mời lại** (tạo
  link mới, link cũ hết hiệu lực) · **Thu hồi**.
- Dòng Chủ gian hàng vẫn hiện, đứng đầu, không có thao tác. Dòng của người xem có "(Bạn)", không thao tác.
- `GET /members` và `GET /members/invites` giữ nguyên cho app Partner đã phát hành.

### 6. Hoạt động gần nhất

- Cột mới `web_sessions.last_seen_at`, ghi thưa bởi `SessionService` khi phiên web được dùng — tối đa
  5 phút/lần (nhịp cài đặt ngắn hơn ngưỡng để "Đang trực tuyến" không bị hở). Không dùng cho quyết định
  bảo mật nào.
- `lastActiveAt` = mốc mới nhất của phiên web (`last_seen_at`), phiên app (`native_auth_sessions.last_used_at`)
  và lần đăng nhập (`users.last_login_at`). ≤ 5 phút ⇒ "Đang trực tuyến" (xanh); còn lại "x phút/giờ
  trước"; quá 7 ngày ⇒ ngày. Tính bằng một truy vấn gộp, không N+1.

### 7. Chỉnh sửa qua hộp; Tạm khoá / Mở khoá tay, tách khỏi khoá hệ thống

- Đổi vai, chi nhánh, tên gợi nhớ qua hộp **"Chỉnh sửa"** — `PATCH /members/:userId {roleKey?, branchScope?,
  branchIds?, nickname?}`; trường vắng mặt = giữ nguyên (như ADR 0052). Bỏ ô chọn vai ngay trên dòng.
- **Tạm khoá / Mở khoá**: `POST /members/:userId/lock` · `/unlock`, quyền `members.update_role`, audit
  `member.lock` / `member.unlock`. Khoá tay = `status = locked`, `locked_reason` NULL.
- Người bị khoá mất quyền ở request kế tiếp vì `TenantScopeGuard` chỉ nhận membership `active`; phiên đăng
  nhập không bị thu hồi.
- Hai loại khoá không mở chéo: **không** mở tay được dòng khoá vì hết gói (`locked_reason = plan_lapsed`)
  — `MEMBER_LOCKED_BY_SYSTEM`; gói kích hoạt lại **không** mở dòng chủ khoá tay (ADR 0085 điều 6 chỉ mở
  dòng `plan_lapsed`).
- Giữ "Gỡ khỏi gian hàng" trong menu ⋮.
- Không ai tự sửa / khoá / gỡ chính mình; không ai sửa / khoá / gỡ chủ; người bị giới hạn chi nhánh chỉ
  thao tác được người nằm gọn trong phần của mình (`BRANCH_SCOPE_EXCEEDED`, ADR 0052).

### 8. "Xem chi tiết" mở ngăn bên

Thành viên: liên hệ (SĐT, email), vai + chi nhánh, tên gợi nhớ, ngày tham gia, người mời, hoạt động gần
nhất. Lời mời: ngày mời, hạn, người mời.

### 9. Chế độ chỉ xem

Gian hàng đang ân hạn / hạ bậc (cờ `members` = `read_only`, ADR 0027): xem được danh sách, chi tiết, ma
trận; không mời / sửa / khoá / gỡ / thu hồi (`FEATURE_READ_ONLY`). Phiên hỗ trợ nền tảng (ADR 0050): chỉ xem.

### Audit

`member.invite` · `member.invite_revoke` · `member.invite_accept` · `member.invite_decline` ·
`member.update_role` · `member.lock` · `member.unlock` · `member.remove` — mỗi thao tác một dòng, cùng
transaction với thay đổi. Token mời không bao giờ vào audit.

## Quan hệ với ADR cũ

Không ghi đè ADR nào. Mở rộng 0085 điều 6 (thêm khoá TAY vào cùng trạng thái `locked`) và 0060 điều 8 (thêm tên gợi
nhớ cho lời mời). Không đổi: ví chỉ chủ (0038 điều 3); phạm vi chi nhánh theo người và trần giao quyền (0052); mời bằng SĐT,
liên kết một lần, điều kiện nhận lời mời (0060 điều 8); một tài khoản một gian hàng (0053 điều 6); khoá /
mở theo gói (0085 điều 6).

## Hệ quả

- `role_permissions` có thêm ba dòng cho vai hệ thống (migration); `DEFAULT_TENANT_ROLE_PERMISSIONS` khớp.
- `web_sessions` có `last_seen_at`; `tenant_invites` có `display_name`.
- API mới: `GET /members/roster`, `GET /members/roles`, `POST /members/:userId/lock|unlock`; `PATCH /members/:userId`
  và `POST /members/invites` nhận `nickname`. Mã lỗi mới: `MEMBER_ROLE_NOT_INVITABLE`, `MEMBER_LOCKED_BY_SYSTEM`.
- `@xeprime/types` mang `ROLE_MATRIX_ROWS`, `roleMatrixLevel`, `invitableTenantRoles`, `TENANT_ROLE_RANK`,
  `MEMBER_ROSTER_STATUS` — web và app native dùng chung một luật.
- App XePrime Partner giữ màn cũ; quyền mặc định mới và trần mời áp ngay vì nằm ở server.

## Cần xem lại khi

- Từ ba gian hàng trở lên xin cùng một tổ hợp quyền mà bốn vai không đáp ứng — cân nhắc mở vai tuỳ biến
  (ADR mới), dựa trên hạ tầng `roles.tenant_id` / `role_id` đã có.
- Chủ gian hàng phàn nàn không biết mình bị khoá / đổi vai — thêm thông báo cho người bị tác động.
- Cần thu hồi phiên ngay khi khoá (người bị khoá còn mở màn cũ) — hiện mất quyền ở request kế tiếp là đủ.
