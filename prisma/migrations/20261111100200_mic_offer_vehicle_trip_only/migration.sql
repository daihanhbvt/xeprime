-- ADR 0088 điều 1 — đợt này MIC chỉ bán bảo hiểm vật chất xe theo chuyến; `IP` (tai nạn người)
-- không bán. Adapter thật đã chặn bằng `supportsKind`, nhưng môi trường chạy giả lập (`mic_mock`)
-- vẫn chào `IP` ⇒ dev/staging lệch production. Tắt sản phẩm trong danh mục là đúng một quyết định
-- kinh doanh, và admin bật lại được ở màn "Bảo hiểm" khi MIC mở sản phẩm này.
UPDATE "public"."insurance_products"
SET "is_active" = false, "updated_at" = now()
WHERE "provider" = 'mic' AND "kind" = 'personal_accident' AND "is_active";

-- Tên đối tác trên dòng phí bảo hiểm của báo giá: migration v4 nạp chữ giữ chỗ và các phiên bản
-- sau chép theo. Chỉ thay đúng chữ giữ chỗ đó — tên admin đã gõ thì để nguyên. Đơn đã tạo không
-- đổi: chính sách phí đóng băng vào snapshot của đơn (ADR 0024).
UPDATE "public"."fee_policies"
SET "insurance_partner_name" = 'Bảo hiểm Quân đội MIC', "updated_at" = now()
WHERE "insurance_partner_name" = 'Đối tác bảo hiểm (chưa cấu hình)';
