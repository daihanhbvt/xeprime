'use client';

import { useMemo } from 'react';
import {
  mobileTabsForScope,
  navForScope,
  supportMobileTabs,
  supportNavSections,
  type MobileTab,
  type NavSection,
} from '@/constants/nav';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useCurrentUser } from '@/hooks/use-current-user';

export interface ManageNavTree {
  readonly sections: readonly NavSection[];
  readonly mobileTabs: readonly MobileTab[];
}

/**
 * Cây menu của khung quản lý — MỘT nguồn cho sidebar, breadcrumb, menu dưới đáy và băng "hết hạn".
 *
 * Trong phiên hỗ trợ gian hàng (ADR 0050 §12) đó là cây của GIAN HÀNG đang được hỗ trợ (Full Manage
 * hoặc Owner Lite), href đã ánh xạ sang route của phiên — không phải cây nền tảng của người đang
 * đăng nhập. Chỉ có một menu toàn cục, không bao giờ hai.
 */
export function useManageNavTree(): ManageNavTree {
  const { data: user } = useCurrentUser();
  const support = useSupportSession();
  const isPlatform = Boolean(user?.platformRole);
  const contextId = support?.contextId ?? null;
  const workspace = support?.context.workspace ?? null;

  return useMemo(() => {
    if (contextId && workspace) {
      return {
        sections: supportNavSections(contextId, workspace),
        mobileTabs: supportMobileTabs(contextId, workspace),
      };
    }
    return { sections: navForScope(isPlatform), mobileTabs: mobileTabsForScope(isPlatform) };
  }, [contextId, workspace, isPlatform]);
}
