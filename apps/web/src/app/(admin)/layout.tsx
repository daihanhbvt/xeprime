import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { ZONE } from '@/zones';
import { ZoneProvider } from '@/zones/ZoneProvider';

/** Gốc SITE QUẢN TRỊ (`admin.xeprime.vn` — ADR 0051 điều 2). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ZoneProvider zone={ZONE.ADMIN}>
      <AdminShell>{children}</AdminShell>
    </ZoneProvider>
  );
}
