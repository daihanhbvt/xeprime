'use client';

import { Spin } from 'antd';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutPaymentView } from '@/features/subscription/components/InvoiceCheckoutView';

/** Thanh toán một PHIẾU GỘP nhiều gói trong khung site partner (ADR 0083 · design `24051:79507`). */
export default function ShopCheckoutPaymentPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Spin size="large" />}>
      <CheckoutPaymentView checkoutId={params?.id ?? ''} variant="shell" />
    </Suspense>
  );
}
