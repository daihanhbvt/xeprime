import { Redirect } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * ALIAS cũ của "Tài khoản nhận tiền" — từ PR #159 nó là khối của trang số dư ở CẢ hai tuyến (web
 * `/bank-accounts` → `balancePayoutPath()`). `ScopeGuard` thường đã chuyển trước khi màn này
 * dựng (`partnerPathRedirect`: chủ → số dư, thành viên → tài khoản); đây là lưới an toàn cho
 * deep link cũ. Trang số dư tự hiện "chỉ chủ sở hữu" cho thành viên.
 */
export default function ManageBankAccountsRoute() {
  return <Redirect href={ROUTES.manage.balancePayout()} />;
}
