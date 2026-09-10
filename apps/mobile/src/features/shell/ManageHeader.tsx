import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { IconButton } from '@/components/ui/IconButton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { BranchScopePill } from '@/features/branches/components/BranchScopePill';
import { colors, fontSize } from '@/theme/tokens';
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
      right={<ScopeSwitcherButton compact />}
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
