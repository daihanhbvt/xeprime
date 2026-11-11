-- Năm lý do báo cáo mặc định — admin sửa/tắt/thêm ở trang quản trị sau đó.
-- Id cố định để chạy lại an toàn (ON CONFLICT DO NOTHING) và để mọi môi trường có cùng id.
INSERT INTO "chat_report_reasons" ("id", "label", "is_active", "sort_order", "created_at", "updated_at") VALUES
    ('01JCHATRSN0000000000000001', 'Spam, quảng cáo', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000002', 'Quấy rối, xúc phạm', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000003', 'Lừa đảo', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000004', 'Nội dung không phù hợp', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000005', 'Khác', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
