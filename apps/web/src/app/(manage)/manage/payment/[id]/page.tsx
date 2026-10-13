'use client';

import { Spin } from 'antd';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { InvoiceCheckoutView } from '@/features/subscription/components/InvoiceCheckoutView';

/**
 * Trang thanh toán một hoá đơn gói — `partner.xeprime.vn/payment/:invoiceId`.
 *
 * Trần (không sidebar) và mở được ở mọi tuyến — xem `isPartnerPaymentPage`. `Suspense` vì thân
 * trang đọc `useSearchParams` (lượt quay về từ cổng).
 */
export default function InvoicePaymentPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Spin size="large" />}>
      <InvoiceCheckoutView invoiceId={params?.id ?? ''} />
    </Suspense>
  );
}
