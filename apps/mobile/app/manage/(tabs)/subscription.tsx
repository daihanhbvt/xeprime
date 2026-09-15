import { SubscriptionScreen } from '@/features/subscription/SubscriptionScreen';

/**
 * "Gói của tôi" — mua/gia hạn gói theo chỗ, mức dùng chỗ, lượt miễn phí, lịch sử hoá đơn.
 *
 * Quyền XEM gác trong màn (`SUBSCRIPTION_VIEW`, cùng quyền mục menu mang); quyền MUA
 * (`SUBSCRIPTION_PURCHASE`) chỉ backend kiểm — đúng như web.
 */
export default function ManageSubscriptionRoute() {
  return <SubscriptionScreen />;
}
