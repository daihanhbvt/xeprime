'use client';

import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, Popconfirm, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useState, type ReactNode } from 'react';

import { decorativeIcon } from '@/lib/decorative-icon';

import styles from './RowActions.module.css';

export interface RowAction {
  key: string;
  /**
   * Tên hành động. **Luôn bắt buộc** — với nút chỉ-icon nó trở thành `aria-label`.
   *
   * Đây là chỗ vá lỗ a11y đã đo ở Batch 1C-A: 5 nút icon ở 3 file hiện không có tên cho trình
   * đọc màn hình vì chỉ bọc `Tooltip`, mà `Tooltip` KHÔNG tạo accessible name.
   */
  label: string;
  icon?: ReactNode;
  /**
   * Điều khiển nhãn nút. Mặc định tự thích ứng: desktop hiện chữ, mobile chỉ giữ icon nếu có.
   * `true` = luôn hiện chữ; `false` = luôn chỉ-icon.
   */
  showLabel?: boolean;
  /**
   * Hành động chính của hàng/thẻ — nhận sắc thương hiệu ở `variant="filled"`. Nếu không action
   * nào khai rõ, action đầu tiên được xem là chính để mỗi hàng luôn có một điểm bấm nổi bật.
   */
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Vì sao không bấm được — hiện trong tooltip. Nút disabled không giải thích là ngõ cụt. */
  disabledReason?: string;
  loading?: boolean;
  /**
   * Feature tự quyết dựa trên quyền của nó rồi truyền xuống. `RowActions` KHÔNG đọc quyền —
   * CLAUDE.md §3: guard backend mới là lớp bảo vệ, component chung không được biết permission key.
   */
  hidden?: boolean;
  /** Hành động phá huỷ → hỏi lại trước khi chạy. */
  confirm?: {
    title: string;
    description?: ReactNode;
    okText?: string;
    cancelText?: string;
  };
  onClick: () => void;
}

interface RowActionsProps {
  actions: RowAction[];
  /** Số hành động hiện trực tiếp; phần dư gom vào menu ⋮ (Figma `127:2060` R6). */
  maxInline?: number;
  /** Nhãn nút ⋮ — mặc định chung, feature có thể nói rõ hơn ("Thêm thao tác cho xe A"). */
  overflowLabel?: string;
  /**
   * `'end'` (mặc định) — bám mép phải, đúng cột hành động của bảng.
   * `'start'` — bám mép trái; dùng khi cụm nút chiếm trọn một hàng riêng thay vì một ô cuối
   * hàng (thẻ xe Figma `186:1713`).
   */
  align?: 'start' | 'end';
  /**
   * `'text'` (mặc định) — dành cho bề mặt phụ cần nút phẳng.
   * `'filled'` — nút có nền, viền và độ nổi rõ; đây là biến thể chuẩn cho bảng và thẻ quản trị.
   */
  variant?: 'text' | 'filled';
}

const DEFAULT_MAX_INLINE = 3;

/**
 * Chuyển sang `lib/decorative-icon` ở Wave 1D-C: `MobileNav` mắc đúng lỗi này (D16.1) nên
 * bản dùng chung mới là chỗ đúng để nó sống. Bí danh giữ lại để phần dưới không phải sửa.
 */
const decorative = decorativeIcon;

/**
 * `variant="filled"` dùng cặp `color` + `variant` của AntD thay vì tự tô nền.
 *
 * Ba sắc thái của Figma trùng đúng ba token ngữ nghĩa AntD sinh từ theme XePrime — màu đỏ đo
 * được (`#dc2626`) khớp `--xp-color-error` từng chữ số. Tự viết `background` sẽ phải nhân đôi
 * class để thắng specificity của AntD (bẫy D19) và vẫn hỏng ở trạng thái hover/disabled/loading.
 */
function toneProps(action: RowAction, variant: 'text' | 'filled', emphasized = false) {
  if (variant !== 'filled') return { type: 'text' as const, danger: action.danger };
  if (action.danger) {
    return {
      variant: 'filled' as const,
      color: 'danger' as const,
      className: styles.toneDanger,
    };
  }
  return (action.primary ?? emphasized)
    ? { variant: 'filled' as const, color: 'primary' as const, className: styles.tonePrimary }
    : { variant: 'filled' as const, color: 'default' as const, className: styles.toneNeutral };
}

function ActionButton({
  action,
  variant,
  emphasized,
}: {
  action: RowAction;
  variant: 'text' | 'filled';
  emphasized?: boolean;
}) {
  const hasIcon = Boolean(action.icon);
  const showsText = action.showLabel !== false;
  const responsiveText = action.showLabel === undefined && hasIcon;
  const commonProps = {
    ...toneProps(action, variant, emphasized),
    size: 'small' as const,
    loading: action.loading,
    icon: decorative(action.icon),
    // Nút chỉ-icon phải có tên; nút có chữ thì chữ đã là tên, thêm `aria-label` sẽ nhân đôi.
    'aria-label': action.showLabel === true || (!hasIcon && showsText) ? undefined : action.label,
  };
  const content = showsText ? (
    <span className={responsiveText ? styles.responsiveLabel : undefined}>{action.label}</span>
  ) : null;

  const tooltip = action.disabled
    ? action.disabledReason
    : action.showLabel === false
      ? action.label
      : undefined;

  if (action.disabled) {
    const disabledButton = (
      <Button {...commonProps} disabled>
        {content}
      </Button>
    );
    // Nút bị `disabled` có `pointer-events: none`, nên tooltip gắn thẳng lên nó KHÔNG bao giờ
    // hiện — người dùng mất luôn lời giải thích. Bọc một `span` để tooltip có chỗ bám.
    return tooltip ? (
      <Tooltip title={tooltip}>
        <span className={styles.disabledWrap}>{disabledButton}</span>
      </Tooltip>
    ) : (
      disabledButton
    );
  }

  if (action.confirm) {
    return (
      <Popconfirm
        title={action.confirm.title}
        description={action.confirm.description}
        okText={action.confirm.okText ?? 'Đồng ý'}
        cancelText={action.confirm.cancelText ?? 'Huỷ'}
        okButtonProps={action.danger ? { danger: true } : undefined}
        onConfirm={action.onClick}
      >
        {/* Popconfirm tự gắn onClick mở popup, nên nút bên trong không tự gọi onClick nữa. */}
        <span className={styles.confirmWrap}>
          <Button {...commonProps}>{content}</Button>
        </span>
      </Popconfirm>
    );
  }

  const button = (
    <Button {...commonProps} onClick={action.onClick}>
      {content}
    </Button>
  );

  return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}

/**
 * Cụm hành động trên một hàng bảng.
 *
 * Ba việc nó làm mà 14 bảng hiện đang tự làm mỗi nơi một kiểu:
 *  1. **Tên khả truy cập** cho nút chỉ-icon (lỗ a11y D15.2).
 *  2. **Chặn sự kiện nổi bọt** lên hàng/thẻ bao ngoài. Bảng đặt `onRow.onClick` mà cột hành động
 *     không chặn thì bấm "Sửa" sinh HAI lần điều hướng và trang chi tiết thắng — tức nút Sửa
 *     thực tế không dẫn tới trang sửa (D15.7). Chặn ở đây sửa cho mọi consumer cùng lúc.
 *  3. **Gom hành động phụ vào menu ⋮** thay vì kéo dài hàng nút.
 *
 * KHÔNG quyết định quyền: feature lọc trước bằng `hidden`, hoặc đơn giản là không truyền action.
 */
export function RowActions({
  actions,
  maxInline = DEFAULT_MAX_INLINE,
  overflowLabel = 'Thêm thao tác',
  align = 'end',
  variant = 'text',
}: RowActionsProps) {
  /**
   * Hành động trong menu ⋮ đang chờ xác nhận.
   *
   * Trước Wave 2, nhánh menu gán thẳng `onClick: action.onClick` — tức `confirm` bị **bỏ qua
   * lặng lẽ**: một hành động phá huỷ rơi vào menu sẽ chạy NGAY khi bấm, không hỏi lại. Lỗ này
   * chưa nổ ra vì cả 13 consumer hiện tại đều ≤3 hành động nên không có gì tràn xuống menu.
   * Pilot Wave 2 (thẻ xe ở mobile, `maxInline={0}`) là nơi đầu tiên đẩy "Xoá" xuống menu.
   */
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;

  const inline = visible.slice(0, maxInline);
  const overflow = visible.slice(maxInline);
  const pending = overflow.find((action) => action.key === pendingKey) ?? null;

  const menuItems: MenuProps['items'] = overflow.map((action) => ({
    key: action.key,
    label: action.label,
    // Cùng lý do như nút: icon là trang trí, để nguyên thì tên mục menu thành "eye Xem chi tiết".
    icon: decorative(action.icon),
    danger: action.danger,
    disabled: action.disabled,
    onClick: action.confirm ? () => setPendingKey(action.key) : action.onClick,
  }));

  const trigger = (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <Button
        {...(variant === 'filled'
          ? {
              variant: 'filled' as const,
              color: 'default' as const,
              className: `${styles.toneNeutral} ${styles.overflowButton}`,
            }
          : { type: 'text' as const, className: styles.overflowButton })}
        size="small"
        icon={decorative(<MoreOutlined />)}
        aria-label={overflowLabel}
      />
    </Dropdown>
  );

  return (
    // Hành động của hàng không được kích hoạt luôn cả hàng — xem điểm (2) ở docblock.
    <div
      className={[
        styles.root,
        align === 'start' && styles.alignStart,
        variant === 'filled' && styles.filled,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      {inline.map((action, index) => (
        <ActionButton key={action.key} action={action} variant={variant} emphasized={index === 0} />
      ))}
      {overflow.length > 0 ? (
        pending ? (
          // Popconfirm điều khiển hoàn toàn bằng state (`trigger={[]}`) và neo vào chính nút ⋮:
          // mục menu đã biến mất khi menu đóng, không còn chỗ nào khác để neo hộp xác nhận.
          <Popconfirm
            open
            trigger={[]}
            title={pending.confirm?.title ?? ''}
            description={pending.confirm?.description}
            okText={pending.confirm?.okText ?? 'Đồng ý'}
            cancelText={pending.confirm?.cancelText ?? 'Huỷ'}
            okButtonProps={pending.danger ? { danger: true } : undefined}
            onConfirm={() => {
              setPendingKey(null);
              pending.onClick();
            }}
            onCancel={() => setPendingKey(null)}
          >
            {trigger}
          </Popconfirm>
        ) : (
          trigger
        )
      ) : null}
    </div>
  );
}
