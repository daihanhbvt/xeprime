'use client';

import { Button, Popconfirm } from 'antd';

import styles from './StickyFormActions.module.css';

interface DestructiveAction {
  label: string;
  onClick: () => void;
  confirm?: { title: string; description?: string; okText?: string; cancelText?: string };
  loading?: boolean;
}

interface StickyFormActionsProps {
  submitLabel: string;
  /** Bỏ trống → không có nút huỷ (đúng với `ShopProfileForm`, form chỉ có một nút Lưu). */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Đang gửi: khoá cả huỷ lẫn hành động phá huỷ để không bỏ dở giữa chừng. */
  submitting?: boolean;
  /** Khoá nút gửi vì lý do của feature (chưa đủ điều kiện, chế độ chỉ xem…). */
  disabled?: boolean;
  /** Ví dụ "Xoá xe" ở form sửa — luôn nằm tách về bên trái, xa nút gửi. */
  destructive?: DestructiveAction;
  /**
   * `sticky` (mặc định) — dính đáy vùng cuộn của trang, dùng cho form dài toàn trang.
   * `inline` — nằm yên tại chỗ. **Bắt buộc dùng khi form nằm trong `ResponsiveDialog` hoặc
   * `DetailDrawer`**: hai overlay đó đã có vùng hành động dính riêng, chồng thêm một thanh dính
   * nữa sẽ ra hai hàng nút cùng lúc.
   */
  variant?: 'sticky' | 'inline';
}

/**
 * Thanh hành động cuối form (Figma `62:1623` — cao 64px, hai trạng thái Save/Saving).
 *
 * **Không tự gửi form.** Nút gửi là `htmlType="submit"`, nên nó kích hoạt `<form onSubmit>` của
 * feature — đúng cách 5 form hiện tại đang làm. Hệ quả bắt buộc: component này phải nằm **bên
 * trong** thẻ `<form>`, nếu không nút submit mất tác dụng.
 *
 * Không giữ validation, không gọi API, không đọc quyền — feature quyết định hết rồi truyền vào
 * `disabled`/`submitting`/`destructive`.
 */
export function StickyFormActions({
  submitLabel,
  onCancel,
  cancelLabel = 'Huỷ',
  submitting = false,
  disabled = false,
  destructive,
  variant = 'sticky',
}: StickyFormActionsProps) {
  const destructiveButton = destructive ? (
    <Button
      danger
      size="large"
      disabled={submitting}
      loading={destructive.loading}
      onClick={destructive.confirm ? undefined : destructive.onClick}
    >
      {destructive.label}
    </Button>
  ) : null;

  return (
    <div className={variant === 'sticky' ? styles.sticky : styles.inline}>
      <div className={styles.left}>
        {destructive?.confirm ? (
          <Popconfirm
            title={destructive.confirm.title}
            description={destructive.confirm.description}
            okText={destructive.confirm.okText ?? 'Đồng ý'}
            cancelText={destructive.confirm.cancelText ?? 'Huỷ'}
            okButtonProps={{ danger: true }}
            onConfirm={destructive.onClick}
          >
            {destructiveButton}
          </Popconfirm>
        ) : (
          destructiveButton
        )}
      </div>

      <div className={styles.right}>
        {onCancel ? (
          <Button size="large" onClick={onCancel} disabled={submitting}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button
          type="primary"
          size="large"
          htmlType="submit"
          loading={submitting}
          disabled={disabled}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
