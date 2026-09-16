'use client';

import { Alert, Button, DatePicker, Skeleton } from 'antd';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ACCOUNT_TRACK, WALLET_STATEMENT_UNIT, resolveAccountTrack } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { useCurrentUser } from '@/hooks/use-current-user';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { WALLET_STATEMENT_PAGE_SIZE } from '../api';
import { useWalletStatement } from '../hooks';
import type { WalletStatementFilters, WalletStatementTrip } from '../types';
import styles from './WalletStatementPanel.module.css';

/** Kỳ là `YYYY-MM` — DatePicker chế độ tháng dùng đúng định dạng đó (như sổ thuế). */
const PERIOD_FORMAT = 'YYYY-MM';
/**
 * Bề ngang tối thiểu của bảng — hẹp hơn thì cuộn ngang, không bóp cột.
 *
 * Hai con số cho hai chỗ đứng: `full` (8 cột) nằm gọn trong khung `/manage`; `compact` (6 cột)
 * nằm gọn trong khu `/account`, nơi menu trái đã ăn mất 256px và phần nội dung chỉ còn ~900px.
 */
const MIN_TABLE_WIDTH: Readonly<Record<StatementVariant, number>> = {
  full: 880,
  compact: 640,
};

/**
 * Hai hình thái của bảng.
 *
 * `compact` bỏ `Hình thức` và `Đơn giá`. Không phải vì chúng vô nghĩa, mà vì ở khu `/account`
 * người đọc là **chủ xe cá nhân tuyến hoa hồng**: gần như toàn bộ chuyến của họ là tự lái (cột
 * hình thức là một cột lặp lại một chữ), và câu hỏi của họ là "chuyến này tôi được bao nhiêu" —
 * `Doanh thu` trả lời, `Đơn giá` chỉ là đường dẫn tới nó. Sáu cột đọc hết trong một tầm mắt;
 * tám cột trong khung hẹp thì phải cuộn ngang mới ghép được một dòng.
 *
 * Cột TIỀN thì KHÔNG bỏ cột nào: thuế và thay đổi số dư là hai thứ chủ xe phải đối chiếu được,
 * và tuyến hoa hồng luôn thu cọc qua sàn nên `Thay đổi SD` của họ luôn khác 0.
 */
export type StatementVariant = 'full' | 'compact';

/**
 * BẢNG TỔNG HỢP GIAO DỊCH — một tháng làm ăn của gian hàng, đọc từ `/shop/wallet/statement`.
 *
 * ## Vì sao không có cột "phí sàn"
 *
 * Phí dịch vụ XePrime do KHÁCH trả thêm (ADR 0032 điều 2), không trừ vào doanh thu gian hàng.
 * Dựng nó thành một dòng khấu trừ trong bảng thu nhập của chủ xe là bịa ra một khoản họ không
 * hề mất. Với gian hàng tuyến gói thì con số đó còn luôn bằng 0 — một cột trắng chiếm chỗ.
 *
 * ## Vì sao "thay đổi số dư" nhỏ hơn "doanh thu"
 *
 * Khách chỉ trả `D + S + IV + IP` online; phần `B − D` họ đưa TAY cho chủ xe lúc nhận xe và
 * XePrime không thu hộ. Bảng vì thế có một dòng riêng cho phần trả tay — thiếu nó, chủ xe đọc
 * hai con số lệch nhau rồi tin rằng nền tảng đang giữ tiền của mình.
 *
 * ## Kỳ và trang sống trên URL
 *
 * ADR 0004: một bảng tiền phải chia sẻ được, sống sót qua reload và phản ứng với nút Back —
 * "gửi cho kế toán đường dẫn tháng 10" là việc có thật.
 */
export function WalletStatementPanel({
  filters,
  onFiltersChange,
  variant = 'full',
}: {
  filters: WalletStatementFilters;
  onFiltersChange: (patch: Partial<WalletStatementFilters>) => void;
  variant?: StatementVariant;
}) {
  const t = useTranslations('Wallet.statement');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { data: user } = useCurrentUser();

  /*
   * Dòng thu nhập gọi người đọc bằng ĐÚNG tên của họ.
   *
   * Cùng một bảng phục vụ hai người: chủ gian hàng tuyến gói ở `/manage`, và chủ xe cá nhân
   * tuyến hoa hồng ở `/account`. Gọi một chủ xe có đúng một chiếc xe là "chủ gian hàng" ngay
   * trên dòng nói về thu nhập của chính họ là sai về con người.
   *
   * Suy từ TUYẾN (`resolveAccountTrack`, dùng chung với nhãn tài khoản và app native), KHÔNG từ
   * `variant`: `variant` là quyết định BỐ CỤC ("khung có hẹp không"), còn đây là câu hỏi
   * "người đang đọc là ai". Buộc hai thứ vào nhau thì ngày ai đó dùng `compact` trong `/manage`
   * là ngày chủ gian hàng bị gọi thành chủ xe.
   *
   * Mọi tuyến còn lại (chưa cấu hình, nhân viên gian hàng) rơi về nhãn chung "Thu nhập" — không
   * đoán, vì đoán sai ở đây là gọi sai tên người ngay trên dòng tiền của họ.
   */
  const incomeLabelKey = ownerIncomeKeyFor(user?.tenant);

  const query = useWalletStatement(filters, true);
  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);

  const compact = variant === 'compact';

  const columns = useMemo<DataTableColumn<WalletStatementTrip>[]>(() => {
    /*
     * Khai ĐỦ cột rồi mới lọc, thay vì ghép mảng theo điều kiện: một danh sách cột đầy đủ đọc
     * được từ trên xuống, còn `[...(compact ? [] : [colA]), colB]` thì phải dựng lại trong đầu
     * mới biết bảng có gì.
     *
     * Kiểu gán TƯỜNG MINH cho mảng: không có nó, `.filter()` cắt mất ngữ cảnh kiểu của
     * `useMemo` và mọi `render` rơi về `any`.
     */
    const all: DataTableColumn<WalletStatementTrip>[] = [
      {
        key: 'code',
        title: t('columns.code'),
        render: (_, row) => <span className={styles.code}>{row.code}</span>,
      },
      {
        key: 'serviceType',
        title: t('columns.serviceType'),
        hidden: compact,
        render: (_, row) => domainLabel('serviceType', row.serviceType, row.serviceType),
      },
      /*
       * GIỜ rồi mới tới ngày (`08:00 · 17/08`) — `fmt.shortDateTime`, đúng bộ định dạng mà bảng
       * vận hành đang dùng.
       *
       * Trên một bảng đối chiếu tiền, giờ nhận/trả là thứ quyết định số ngày tính tiền, nên nó
       * phải đọc được chứ không bị cắt mất như ở `fmt.date`. Năm thì bỏ: cả bảng đã nằm trong
       * một kỳ `YYYY-MM` mà người dùng vừa tự chọn ở ngay đầu khối.
       */
      {
        key: 'pickupAt',
        title: t('columns.pickupAt'),
        render: (_, row) => <span className={styles.number}>{fmt.shortDateTime(row.pickupAt)}</span>,
      },
      {
        key: 'returnAt',
        title: t('columns.returnAt'),
        render: (_, row) => <span className={styles.number}>{fmt.shortDateTime(row.returnAt)}</span>,
      },
      {
        key: 'unit',
        title: t('columns.unitAmount'),
        align: 'right',
        hidden: compact,
        render: (_, row) =>
          row.unitAmount == null ? (
            <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
          ) : (
            <span className={styles.number}>
              {row.unitKind === WALLET_STATEMENT_UNIT.MONTH
                ? fmt.pricePerMonth(row.unitAmount)
                : fmt.pricePerDay(row.unitAmount)}
            </span>
          ),
      },
      {
        key: 'revenue',
        title: t('columns.revenue'),
        align: 'right',
        render: (_, row) => <span className={styles.strong}>{fmt.money(row.revenueAmount)}</span>,
      },
      {
        key: 'tax',
        title: t('columns.tax'),
        align: 'right',
        render: (_, row) => (
          /* Thuế là khoản TRỪ khỏi tiền chủ xe — hiện dấu trừ, không chỉ là một số nhỏ. */
          <span className={Number(row.taxAmount) > 0 ? styles.negative : styles.muted}>
            {Number(row.taxAmount) > 0 ? `−${fmt.money(row.taxAmount)}` : fmt.money('0')}
          </span>
        ),
      },
      {
        key: 'balanceChange',
        title: t('columns.balanceChange'),
        align: 'right',
        render: (_, row) => <SignedAmount value={row.balanceChange} />,
      },
    ];
    return all.filter((column) => !column.hidden);
  }, [t, tCommon, fmt, domainLabel, compact]);

  const stats = data?.stats;
  const totals = data?.totals;

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t('title')}</h2>
        <DatePicker
          className={styles.period}
          picker="month"
          value={dayjs(filters.period, PERIOD_FORMAT)}
          allowClear={false}
          aria-label={t('period')}
          /* Tháng sau chưa xảy ra — một bảng rỗng của tương lai không nói lên điều gì. */
          maxDate={nowInAppTz()}
          onChange={(value) => {
            if (value) onFiltersChange({ period: value.format(PERIOD_FORMAT), page: 1 });
          }}
        />
      </header>

      {query.isError && !data ? (
        <Alert
          className={styles.alert}
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {query.isPending && !data ? (
        <div className={styles.body}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </div>
      ) : null}

      {stats ? (
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dd className={styles.statValue}>
              {stats.ratingAvg == null ? (
                <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
              ) : (
                <>
                  <span aria-hidden="true" className={styles.star}>
                    ★
                  </span>{' '}
                  {fmt.rating(stats.ratingAvg)}
                </>
              )}
            </dd>
            <dt className={styles.statLabel}>
              {t('stats.rating', { count: stats.ratingCount })}
            </dt>
          </div>
          <div className={styles.stat}>
            <dd className={styles.statValue}>
              {t('stats.tripsValue', { count: stats.completedTripCount })}
            </dd>
            <dt className={styles.statLabel}>{t('stats.trips')}</dt>
          </div>
          <div className={styles.stat}>
            <dd className={styles.statValue}>
              {stats.responseRatePercent == null ? (
                <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>
              ) : (
                t('stats.responseValue', { percent: stats.responseRatePercent })
              )}
            </dd>
            <dt className={styles.statLabel}>{t('stats.response')}</dt>
          </div>
        </dl>
      ) : null}

      <DataTable<WalletStatementTrip>
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.bookingId}
        minWidth={MIN_TABLE_WIDTH[variant]}
        loading={query.isFetching}
        striped={false}
        empty={{ title: t('empty.title'), description: t('empty.body') }}
        pagination={{
          meta: {
            page: data?.page ?? filters.page,
            limit: data?.limit ?? WALLET_STATEMENT_PAGE_SIZE,
            total: data?.total ?? 0,
            hasNext: data?.hasNext ?? false,
          },
          onChange: (page) => onFiltersChange({ page }),
          totalLabel: (total) => t('totalLabel', { count: total }),
        }}
      />

      {totals ? (
        <dl className={styles.totals}>
          <SummaryRow label={t('totals.balanceChange')} value={<SignedAmount value={totals.balanceChangeTotal} />} />
          {/*
            Phần khách trả TAY: chỉ hiện khi thật sự có. Ở gian hàng tắt thu cọc qua sàn thì
            `D = 0` và toàn bộ tiền thuê đi thẳng cho chủ xe — dòng này khi đó là cả doanh thu,
            và giấu nó đi sẽ khiến "thu nhập" trông như từ trên trời rơi xuống.
          */}
          {Number(totals.payAtPickupTotal) !== 0 ? (
            <SummaryRow
              label={t('totals.payAtPickup')}
              hint={t('totals.payAtPickupHint')}
              value={<span className={styles.number}>{fmt.money(totals.payAtPickupTotal)}</span>}
            />
          ) : null}
          {Number(totals.subscriptionFeeTotal) !== 0 ? (
            <SummaryRow
              label={t('totals.subscriptionFee')}
              value={
                <span className={styles.negative}>−{fmt.money(totals.subscriptionFeeTotal)}</span>
              }
            />
          ) : null}
          <SummaryRow
            label={t('totals.tax')}
            value={
              Number(totals.taxTotal) > 0 ? (
                <span className={styles.negative}>−{fmt.money(totals.taxTotal)}</span>
              ) : (
                <span className={styles.muted}>{fmt.money('0')}</span>
              )
            }
          />
          <SummaryRow
            highlight
            label={t(`totals.${incomeLabelKey}`)}
            hint={t('totals.ownerIncomeHint')}
            value={<span className={styles.incomeValue}>{fmt.money(totals.ownerIncome)}</span>}
          />
        </dl>
      ) : null}
    </section>
  );
}

/**
 * Khoá nhãn dòng thu nhập theo TUYẾN của người đang đọc.
 *
 * Hàm THUẦN và nhận đúng phần dữ liệu nó cần, nên test được mà không dựng React — cùng khuôn
 * với `walletScopeFor`.
 */
export function ownerIncomeKeyFor(
  tenant: Parameters<typeof resolveAccountTrack>[0],
): 'ownerIncome' | 'ownerIncomeCommission' | 'ownerIncomeGeneric' {
  const { track } = resolveAccountTrack(tenant);
  if (track === ACCOUNT_TRACK.SHOP_OWNER) return 'ownerIncome';
  if (track === ACCOUNT_TRACK.COMMISSION_OWNER) return 'ownerIncomeCommission';
  return 'ownerIncomeGeneric';
}

/**
 * Một dòng cộng dồn.
 *
 * `<dt>`/`<dd>` chứ không phải hai `<span>`: đây là cặp nhãn–giá trị, và trình đọc màn hình
 * đọc được cặp đó thay vì một hàng chữ rời rạc.
 */
function SummaryRow({
  label,
  hint,
  value,
  highlight,
}: {
  label: string;
  hint?: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? `${styles.totalRow} ${styles.totalHighlight}` : styles.totalRow}>
      <dt className={styles.totalLabel}>
        {label}
        {hint ? <span className={styles.totalHint}>{hint}</span> : null}
      </dt>
      <dd className={styles.totalValue}>{value}</dd>
    </div>
  );
}

/**
 * Số tiền có DẤU.
 *
 * Dấu đứng trước và có màu riêng: trên một sổ tiền, hướng dòng tiền là thứ mắt phải bắt được
 * trước giá trị. Dùng cả dấu lẫn màu để không phụ thuộc khả năng phân biệt màu.
 */
function SignedAmount({ value }: { value: string }) {
  const fmt = useAppFormat();
  const amount = Number(value);
  if (amount === 0) return <span className={styles.muted}>{fmt.money('0')}</span>;
  const positive = amount > 0;
  return (
    <span className={positive ? styles.positive : styles.negative}>
      {positive ? '+' : '−'}
      {fmt.money(String(Math.abs(amount)))}
    </span>
  );
}
