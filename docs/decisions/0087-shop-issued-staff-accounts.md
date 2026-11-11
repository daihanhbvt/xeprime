# ADR 0087 — Chủ gian hàng cấp tài khoản cho nhân viên (tên đăng nhập + mật khẩu), bỏ mời bằng SĐT

Ngày: 09/11/2026 · Trạng thái: **Accepted** (09/11/2026 — người dùng chốt sau khi duyệt luồng mời của
ADR 0086) · Ghi đè: [0060](0060-phone-login-and-account-required-booking.md) điều 8 và câu "site partner
chỉ đăng nhập bằng SĐT" **trong phạm vi tài khoản nhân viên**; [0086](0086-staff-roles-matrix-and-member-lock.md)
điều 4–5 **phần mời** · Liên quan: [0053](0053-separate-account-realms.md) (realm, một tài khoản một gian
hàng), [0076](0076-revocable-web-sessions-login-lockout.md) (phiên thu hồi được, khoá đăng nhập sai),
[0085](0085-unified-partner-ui-and-plan-slot-transitions.md) điều 6 (khoá nhân viên khi hết gói) · Đặc tả
BA: `SPEC-BUS-09` v1.1

## Bối cảnh

ADR 0060 điều 8 (và 0086 điều 4–5 làm lại giao diện của nó) mời nhân viên bằng SĐT: chủ tạo lời mời,
nhận một liên kết, tự gửi qua Zalo; người nhận phải **tự đăng ký** tài khoản partner bằng chính số đó,
**xác minh OTP**, rồi mới bấm nhận. Khi đưa vào vận hành thử, chủ gian hàng thấy:

1. **Quá nhiều bước ở phía nhân viên**: tải app / mở web, đăng ký, chờ OTP, đặt mật khẩu, mở lại liên kết —
   nhân viên quầy thường bỏ giữa chừng, chủ phải ngồi hướng dẫn từng người.
2. **Nhân viên không phải lúc nào cũng có số riêng ổn định** (dùng số của cửa hàng, đổi số theo ca), mà
   một SĐT chỉ làm được MỘT tài khoản partner (ADR 0053) — số đó đã là tài khoản của chủ thì không mời được.
3. **Chủ không quản lý được tài khoản**: nhân viên quên mật khẩu thì chỉ tự lấy lại bằng OTP tới số của họ;
   nghỉ việc thì chủ chỉ gỡ được khỏi gian hàng, còn tài khoản (và mật khẩu chủ từng biết) vẫn sống.

Các cửa hàng cho thuê xe quen cách làm của phần mềm quản lý bán hàng: chủ **tạo** tài khoản cho nhân viên,
đưa tên đăng nhập + mật khẩu, thu lại khi nghỉ.

## Quyết định

### 1. Chủ gian hàng CẤP tài khoản cho nhân viên

- Nút "Thêm nhân viên" (thay "Mời thành viên") mở hộp: **Họ tên*** · **Tên đăng nhập*** · **Mật khẩu***
  (có nút tạo ngẫu nhiên) · **Vai trò*** · **Chi nhánh phụ trách** · **SĐT liên hệ** (tuỳ chọn, KHÔNG xác
  minh, KHÔNG dùng để đăng nhập).
- `POST /members/accounts {displayName, username, password, roleKey, branchScope?, branchIds?, contactPhone?}`
  tạo trong MỘT transaction: `users` (realm `partner`, `username`, mật khẩu băm, `managed_by_tenant_id` =
  gian hàng, không SĐT, không email) + `tenant_memberships` `active` (vai, phạm vi chi nhánh, `contact_phone`,
  `invited_by`, `joined_at`) + audit `member.create_account` (KHÔNG BAO GIỜ ghi mật khẩu, kể cả bản băm).
- Tạo xong hộp hiện **tóm tắt**: tên đăng nhập + mật khẩu + địa chỉ đăng nhập site partner để chủ sao chép
  gửi nhân viên. Mật khẩu **chỉ hiện một lần** (server chỉ giữ bản băm). Không gửi SMS/email.
- Quyền: `members.invite`. Trần vai như luật mời cũ (`invitableTenantRoles`): chủ cấp mọi vai trừ chủ, quản
  lý chỉ cấp vai Nhân viên (`MEMBER_ROLE_NOT_INVITABLE`). Phạm vi chi nhánh không rộng hơn người cấp
  (`BRANCH_SCOPE_EXCEEDED`, ADR 0052). Hạn mức 10 lượt/phút.
- Mật khẩu: tối thiểu 8 ký tự, có cả chữ và số — cùng luật đăng ký.

### 2. Mời bằng SĐT bỏ hẳn

- `POST /members/invites` trả **410 `MEMBER_INVITE_RETIRED`** (route giữ lại để app Partner cũ nhận một câu
  rõ ràng thay vì 404).
- Lời mời ĐÃ gửi vẫn sống tới hết hạn 7 ngày: người nhận vẫn nhận / từ chối được theo luật cũ (SĐT đã xác
  minh trùng số mời); gian hàng vẫn **Thu hồi** được. Dòng "Chờ xác nhận" còn hiện trong danh sách gộp,
  menu chỉ còn Thu hồi — **không còn "Mời lại"**.

### 3. Tên đăng nhập

- Tự do, **duy nhất toàn site partner**: chữ thường, bắt đầu bằng chữ cái, 4–32 ký tự `a-z 0-9 . _`, không
  kết thúc bằng `.` hoặc `_` — `STAFF_USERNAME_PATTERN` (`@xeprime/types`), CHECK `users_username_format_check`,
  unique `(realm, username)`. Server tự hạ chữ thường; trùng ⇒ 409 `USERNAME_TAKEN`.
- Bắt đầu bằng chữ cái là chủ đích: một tên toàn chữ số trông như SĐT và làm ô đăng nhập không biết tra cột
  nào.

### 4. Đăng nhập site partner: một ô "Số điện thoại hoặc tên đăng nhập"

- Server phân loại theo HÌNH DẠNG (`detectLoginIdentifierKind`): có `@` ⇒ email; chỉ chữ số ⇒ SĐT; khớp
  mẫu tên ⇒ tên đăng nhập. Tên đăng nhập CHỈ nhận ở realm `partner`; site khách gõ tên ⇒ `PHONE_LOGIN_REQUIRED`
  như email. Site quản trị không đổi (email + mật khẩu).
- Khoá đăng nhập sai (ADR 0076) đếm theo định danh đã chuẩn hoá — tên đăng nhập là một định danh như SĐT.
- **Không bắt đổi mật khẩu** lần đầu; nhân viên tự đổi ở "Tài khoản & bảo mật" nếu muốn.

### 5. Tài khoản do gian hàng cấp

- `users.managed_by_tenant_id` = gian hàng đã tạo. Không có SĐT ⇒ **không** qua cổng bắt xác minh SĐT của
  site partner (cổng đó chỉ áp cho tài khoản tự đăng ký).
- Chủ đổi được **họ tên** + **SĐT liên hệ** qua hộp Chỉnh sửa —
  `PATCH /members/:userId {displayName?, contactPhone?, roleKey?, branchScope?, branchIds?}`. Họ tên của
  tài khoản TỰ ĐĂNG KÝ là của chính chủ tài khoản ⇒ đổi ⇒ 409 `MEMBER_ACCOUNT_NOT_MANAGED`.
- `GET /auth/me` thêm `username?`, `managedAccount?` (tuỳ chọn trong hợp đồng để app không gãy).

### 6. Quên mật khẩu: chủ đặt lại

- Người có `members.update_role` bấm "Đặt lại mật khẩu" — `POST /members/:userId/password {password}`. Đặt
  lại = thu hồi MỌI phiên web + app của nhân viên trong cùng transaction (ADR 0076: đặt lại giết tất cả);
  audit `member.reset_password`. Hạn mức 10 lượt/phút.
- Tài khoản tự đăng ký (nhân viên cũ đã nhận lời mời): KHÔNG đặt lại được — 409 `MEMBER_ACCOUNT_NOT_MANAGED`;
  họ tự quên mật khẩu bằng OTP như cũ.

### 7. Tạm khoá thu hồi phiên ngay

- `POST /members/:userId/lock`: membership `locked` (khoá tay, ADR 0086 điều 7) **+ thu hồi mọi phiên web +
  app ngay**. Tài khoản do gian hàng cấp đăng nhập khi không còn membership `active` ở gian hàng của mình
  ⇒ 401 `STAFF_ACCOUNT_SUSPENDED` ("Tài khoản đang bị gian hàng tạm khoá") — chặn sau khi đúng mật khẩu,
  không cấp phiên. Áp cả khi khoá vì hết gói (`plan_lapsed`).
- `/unlock` ⇒ đăng nhập lại được. Khoá vì hết gói vẫn không mở tay (`MEMBER_LOCKED_BY_SYSTEM`, ADR 0086).

### 8. Gỡ khỏi gian hàng

- Tài khoản do gian hàng cấp ⇒ **vô hiệu hoá tài khoản**: `users.status = locked`, `username = NULL` (để tên
  cấp lại được cho người khác), thu hồi mọi phiên. **Không xoá cứng** — nhật ký, chứng từ, bàn giao còn trỏ
  tới người đó. Đăng nhập bằng tên cũ ⇒ không còn tài khoản nào mang tên đó.
- Tài khoản tự đăng ký ⇒ chỉ gỡ membership + thu hồi phiên (tài khoản là của họ).
- Audit `member.remove` ghi thêm `username` + `accountDisabled`.

### 9. Ngăn "Xem chi tiết" làm lại

- Đầu ngăn: thẻ người (ảnh, họ tên, tên đăng nhập, vai, trạng thái).
- Khối: **Thông tin liên hệ** (SĐT / SĐT liên hệ, email) · **Truy cập** (công tắc "Cho phép truy cập" =
  tạm khoá / mở khoá; vai + mô tả; chi nhánh phụ trách; tên đăng nhập + nút "Đặt lại mật khẩu" cho tài khoản
  do gian hàng cấp) · **Quyền của vai** (tóm tắt các dòng ma trận vai đó có quyền) · **Hoạt động** (hoạt
  động gần nhất, ngày tham gia, người tạo / mời) · **Hoạt động gần đây** (10 việc gần nhất người đó làm
  trong gian hàng — `GET /members/:userId/activity?limit=` đọc `audit_logs` theo `actor_user_id`, tối đa 20).
- Chân ngăn: Chỉnh sửa · Gỡ khỏi gian hàng. Dòng của chủ / của chính mình: không công tắc, không nút thao tác.

### 10. Danh sách gộp

`GET /members/roster` thêm `username`, `managedAccount`, `contactPhone`. Cột SĐT = SĐT tài khoản, không có
thì SĐT liên hệ. Ô tìm khớp cả tên đăng nhập và SĐT liên hệ.

### Dữ liệu và audit

- Migration `20261109170000_staff_managed_accounts`: `users.username VARCHAR(32)` (+ CHECK, unique
  `(realm, username)`), `users.managed_by_tenant_id CHAR(26)` FK `tenants` `ON DELETE SET NULL` + index,
  `tenant_memberships.contact_phone VARCHAR(30)`.
- Audit mới: `member.create_account`, `member.reset_password`; `member.remove` thêm `username` +
  `accountDisabled`. Mật khẩu không bao giờ nằm trong audit, log hay phản hồi nào ngoài lượt tạo.

## Quan hệ với ADR cũ

| ADR | Phần bị ghi đè | Nay |
| --- | --- | --- |
| 0060 điều 8 | Thành viên gian hàng được mời bằng SĐT, nhận bằng tài khoản partner có SĐT đã xác minh | Chủ cấp tài khoản (điều 1); lời mời cũ chỉ còn nhận / thu hồi tới khi hết hạn (điều 2) |
| 0060 (bảng xác thực của CLAUDE.md) | "Site partner: SĐT + mật khẩu" là định danh duy nhất | Site partner nhận thêm tên đăng nhập — chỉ cho tài khoản nhân viên do gian hàng cấp (điều 4) |
| 0086 điều 4 | Hộp "Mời thành viên" (SĐT, vai, chi nhánh, tên gợi nhớ, liên kết một lần) | Hộp "Thêm nhân viên" (điều 1) |
| 0086 điều 5 | Menu dòng chờ: Mời lại · Thu hồi | Chỉ Thu hồi (điều 2) |

Không đổi: SĐT vẫn là định danh DUY NHẤT của tài khoản tự đăng ký ở site khách/partner; OTP vẫn chỉ xác minh
SĐT, không cấp phiên (0060); một tài khoản đối tác thuộc tối đa một gian hàng (0053 điều 6 — tài khoản cấp
gắn cứng với gian hàng tạo ra nó); khoá / mở theo gói (0085 điều 6); ma trận, quyền mặc định, khoá tay,
hoạt động gần nhất (0086 điều 1–3, 6–9).

## Hệ quả

- Web partner: hộp "Thêm nhân viên" + tóm tắt tài khoản thay hộp mời; ô đăng nhập "Số điện thoại hoặc tên
  đăng nhập"; ngăn chi tiết mới; hộp đặt lại mật khẩu.
- **App XePrime Partner** dùng chung bộ kiểm định danh `@xeprime/validators` nên ô đăng nhập app nhận tên
  đăng nhập ngay; nhưng màn mời thành viên trên app sẽ nhận 410 `MEMBER_INVITE_RETIRED` cho tới khi dev
  mobile thay bằng màn cấp tài khoản.
- Nhân viên dùng tài khoản cấp không có SĐT ⇒ không nhận được OTP, không tự đặt lại mật khẩu; mọi luồng
  cần SĐT đã xác minh (đặt xe ở site khách là realm khác, không liên quan) không áp cho họ.
- Gian hàng hết gói (0085 điều 6) ⇒ nhân viên tài khoản cấp không đăng nhập được cho tới khi gói kích hoạt
  lại (`STAFF_ACCOUNT_SUSPENDED`).

## Cần xem lại khi

- Chủ gian hàng phàn nàn phải tự đặt lại mật khẩu quá thường xuyên — cân nhắc cho nhân viên tự đổi bằng
  câu hỏi bảo mật hoặc SĐT liên hệ đã xác minh (khi đó SĐT liên hệ thành định danh phụ, cần ADR mới).
- Cần bắt đổi mật khẩu lần đầu (chủ biết mật khẩu nhân viên là rủi ro nội bộ) — thêm cờ `must_change_password`.
- Một người làm cho hai gian hàng cần một tài khoản dùng chung — hiện phải có hai tài khoản cấp riêng.
