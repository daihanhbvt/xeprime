'use client';

import { useTranslations } from 'next-intl';
import { answerParts } from '../dashboard-model';
import type { PartnerOverview } from '../types';

/** Dấu ngăn các vế của câu trả lời — dấu câu trung tính, đúng ở cả hai ngôn ngữ. */
const PART_SEPARATOR = ' · ';

/**
 * Câu trả lời đầu trang của Tổng quan partner (UX §0 nguyên tắc 1) — dựng từ CHÍNH số liệu của
 * các ô việc bên dưới, nên câu và ô không bao giờ nói hai điều khác nhau.
 *
 * `null` khi chưa có dữ liệu hoặc người xem không được xem đơn lẫn yêu cầu.
 */
export function useDashboardAnswer(
  overview: PartnerOverview | undefined,
): { text: string; busy: boolean } | null {
  const t = useTranslations('Dashboard.answer');
  if (!overview) return null;
  const parts = answerParts(overview);
  if (parts === null) return null;
  if (parts.length === 0) return { text: t('calm'), busy: false };
  const text = parts.map((part) => t(part.key, { count: part.count })).join(PART_SEPARATOR);
  return { text: t('busy', { parts: text }), busy: true };
}
