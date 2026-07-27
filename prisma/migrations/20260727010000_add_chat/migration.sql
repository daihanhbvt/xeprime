-- ---------------------------------------------------------------------------
-- Chat (Phase 5, ADR 0009)
--
-- PostgreSQL là source of truth cho toàn bộ hội thoại/thành viên/tin/đính kèm/đã đọc.
-- Firestore chỉ giữ projection realtime; đồng bộ PG→Firestore qua message_outbox.
-- ---------------------------------------------------------------------------

-- conversations ------------------------------------------------------------
CREATE TABLE "conversations" (
    "id" CHAR(26) NOT NULL,
    "firebase_conversation_id" VARCHAR(160),
    "tenant_id" CHAR(26) NOT NULL,
    "customer_user_id" CHAR(26),
    "vehicle_id" CHAR(26),
    "booking_id" CHAR(26),
    "booking_request_id" CHAR(26),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "last_message_text" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "last_sender_type" VARCHAR(50),
    "unread_customer_count" INTEGER NOT NULL DEFAULT 0,
    "unread_tenant_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversations_firebase_conversation_id_key"
    ON "conversations"("firebase_conversation_id");
CREATE INDEX "conversations_tenant_id_last_message_at_idx"
    ON "conversations"("tenant_id", "last_message_at");
CREATE INDEX "conversations_customer_user_id_last_message_at_idx"
    ON "conversations"("customer_user_id", "last_message_at");
CREATE INDEX "conversations_booking_id_idx" ON "conversations"("booking_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- conversation_participants ------------------------------------------------
CREATE TABLE "conversation_participants" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "user_id" CHAR(26),
    "participant_type" VARCHAR(50) NOT NULL,
    "tenant_id" CHAR(26),
    "last_read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key"
    ON "conversation_participants"("conversation_id", "user_id");
CREATE INDEX "conversation_participants_user_id_idx"
    ON "conversation_participants"("user_id");

ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- messages -----------------------------------------------------------------
CREATE TABLE "messages" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "firebase_message_id" VARCHAR(160),
    "sender_user_id" CHAR(26),
    "sender_type" VARCHAR(50) NOT NULL,
    "message_type" VARCHAR(50) NOT NULL DEFAULT 'text',
    "text" TEXT,
    "metadata_json" JSONB,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at");

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey"
    FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- message_outbox -----------------------------------------------------------
CREATE TABLE "message_outbox" (
    "id" CHAR(26) NOT NULL,
    "message_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_outbox_message_id_key" ON "message_outbox"("message_id");
CREATE INDEX "message_outbox_status_next_attempt_at_idx"
    ON "message_outbox"("status", "next_attempt_at");

ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- chat_attachments ---------------------------------------------------------
CREATE TABLE "chat_attachments" (
    "id" CHAR(26) NOT NULL,
    "message_id" CHAR(26) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(100),
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_attachments_message_id_idx" ON "chat_attachments"("message_id");

ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
