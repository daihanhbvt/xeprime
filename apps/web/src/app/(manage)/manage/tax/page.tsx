import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { SellerTaxCompactForm } from '@/features/seller-profile/components/SellerTaxCompactForm';
import { ShopTaxWithheldCard } from '@/features/tax/components/ShopTaxWithheldCard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('tax'), robots: { index: false, follow: false } };
}

/**
 * Thuế của chủ xe — HAI khối, trả lời hai câu khác nhau:
 *
 *  1. `SellerTaxCompactForm` — *"tôi khai thuế thế nào"*: loại chủ thể, mã số thuế. Dữ liệu chủ
 *     xe NHẬP, và nó quyết định tỷ lệ áp cho chuyến của họ.
 *  2. `ShopTaxWithheldCard` — *"tôi đã bị trừ bao nhiêu"* (Phase 8): nghĩa vụ đã phát sinh theo
 *     kỳ. Số liệu hệ thống sinh; không có nó thì chủ xe chỉ thấy ví vào ít hơn dự kiến mà không
 *     có chỗ nào giải thích vì sao (ADR 0032 điều 3 — thuế khấu trừ khỏi khoản phải trả họ).
 *
 * `OwnerGate` chặn trước khi cả hai gọi API cho người không phải chủ gian hàng.
 */
export default function AccountTaxPage() {
  return (
    <OwnerGate>
      <SellerTaxCompactForm />
      <ShopTaxWithheldCard />
    </OwnerGate>
  );
}
