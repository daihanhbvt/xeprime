'use client';

import { Spin } from 'antd';
import { Suspense } from 'react';
import { PartnerPaymentReturn } from '@/features/payment-gateway/components/PartnerPaymentReturn';

/**
 * Trang quay về từ cổng MoMo/VNPAY của site partner (ADR 0058) — `partner.xeprime.vn/payment-return`.
 *
 * `Suspense` vì màn đọc `useSearchParams`: không có ranh giới, Next từ chối dựng tĩnh đường dẫn này.
 */
export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<Spin size="large" />}>
      <PartnerPaymentReturn />
    </Suspense>
  );
}
