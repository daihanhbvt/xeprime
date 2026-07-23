# ADR 0003 — Styling: AntD design token + CSS Modules, bỏ styled-components

Ngày: 22/07/2026 · Trạng thái: Accepted

## Bối cảnh

`xeprime_fe_base_stack_calendar.md` và `xeprime_product_base_source_master_prompt.md` chốt `styled-components`. Nhưng cùng lúc đó cũng chốt:

- Ant Design v5 — **đã có CSS-in-JS runtime riêng** (`@ant-design/cssinjs`).
- "Server Components mặc định".

Hai điều này xung đột với styled-components:

1. Ship **hai** runtime CSS-in-JS song song trong cùng bundle.
2. Mọi component dùng `styled` buộc phải `'use client'` → không còn Server Component nữa.
3. `@ant-design/nextjs-registry` và `StyledComponentsRegistry` là hai cơ chế thu thập style SSR khác nhau, phải duy trì cả hai.

## Quyết định

- **Design token**: `ConfigProvider` theme của AntD là nguồn duy nhất cho màu, spacing, radius, font.
- **Style riêng**: CSS Modules (`*.module.css`), Next.js hỗ trợ sẵn, zero runtime.
- **Token dùng trong CSS**: export token AntD ra CSS custom properties ở `:root` một lần, để `.module.css` dùng `var(--xp-color-primary)` mà không cần JS.
- **Bỏ** `styled-components` và `babel-plugin-styled-components` khỏi dependency.

Điều cấm trong `CLAUDE.md` giữ nguyên tinh thần, chỉ đổi phương tiện: **vẫn không inline style, vẫn chỉ dùng token, không hard-code màu.**

## Lý do

- Zero runtime → bundle nhỏ hơn, không tốn CPU serialize style mỗi lần render.
- CSS Modules chạy được **trong Server Component**, giữ được lý do chọn App Router.
- Một cơ chế SSR style thay vì hai.
- Không phải theo dõi ma trận tương thích `styled-components v6 × React 19 × Next 15` — một nguồn rủi ro version không đem lại giá trị nghiệp vụ nào.

## Hệ quả

- `apps/web/src/styles/theme.ts` giữ token AntD (TypeScript, dùng cho `ConfigProvider`).
- `apps/web/src/styles/tokens.css` sinh CSS variables tương ứng. **Hai file phải khớp nhau** — viết một unit test nhỏ so sánh key để tránh lệch.
- `packages/ui` chỉ chứa component thật sự dùng chung giữa `(public)` và `(manage)`; component nào chỉ một nơi dùng thì để nguyên chỗ đó, đừng đẩy vào package sớm.
- Màn lịch (`CalendarScheduler`) là chỗ style động nhiều nhất (vị trí/độ dài event bar). Dùng **CSS custom property đặt qua `style` cho riêng giá trị tính toán** (`style={{ '--bar-left': x + 'px' }}`) — đây là ngoại lệ hợp lệ của quy tắc "không inline style", vì giá trị chỉ biết lúc runtime. Màu/hình dạng vẫn nằm trong `.module.css`.
