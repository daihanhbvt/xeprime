'use client';

import { App, Alert, Button, Empty, Pagination, Popconfirm, Skeleton, Tag } from 'antd';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WITHDRAWAL_STATUS } from '@xeprime/types';
import { useUrlFilters, positiveIntParam } from '@/hooks/use-url-filters';
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
 * Bốn khối theo đúng thứ tự câu hỏi người dùng đặt ra khi mở màn này:
 *
 *  1. *tôi còn bao nhiêu* — thẻ số dư, con số khả dụng lớn hết cỡ;
 *  2. *tháng vừa rồi tôi kiếm được bao nhiêu* — bảng tổng hợp giao dịch (chỉ gian hàng);
 *  3. *tiền đang đi tới đâu* — các lệnh rút đang chạy;
 *  4. *nó đến từ đâu* — sổ ví.
 *
 * Nút RÚT đứng giữa khối 1 và 2, không nằm trong thẻ số dư: nó là hành động của cả màn, và
 * người ta đọc số dư xong mới quyết. Nó KHÔNG có màu riêng — `type="primary"` lấy sắc gold
 * chung của hệ, y như mọi nút chính khác trong sản phẩm.
 *
 * Sổ và bảng tổng hợp đều phân trang ở SERVER: một chủ xe chạy vài trăm chuyến một năm có sổ
 * dài hàng nghìn dòng.
 *
 * ## Ba người đọc, một màn (16/09/2026)
 *
 *  - **Gian hàng** ở `/manage/balance` — `scope="shop"`, hình thái `full`.
 *  - **Chủ xe cá nhân tuyến hoa hồng** ở `/account/earnings` — cũng `scope="shop"` (ví thuộc
 *    tenant của họ), nhưng hình thái `compact`: khu `/account` có menu trái ăn mất 256px.
 *  - **Khách thuê thuần** ở `/account/balance` — `scope="account"`. KHÔNG có bảng tổng hợp:
 *    họ không có chuyến nào ở phía bán, và một bảng rỗng vĩnh viễn là một câu hỏi không lời đáp.
 */
export function WalletView({
  scope,
  variant = 'full',
}: {
  scope: WalletScope;
  /** Hình thái bảng tổng hợp — `compact` cho khu `/account` (khung hẹp hơn `/manage`). */
  variant?: StatementVariant;
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

  const summary = useWalletSummary(scope);
  const entries = useWalletEntries(scope, page);
  const withdrawals = useWithdrawals(scope);
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
    balance.status !== 'frozen' &&
    Number(balance.available) >= Number(balance.minWithdrawAmount);

  return (
    <div className={styles.page}>
      <WalletSummaryCard scope={scope} variant="hero" />

      {/*
        Nút vẫn HIỆN khi chưa đủ điều kiện rút, chỉ bị khoá: ẩn nó đi thì người dùng không biết
        chức năng tồn tại, còn dòng gợi ý ngay dưới nói rõ vì sao chưa bấm được.
      */}
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
        {balance && !canWithdraw ? (
          <p className={styles.ctaHint}>
            {balance.status === 'frozen'
              ? t('balance.frozen')
              : t('withdraw.belowMinimum', { min: fmt.money(balance.minWithdrawAmount) })}
          </p>
        ) : null}
      </div>

      {/* Bảng tổng hợp chỉ có ở phía GIAN HÀNG — khách thuê thuần không có chuyến nào để tổng hợp. */}
      {isShop ? (
        <WalletStatementPanel
          filters={statementFilters}
          onFiltersChange={(patch) => setStatementFilters(patch)}
          variant={variant}
        />
      ) : null}

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
                <Tag>{domainLabel('withdrawalStatus', request.status)}</Tag>
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
            const positive = Number(entry.amount) > 0;
            return (
              <li key={entry.id} className={styles.entry}>
                <div>
                  <p className={styles.entryKind}>{domainLabel('walletEntryKind', entry.kind)}</p>
                  <p className={styles.muted}>{fmt.dateTime(entry.createdAt)}</p>
                </div>
                <div className={styles.entryRight}>
                  <p className={positive ? styles.plus : styles.minus}>
                    {positive ? '+' : '−'}
                    {fmt.money(String(Math.abs(Number(entry.amount))))}
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

      <WithdrawDialog scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}
