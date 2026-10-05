'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';

/**
 * Chuyển trang PHÍA CLIENT — cho nhánh "chuyển tới bản tương đương" bên trong `PartnerTrackView`,
 * nơi quyết định phụ thuộc tuyến đọc từ `/auth/me` nên không làm được bằng `redirect()` của server.
 * `replace`: bấm Quay lại không rơi lại đúng URL vừa bị chuyển đi.
 */
export function ClientRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return <LoadingState variant="page" />;
}
