-- Sửa số cọc ĐÃ THU bằng bút toán điều chỉnh (không sửa/xoá khoản cũ).
--
-- Lượt "Sửa tiền cọc" hạ số đã thu (chủ xe thu dư rồi trả lại khách trước quyết toán) ghi MỘT dòng
-- `payments.kind = 'deposit_return'` + phiếu CHI `deposit_refund` (`source_ref_id` = payments.id).
-- Cọc ròng = Σ deposit − Σ deposit_return; lượt hoàn cọc lúc trả xe chỉ hoàn phần ròng.
-- Nâng số đã thu dùng lại `kind = 'deposit'` như hộp Thu cọc.

-- @xeprime/types → PAYMENT_KIND
ALTER TABLE "public"."payments" DROP CONSTRAINT "payments_kind_check";
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_kind_check"
    CHECK ("kind" IN ('rental', 'deposit', 'deposit_return'));
