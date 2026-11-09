'use client';

import { Spin } from 'antd';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { InvoiceCheckoutView } from '@/features/subscription/components/InvoiceCheckoutView';

/**
 * Thanh toán một hoá đơn gói NGAY TRONG khung site partner — breadcrumb "Thông tin cửa hàng ›
 * Thanh toán hoá đơn" (design `24051:79507`). Bản trần cho onboarding ở `/payment/:invoiceId`.
 */
export default function ShopInvoicePaymentPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Spin size="large" />}>
      <InvoiceCheckoutView invoiceId={params?.id ?? ''} variant="shell" />
    </Suspense>
  );
}
