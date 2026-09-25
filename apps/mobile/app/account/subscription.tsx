import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SubscriptionScreen } from '@/features/subscription/SubscriptionScreen';

/**
 * Gói dịch vụ nhìn từ khu KHÁCH — cùng `SubscriptionScreen` với `/manage/subscription`.
 *
 * Chủ xe tuyến hoa hồng không vào khu quản lý được (ADR 0038 điều 4), nhưng họ chính là người
 * cần màn này nhất: đây là phễu nâng cấp lên gian hàng, và là nơi duy nhất hiện trần 3 xe của
 * Owner Lite (điều 12). Thiếu route này thì đường nâng cấp đứt hẳn trên app.
 *
 * `OwnerGate` gác ở vai CHỦ, tức bậc `registering` trở lên — đúng cổng web đặt cho trang này:
 * người đang đăng ký cũng phải xem và mua được gói, khoá họ lại là khoá đúng những người đang
 * trên đường trở thành khách hàng trả tiền.
 */
export default function AccountSubscriptionRoute() {
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <SubscriptionScreen shell="account" />
      </OwnerGate>
    </RequireSession>
  );
}
