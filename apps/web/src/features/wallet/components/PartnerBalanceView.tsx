'use client';

import { Button } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import {
  BALANCE_PAYOUT_DOM_ID,
  BALANCE_PAYOUT_SECTION,
  ROUTES,
  SECTION_PARAM,
} from '@/constants/routes';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { ShopTaxWithheldCard } from '@/features/tax/components/ShopTaxWithheldCard';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';

import { walletScopeFor } from '../wallet-scope';
import { WalletView } from './WalletView';
import styles from './PartnerBalanceView.module.css';

/**
 * "SỐ DƯ & RÚT TIỀN" của site partner — MỘT trang tiền cho cả hai tuyến (07/10/2026).
 *
 * ## Một câu hỏi, một chỗ
 *
 * Trước đợt này "tài khoản nhận tiền" sống ở hai nơi tuỳ tuyến: một mục menu riêng (`/bank-accounts`)
 * với chủ xe cá nhân, một section của trang Cửa hàng với gian hàng. Cả hai đều tách nó khỏi nút RÚT —
 * người bấm "Rút" mà chưa khai tài khoản phải rời trang đi tìm. Nay nó là khối ngay dưới nút đó, ở
 * cả hai tuyến, và hai route cũ chuyển về `?section=payout` của trang này.
 *
 * ## Thuế đã khấu trừ — ở đây, cho CẢ hai tuyến
 *
 * Thuế trừ thẳng vào khoản XePrime phải trả (ADR 0032 điều 3), nên "vì sao tôi nhận ít hơn" là câu
 * hỏi của trang tiền. Và trang này KHÔNG nằm sau cờ tính năng nào (ADR 0027 điều 3 · ADR 0038 điều
 * 5): sổ Tài chính của tuyến gói cũng hiện thẻ này, nhưng nó gác bằng `PLAN_FEATURE.FINANCE` — một
 * bậc gói bị gỡ tính năng đó không được làm chủ gian hàng mất lối biết mình bị trừ bao nhiêu. Thẻ ở
 * sổ Tài chính vẫn giữ: đó là chỗ của QUẢN LÝ có `finance.view`, những người không vào được trang
 * này (chỉ chủ).
 *
 * ## Chỉ CHỦ
 *
 * Ví và sổ ngân hàng là `@ShopOwnerOnly()` ở API; menu đã ẩn mục với thành viên, nhưng URL gõ tay vẫn
 * tới được. Cổng ở đây chặn TRƯỚC khi ba query ví bay đi để nhận 403 — `walletScopeFor` là nơi duy
 * nhất quyết định tài khoản này có ví hay không.
 */
export function PartnerBalanceView() {
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('ManageCommon');
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return <LoadingState variant="cards" />;

  if (walletScopeFor(user) !== 'shop') {
    return (
      <PermissionState
        kind="forbidden"
        title={t('ownerOnly.title')}
        description={t('ownerOnly.description')}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tCommon('permission.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return <PartnerBalanceBody />;
}

/**
 * Thân trang — chỉ dựng khi đã qua cổng, để lần vẽ đầu đã có khối "Tài khoản nhận tiền" trong DOM:
 * link `?section=payout` (hai route cũ, thông báo) phải rơi đúng khối đó, không phải đầu trang.
 *
 * Đọc `?section=` thẳng từ URL (không qua `useUrlFilters`): trang này không GHI nó — chỉ cuộn một lần.
 */
function PartnerBalanceBody() {
  const t = useTranslations('Wallet');
  const payoutInUrl = useSearchParams().get(SECTION_PARAM) === BALANCE_PAYOUT_SECTION;
  useScrollToSection(BALANCE_PAYOUT_DOM_ID, payoutInUrl);

  return (
    <div className={styles.stack}>
      <WalletView
        scope="shop"
        payout={
          // Tiêu đề mặc định của sổ ("Tài khoản nhận tiền"); gợi ý nói về RÚT, đúng ngữ cảnh trang.
          <BankAccountList
            scope="shop"
            id={BALANCE_PAYOUT_DOM_ID}
            className={styles.payout}
            subtitle={t('payout.hint')}
          />
        }
      />
      <ShopTaxWithheldCard />
    </div>
  );
}
