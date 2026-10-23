-- ADR 0064 — Gắn nhãn THỬ NGHIỆM cho GCN giả lập phát hành TRƯỚC khi có cờ `is_test`.
--
-- Bối cảnh: adapter giả lập MIC (`INSURANCE_PARTNER=mic_mock`, chỉ dev/staging) từng cấp GCN dạng
-- `MIC-VCX-…` / `MIC-NNTX-…` — không tiền tố `TEST-`. Migration `20261021100000_insurance_products`
-- thêm cột `is_test` với DEFAULT false và CHECK `booking_insurance_policies_test_certificate_check`
-- (`is_test` ⇔ số GCN bắt đầu bằng `TEST-`). Các dòng cũ qua được CHECK, nhưng qua SAI: chúng là
-- GCN không có hiệu lực mà sổ lại nói là hợp đồng thật (`is_test = false`), và màn hình khách/gian
-- hàng/admin hiện chúng như bảo hiểm có thật.
--
-- Dấu hiệu nhận ra một GCN giả lập là BẰNG CHỨNG adapter tự ghi: `response_payload_json.mock = true`
-- (`MicMockInsurancePartner.raw`). Không suy từ tiền tố `MIC-` — một đối tác thật cũng có thể dùng
-- tiền tố đó.
--
-- Việc làm, trong MỘT câu lệnh (CHECK kiểm theo câu lệnh — đổi cờ và số GCN ở hai câu sẽ có một
-- khoảnh khắc hàng vi phạm):
--   · `is_test = true`;
--   · thêm tiền tố `TEST-` vào `certificate_number` (bỏ qua dòng đã có tiền tố);
--   · `certificate_url` của adapter giả lập NHÚNG số GCN (`insuranceCertificateUrl` thay `{certCode}`)
--     nên thay số cũ bằng số mới ngay trong URL — không thì nút "Xem GCN" mở số không còn tồn tại.
--     Số GCN chỉ gồm chữ/số/gạch nối nên bản mã hoá URL trùng bản gốc.
--
-- `response_payload_json` GIỮ NGUYÊN: đó là bằng chứng nguyên trạng adapter trả về lúc phát hành,
-- không phải dữ liệu để viết lại. Không đụng migration đã áp — đây là migration mới.
--
-- Idempotent: chạy lại không còn dòng nào khớp điều kiện. Production không có dòng nào khớp
-- (`mic_mock` bị env schema từ chối ở production).

UPDATE "public"."booking_insurance_policies"
SET
    "is_test"            = true,
    "certificate_number" = CASE
        WHEN "certificate_number" IS NULL OR left("certificate_number", 5) = 'TEST-'
            THEN "certificate_number"
        ELSE 'TEST-' || "certificate_number"
    END,
    "certificate_url"    = CASE
        WHEN "certificate_url" IS NULL
          OR "certificate_number" IS NULL
          OR left("certificate_number", 5) = 'TEST-'
            THEN "certificate_url"
        ELSE replace("certificate_url", "certificate_number", 'TEST-' || "certificate_number")
    END,
    "updated_at"         = now()
WHERE ("response_payload_json" ->> 'mock') = 'true'
  AND (
        "is_test" = false
     OR ("certificate_number" IS NOT NULL AND left("certificate_number", 5) <> 'TEST-')
  );
