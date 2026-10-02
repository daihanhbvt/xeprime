import { CHAT_SIDE } from '@xeprime/types';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { IconButton } from '@/components/ui/IconButton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { BranchScopePill } from '@/features/branches/components/BranchScopePill';
import { ChatBadgeButton } from '@/features/chat/components/ChatBadgeButton';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { NOTIFICATION_CONTEXT } from '@/features/notifications/notification-display';
import { colors, fontSize, space } from '@/theme/tokens';
import { useManageDrawer } from './ManageDrawerHost';
import { ScopeSwitcherButton } from './ScopeSwitcher';

/**
 * Thanh trên của khu quản lý — nút mở menu · gian hàng đang làm việc · đổi khu · phạm vi chi nhánh.
 *
 * MỘT thanh cho mọi màn gốc của khu quản lý, thay vì mỗi màn tự khai `AppHeader` riêng rồi lệch
 * nhau về nội dung bên phải — đổi mục là cả thanh trên nhảy.
 *
 * Tiêu đề TRANG không nằm ở đây mà ở `ManagePageTitle` trong nội dung — cùng cách web dựng, và
 * mục đang sáng trong drawer đã nói người dùng đang ở đâu.
 *
 * Phạm vi chi nhánh đi vào DÒNG PHỤ của chính thanh này, không phải một dải riêng bên dưới. Dải
 * riêng lấy của mọi màn quản lý thêm ~34dp cộng một nét kẻ — kể cả những màn không lọc theo chi
 * nhánh gì cả (hồ sơ gian hàng, chính sách) — còn dòng phụ thì vốn đã có sẵn và chỉ chở một lời
 * chào. Lời chào lùi về làm dự phòng: nó chỉ xuất hiện khi không có chi nhánh nào để nói tới
 * (`BranchScopePill` quyết định — xem component đó).
 *
 * Không nhồi bộ chọn vào HÀNG CHÍNH: hàng đó đã có nút menu, tên gian hàng và nút đổi khu, thêm
 * một ô chọn nữa thì ở 360dp tên chi nhánh còn ba ký tự.
 */
export function ManageHeader() {
  const t = useTranslations('MobileShell.manageHome');
  const tNav = useTranslations('MobileShell.manageNav');
  const user = useAuthenticatedUser();
  const { tenant } = useTenantScope();

  const drawer = useManageDrawer();

  return (
    <AppHeader
      left={<IconButton icon="menu" label={tNav('openMenu')} onPress={drawer.open} tone="surface" />}
      title={tenant?.name ?? ''}
      context={
        <BranchScopePill fallback={<Greeting text={t('greeting', { name: user.displayName })} />} />
      }
      right={
        /*
          Tin nhắn → thông báo → ngữ cảnh gian hàng, đúng thứ tự web đặt trên `Topbar`.

          Biểu tượng tin nhắn KHÔNG trùng với mục "Trò chuyện" trong drawer: mục đó đếm riêng
          hộp thư GIAN HÀNG (`MANAGE_NAV_BADGE.CHAT_UNREAD`), còn viên này đếm TỔNG cả hai vai —
          nếu không, chủ gian hàng đang làm việc ở khu quản lý không hề biết có người nhắn vào hộp
          thư cá nhân của mình. Đó là đúng lỗ mà `useChatBadge` sinh ra để bịt.

          Cả ba ở biến thể GỌN 32dp: hàng này còn phải chứa nút menu và tên gian hàng trên màn
          320dp, và ở 48dp thì tên chỉ còn vài ký tự.
        */
        <XStack ai="center" gap={space.xs}>
          <ChatBadgeButton surface={CHAT_SIDE.SHOP} compact />
          <NotificationBell context={NOTIFICATION_CONTEXT.MANAGE} compact />
          <ScopeSwitcherButton compact />
        </XStack>
      }
    />
  );
}

/** Dòng phụ mặc định khi không có chi nhánh nào để hiện — cùng kiểu chữ với `subtitle` của thanh. */
function Greeting({ text }: { text: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
      {text}
    </Text>
  );
}
