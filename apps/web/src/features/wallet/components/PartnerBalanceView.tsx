'use client';

import { Button, Segmented } from 'antd';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import segmentedStyles from '@/components/filter/segmented.module.css';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  BALANCE_PAYOUT_DOM_ID,
  BALANCE_PAYOUT_SECTION,
  BALANCE_TAB,
  BALANCE_TAB_PARAM,
  ROUTES,
  SECTION_PARAM,
  type BalanceTab,
} from '@/constants/routes';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { ShopTaxWithheldCard } from '@/features/tax/components/ShopTaxWithheldCard';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { nowInAppTz } from '@/lib/datetime';

import { useWithdrawGate } from '../hooks';
import { walletScopeFor } from '../wallet-scope';
import { WalletActivityPanel } from './WalletActivityPanel';
import { WalletMonthSummary } from './WalletMonthSummary';
import { WalletStatementPanel } from './WalletStatementPanel';
import { WalletSummaryCard } from './WalletSummaryCard';
import { WithdrawDialog } from './WithdrawDialog';
import styles from './PartnerBalanceView.module.css';

const PERIOD_FORMAT = 'YYYY-MM';
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Tab + kỳ + trang — cả ba sống trên URL (ADR 0004): "gửi kế toán đường dẫn tháng 10" là việc có thật. */
interface BalanceFilters {
  tab: BalanceTab;
  period: string;
  page: number;
}

/**
 * "QUẢN LÝ VÍ" của site partner — MỘT trang tiền cho cả hai tuyến (design Partner-XePrime
 * `23813:39558` · `23813:55449`, ráp 04/11/2026; kiểm kê và quyết định ở
 * `docs/design/09_PARTNER_REDESIGN.md` §3.10).
 *
 * Hai cột: bên trái là hai tab — **Tổng hợp giao dịch** (bảng theo chuyến của kỳ, dòng mở rộng ra
 * bảng cộng ví) và **Biến động số dư** (sổ ví + lệnh rút của kỳ, một danh sách); bên phải là câu
 * trả lời thường trực — số dư rút được + nút Rút, tài khoản nhận tiền, tổng hợp tháng và ghi chú
 * thuế. Máy hẹp: cột phải lên TRƯỚC (số dư là câu người ta mở trang để hỏi), rồi tới tab.
 *
 * Kỳ dùng CHUNG hai tab và thẻ tổng hợp tháng: đổi tháng ở tab nào thì cả trang nói về tháng đó.
 *
 * ## Thuế đã khấu trừ — ở đây, cho CẢ hai tuyến
 *
 * Thuế trừ thẳng vào khoản XePrime phải trả (ADR 0032 điều 3), nên "vì sao tôi nhận ít hơn" là câu
 * hỏi của trang tiền. Trang này KHÔNG nằm sau cờ tính năng nào (ADR 0027 điều 3 · ADR 0038 điều 5),
 * còn sổ Tài chính của tuyến gói thì có (`PLAN_FEATURE.FINANCE`) — nên thẻ thuế đầy đủ vẫn ở đây,
 * mở từ chữ "Chi tiết" của ô ghi chú thuế (chốt 04/11/2026).
 *
 * ## Chỉ CHỦ
 *
 * Ví và sổ ngân hàng là `@ShopOwnerOnly()` ở API; menu đã ẩn mục với thành viên, nhưng URL gõ tay vẫn
 * tới được. Cổng ở đây chặn TRƯỚC khi các query ví bay đi để nhận 403 — `walletScopeFor` là nơi duy
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
 */
function PartnerBalanceBody() {
  const t = useTranslations('Wallet');
  const payoutInUrl = useSearchParams().get(SECTION_PARAM) === BALANCE_PAYOUT_SECTION;
  useScrollToSection(BALANCE_PAYOUT_DOM_ID, payoutInUrl);

  const { filters, setFilters } = useUrlFilters<BalanceFilters>(
    useCallback((params: URLSearchParams) => {
      const period = params.get('period');
      return {
        tab:
          params.get(BALANCE_TAB_PARAM) === BALANCE_TAB.ACTIVITY
            ? BALANCE_TAB.ACTIVITY
            : BALANCE_TAB.STATEMENT,
        period: period && PERIOD_PATTERN.test(period) ? period : nowInAppTz().format(PERIOD_FORMAT),
        page: positiveIntParam(params, 'page') ?? 1,
      };
    }, []),
  );
  const periodFilters = { period: filters.period, page: filters.page };
  /*
   * Thẻ tổng hợp tháng đọc CÙNG query với bảng bên trái khi đang ở tab đó (cùng khoá cache). Ở
   * tab biến động, tham số `page` là trang của sổ — thẻ đọc trang 1 của bảng tổng hợp (cộng dồn
   * tính trên cả kỳ, không theo trang).
   */
  const summaryFilters =
    filters.tab === BALANCE_TAB.STATEMENT ? periodFilters : { period: filters.period, page: 1 };

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { canWithdraw, hint } = useWithdrawGate('shop');

  return (
    <div className={styles.layout}>
      <Segmented
        className={`${segmentedStyles.outlined} ${styles.tabs}`}
        size="large"
        value={filters.tab}
        aria-label={t('tabs.label')}
        options={[
          { value: BALANCE_TAB.STATEMENT, label: t('tabs.statement') },
          { value: BALANCE_TAB.ACTIVITY, label: t('tabs.activity') },
        ]}
        // Hai tab phân trang khác nhau — sang tab kia là về trang 1, giữ nguyên kỳ.
        onChange={(tab) => setFilters({ tab: tab as BalanceTab, page: 1 })}
      />

      <aside className={styles.aside} aria-label={t('aside.label')}>
        <section className={styles.walletCard}>
          <WalletSummaryCard
            scope="shop"
            variant="hero"
            action={
              <CtaButton disabled={!canWithdraw} onClick={() => setWithdrawOpen(true)} block>
                {t('withdraw.action')}
              </CtaButton>
            }
            hint={hint}
          />
          <BankAccountList
            scope="shop"
            appearance="partner"
            id={BALANCE_PAYOUT_DOM_ID}
            className={styles.payout}
          />
        </section>
        <WalletMonthSummary filters={summaryFilters} />
        <TaxNote period={filters.period} />
      </aside>

      <div className={styles.main}>
        {filters.tab === BALANCE_TAB.ACTIVITY ? (
          <WalletActivityPanel filters={periodFilters} onFiltersChange={setFilters} />
        ) : (
          <WalletStatementPanel filters={periodFilters} onFiltersChange={setFilters} />
        )}
      </div>

      <WithdrawDialog scope="shop" open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}

/**
 * Ô ghi chú thuế (design `23948:94510`, cuối cột phải). "Chi tiết" mở hộp thoại chứa nguyên thẻ
 * "Thuế đã khấu trừ" — chọn tháng, GTGT/TNCN, bảng theo chuyến — mở đúng tháng trang đang xem.
 */
function TaxNote({ period }: { period: string }) {
  const t = useTranslations('Wallet');
  const tTax = useTranslations('Finance.taxWithheld');
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className={styles.taxNote}>
        {t('taxNote.body')}{' '}
        <button type="button" className={styles.taxLink} onClick={() => setOpen(true)}>
          {t('taxNote.detail')}
        </button>
      </p>
      <ResponsiveDialog
        open={open}
        onClose={() => setOpen(false)}
        title={tTax('title')}
        size="xl"
        footer={null}
        destroyOnClose
      >
        <ShopTaxWithheldCard embedded initialPeriod={period} />
      </ResponsiveDialog>
    </>
  );
}
