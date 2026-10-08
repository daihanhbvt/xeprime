import { OWNER_STAGE } from '@xeprime/types';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { OwnerRegistrationScreen } from '@/features/account/OwnerRegistrationScreen';

/**
 * Tiến trình đăng ký chủ xe, và là màn "Hồ sơ chủ xe" về sau.
 *
 * Cổng ở mức CHỦ XE (bậc `registering` trở lên): đây chính là màn của bậc đó, nên đòi bậc `owner`
 * sẽ khoá đúng những người duy nhất cần nó.
 */
export default function ManageOwnerLiteRegistrationRoute() {
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING} header={<ManageHeader />}>
      <OwnerRegistrationScreen shell="manage" />
    </OwnerGate>
  );
}
