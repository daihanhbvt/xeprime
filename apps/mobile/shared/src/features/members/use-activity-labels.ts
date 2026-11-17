import { useMemo } from 'react';
import { useMessages } from 'use-intl';
import { auditActionLabel, lookupAuditMessage, type AuditMessageTree } from '@xeprime/domain';
import { useDomainLabel } from '@/i18n/domain';

/**
 * Nhãn một dòng "Hoạt động gần đây" của thành viên — phần con của `createAuditLabels` bên web
 * (`apps/web/src/features/admin-audit/labels.ts`) mà tấm chi tiết nhân viên cần: tên hành động và
 * loại đối tượng. Chuỗi đọc từ namespace `Domain` của gốc chung, không chép.
 *
 * Tra trên cây thay vì `t()`: khoá hành động chứa dấu chấm nên một NHÓM (`auditAction.member`)
 * cũng "có" — gọi `t()` vào nhóm là lỗi runtime.
 */
export function useActivityLabels() {
  const messages = useMessages() as { Domain?: Record<string, unknown> };
  const domainLabel = useDomainLabel();

  return useMemo(() => {
    const actions = messages.Domain?.auditAction as AuditMessageTree | undefined;
    const targetTypes = messages.Domain?.auditTargetType as AuditMessageTree | undefined;
    return {
      // Cùng một hàm với web `createAuditLabels` (`@xeprime/domain`): nhãn đầy đủ → "Nhóm · Động từ" → mã thô.
      action: (action: string): string =>
        auditActionLabel(actions, action, {
          verb: (verb) => domainLabel('auditActionVerb', verb, ''),
          category: (category) => domainLabel('auditActionCategory', category),
        }),
      targetType: (targetType: string): string =>
        lookupAuditMessage(targetTypes, targetType) ?? targetType.replace(/_/g, ' '),
    };
  }, [messages, domainLabel]);
}
