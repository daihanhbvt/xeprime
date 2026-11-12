# ADR 0080 — Admin sửa kỳ gói, huỷ kỳ kéo theo các kỳ xếp sau

Ngày: 05/11/2026 · Trạng thái: **Accepted** (05/11/2026 — người dùng chốt khi gian hàng XePrime Sài
Gòn đang ở gói Doanh nghiệp không đổi được gói, và admin không huỷ được kỳ đang chạy) · Liên quan:
[0010](0010-billing-plans-subscriptions.md) (lịch sử kỳ append-only), [0041](0041-plan-tiers-by-vehicle-count.md)
điều 6 (đổi gói ngay, luật huỷ), [0065](0065-per-vehicle-type-shop-plans.md) (phạm vi loại xe, bậc
`enterprise_contact`), [0024](0024-billing-mode-from-plan-frozen-on-booking.md) (snapshot giá / hạn mức)

## Bối cảnh

Bậc Doanh nghiệp (`enterprise_contact`, phạm vi `all`) bán bằng tư vấn: gian hàng không tự mua, không
tự đổi; admin là người duy nhất gán nó (ADR 0041 điều 5). Nhưng sau khi gán, admin chỉ còn hai việc:

- **Gán thêm** một kỳ (nối đuôi, hoặc đổi ngay).
- **Huỷ** — và chỉ huỷ được kỳ ở ĐUÔI chuỗi (ADR 0041 điều 6.4, `SUBSCRIPTION_LATER_TERM_EXISTS`).

Gian hàng có kỳ Doanh nghiệp đang chạy (21/09 → 21/12/2026) cộng một kỳ gia hạn đã xếp lịch (21/12 →
21/03/2027) thì kỳ đang chạy không có nút Huỷ. Admin phải đoán ra là huỷ kỳ sau trước. Và không có
cách nào sửa giá đàm phán, dời ngày kết thúc hay đổi trần xe của một kỳ đã gán: muốn chỉnh là phải huỷ
rồi gán lại, mất lịch sử và sinh thêm hoá đơn.

## Quyết định

1. **Huỷ kèm.** Huỷ một kỳ còn hạn thì các kỳ XẾP SAU nó trong chuỗi bị huỷ cùng, trong cùng
   transaction. "Trong chuỗi" là bao đóng xung đột phạm vi (`laterChainTermsOf`, `@xeprime/types`):
   huỷ kỳ xe máy kéo theo kỳ doanh nghiệp xếp sau nó, rồi kỳ ô tô xếp sau kỳ doanh nghiệp đó. Mỗi kỳ
   trả phí bị huỷ kèm có một dòng audit `subscription.cancel` lý do `cascade` (`causedBy` = kỳ bị
   huỷ chính); dòng audit của kỳ chính mang `cascadedTerms`. Hộp xác nhận ở web kể tên từng kỳ bị
   huỷ kèm. `SUBSCRIPTION_LATER_TERM_EXISTS` bị gỡ.
2. **Sửa kỳ.** `PATCH /platform/tenants/:tenantId/subscriptions/:id` (`platform.billing.manage`)
   sửa được bốn thứ trên một kỳ TRẢ PHÍ còn hạn: giá, ngày kết thúc, trần số xe (`quota_json.maxVehicles`,
   `null` = không giới hạn), ghi chú. Kỳ đã huỷ / hết hạn / dòng hoa hồng ⇒ 409
   `SUBSCRIPTION_TERM_NOT_EDITABLE` (`subscriptionEditBlockOf`).
   - **Ngày kết thúc** phải sau ngày bắt đầu, sau bây giờ và trong 36 tháng tới
     (`subscriptionEndsAtValid`). Rút về quá khứ là huỷ, dùng nút Huỷ.
   - Đổi ngày kết thúc thì các kỳ xếp sau trong chuỗi **dời theo cùng khoảng, giữ độ dài**
     (`subscriptionShiftPlan`): kéo dài không đè lên kỳ sau, rút ngắn không để hở. Mỗi kỳ bị dời một
     dòng audit `subscription.shift`. Kỳ ngoài chuỗi không đụng tới; nếu dời làm chồng lên nó thì
     EXCLUDE `tenant_subscriptions_package_scope_no_overlap` từ chối (`SUBSCRIPTION_TERM_CONFLICT`).
   - Ba cột claim của job vòng đời trên kỳ đổi ngày được xoá để nhắc lại theo ngày mới.
   - `term_months` giữ nguyên: nó là kỳ hạn đã MUA; `ends_at` không còn buộc bằng
     `starts_at + term_months` sau một lượt sửa.
   - Hạ trần xe dưới số xe đang dùng không gỡ xe nào — như hạ bậc, cổng tạo / đưa xe lên chợ chặn từ
     lượt sau.
3. **Giá chỉ sửa ở kỳ admin gán** (`origin = admin`). Kỳ kích hoạt từ hoá đơn gian hàng đã trả giữ số
   tiền khớp hoá đơn ⇒ 409 `SUBSCRIPTION_PRICE_NOT_EDITABLE`; ngày, trần xe, ghi chú vẫn sửa được, và
   web ẩn hẳn ô giá. Hoá đơn `paid` của kỳ admin gán là chứng từ của chính lượt gán, nên được ghi lại
   theo kỳ: giá, dòng, kỳ hiệu lực, hạn mức; giá về 0đ ⇒ hoá đơn `void`; kỳ tặng 0đ nay tính tiền ⇒
   sinh hoá đơn `paid` mới. Hoá đơn của kỳ từ thanh toán không bị viết lại.
4. Mọi lượt sửa / huỷ lấy khoá chuỗi kỳ (`subscriptionChainLockKey`) trước khi đọc, ghi audit
   `subscription.update` (trước / sau: kỳ, giá, trần xe, ghi chú, `shiftedTerms`) trong cùng
   transaction. Lượt lưu không đổi gì thì không ghi gì.

## Quan hệ với ADR cũ

- Ghi đè **ADR 0041 điều 6.4** trong phần "chỉ huỷ kỳ ở ĐUÔI chuỗi". Phần còn lại của điều 6.4 (dòng
  hoa hồng đang chạy không huỷ được; huỷ kỳ cuối cùng gán lại dòng hoa hồng mặc định) giữ nguyên.
- Nới **ADR 0010** "lịch sử append-only": một kỳ còn hạn giờ được UPDATE giá / ngày / hạn mức / ghi
  chú bởi admin, với audit trước/sau làm lịch sử. Gán, gia hạn, đổi gói vẫn chèn dòng mới.
- Ngoại lệ có kiểm soát của **ADR 0024** "snapshot không tính lại": snapshot giá / hạn mức của một kỳ
  chỉ đổi bằng lượt sửa tường minh của admin, không bao giờ vì bậc gói đổi.

## Hệ quả

- Màn gian hàng phía partner không đổi: gói Doanh nghiệp vẫn chỉ có lối "Liên hệ tư vấn". Đổi gói
  của họ là admin sửa / huỷ / gán ở "Thao tác quản trị nền tảng".
- Báo cáo doanh thu gói đọc từ hoá đơn sẽ thấy số mới sau khi admin sửa giá một kỳ admin gán; dấu vết
  nằm ở audit `subscription.update`.
