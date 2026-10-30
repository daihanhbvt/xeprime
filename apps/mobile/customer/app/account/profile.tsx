import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { AccountProfileScreen } from '@/features/account/AccountProfileScreen';
import { RequireSession } from '@/features/auth/RequireSession';

/** "Quản lý tài khoản" — mở từ thẻ hồ sơ / mục menu của tab Tài khoản. */
export default function AccountProfileRoute() {
  return (
    <RequireSession fallback={<ProfileSkeleton />}>
      <AccountProfileScreen />
    </RequireSession>
  );
}
