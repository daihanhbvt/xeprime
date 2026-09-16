'use client';

import { EyeInvisibleOutlined, EyeOutlined, RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { useWalletSummary } from '../hooks';
import { walletHrefFor, walletScopeFor } from '../wallet-scope';
import styles from './WalletBalancePill.module.css';

/** Người xem đã chọn ẨN số dư hay chưa. Tiện ích của RIÊNG trình duyệt này, không phải dữ liệu. */
const HIDDEN_KEY = 'xp.wallet.balance.hidden';
/** Ký tự che — dấu chấm tròn, không phải `*`: nó không gợi ý độ dài con số thật. */
const MASK = '••••••';

/**
 * Số dư ở góc trên phải hồ sơ "Tài khoản của tôi" — một lối tắt, không phải một thẻ tiền.
 *
 * Trả lời đúng MỘT câu ("tôi còn bao nhiêu") và mở thẳng màn số dư đầy đủ. Ba con số, sổ giao
 * dịch và các lệnh rút vẫn nằm ở `AccountMoneyPanel` phía dưới và ở màn đích — nhân bản chúng
 * lên đây là mở đường cho hai chỗ hiện hai số dư khác nhau cho cùng một người.
 *
 * ## Vì sao có con mắt, và vì sao nó phải bấm được thật
 *
 * Màn hình này hay được mở ở chỗ đông người. Biểu tượng con mắt ở mọi ứng dụng ngân hàng đều
 * hứa một việc: ẩn/hiện số dư. Vẽ nó ra mà không cho bấm là hứa suông, nên đây là một nút thật.
 *
 * Lựa chọn ẩn/hiện sống ở `localStorage` của CHÍNH trình duyệt đó: nó là tiện ích của người
 * đang ngồi trước máy, không phải thiết lập tài khoản (đồng bộ nó sang máy khác là hiểu sai vấn
 * đề). `useSyncExternalStore` để hai pill trên cùng một trang không lệch nhau, và snapshot phía
 * server luôn là "hiện" — DOM lúc hydrate vì thế khớp với lần render đầu ở client.
 *
 * ## Vì sao KHÔNG hiện gì khi chưa có dữ liệu
 *
 * Hỏng, đang tải, hay chưa biết người dùng là ai ⇒ không render. Một ô "—" hay một dòng lỗi đỏ ở
 * góc hồ sơ sẽ làm người ta tin rằng tiền của mình có vấn đề, trong khi thứ hỏng chỉ là một lối
 * tắt. Màn số dư đầy đủ vẫn vào được qua menu.
 */
export function WalletBalancePill() {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const hidden = useBalanceHidden();

  const scope = walletScopeFor(user);
  // `enabled` gián tiếp: chưa biết người dùng là ai thì chưa đoán sổ — đoán sai là hiện nhầm ví.
  const { data } = useWalletSummary(scope);

  if (!user || !data) return null;

  return (
    <div className={styles.pill}>
      <button
        type="button"
        className={styles.eye}
        aria-pressed={hidden}
        aria-label={hidden ? t('pill.show') : t('pill.hide')}
        onClick={() => setBalanceHidden(!hidden)}
      >
        {hidden ? <EyeInvisibleOutlined aria-hidden="true" /> : <EyeOutlined aria-hidden="true" />}
      </button>
      <Link href={walletHrefFor(user)} className={styles.link}>
        <span className={styles.label}>{t('pill.label')}</span>
        <span className={styles.amount}>{hidden ? MASK : fmt.money(data.available)}</span>
        <RightOutlined aria-hidden="true" className={styles.chevron} />
      </Link>
    </div>
  );
}

// ── Trạng thái ẩn/hiện ──────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Đọc `localStorage` trong `try/catch`: cửa sổ ẩn danh, dữ liệu site bị chặn, hay lúc chụp ảnh
 * xem trước đều ném ngay ở bước truy cập. Hỏng thì coi như "chưa chọn gì" — tức là HIỆN.
 */
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Server không có `localStorage`; mặc định HIỆN để DOM lúc hydrate khớp lần render đầu ở client. */
function getServerSnapshot(): boolean {
  return false;
}

function useBalanceHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function setBalanceHidden(next: boolean): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, next ? '1' : '0');
  } catch {
    /* Không lưu được thì thôi — lựa chọn chỉ mất khi tải lại trang, không có gì hỏng. */
  }
  for (const listener of listeners) listener();
}
