'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';

import { ZONE, ZONE_MODE, ZONE_REALM, zoneMode, zoneOfInternalPath, type Zone } from './zone-config';

/**
 * Khu đang render — đặt ở layout GỐC của từng route group (`(public)`, `(manage)`, `(admin)`).
 *
 * Vì sao không suy từ đường dẫn: sau khi bỏ tiền tố (ADR 0051 điều 2), `/chat`, `/support`,
 * `/login` tồn tại ở nhiều site — chỉ cây layout biết chắc trang đang thuộc khu nào, ở cả hai chế
 * độ `host` và `path`.
 *
 * Mặc định `market` cho các trang nằm ngoài ba nhóm (root `not-found`, `legal` dùng chung…): đó là
 * khu công khai, khu duy nhất không có cổng đăng nhập riêng.
 */
const ZoneContext = createContext<Zone>(ZONE.MARKET);

export function ZoneProvider({ zone, children }: { zone: Zone; children: ReactNode }) {
  return <ZoneContext.Provider value={zone}>{children}</ZoneContext.Provider>;
}

/** Khu của trang đang render. */
export function useZone(): Zone {
  return useContext(ZoneContext);
}

/** Realm tài khoản của khu đang render — đăng nhập ở site nào là tài khoản của realm đó. */
export function useZoneRealm() {
  return ZONE_REALM[useZone()];
}

/**
 * Khu của TRANG ĐANG MỞ, đọc ở GỐC cây — trên mọi `ZoneProvider`. CHỈ dành cho hạ tầng gốc phải biết
 * khu trước khi route group kịp render (QueryClient theo khu ở `lib/query-client.ts`); component
 * thường vẫn đọc `useZone()`.
 *
 *  - chế độ `host`: khu cố định theo host của request (`hostZone`, root layout đọc từ header) — đi
 *    sang site khác là tải lại cả trang, nên trong một phiên bản app khu không bao giờ đổi;
 *  - chế độ `path` (máy dev): ba khu chung một origin và chuyển trang phía client, nên khu đọc từ
 *    tiền tố thư mục của đường dẫn hiện tại.
 */
export function useAppZone(hostZone: Zone): Zone {
  const pathname = usePathname();
  return zoneMode() === ZONE_MODE.PATH ? zoneOfInternalPath(pathname ?? '/') : hostZone;
}
