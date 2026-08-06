# FIGMA_SECTION_INDEX — Chỉ mục section của file Figma

> Ngày lập: 06/08/2026 · Wave 0A (persist kết quả discovery, chưa inspect chi tiết).
> Nguồn: metadata page-level đọc qua Figma MCP trong phiên 06/08/2026.

## File

| Thuộc tính | Giá trị |
| --- | --- |
| Tên file | **Untitled** |
| File key | `GnaJwLjHkWH9BEkcT1lL7W` |
| Page | **Page 1** — node `0:1` (page duy nhất) |
| Link node bất kỳ | `https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=<ID, thay ":" bằng "-">` |

## Section cấp cao nhất (13 section)

Cột "Quá lớn?": **mọi section đều quá lớn** để gọi `get_metadata` trực tiếp ở cấp section — metadata của riêng Page 1 đã 11,3MB. Cách làm bắt buộc: inspect theo **từng frame con** bằng node ID trong [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md).

| # | Section | Node ID | Kích thước | Số con trực tiếp | Tóm tắt nội dung | Quá lớn? | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | 📂 Docs | `8:2` | 6000×5967 | 15 | Bản nhúng 12 tài liệu `docs/design/` (01_BRAND_GUIDE → README) + Assets. **Repo là bản gốc, bản nhúng chỉ để designer đọc** | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=8-2) |
| 01 | XePrime Foundations | `14:2` | 12000×26000 | 89 | Token `--xp-*` đầy đủ (primary/neutral/status/dark-sidebar), thang chữ, spacing + atoms | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=14-2) |
| 02 | Customer Marketplace | `18:1662` | 14000×28594 | 46 | 7 màn desktop đánh số (populated/filtered/loading/empty/error), vehicle-detail, shop-profile, tablet, mobile + 5 frame audit/annotation/handoff | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=18-1662) |
| 03 | Customer Account & Engagement | `23:3386` | 10800×12988 | 74 | Auth modal 9 trạng thái, account, trips, review, mobile drawers | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=23-3386) |
| 04 | Shop Onboarding & Settings | `41:2` | 12000×22000 | 75 | Luồng entry → login → no-tenant → registration (đủ trạng thái) + shop profile + mobile | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=41-2) |
| 05 | Fleet Management | `57:2` | 11600×24000 | 131 | Fleet list 10 trạng thái, form xe, chi tiết xe, mobile + component cục bộ (`Fleet/*`, `Shell/Sidebar`, Money Input…) + spec matrix 05.9x | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=57-2) |
| 06 | Rental Operations | `66:2` | 11600×25983 | 101 | Booking request flow 12 trạng thái (desktop + mobile bottom sheet), inbox duyệt yêu cầu của shop | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=66-2) |
| 07 | Finance Operations | `77:1195` | 11600×19500 | 87 | Finance dashboard 9 trạng thái + drill-down, debt list, record payment, void, tablet/mobile | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=77-1195) |
| 08 | Shop Organization & Communication | `87:1195` | 11600×13788 | 74 | Members đủ luồng (add/role-change/remove, not-found/already-member/reactivated) + mobile | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=87-1195) |
| 09 | Platform Governance | `92:1259` | 13760×21630 | 114 | Platform dashboard + KPI treatments + approval queue/detail + tablet/mobile | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=92-1259) |
| 10 | Platform Operations & Privacy | `106:1203` | 9200×24000 | 84 | Booking monitor, customer monitor, PII reveal; có frame ghi chú route + permission | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=106-1203) |
| 11 | Platform Organization & Billing | `113:3016` | 9200×25233 | 98 | Staff management đủ luồng (kể cả super-admin/conflict) + mobile. ⚠️ có 2 bộ nhãn "Batch 1" — xem [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A2 | Có | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=113-3016) |
| 12 | Product Coverage & Consistency Audit | `120:1563` | 9200×72000 | 63 | 3 batch audit: coverage theo persona, global component map/ownership/duplicate-report/token-audit, table/filter/responsive audit. **Đọc trước khi kết luận về độ phủ design** | Có (cao 72.000px) | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=120-1563) |

## Shared component cấp page (6 node, nằm ngoài mọi section)

| Component | Node ID | Kích thước | Link |
| --- | --- | --- | --- |
| XePrime/Button | `125:1571` | 624×174 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-1571) |
| XePrime/Modal | `125:1611` | 1776×381 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-1611) |
| XePrime/Toast | `125:1632` | 354×284 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-1632) |
| XePrime/SearchBar | `125:1650` | 287×84 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-1650) |
| XePrime/Chip | `125:2696` | 193×69 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-2696) |
| XePrime/Badge | `125:2703` | 116×77 | [mở](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=125-2703) |

> ⚠️ Ghi nhận từ inspect mẫu (frame `18:4`, 06/08/2026): màn marketplace home **không dùng instance** của các component này (chỉ có 1 instance `pagination` `117:1250`) — mức độ "screens dùng component thật" cần kiểm chứng ở wave inspect chi tiết. Xem [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A3.

## Trạng thái sử dụng

- Danh mục node đầy đủ (1057 node, phân loại + eligibility): [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md)
- Điểm mơ hồ cần xử lý trước khi code: [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md)
- Mức đã làm: **discovery con trực tiếp (độ sâu 1)** — CHƯA inspect chi tiết bất kỳ frame production nào ngoài `18:4`.
