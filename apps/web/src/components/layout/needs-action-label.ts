import type { useTranslations } from 'next-intl';

type ShellT = ReturnType<typeof useTranslations<'ManageCommon'>>;

/**
 * Câu đọc thành lời đi kèm huy hiệu "cần xử lý" — "3 việc cần xử lý" hoặc "3 việc cần xử lý, có
 * việc gấp". Màu đỏ của huy hiệu khẩn KHÔNG được là tín hiệu duy nhất (WCAG 1.4.1), nên mọi
 * menu dựng tên truy cập được qua đúng một hàm này.
 */
export function needsActionLabel(t: ShellT, count: number, urgent: boolean): string {
  return urgent ? t('shell.needsActionUrgent', { count }) : t('shell.needsAction', { count });
}
