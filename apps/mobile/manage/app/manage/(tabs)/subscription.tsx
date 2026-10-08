import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { PartnerTrackView } from '@/features/shell/PartnerTrackView';
import { SubscriptionScreen } from '@/features/subscription/SubscriptionScreen';

/**
 * Gói & hoá đơn — gian hàng tuyến gói quản lý thuê bao; chủ xe tuyến hoa hồng thấy đúng màn này làm
 * phễu nâng cấp (web `OwnerSubscriptionView`, gác `OwnerGate` từ bước đăng ký).
 */
export default function ManageSubscriptionRoute() {
  return (
    <PartnerTrackView
      packageView={<SubscriptionScreen />}
      commissionView={
        <OwnerGate minStage={OWNER_STAGE.REGISTERING} header={<ManageHeader />}>
          <SubscriptionScreen ownerLite />
        </OwnerGate>
      }
    />
  );
}
