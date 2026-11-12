'use client';

import { CopyOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { CopyButton } from '@/components/data-display/CopyButton';
import { ROUTES } from '@/constants/routes';
import styles from './StaffCredentials.module.css';

/**
 * Thông tin đăng nhập vừa cấp / vừa đặt lại cho một nhân viên (ADR 0087) — hiện ĐÚNG MỘT LẦN: mật
 * khẩu không lưu ở đâu để xem lại, nên khối này có nút sao chép từng dòng và "Sao chép tất cả" ra
 * đúng một đoạn để chủ dán vào Zalo.
 */
export function StaffCredentials({
  name,
  username,
  password,
  body,
}: {
  name: string;
  username: string | null;
  password: string;
  /** Câu dẫn — "Gửi thông tin… cho {name}" khi tạo, "Gửi mật khẩu mới…" khi đặt lại. */
  body: string;
}) {
  const t = useTranslations('Members.staff.created');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const loginUrl =
    typeof window === 'undefined' ? '' : new URL(ROUTES.MANAGE.LOGIN, window.location.origin).toString();
  const rows = [
    { key: 'url', label: t('loginUrl'), value: loginUrl },
    ...(username ? [{ key: 'username', label: t('username'), value: username }] : []),
    { key: 'password', label: t('password'), value: password },
  ];

  async function copyAll() {
    const text = t('copyText', { url: loginUrl, username: username ?? '', password });
    try {
      await navigator.clipboard.writeText(text);
      message.success(tCommon('actions.copied'));
    } catch {
      // Trình duyệt chặn clipboard (http, quyền) — nói ra, đừng im: mật khẩu chỉ hiện một lần.
      message.error(tCommon('components.copyFailed'));
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.body}>{body}</p>
      <dl className={styles.list} aria-label={name}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>
              <code className={styles.code}>{row.value}</code>
              <CopyButton value={row.value} label={`${t('copy')} ${row.label}`} />
            </dd>
          </div>
        ))}
      </dl>
      <Button icon={<CopyOutlined />} onClick={() => void copyAll()} block>
        {t('copyAll')}
      </Button>
    </div>
  );
}
