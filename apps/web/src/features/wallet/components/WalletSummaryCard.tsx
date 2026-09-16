'use client';

import { ArrowRightOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SELLER_PROFILE_STATUS } from '@xeprime/types';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import { cx } from '@/lib/cx';
import { useAppFormat } from '@/i18n/use-app-format';
import { useWalletSummary } from '../hooks';
import type { WalletScope } from '../types';
import styles from './WalletSummaryCard.module.css';

/**
 * Số dư — BA con số, không phải một.
 *
 * Hiện một con số duy nhất sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế (khi có lệnh
 * đang chờ chuyển), hoặc tưởng tiền đã biến mất trong lúc chờ. Ba con số trả lời đủ: rút được
 * ngay · đang trên đường · tổng XePrime đang nợ.
 *
 * ## Là TIỀN, không phải "điểm" (16/09/2026)
 *
 * Bản trước hiển thị số dư kèm đơn vị "điểm" và một dòng chú thích cố định "1 điểm = 1đ · không
 * hết hạn" (ADR 0023 ràng buộc 1 · ADR 0033 điều 1). Theo quyết định sản phẩm ngày 16/09/2026,
 * số dư hiển thị thẳng bằng VND: đơn vị giả và dòng chú thích đi kèm bị bỏ. Ba con số vẫn ở lại
 * — chúng giải thích tiền, không giải thích cách gọi tên tiền.
 *
 * ## Hai chỗ đứng, hai hành động (16/09/2026)
 *
 * Trên chính màn ví, hành động là RÚT (`onWithdraw`). Khi thẻ đứng trong hồ sơ "Tài khoản của
 * tôi", hành động là MỞ SỔ (`href`) — ở đó mới có lịch sử giao dịch, các lệnh rút và trạng thái
 * của chúng. Cùng ba con số, cùng một nguồn; chép chúng ra một thẻ thứ hai là mở đường cho hai
 * màn hiện hai số dư khác nhau cho cùng một người.
 *
 * ## Hai hình thái, MỘT nguồn dữ liệu
 *
 * `variant="hero"` là thẻ mở đầu màn ví: con số khả dụng lớn hết cỡ, căn giữa, kèm huy hiệu
 * xác minh — nó là câu trả lời duy nhất mà người ta mở màn này để đọc. `variant="compact"` là
 * thẻ nằm lẫn giữa các khối khác trong hồ sơ.
 *
 * Hai hình thái đi qua CÙNG component thay vì hai component: chúng đọc cùng một `useWalletSummary`
 * và nói cùng ba con số. Tách đôi là mở đường cho hai màn hiện hai số dư khác nhau — đúng cái
 * đoạn trên vừa nói tới.
 */
export function WalletSummaryCard({
  scope,
  variant = 'compact',
  onWithdraw,
  href,
}: {
  scope: WalletScope;
  variant?: 'compact' | 'hero';
  onWithdraw?: () => void;
  /** Màn ví đầy đủ — hiện một liên kết thay cho nút Rút khi thẻ đứng ngoài màn đó. */
  href?: string;
}) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data, isPending, isError } = useWalletSummary(scope);

  if (isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (isError) return <Alert type="error" showIcon title={t('loadError')} />;

  const hero = variant === 'hero';
  const frozen = data.status === 'frozen';
  const canWithdraw = !frozen && Number(data.available) >= Number(data.minWithdrawAmount);
  const title = t(`title.${scope === 'shop' ? 'tenant' : 'user'}`);

  return (
    <section className={cx(styles.card, hero && styles.hero)} aria-label={title}>
      {/*
        Ở hình thái hero KHÔNG dựng header: tiêu đề trang ngay phía trên đã nói cùng một câu, và
        nút Rút chuyển xuống cuối màn (`WalletView`) — đọc số dư trước rồi mới quyết rút là thứ
        tự tự nhiên, còn một nút đứng cạnh con số lớn thì cạnh tranh với chính con số đó. `<h2>`
        vẫn còn, chỉ ẩn khỏi mắt, để bậc heading của màn không bị cắt đứt.
      */}
      {hero ? (
        <h2 className={cx(styles.title, styles.srOnly)}>{title}</h2>
      ) : (
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {onWithdraw ? (
            <Button type="primary" disabled={!canWithdraw} onClick={onWithdraw}>
              {t('withdraw.action')}
            </Button>
          ) : href ? (
            <Link href={href} className={styles.openLink}>
              {t('openLedger')} <ArrowRightOutlined aria-hidden="true" />
            </Link>
          ) : null}
        </header>
      )}

      {frozen ? <Alert type="warning" showIcon title={t('balance.frozen')} /> : null}

      <dl className={styles.figures}>
        <div className={styles.primary}>
          <dt>{t('balance.available')}</dt>
          <dd className={styles.big}>{fmt.money(data.available)}</dd>
        </div>
        <div>
          <dt>{t('balance.pending')}</dt>
          <dd>{fmt.money(data.pending)}</dd>
        </div>
        <div>
          <dt>{t('balance.total')}</dt>
          <dd>{fmt.money(data.total)}</dd>
        </div>
      </dl>

      {hero && scope === 'shop' ? <VerifiedBadge /> : null}
    </section>
  );
}

/**
 * "Đã xác minh" — hồ sơ người bán đã được nền tảng duyệt.
 *
 * Đứng cạnh số dư có chủ đích: hồ sơ chưa xác minh là lý do một lệnh rút bị treo, và biết điều
 * đó TRƯỚC khi bấm rút rẻ hơn nhiều so với biết sau.
 *
 * Hỏng hoặc thiếu quyền ⇒ KHÔNG hiện gì. Đây là một huy hiệu bổ trợ; thay nó bằng một dòng lỗi
 * đỏ giữa thẻ số dư sẽ làm người dùng tưởng tiền của mình có vấn đề.
 */
function VerifiedBadge() {
  const t = useTranslations('Wallet');
  const { data } = useSellerProfile();
  if (data?.status !== SELLER_PROFILE_STATUS.VERIFIED) return null;
  return (
    <p className={styles.verified}>
      <CheckCircleFilled aria-hidden="true" /> {t('verified')}
    </p>
  );
}
