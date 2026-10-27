'use client';

import { App, Alert, Button, Empty, Pagination, Popconfirm, Skeleton } from 'antd';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { absoluteMoney, isNegativeMoney, isZeroMoney, subtractMoney } from '@xeprime/domain';
import { WALLET_STATUS, WITHDRAWAL_STATUS, WITHDRAWAL_STATUS_META } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useUrlFilters, positiveIntParam } from '@/hooks/use-url-filters';
import { cx } from '@/lib/cx';
import { nowInAppTz } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCancelWithdrawal, useWalletEntries, useWalletSummary, useWithdrawals } from '../hooks';
import type { WalletScope, WalletStatementFilters } from '../types';
import { WalletStatementPanel, type StatementVariant } from './WalletStatementPanel';
import { WalletSummaryCard } from './WalletSummaryCard';
import { WithdrawDialog } from './WithdrawDialog';
import styles from './WalletView.module.css';

/** Kỳ mặc định của bảng tổng hợp: tháng đang chạy, theo giờ Việt Nam. */
const PERIOD_FORMAT = 'YYYY-MM';
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Màn ví điểm — dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở `scope`
 * (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * Năm khối theo đúng thứ tự câu hỏi người dùng đặt ra khi mở màn này:
 *
 *  1. *tôi còn bao nhiêu* — thẻ số dư, con số khả dụng lớn hết cỡ;
 *  2. *rút về đâu* — tài khoản nhận tiền, khi trang nhúng nó vào (`payout`);
 *  3. *tháng vừa rồi tôi kiếm được bao nhiêu* — bảng tổng hợp giao dịch (chỉ gian hàng);
 *  4. *tiền đang đi tới đâu* — các lệnh rút đang chạy;
 *  5. *nó đến từ đâu* — sổ ví.
 *
 * Nút RÚT đứng giữa khối 1 và 2, không nằm trong thẻ số dư: nó là hành động của cả màn, và
 * người ta đọc số dư xong mới quyết. Nó KHÔNG có màu riêng — `type="primary"` lấy sắc gold
 * chung của hệ, y như mọi nút chính khác trong sản phẩm.
 *
 * Sổ và bảng tổng hợp đều phân trang ở SERVER: một chủ xe chạy vài trăm chuyến một năm có sổ
 * dài hàng nghìn dòng.
 *
 * ## Hai phía, một màn
 *
 *  - **Site partner** ở `/balance` — `scope="shop"`, cho CẢ gian hàng tuyến gói lẫn chủ xe tuyến
 *    hoa hồng (ví thuộc tenant), qua `PartnerBalanceView` — trang đó nhúng thêm tài khoản nhận tiền.
 *  - **Khách thuê** ở `/account/balance` (site khách) — `scope="account"`. KHÔNG có bảng tổng hợp:
 *    họ không có chuyến nào ở phía bán, và một bảng rỗng vĩnh viễn là một câu hỏi không lời đáp.
 *
 * ## Hai dáng (`appearance`)
 *
 * `standard` là dáng của site partner. `account` là dáng tab "Tài khoản thanh toán" của khu tài
 * khoản khách (Figma `19879:74829`): nút Rút nằm TRONG thẻ số dư, cùng hàng con số khả dụng, và
 * mỗi khối bên dưới là một thẻ viền bo 16 có đầu thẻ gạch chân. Cùng dữ liệu, cùng quy tắc — chỉ
 * khác bố cục.
 */
export function WalletView({
  scope,
  variant = 'full',
  payout,
  appearance = 'standard',
}: {
  scope: WalletScope;
  /** Hình thái bảng tổng hợp — `compact` cho khu `/account` (khung hẹp hơn `/manage`). */
  variant?: StatementVariant;
  /**
   * Khối "Tài khoản nhận tiền" — đứng NGAY dưới nút Rút (07/10/2026). Trang số dư của CẢ HAI site
   * truyền vào (`PartnerBalanceView`, và `AccountBalanceView` từ design Account 22/10/2026).
   * Là một slot chứ không phải cờ: trang quyết định id cuộn, tiêu đề và khung của khối đó.
   */
  payout?: ReactNode;
  /** Dáng trình bày — `account` cho khu tài khoản khách (Figma Account / Balance). */
  appearance?: 'standard' | 'account';
}) {
  const t = useTranslations('Wallet');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  /*
   * Trang của SỔ ví giữ ở state cục bộ, không lên URL: tham số `page` trên URL thuộc về BẢNG
   * TỔNG HỢP (bảng chính của màn, có bộ lọc kỳ cần chia sẻ được). Hai danh sách phân trang cùng
   * một khoá `page` sẽ kéo nhau mỗi lần một bên lật trang.
   */
  const [page, setPage] = useState(1);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const isAccount = appearance === 'account';
  const summary = useWalletSummary(scope);
  /*
   * Dáng `account`: lệnh rút và sổ ví đã là các dòng của tab "Lịch sử giao dịch"
   * (`GET /account/transactions`) — tab số dư chỉ còn thẻ số dư + tài khoản nhận tiền (Figma
   * `19879:74829`), nên không tải hai danh sách đó ở đây.
   */
  const entries = useWalletEntries(scope, page, { enabled: !isAccount });
  const withdrawals = useWithdrawals(scope, { enabled: !isAccount });
  const cancel = useCancelWithdrawal(scope);

  /*
   * Kỳ và trang của bảng tổng hợp sống trên URL (ADR 0004): "gửi kế toán đường dẫn tháng 10"
   * là việc có thật, và nút Back phải quay về tháng vừa xem.
   */
  const { filters: statementFilters, setFilters: setStatementFilters } =
    useUrlFilters<WalletStatementFilters>(
      useCallback((params: URLSearchParams) => {
        const period = params.get('period');
        return {
          period:
            period && PERIOD_PATTERN.test(period) ? period : nowInAppTz().format(PERIOD_FORMAT),
          page: positiveIntParam(params, 'page') ?? 1,
        };
      }, []),
    );

  const requests = withdrawals.data ?? [];
  const isShop = scope === 'shop';
  const balance = summary.data;
  const canWithdraw =
    balance !== undefined &&
    balance.status !== WALLET_STATUS.FROZEN &&
    // So trên CHUỖI tiền, không qua `Number` (ADR 0007): khả dụng − ngưỡng không âm là rút được.
    !isNegativeMoney(subtractMoney(balance.available, balance.minWithdrawAmount));

  /*
   * Nút vẫn HIỆN khi chưa đủ điều kiện rút, chỉ bị khoá: ẩn nó đi thì người dùng không biết chức
   * năng tồn tại, còn dòng gợi ý nói rõ vì sao chưa bấm được.
   */
  const withdrawHint =
    balance && !canWithdraw
      ? balance.status === WALLET_STATUS.FROZEN
        ? t('balance.frozen')
        : t('withdraw.belowMinimum', { min: fmt.money(balance.minWithdrawAmount) })
      : null;

  return (
    <div className={cx(styles.page, isAccount && styles.account)}>
      {isAccount ? (
        <WalletSummaryCard
          scope={scope}
          variant="panel"
          action={
            <CtaButton
              variant="neutral"
              disabled={!canWithdraw}
              onClick={() => setWithdrawOpen(true)}
            >
              {t('withdraw.actionLinked')}
            </CtaButton>
          }
          // Ví đóng băng đã có cảnh báo riêng trong thẻ — không nói hai lần.
          hint={balance?.status === WALLET_STATUS.FROZEN ? null : withdrawHint}
        />
      ) : (
        <>
          <WalletSummaryCard scope={scope} variant="hero" />
          <div className={styles.cta}>
            <Button
              type="primary"
              size="large"
              disabled={!canWithdraw}
              loading={summary.isPending}
              onClick={() => setWithdrawOpen(true)}
            >
              {t('withdraw.action')}
            </Button>
            {withdrawHint ? <p className={styles.ctaHint}>{withdrawHint}</p> : null}
          </div>
        </>
      )}

      {/*
        Nơi tiền về đứng sát nút Rút: người chưa có tài khoản nào thấy chỗ khai ngay bên dưới, và
        người có nhiều tài khoản đổi mặc định trước khi bấm — không phải đi tìm một trang khác.
      */}
      {payout}

      {/* Bảng tổng hợp chỉ có ở phía GIAN HÀNG — khách thuê thuần không có chuyến nào để tổng hợp. */}
      {isShop ? (
        <WalletStatementPanel
          filters={statementFilters}
          onFiltersChange={(patch) => setStatementFilters(patch)}
          variant={variant}
        />
      ) : null}

      {isAccount ? null : (
        <>
      <section className={styles.block} aria-label={t('requests.title')}>
        <h3 className={styles.heading}>{t('requests.title')}</h3>
        {withdrawals.isPending ? <Skeleton active paragraph={{ rows: 1 }} /> : null}
        {!withdrawals.isPending && requests.length === 0 ? (
          <p className={styles.muted}>{t('requests.empty')}</p>
        ) : null}

        <ul className={styles.list}>
          {requests.map((request) => (
            <li key={request.id} className={styles.request}>
              <div className={styles.requestMain}>
                <p className={styles.amount}>
                  {fmt.money(request.amount)} <span className={styles.code}>{request.code}</span>
                </p>
                <p className={styles.muted}>
                  {request.bankCode} · {request.accountNumberMasked}
                </p>
                {request.status === WITHDRAWAL_STATUS.REJECTED && request.rejectReason ? (
                  <p className={styles.muted}>
                    {t('requests.rejected', { reason: request.rejectReason })}
                  </p>
                ) : request.status === WITHDRAWAL_STATUS.REVERSED ? (
                  // Tiền đã về ví — nói rõ việc cần làm tiếp, không để chủ ví đoán (ADR 0025 điều 7).
                  <p className={styles.muted}>
                    {t('requests.reversed', { reason: request.reverseReason ?? '' })}
                  </p>
                ) : request.paidAt ? (
                  <p className={styles.muted}>
                    {t('requests.paidAt', { time: fmt.dateTime(request.paidAt) })}
                  </p>
                ) : request.dueBy ? (
                  <p className={styles.muted}>
                    {t('requests.dueBy', { time: fmt.dateTime(request.dueBy) })}
                  </p>
                ) : null}
              </div>
              <div className={styles.requestSide}>
                {/* Màu theo trạng thái (thành công / chờ / thất bại) như hàng giao dịch của bản vẽ. */}
                <StatusTag
                  value={request.status}
                  meta={WITHDRAWAL_STATUS_META}
                  group="withdrawalStatus"
                />
                {request.status === WITHDRAWAL_STATUS.PENDING ? (
                  <Popconfirm
                    title={t('requests.cancelConfirm')}
                    description={t('requests.cancelHint')}
                    onConfirm={() =>
                      cancel.mutate(request.id, {
                        onSuccess: () => message.success(t('withdraw.cancelled')),
                        onError: (err: unknown) => message.error(errorMessage(err)),
                      })
                    }
                  >
                    <Button size="small">{t('requests.cancel')}</Button>
                  </Popconfirm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-label={t('entries.title')}>
        <h3 className={styles.heading}>{t('entries.title')}</h3>
        {entries.isPending ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
        {entries.isError ? <Alert type="error" showIcon title={t('loadError')} /> : null}
        {!entries.isPending && (entries.data?.items.length ?? 0) === 0 ? (
          <Empty description={t('entries.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}

        <ul className={styles.list}>
          {(entries.data?.items ?? []).map((entry) => {
            const positive = !isNegativeMoney(entry.amount) && !isZeroMoney(entry.amount);
            return (
              <li key={entry.id} className={styles.entry}>
                <div>
                  <p className={styles.entryKind}>{domainLabel('walletEntryKind', entry.kind)}</p>
                  <p className={styles.muted}>{fmt.dateTime(entry.createdAt)}</p>
                </div>
                <div className={styles.entryRight}>
                  <p className={positive ? styles.plus : styles.minus}>
                    {positive ? '+' : '−'}
                    {fmt.money(absoluteMoney(entry.amount))}
                  </p>
                  <p className={styles.muted}>
                    {t('entries.balanceAfter', { amount: fmt.money(entry.balanceAfter) })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {(entries.data?.total ?? 0) > (entries.data?.limit ?? 20) ? (
          <Pagination
            className={styles.pagination}
            current={page}
            pageSize={entries.data?.limit ?? 20}
            total={entries.data?.total ?? 0}
            showSizeChanger={false}
            onChange={setPage}
          />
        ) : null}
      </section>
        </>
      )}

      <WithdrawDialog scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}
