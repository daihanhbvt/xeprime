-- ═══════════════════════════════════════════════════════════════════════════
-- Thông báo ĐẨY qua Firebase Cloud Messaging (10/09/2026)
--
-- Hai bảng, và ranh giới giữa chúng là điều quan trọng nhất của migration này:
--
--   • `push_devices`    — MỘT bản cài app đã đăng ký nhận thông báo. Khoá là registration
--                         token của FCM, không phải "máy của ai".
--   • `push_deliveries` — MỘT lượt giao một `notifications` row tới MỘT thiết bị. Nó KHÔNG
--                         phải một thông báo thứ hai: hộp thư vẫn một dòng cho một sự kiện,
--                         người có ba máy sinh ba dòng ở đây.
--
-- Vì sao có bảng giao vận thay vì gọi FCM ngay trong request: đặt xe và gửi tin nhắn KHÔNG
-- được hỏng vì Firebase đang lỗi. Delivery được ghi trong CÙNG transaction với thông báo, rồi
-- worker mới đọc và gửi (đúng khuôn `message_outbox` của chat — ADR 0009 §3).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Thiết bị ────────────────────────────────────────────────────────────
CREATE TABLE "public"."push_devices" (
    "id"                     CHAR(26)       NOT NULL,
    "user_id"                CHAR(26)       NOT NULL,
    "native_auth_session_id" CHAR(26),
    "provider"               VARCHAR(20)    NOT NULL DEFAULT 'fcm',
    "provider_token"         TEXT           NOT NULL,
    "platform"               VARCHAR(20)    NOT NULL,
    "app_version"            VARCHAR(30),
    "device_name"            VARCHAR(120),
    "enabled"                BOOLEAN        NOT NULL DEFAULT true,
    "last_seen_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at"            TIMESTAMPTZ(3),
    "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- Union type ở @xeprime/types (ADR 0005) + CHECK ở đây: hai lớp cho cùng một luật, vì bảng này
-- được ghi từ một endpoint công khai nhận dữ liệu client.
ALTER TABLE "public"."push_devices"
    ADD CONSTRAINT "push_devices_provider_check" CHECK ("provider" IN ('fcm'));

ALTER TABLE "public"."push_devices"
    ADD CONSTRAINT "push_devices_platform_check" CHECK ("platform" IN ('android', 'ios'));

-- Đã tắt thì phải có mốc tắt, và ngược lại — cột trạng thái không được rời khỏi cột thời gian
-- giải thích nó. Không có ràng buộc này thì "vì sao máy tôi ngừng nhận" là câu không trả lời được.
ALTER TABLE "public"."push_devices"
    ADD CONSTRAINT "push_devices_disabled_at_check"
    CHECK (("enabled" = true AND "disabled_at" IS NULL) OR ("enabled" = false AND "disabled_at" IS NOT NULL));

-- ⚠️ RÀNG BUỘC LÕI. FCM cấp token cho một BẢN CÀI, không cho một tài khoản: máy đó đăng nhập
-- tài khoản khác vẫn mang lại đúng token này. Unique ở đây biến việc "gán lại chủ" thành một
-- câu UPSERT nguyên tử. Không có nó, hai hàng cùng token cùng tồn tại và người dùng TRƯỚC tiếp
-- tục nhận thông báo trên máy của người SAU — một rò rỉ dữ liệu, không phải một phiền toái.
CREATE UNIQUE INDEX "push_devices_provider_token_key"
    ON "public"."push_devices" ("provider", "provider_token");

-- Truy vấn nóng: mọi lần phát thông báo đều hỏi "thiết bị đang bật của những người này".
CREATE INDEX "push_devices_user_id_enabled_idx"
    ON "public"."push_devices" ("user_id", "enabled");

-- Tắt hàng loạt khi một phiên native bị thu hồi (đăng xuất, phát hiện replay refresh token).
CREATE INDEX "push_devices_native_auth_session_id_idx"
    ON "public"."push_devices" ("native_auth_session_id");

ALTER TABLE "public"."push_devices"
    ADD CONSTRAINT "push_devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL chứ không CASCADE: phiên là thứ hết hạn và bị dọn theo lô, còn thiết bị thì vẫn là
-- thiết bị đó. Mất liên kết phiên chỉ nghĩa là không tắt tự động được nữa — mất cả hàng nghĩa là
-- token biến mất và máy im lặng cho tới lần đăng nhập sau.
ALTER TABLE "public"."push_devices"
    ADD CONSTRAINT "push_devices_native_auth_session_id_fkey"
    FOREIGN KEY ("native_auth_session_id") REFERENCES "public"."native_auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Lượt giao ───────────────────────────────────────────────────────────
CREATE TABLE "public"."push_deliveries" (
    "id"                  CHAR(26)       NOT NULL,
    "notification_id"     CHAR(26)       NOT NULL,
    "push_device_id"      CHAR(26)       NOT NULL,
    "status"              VARCHAR(20)    NOT NULL DEFAULT 'pending',
    "attempts"            INTEGER        NOT NULL DEFAULT 0,
    "next_attempt_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at"             TIMESTAMPTZ(3),
    "provider_message_id" VARCHAR(255),
    "last_error_code"     VARCHAR(40),
    "last_error_at"       TIMESTAMPTZ(3),
    "expires_at"          TIMESTAMPTZ(3),
    "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_status_check"
    CHECK ("status" IN ('pending', 'processing', 'sent', 'retry', 'failed'));

-- Chống rung máy HAI LẦN cho cùng một sự kiện. Nghiệp vụ thử lại một transaction là chuyện bình
-- thường; biến nó thành hai thông báo thì không. Đây là người gác thật — `skipDuplicates` ở tầng
-- app chỉ là đường tắt cho trường hợp thường gặp.
CREATE UNIQUE INDEX "push_deliveries_notification_id_push_device_id_key"
    ON "public"."push_deliveries" ("notification_id", "push_device_id");

-- ⚠️ VIẾT TAY, Prisma không mô tả được index MỘT PHẦN nên nó không có mặt trong `schema.prisma`
-- (ghi chú tương ứng nằm ở model `PushDelivery`).
--
-- Vì sao một phần: gần như mọi hàng cuối cùng đều là `sent`, nên một index đầy đủ trên
-- (status, next_attempt_at) lớn dần theo TỔNG số thông báo đã từng gửi, trong khi truy vấn của
-- worker chỉ quan tâm hàng đợi — thứ luôn nhỏ. Đây là vòng lặp chạy mỗi vài giây.
--
-- `processing` NẰM TRONG tập này, và đó là điều quan trọng: worker chiếm dòng bằng cách lật nó
-- sang `processing` rồi mới gọi FCM, nên một tiến trình bị giết giữa chừng (mỗi lần deploy là
-- một lần) để lại dòng mắc kẹt ở đó. Vòng lặp có bước THU HỒI các dòng `processing` quá cũ, và
-- bước đó cần chính index này — không có nó thì việc thu hồi là một lần quét toàn bảng.
CREATE INDEX "push_deliveries_queue_idx"
    ON "public"."push_deliveries" ("next_attempt_at")
    WHERE "status" IN ('pending', 'retry', 'processing');

-- Tra "máy này đã nhận được gì" khi có khiếu nại, và dọn theo thiết bị.
CREATE INDEX "push_deliveries_push_device_id_status_idx"
    ON "public"."push_deliveries" ("push_device_id", "status");

ALTER TABLE "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_push_device_id_fkey"
    FOREIGN KEY ("push_device_id") REFERENCES "public"."push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
