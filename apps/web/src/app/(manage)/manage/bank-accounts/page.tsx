import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('BankAccounts');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Tài khoản ngân hàng NHẬN TIỀN của gian hàng — chủ xe tuyến hoa hồng (tuyến gói khai ở section
 * "Tài khoản nhận tiền" của trang Cửa hàng; `partnerPageRedirect` đưa họ sang đó).
 *
 * Sổ của TENANT (`scope="shop"`): ADR 0053 tách tiền theo tài khoản — tài khoản khách cùng số điện
 * thoại có sổ riêng ở `xeprime.vn/account/bank-accounts`.
 */
export default function PartnerBankAccountsPage() {
  return (
    <OwnerGate>
      <BankAccountList scope="shop" />
    </OwnerGate>
  );
}
