import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SupportDataScope } from '@/features/tenant-support/components/SupportWorkspaceProvider';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('TenantSupport.session');
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

/**
 * Nội dung của MỘT phiên hỗ trợ gian hàng (ADR 0050): băng cảnh báo + cache riêng của phiên.
 *
 * Ranh giới phiên (menu của gian hàng, breadcrumb, header phiên) đã dựng ở `AppShell`
 * (`SupportSessionBoundary`) — ở đây chỉ còn phạm vi DỮ LIỆU của trang.
 *
 * `key={contextId}` là bắt buộc, không phải trang trí: Next giữ layout khi chỉ đổi tham số động,
 * nên thiếu key thì chuyển từ phiên A sang phiên B dùng lại cache của A.
 */
export default async function SupportContextLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ contextId: string }>;
}) {
  const { contextId } = await params;
  return <SupportDataScope key={contextId}>{children}</SupportDataScope>;
}
