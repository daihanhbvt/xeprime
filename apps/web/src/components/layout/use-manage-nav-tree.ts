'use client';

import { useMemo } from 'react';
import {
  mobileTabsForZone,
  navForZone,
  supportMobileTabs,
  supportNavSections,
  type MobileTab,
  type NavSection,
} from '@/constants/nav';
import { resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useZone } from '@/zones/ZoneProvider';

export interface ManageNavTree {
  readonly sections: readonly NavSection[];
  readonly mobileTabs: readonly MobileTab[];
}

/**
 * Cây menu của khung quản lý — MỘT nguồn cho sidebar, breadcrumb, menu dưới đáy và băng "hết hạn".
 *
 * Chọn theo KHU (`useZone`) và TUYẾN do server trả (ADR 0051 điều 3): khu admin → menu nền tảng;
 * khu partner → menu tuyến gói hoặc tuyến hoa hồng. Trong phiên hỗ trợ gian hàng (khu admin — ADR
 * 0050 §12) đó là cây của GIAN HÀNG đang được hỗ trợ, href đã ánh xạ sang route của phiên. Chỉ có một
 * menu toàn cục, không bao giờ hai.
 */
export function useManageNavTree(): ManageNavTree {
  const { data: user } = useCurrentUser();
  const zone = useZone();
  const support = useSupportSession();
  const track = resolvePartnerTrack(user);
  const contextId = support?.contextId ?? null;
  const workspace = support?.context.workspace ?? null;

  return useMemo(() => {
    if (contextId && workspace) {
      return {
        sections: supportNavSections(contextId, workspace),
        mobileTabs: supportMobileTabs(contextId, workspace),
      };
    }
    return { sections: navForZone(zone, track), mobileTabs: mobileTabsForZone(zone, track) };
  }, [contextId, workspace, zone, track]);
}
