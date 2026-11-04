'use client';

import { Button, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { telHref, zaloHref } from '@/lib/contact';
import { cx } from '@/lib/cx';
import styles from './CustomerContactButtons.module.css';

/**
 * Cụm liên hệ khách — Nhắn tin · Gọi · Zalo (Figma Partner-XePrime "Buttons group", 02/11/2026).
 * Một bản cho thẻ yêu cầu (`labeled`, có chữ) và thẻ đơn (`icon`, chỉ biểu tượng).
 *
 * Component KHÔNG tự quyết được thấy liên hệ hay không: SĐT vắng là vì server đã giấu nó
 * (`hostSeesCustomerContact` — ADR 0056), và `onMessage` vắng là vì kênh nhắn tin chưa mở hoặc
 * người xem không được nhắn (ADR 0073 · phiên hỗ trợ ADR 0050). Thiếu thứ gì thì nút đó vắng hẳn.
 */
export function CustomerContactButtons({
  name,
  phone,
  variant,
  onMessage,
  messageUnavailable = false,
  messageLoading = false,
  disabled = false,
}: {
  name: string;
  phone: string | null | undefined;
  variant: 'labeled' | 'icon';
  /** Mở hội thoại. Vắng ⇒ không có nút Nhắn tin. */
  onMessage?: () => void;
  /** Khách không có tài khoản để nhắn: nút vẫn hiện nhưng xám, kèm lý do ở tooltip. */
  messageUnavailable?: boolean;
  messageLoading?: boolean;
  /** Một thao tác khác đang chạy trên cùng bản ghi. */
  disabled?: boolean;
}) {
  const t = useTranslations('BookingRequests.actions');
  const phoneLink = telHref(phone);
  const zaloLink = zaloHref(phone);
  const iconOnly = variant === 'icon';

  if (!onMessage && !phoneLink && !zaloLink) return null;

  return (
    <div className={styles.group}>
      {onMessage ? (
        <Tooltip title={messageUnavailable ? t('messageUnavailable') : iconOnly ? t('message') : undefined}>
          {/* `<span>` để tooltip vẫn nhận chuột khi nút bị disable. */}
          <span className={styles.slot}>
            <Button
              className={cx(styles.button, iconOnly && styles.iconOnly)}
              icon={<LineIcon name="message-sm" className={styles.icon} />}
              loading={messageLoading}
              disabled={messageUnavailable || (disabled && !messageLoading)}
              aria-label={t('messageAria', { name })}
              onClick={onMessage}
            >
              {iconOnly ? null : t('message')}
            </Button>
          </span>
        </Tooltip>
      ) : null}

      {phoneLink && phone ? (
        <Tooltip title={iconOnly ? phone : undefined}>
          <Button
            className={cx(styles.button, iconOnly && styles.iconOnly)}
            href={phoneLink}
            icon={<LineIcon name="calling" className={styles.icon} />}
            aria-label={t('callAria', { name, phone })}
          >
            {iconOnly ? null : t('call')}
          </Button>
        </Tooltip>
      ) : null}

      {zaloLink && phone ? (
        <Button
          className={cx(styles.button, styles.zalo, iconOnly && styles.iconOnly)}
          href={zaloLink}
          target="_blank"
          rel="noopener noreferrer"
          icon={
            // eslint-disable-next-line @next/next/no-img-element -- logo tĩnh 35px, không cần tối ưu ảnh
            <img src="/icons/brand/zalo.png" alt="" className={styles.zaloLogo} />
          }
          aria-label={t('zaloAria', { name, phone })}
        >
          {iconOnly ? null : t('zalo')}
        </Button>
      ) : null}
    </div>
  );
}
