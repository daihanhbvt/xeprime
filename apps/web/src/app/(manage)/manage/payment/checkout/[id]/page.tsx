'use client';

import { Spin } from 'antd';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckoutPaymentView } from '@/features/subscription/components/InvoiceCheckoutView';

/**
 * Trang thanh toán một PHIẾU GỘP nhiều gói - `partner.xeprime.vn/payment/checkout/:id` (ADR 0083).
 * Trần như `/payment/:invoiceId` (xem `isPartnerPaymentPage`); bản trong khung gian hàng ở
 * `/shop/payment/checkout/:id`.
 */
export default function CheckoutPaymentPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Spin size="large" />}>
      <CheckoutPaymentView checkoutId={params?.id ?? ''} />
    </Suspense>
  );
}
