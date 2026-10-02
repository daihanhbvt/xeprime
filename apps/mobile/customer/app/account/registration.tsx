import { OWNER_STAGE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerRegistrationScreen } from '@/features/account/OwnerRegistrationScreen';

/**
 * Tiến trình đăng ký chủ xe, và là màn "Hồ sơ chủ xe" về sau.
 *
 * Cổng ở mức CHỦ XE (bậc `registering` trở lên): đây chính là màn của bậc đó, nên đòi bậc `owner`
 * sẽ khoá đúng những người duy nhất cần nó.
 */
export default function AccountRegistrationRoute() {
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <OwnerRegistrationScreen />
      </OwnerGate>
    </RequireSession>
  );
}
