import { Suspense } from 'react';
import { PartnerRegisterView } from '@/features/auth/components/PartnerRegisterView';

/** Đăng ký site partner + chọn tuyến (ADR 0040 · ADR 0051 điều 3). Route CÔNG KHAI. */
export default function PartnerRegisterPage() {
  // `useSearchParams` (đọc `?track=`) cần ranh giới Suspense ở route tĩnh.
  return (
    <Suspense fallback={null}>
      <PartnerRegisterView />
    </Suspense>
  );
}
