'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { SupportCapability, SupportWorkspace } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useWorkspace } from '@/hooks/use-workspace';
import { useSupportSession } from '../support-session';

/**
 * Cổng của MỘT route trong phiên hỗ trợ (ADR 0050 §12).
 *
 *  - `workspace`: route chỉ thuộc bộ giao diện đó (màn sửa xe nhiều tab là của Full Manage, không
 *    gian "Quản lý xe" là của Owner Lite…). Gõ tay URL của bộ kia, hay gian hàng vừa đổi tuyến giữa
 *    phiên, thì nói thẳng và đưa về trang đầu của phiên — không dựng một màn lai.
 *  - `requires`: capability server đã cấp cho phiên. Thiếu (cờ gói đang ẩn, tuyến không có màn đó)
 *    thì KHÔNG dựng trang — không để trang gọi API rồi hiện lỗi 403.
 *
 * Đây là lớp trải nghiệm; server chặn thật bằng `@SupportAction`.
 */
export function SupportWorkspaceGate({
  workspace,
  requires,
  children,
}: {
  workspace?: SupportWorkspace | readonly SupportWorkspace[];
  requires?: SupportCapability;
  children: ReactNode;
}) {
  const session = useSupportSession();
  const { paths } = useWorkspace();
  const t = useTranslations('TenantSupport.gate');
  if (!session) return null;

  const workspaces = workspace === undefined ? null : ([] as SupportWorkspace[]).concat(workspace);
  const workspaceOk = workspaces === null || workspaces.includes(session.context.workspace);
  const capabilityOk = requires === undefined || session.can(requires);
  if (workspaceOk && capabilityOk) return <>{children}</>;

  return (
    <EmptyState
      variant="empty"
      title={t('title')}
      description={t('body')}
      action={
        <Link href={paths.home}>
          <Button type="primary">{t('back')}</Button>
        </Link>
      }
    />
  );
}

/** Tên ngắn cho các route của phiên — cùng một cổng. */
export const SupportRoute = SupportWorkspaceGate;
