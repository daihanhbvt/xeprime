-- ═══════════════════════════════════════════════════════════════════════════
-- Xác thực địa chỉ email bằng mã 6 số (14/09/2026)
--
-- Vì sao cần: trang `/account` cho khách ĐỔI email và số điện thoại. Số điện thoại đã có
-- `phone_verifications` để chứng minh quyền sở hữu; email thì chưa có gì — cột
-- `users.email_verified_at` tồn tại từ đầu nhưng chỉ được đóng dấu khi đăng nhập bằng Google.
-- Không có bảng này thì "đổi email" chỉ là ghi đè một chuỗi, và ai chiếm được một phiên sẽ
-- chuyển tài khoản sang hộp thư của họ mà không cần chứng minh gì.
--
-- Bảng RIÊNG chứ không mở rộng `phone_verifications`: cột `phone` là `VARCHAR(30)` và không
-- chứa nổi một địa chỉ email, còn cách chuẩn hoá, giới hạn gửi và nhà cung cấp của hai kênh
-- không liên quan gì tới nhau. Ngược lại, VÒNG ĐỜI của một mã thì giống hệt, nên cột `status`
-- dùng chung đúng bộ giá trị của SĐT (pending · verified · expired · failed) thay vì đẻ ra một
-- bộ thứ hai để hai bên trôi khác nhau.
--
-- `user_id` là `ON DELETE SET NULL` (giống `phone_verifications`): xoá tài khoản không được
-- kéo theo lịch sử xác thực, thứ còn dùng để điều tra khi có tranh chấp chiếm tài khoản.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "email_verifications" (
  "id"            CHAR(26)     NOT NULL,
  "user_id"       CHAR(26),
  "email"         VARCHAR(255) NOT NULL,
  "purpose"       VARCHAR(50)  NOT NULL,
  "otp_hash"      VARCHAR(255),
  "status"        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  "sent_count"    INTEGER      NOT NULL DEFAULT 0,
  "attempt_count" INTEGER      NOT NULL DEFAULT 0,
  "expires_at"    TIMESTAMPTZ(3) NOT NULL,
  "verified_at"   TIMESTAMPTZ(3),
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_verifications"
  ADD CONSTRAINT "email_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ba chỉ mục khớp đúng ba câu truy vấn thật của `EmailVerificationService`:
--   · theo email  → tìm mã mới nhất để đối chiếu và để tính cooldown/trần gửi mỗi giờ;
--   · theo user   → lịch sử xác thực của một tài khoản khi điều tra tranh chấp;
--   · (status, expires_at) → dọn mã treo.
CREATE INDEX "email_verifications_email_idx"  ON "email_verifications"("email");
CREATE INDEX "email_verifications_user_id_idx" ON "email_verifications"("user_id");
CREATE INDEX "email_verifications_status_expires_at_idx"
  ON "email_verifications"("status", "expires_at");
