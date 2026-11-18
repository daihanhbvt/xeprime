'use client';

import { StatePage } from '@/components/feedback/StatePage';

/**
 * Lỗi không lường trước khi dựng trang trong nhóm route này — trang trạng thái chung "Đã xảy ra lỗi
 * hệ thống" (Figma `22306:65769`), nằm TRONG khung của nhóm (giữ header). `reset` thử dựng lại.
 */
export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <StatePage kind="error" onRetry={reset} />;
}
