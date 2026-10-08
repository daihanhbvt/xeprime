'use client';

import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { auditValueGroup } from '../labels';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Trường tiền — tra theo TÊN LÁ: `price`, `listedPrice`, `lines.0.amount`, `totalAmount`… */
const MONEY_FIELD = /(price|amount|fee|total|subtotal|balance|payable|cost)$/i;
const PERCENT_FIELDS = new Set(['commissionPercent', 'percent', 'discountPercent']);
const NUMERIC = /^-?\d+(\.\d+)?$/;

export type AuditValueFormatter = (path: string, value: unknown) => string;

/**
 * Định dạng MỘT giá trị lá của snapshot nhật ký theo NGHĨA của trường — dùng chung cho bảng thay
 * đổi và lưới thông tin. Thứ tự ưu tiên: rỗng → boolean → mảng → mốc giờ → từ vựng theo đối tượng
 * (trạng thái, vai trò, chế độ thu phí) → phần trăm → tiền → như đã ghi.
 */
export function useAuditValueFormatter(targetType: string): AuditValueFormatter {
  const fmt = useAppFormat();
  const t = useTranslations('AdminAudit.detail.values');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  return (path, value) => {
    const leaf = path.slice(path.lastIndexOf('.') + 1);
    if (value === undefined) return tCommon('emptyValue');
    if (value === null) {
      // Hạn mức `null` = KHÔNG GIỚI HẠN (ADR 0041 điều 3) — in gạch ngang là nói ngược nghĩa.
      return path.startsWith('quota.') ? t('unlimited') : tCommon('emptyValue');
    }
    if (typeof value === 'boolean') return value ? tCommon('yes') : tCommon('no');
    if (Array.isArray(value)) {
      return value.length === 0 ? tCommon('none') : value.map((item) => String(item)).join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string') {
      if (ISO_DATETIME.test(value)) return fmt.dateTime(value);
      if (ISO_DATE.test(value)) return fmt.dateKey(value);
    }
    const text = String(value);
    const group = auditValueGroup(targetType, path);
    if (group) return domainLabel(group, text);
    if (PERCENT_FIELDS.has(leaf)) return t('percent', { value: text });
    if (MONEY_FIELD.test(leaf) && NUMERIC.test(text)) return fmt.money(text);
    return text;
  };
}
