import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { AccountScreen } from '@/features/account/AccountScreen';
import { RequireSession } from '@/features/auth/RequireSession';

export default function AccountRoute() {
  return (
    <RequireSession fallback={<ProfileSkeleton />}>
      <AccountScreen />
    </RequireSession>
  );
}
