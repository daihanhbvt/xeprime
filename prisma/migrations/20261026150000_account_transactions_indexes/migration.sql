-- Lịch sử giao dịch hợp nhất của khách (`GET /account/transactions`).
-- Hai nhánh của UNION đi từ khách → hold → sổ khác mà chưa có index phía sổ đó:
--   · bank_transactions khớp vào hold (tra theo `matched_ref_id`),
--   · hold_refunds theo `customer_user_id`.
CREATE INDEX "bank_transactions_matched_type_ref_idx"
  ON "bank_transactions" ("matched_type", "matched_ref_id");

CREATE INDEX "hold_refunds_customer_user_id_idx"
  ON "hold_refunds" ("customer_user_id");
