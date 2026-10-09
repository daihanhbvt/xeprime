-- Bằng lái quốc tế / nước ngoài TỰ XÁC THỰC khi máy nhận ra đúng là bằng lái (ADR 0057, sửa
-- 09/10/2026).
--
-- Trên bố cục nước ngoài, máy đọc chữ không tách được tin cậy hạng (IDP đóng DẤU vào ô hạng, không in
-- chữ), hạn (mỗi nước một kiểu ngày), số bằng hay họ tên — nên một dòng `verified` của bằng nước
-- ngoài được phép THIẾU các trường đó. Chủ xe đối chiếu bằng gốc lúc giao xe. GPLX Việt Nam giữ
-- nguyên đòi hỏi đủ trường: cổng đặt xe soát hạng và hạn của nó.
ALTER TABLE "customer_driver_licences"
    DROP CONSTRAINT "customer_driver_licences_verified_complete_check";

ALTER TABLE "customer_driver_licences"
    ADD CONSTRAINT "customer_driver_licences_verified_complete_check" CHECK (
        "status" NOT IN ('verified', 'superseded') OR (
            "kind" IS NOT NULL
            AND "decision_source" IS NOT NULL
            AND "decided_at" IS NOT NULL
            AND "uploaded_at" IS NOT NULL
            AND (
                "kind" <> 'vn' OR (
                    "licence_number" IS NOT NULL
                    AND "full_name" IS NOT NULL
                    AND cardinality("licence_classes") >= 1
                    AND ("no_expiry" OR "expires_on" IS NOT NULL)
                )
            )
        )
    );
