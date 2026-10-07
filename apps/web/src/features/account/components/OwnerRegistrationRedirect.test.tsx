import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE, TENANT_STATUS } from '@xeprime/types';

import { OwnerRegistrationRedirect } from './OwnerRegistrationRedirect';

/**
 * Route cũ `/registration` (06/10/2026: "Hồ sơ chủ xe" gộp vào `/account`) — đích THEO TUYẾN.
 * Một redirect ở server không biết tuyến; bản này chọn bằng đúng luật `AppShell` dùng.
 */

const user = vi.hoisted(() => ({ value: null as unknown, isPending: false }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isPending: user.isPending }),
}));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function tenant(billingMode: string, onboardingState: string) {
  return {
    tenant: {
      id: 'T1',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: TENANT_STATUS.ACTIVE,
      billingMode,
      onboardingState,
      publicVehicleCount: 1,
    },
  };
}

afterEach(() => {
  cleanup();
  replace.mockReset();
  user.isPending = false;
});

describe('/registration → đích theo tuyến', () => {
  it('chủ xe tuyến hoa hồng → section "Trang chủ xe" của Hồ sơ chủ xe', async () => {
    user.value = tenant(BILLING_MODE.COMMISSION, SHOP_ONBOARDING_STATE.COMMISSION);
    render(<OwnerRegistrationRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/manage/account?section=storefront'));
  });

  it('tuyến gói → trang Cửa hàng', async () => {
    user.value = tenant(BILLING_MODE.PACKAGE, SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);
    render(<OwnerRegistrationRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/manage/shop'));
  });

  it('chưa biết người dùng là ai: chưa điều hướng', () => {
    user.isPending = true;
    render(<OwnerRegistrationRedirect />);
    expect(replace).not.toHaveBeenCalled();
  });
});
