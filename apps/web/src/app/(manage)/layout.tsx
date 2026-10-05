import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ZONE } from '@/zones';
import { ZoneProvider } from '@/zones/ZoneProvider';

/**
 * Gốc SITE PARTNER (`partner.xeprime.vn` — ADR 0051 điều 2). `ZoneProvider` là nguồn duy nhất cho
 * câu "trang này thuộc khu nào" — không suy từ tiền tố đường dẫn.
 */
export default function ManageLayout({ children }: { children: ReactNode }) {
  return (
    <ZoneProvider zone={ZONE.PARTNER}>
      <AppShell>{children}</AppShell>
    </ZoneProvider>
  );
}
