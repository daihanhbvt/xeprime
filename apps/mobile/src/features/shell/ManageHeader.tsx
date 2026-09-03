import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { IconButton } from '@/components/ui/IconButton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useManageDrawer } from './ManageDrawerHost';
import { ScopeSwitcherButton } from './ScopeSwitcher';

/**
 * Thanh trên của khu quản lý — nút mở menu · gian hàng đang làm việc · đổi khu.
 *
 * MỘT thanh cho mọi màn gốc của khu quản lý, thay vì mỗi màn tự khai `AppHeader` riêng rồi lệch
 * nhau về nội dung bên phải — đổi mục là cả thanh trên nhảy.
 *
 * Tiêu đề TRANG không nằm ở đây mà ở `ManagePageTitle` trong nội dung — cùng cách web dựng, và
 * mục đang sáng trong drawer đã nói người dùng đang ở đâu.
 */
export function ManageHeader() {
  const t = useTranslations('MobileShell.manageHome');
  const tNav = useTranslations('MobileShell.manageNav');
  const user = useAuthenticatedUser();
  const { tenant } = useTenantScope();

  const drawer = useManageDrawer();

  return (
    <AppHeader
      left={
        <IconButton icon="menu" label={tNav('openMenu')} onPress={drawer.open} tone="surface" />
      }
      title={tenant?.name ?? ''}
      subtitle={t('greeting', { name: user.displayName })}
      right={<ScopeSwitcherButton compact />}
    />
  );
}
