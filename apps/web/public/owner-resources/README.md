# Tài liệu PDF cho chủ xe

Thư mục này phục vụ hai màn trong khu tài khoản: **Cẩm nang cho thuê xe** (`/account/host-guide`)
và **Hợp đồng & Chứng từ** (`/account/contracts-documents`). Danh sách và tên file được khai ở
`apps/web/src/constants/owner-resources.ts` — link trên giao diện sinh từ đó, không sửa tay.

**Repo không chứa PDF.** Chép các file thật vào đúng thư mục này với ĐÚNG tên dưới đây (chữ
thường, gạch nối). Thiếu file thì link trên giao diện trả 404 — không có file giữ chỗ.

| Tên file bắt buộc | Nội dung | Màn |
| --- | --- | --- |
| `safe-rental-process.pdf` | Quy trình cho thuê xe an toàn: bàn giao, nhận lại, hồ sơ thủ tục | Cẩm nang |
| `tax-settlement-guide.pdf` | Cẩm nang kê khai và quyết toán thuế thu nhập từ cho thuê | Cẩm nang |
| `rental-contract-template.pdf` | Hợp đồng cho thuê xe (mẫu) | Hợp đồng & Chứng từ |
| `handover-record-template.pdf` | Biên bản bàn giao xe (mẫu) | Hợp đồng & Chứng từ |
| `pit-settlement-document.pdf` | Chứng từ quyết toán thuế thu nhập cá nhân (mẫu) | Hợp đồng & Chứng từ |
| `tax-refund-request.pdf` | Văn bản đề nghị hoàn thuế gửi cơ quan thuế (mẫu) | Hợp đồng & Chứng từ |

Lưu ý nội dung: mọi số liệu thuế, tỷ lệ khấu trừ hay số hiệu văn bản pháp luật trong PDF phải
được tư vấn thuế/pháp lý xác nhận trước khi đưa lên (ADR 0028 §4). Giao diện không lặp lại các
con số đó.
