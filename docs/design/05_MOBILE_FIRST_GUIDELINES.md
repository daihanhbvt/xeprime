# 05 — Mobile-First Guidelines

> Ngày: 04/08/2026 · Chủ sở hữu: Product + Creative Director
> Breakpoint kỹ thuật hiện có: `useIsMobile` = **≤ 640px** (`apps/web/src/hooks/use-media-query.ts`).

---

## 1. Vì sao mobile là mặt trận chính

Không phải vì "xu hướng". Vì **cả ba persona đều ở trên điện thoại vào đúng lúc quan trọng nhất**:

| Persona | Khoảnh khắc quyết định | Thiết bị |
| --- | --- | --- |
| Khách thuê | So sánh và chốt xe, tối trước chuyến đi | Điện thoại, gần như 100% |
| Chủ shop | Khách gọi hỏi "xe còn không" khi đang ở bãi | Điện thoại, một tay |
| Nhân viên | Giao/nhận xe tại điểm hẹn | Điện thoại |
| Nhân viên | Nhập liệu, đối soát cuối ngày | Laptop |
| Nền tảng | Duyệt hàng loạt | Laptop |

⇒ **Marketplace: mobile-first tuyệt đối.** **Portal: mobile-first cho luồng vận hành hiện trường, desktop-first cho luồng nhập liệu hàng loạt** — và cả hai đều phải dùng được, không có màn nào "chỉ desktop".

---

## 2. Breakpoint

| Tên | Dải | Bố cục |
| --- | --- | --- |
| `mobile` | ≤ 640px | 1 cột · bottom tab bar · bottom sheet · bảng → thẻ |
| `tablet` | 641–1024px | 2 cột · sidebar thu gọn (icon) · drawer |
| `desktop` | 1025–1440px | Bố cục đầy đủ · sidebar 232px · bảng thật |
| `wide` | > 1440px | Nội dung giới hạn 1440px, canh giữa; **không** kéo bảng ra vô tận |

Chỉ dùng **một** hệ breakpoint. Không được có media query rời rạc `@media (max-width: 768px)` trong một `.module.css` lẻ.

---

## 3. Vùng chạm

| Yếu tố | Tối thiểu |
| --- | --- |
| Vùng chạm bất kỳ | **44 × 44px** (ngay cả khi icon 20px) |
| Khoảng cách giữa 2 vùng chạm | 8px |
| Hàng trong danh sách | Cao ≥ 56px |
| Nút chính trong sheet | Cao 48px, rộng hết khung |
| Ô nhập | Cao 44px, chữ **≥ 16px** (dưới 16px iOS tự phóng to trang) |

**Vùng ngón cái**: hành động chính nằm ở **1/3 dưới** màn hình. Hành động phá huỷ (xoá, huỷ đơn) **không** đặt ở vùng dễ chạm nhầm — đưa vào menu phụ hoặc yêu cầu xác nhận.

**Safe area**: mọi thanh cố định dưới đáy phải cộng `env(safe-area-inset-bottom)`. Luồng đặt xe đã làm đúng chỗ này — giữ nguyên chuẩn đó.

---

## 4. Điều hướng

### Marketplace (đã có `MobileTabBar`)
5 tab tối đa: **Khám phá · Chuyến của tôi · Tin nhắn · Yêu thích · Tài khoản**.
Tab cần đăng nhập thì mở **auth modal** kèm `next` đúng tab đó — không đẩy sang trang đăng nhập cổng quản lý (đã sửa 04/08, giữ nguyên).

### Portal (đã có `MobileNav`)
4 tab + "Thêm": **Tổng quan · Lịch · Yêu cầu thuê · Đơn thuê · Thêm**.
"Thêm" mở drawer chứa toàn bộ menu còn lại, nhóm theo `07_INFORMATION_ARCHITECTURE.md`.

### Quy tắc chung
- Tab bar luôn hiện, trừ khi đang trong luồng nhiều bước (đặt xe, tạo đơn) — lúc đó thay bằng thanh hành động của luồng.
- Không có menu hamburger ở mobile marketplace. Hamburger là nơi tính năng đi chết.
- Nút "quay lại" luôn về **màn trước trong luồng**, không phải trang chủ.

---

## 5. Bảng → thẻ

Bảng nhiều cột không tồn tại ở mobile. Quy tắc chuyển đổi bắt buộc:

```
Hàng bảng (desktop)                 Thẻ (mobile)
┌─────────────────────────────┐     ┌────────────────────────────┐
│ Mã | Khách | Xe | Thời gian │     │ Nguyễn Văn A   [Đang thuê] │  ← neo + trạng thái
│ | Tổng | Đã trả | Còn | TT  │  →  │ VF3 Plus · 43B33692        │  ← dòng phụ
└─────────────────────────────┘     │ 05/07 08:00 → 08/07 20:00  │
                                    │ Còn nợ      1.520.000 đ    │  ← số liệu quan trọng nhất
                                    │              [Thu tiền] ⋯  │  ← 1 hành động chính
                                    └────────────────────────────┘
```

**Luật**:
1. Mỗi thẻ có đúng **một** giá trị neo (tên khách hoặc tên xe) ở dòng đầu, cỡ 16px, weight 600.
2. Trạng thái là chip ở góc phải dòng đầu — không bao giờ chôn ở dòng 4.
3. Tối đa **4 dòng thông tin**. Cái thứ 5 trở đi thuộc màn chi tiết.
4. Đúng **một** nút hành động chính; phần còn lại vào `⋯`.
5. Số tiền quan trọng nhất của ngữ cảnh đó được in đậm, canh phải, tabular.
6. Chạm vào thẻ = mở chi tiết. Không có ngoại lệ.

**Không dùng**: cuộn ngang bảng ở mobile (người dùng không biết còn cột bên phải), thu nhỏ chữ để nhét đủ cột, ẩn cột mà không nói.

---

## 6. Lịch trên mobile — bài toán khó nhất

Resource-timeline (xe × ngày) là màn quan trọng nhất của portal và cũng là màn khó chuyển thể nhất. **Không co lịch desktop lại.** Thiết kế bản mobile riêng:

| Chế độ | Mô tả | Khi nào |
| --- | --- | --- |
| **Agenda ngày** (mặc định mobile) | Danh sách theo mốc giờ trong ngày: giao xe nào, nhận xe nào, xe nào đang chạy | Mở app buổi sáng — đây là câu hỏi thật của chủ shop |
| **Theo xe** | Chọn 1 xe → dòng thời gian 14 ngày của riêng xe đó | Khách hỏi "xe X còn trống không" |
| **Lưới nén** | Lưới xe × ngày, cột ngày 32px, cuộn hai chiều, cột xe dính trái | Chỉ khi người dùng chủ động chọn |

Kéo-thả **tắt** ở mobile: chạm giữ để chọn, rồi dùng bảng hành động ("Dời lịch", "Đổi xe"). Kéo-thả trên màn cảm ứng để đặt lịch là công thức tạo lỗi.

---

## 7. Form

- **Một trường một dòng.** Không có ngoại lệ ở mobile, kể cả "ngày" và "giờ".
- **Bàn phím đúng loại**: `inputMode="numeric"` cho tiền/số km, `type="tel"` cho SĐT, `autoComplete="one-time-code"` cho OTP (đã làm ở `OtpCodeInput` — giữ).
- **Nhãn luôn hiện** phía trên ô. Không dùng placeholder thay nhãn.
- **Lỗi ngay dưới ô**, kèm cách sửa. Không dùng toast cho lỗi trường.
- **Nút gửi dính đáy** trong sheet, có safe-area, hiện trạng thái đang gửi và **chống double-submit**.
- **Form dài chia bước**: mỗi bước một câu hỏi rõ ràng, có chỉ báo tiến độ, quay lại được mà không mất dữ liệu.
  > Luồng đặt xe hiện tại đã đúng mẫu này (ngày giờ → kiểm tra còn trống → tên+SĐT → OTP). Dùng nó làm chuẩn cho các form dài khác, đặc biệt là **tạo đơn thuê** — thứ đang là modal 5 tab.

---

## 8. Bottom sheet, modal, drawer

| Mẫu | Mobile | Desktop | Dùng cho |
| --- | --- | --- | --- |
| Bottom sheet | ✅ | → Modal giữa | Luồng ngắn: chọn ngày, xác nhận, hành động nhanh |
| Drawer phải | → Toàn màn hình | ✅ | Chi tiết bản ghi (đơn, xe, khách) |
| Modal | → Bottom sheet | ✅ | Xác nhận, form ngắn |
| Trang riêng | ✅ | ✅ | Quy trình dài, nội dung cần chia sẻ được bằng link |

Sheet phải: kéo xuống để đóng · có nút đóng rõ ràng · khoá cuộn nền · trả focus về nơi đã mở · **không lồng sheet trong sheet**.

---

## 9. Hiệu năng — ngân sách bắt buộc

Đo trên 4G tiết chế, thiết bị tầm trung (không phải máy dev):

| Chỉ số | Ngưỡng |
| --- | --- |
| LCP trang chủ marketplace | ≤ 2.5s |
| LCP trang chi tiết xe | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| JS chuyển tới client cho route marketplace | ≤ 180KB gzip |
| Ảnh thẻ xe | ≤ 80KB (WebP/AVIF, `next/image`) |

**Ba luật giữ ngân sách**:
1. Marketplace mặc định Server Component; `'use client'` đẩy xuống lá càng sâu càng tốt.
2. Không kéo cả cây vào Suspense chỉ để đọc query param — bài học `AuthModalProvider`/`AuthUrlSync` (giữ static render cho `/`). Xem `10`.
3. Ảnh luôn có `width`/`height` hoặc `aspect-ratio` — CLS ở danh sách xe chủ yếu do ảnh không đặt tỉ lệ.

---

## 10. Mạng yếu, offline

- Mọi màn dữ liệu phải có **skeleton theo đúng hình dạng nội dung**, không phải spinner giữa màn.
- Thao tác ghi thất bại vì mạng: giữ nguyên dữ liệu người dùng đã nhập + nút "Thử lại". **Không** bao giờ đóng form và mất dữ liệu.
- Không dùng optimistic update cho: đặt/dời lịch, thu tiền, duyệt hồ sơ. Những thao tác này phải chờ máy chủ xác nhận vì chúng có thể bị ràng buộc DB từ chối (ADR 0006).
- Optimistic được phép cho: đánh dấu đã đọc, yêu thích, đổi bộ lọc.

---

## 11. Nội dung trên màn nhỏ

- Tiêu đề trang ≤ 24 ký tự; dài hơn thì rút gọn có ý nghĩa, không cắt ngang từ.
- Tên xe/khách dài: cắt bằng ellipsis **một dòng** ở danh sách, hiện đủ ở chi tiết. Không xuống 3 dòng.
- Tiền: mobile hiển thị `1.520.000 đ`; không rút gọn thành `1,5tr` ở màn tài chính (mơ hồ), chỉ được rút gọn ở thẻ số liệu tổng quan và phải có tooltip/chi tiết đầy đủ.
- Ngày giờ: `05/07 08:00`. Năm chỉ hiện khi khác năm hiện tại.

---

## 12. Kiểm tra trước khi giao

- [ ] Dùng được một tay trên máy 375px rộng
- [ ] Mọi vùng chạm ≥ 44px
- [ ] Không có cuộn ngang ngoài ý muốn
- [ ] Bàn phím không che nút gửi
- [ ] Safe area được cộng ở mọi thanh dính đáy
- [ ] Bảng đã chuyển thành thẻ theo luật §5
- [ ] Loading / rỗng / lỗi / thiếu quyền đều đã vẽ ở bản mobile
- [ ] Kiểm tra thật với `Ctrl+F5` ở chế độ 4G tiết chế
- [ ] Xoay ngang không vỡ bố cục

Liên quan: `08_UX_GUIDELINES.md` (mẫu tương tác đầy đủ) · `10_IMPLEMENTATION_CONSTRAINTS.md`.
