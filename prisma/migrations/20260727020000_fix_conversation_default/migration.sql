-- ---------------------------------------------------------------------------
-- conversations.status: mặc định 'active' → 'open'
--
-- Đồng bộ với CONVERSATION_STATUS ở @xeprime/types (misc.ts: open/closed/flagged/archived).
-- ChatService luôn set status tường minh nên đây chỉ để nhất quán default + StatusTag.
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'open';
