import { RequireSession } from '@/features/auth/RequireSession';
import { FavoritesScreen } from '@/features/favorites/FavoritesScreen';

/** Xe yêu thích của tài khoản khách — `/account/favorites` như web (BRD customer favorites). */
export default function AccountFavoritesRoute() {
  return (
    <RequireSession>
      <FavoritesScreen />
    </RequireSession>
  );
}
