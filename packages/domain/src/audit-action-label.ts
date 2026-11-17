import { auditActionCategoryOf, type AuditActionCategory } from '@xeprime/types';
import { LIST_SEPARATOR } from './display';

/** Cây message lồng nhau — `auditAction.member.create_account` là hai tầng object rồi một chuỗi. */
export type AuditMessageTree = { readonly [key: string]: string | AuditMessageTree };

/**
 * Tra một khoá có dấu chấm trên cây message. Tra trên cây thay vì `t()`: khoá hành động chứa dấu
 * chấm nên một NHÓM (`auditAction.member`) cũng "có", và `t()` vào một nhóm là lỗi runtime.
 */
export function lookupAuditMessage(tree: AuditMessageTree | undefined, path: string): string | null {
  let node: string | AuditMessageTree | undefined = tree;
  for (const part of path.split('.')) {
    if (!node || typeof node === 'string') return null;
    node = node[part];
  }
  return typeof node === 'string' ? node : null;
}

/**
 * Nhãn một mã hành động nhật ký — dùng chung web (`createAuditLabels`) và app (hoạt động thành viên).
 *
 * Có nhãn đầy đủ thì dùng; chưa có thì ghép "Nhóm · Động từ" (`LIST_SEPARATOR`) từ hai bảng cũ;
 * vẫn không có động từ thì hiện mã thô, để một hành động mới KHÔNG BAO GIỜ thành ô trống.
 */
export function auditActionLabel(
  actions: AuditMessageTree | undefined,
  action: string,
  labels: {
    /** Nhãn động từ, chuỗi rỗng khi chưa có. */
    verb: (verb: string) => string;
    category: (category: AuditActionCategory) => string;
  },
): string {
  const full = lookupAuditMessage(actions, action);
  if (full) return full;
  const verbLabel = labels.verb(action.slice(action.lastIndexOf('.') + 1));
  const category = labels.category(auditActionCategoryOf(action));
  return verbLabel ? `${category}${LIST_SEPARATOR}${verbLabel}` : action;
}
