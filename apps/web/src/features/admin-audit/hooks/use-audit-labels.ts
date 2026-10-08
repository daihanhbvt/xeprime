'use client';

import { useMessages } from 'next-intl';
import { useMemo } from 'react';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { createAuditLabels, type AuditLabels } from '../labels';

/** Bộ tra nhãn nhật ký của ngôn ngữ đang dùng — xem `createAuditLabels`. */
export function useAuditLabels(): AuditLabels {
  const messages = useMessages();
  const domainLabel = useDomainLabel();
  return useMemo(() => createAuditLabels(messages.Domain, domainLabel), [messages, domainLabel]);
}
