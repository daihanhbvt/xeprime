import type { Href } from 'expo-router';
import {
  WORKSPACE_TARGET,
  isPackageOnboardingPending,
  resolveWorkspaceTarget,
  type WorkspaceTarget,
  type components,
} from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';

type CurrentUserLike = components['schemas']['MeDto'];

/**
 * Khoá khu làm việc → đích của APP NATIVE.
 *
 * Phép suy nằm ở `resolveWorkspaceTarget` (`@xeprime/types`), dùng chung với web; ở đây chỉ còn
 * bảng địa chỉ, vì hai app đi tới hai nơi khác nhau cho cùng một câu trả lời. `Record` đầy đủ nên
 * thêm một khoá vào `WORKSPACE_TARGET` mà quên đường dẫn sẽ đỏ ngay ở đây, thay vì âm thầm rơi vào
 * một nhánh mặc định.
 */
const TARGET_HREF: Readonly<Record<WorkspaceTarget, () => Href>> = {
  [WORKSPACE_TARGET.ONBOARDING]: () => ROUTES.manage.onboarding(),
  [WORKSPACE_TARGET.MANAGE]: () => ROUTES.manage.home(),
  [WORKSPACE_TARGET.ACCOUNT]: () => ROUTES.account.home(),
  [WORKSPACE_TARGET.VEHICLES]: () => ROUTES.account.vehicles(),
  [WORKSPACE_TARGET.REGISTRATION]: () => ROUTES.account.registration(),
};

/**
 * "Khu làm việc của người này ở đâu" — bản native, cùng phép suy với web.
 *
 * `null` = không có gian hàng; nơi gọi tự chọn (landing đăng xe, hay ở nguyên màn). Thứ tự quyết
 * định và lý do của từng nhánh nằm ở docblock của `resolveWorkspaceTarget`.
 */
export function resolveWorkspaceHref(user: CurrentUserLike | null | undefined): Href | null {
  const target = resolveWorkspaceTarget(user?.tenant ?? null);
  return target ? TARGET_HREF[target]() : null;
}

/**
 * Người này đang ở giữa luồng mở gian hàng trả phí — màn onboarding là nơi DUY NHẤT họ vào được.
 *
 * Hàm riêng thay vì để mỗi nơi tự so `resolveWorkspaceHref(user) === onboarding`: màn onboarding,
 * `resolveInitialScope` và thẻ nhắc ở khu tài khoản đều hỏi nó, và ba phép so là ba chỗ để một lần
 * đổi route làm hỏng cổng chặn mà không ai thấy.
 */
export function isPackageOnboarding(user: CurrentUserLike | null | undefined): boolean {
  return isPackageOnboardingPending(user?.tenant ?? null);
}
