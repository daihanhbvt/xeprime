import { useTranslations } from 'use-intl';
import { useMemo } from 'react';
import type { AppMessages } from './messages';

/**
 * Nhãn của một giá trị nghiệp vụ (status, vai trò, loại xe, phương thức thanh toán…).
 *
 * BẢN SAO của `apps/web/src/i18n/domain.ts` + `use-domain-label.ts`, khác đúng một chỗ:
 * `use-intl` thay cho `next-intl`. Chuỗi thì KHÔNG chép — nhãn vẫn đọc từ namespace `Domain`
 * của gốc chung `@xeprime/domain/messages`.
 *
 * Mã đi trên dây (`active`, `self_drive`, `pending_host_approval`) KHÔNG bao giờ đổi — đó là
 * dữ liệu, không phải chữ. Đổi ngôn ngữ chỉ đổi thứ hiện lên màn hình.
 */
export type DomainGroup = keyof AppMessages['Domain'];

export function domainMessageKey(group: DomainGroup, code: string): string {
  return `${group}.${code}`;
}

/**
 * `fallback` dùng cho dữ liệu CŨ: một status có trong DB nhưng chưa khai báo message thì hiện
 * nhãn dự phòng (hoặc chính mã đó) chứ không nổ giữa màn hình, cũng không thành ô trống khó truy.
 */
export type DomainLabel = (
  group: DomainGroup,
  code: string | null | undefined,
  fallback?: string,
) => string;

export function createDomainLabel(t: {
  (key: never): string;
  has: (key: never) => boolean;
}): DomainLabel {
  return (group, code, fallback) => {
    if (code === null || code === undefined || code === '') return fallback ?? '';
    const key = domainMessageKey(group, code) as never;
    return t.has(key) ? t(key) : (fallback ?? code);
  };
}

export function useDomainLabel(): DomainLabel {
  const t = useTranslations('Domain');
  return useMemo(() => createDomainLabel(t as never), [t]);
}
