import { RequireSession } from '@/features/auth/RequireSession';
import { HostGuideScreen } from '@/features/account/HostGuideScreen';

/**
 * Cẩm nang cho thuê xe — nội dung TĨNH, không gọi API tenant nào, nên KHÔNG có `OwnerGate`.
 *
 * Web cũng vậy (`/account/host-guide` chỉ render `HostGuideView`): mục chỉ hiện trong menu của
 * chủ xe, nhưng một người vào bằng deep link thì đọc hướng dẫn cũng chẳng hại gì — chặn lại là
 * dựng một cổng không bảo vệ thứ gì.
 */
export default function AccountHostGuideRoute() {
  return (
    <RequireSession>
      <HostGuideScreen />
    </RequireSession>
  );
}
