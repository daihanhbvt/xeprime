'use client';

import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, Popconfirm, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

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
  /** Hiện chữ cạnh icon. Mặc định `false` = nút chỉ-icon. */
  showLabel?: boolean;
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
}

const DEFAULT_MAX_INLINE = 3;

/**
 * Icon của `@ant-design/icons` tự render `role="img"` kèm `aria-label` là TÊN ICON ("eye",
 * "delete"). Với nút có chữ, tên đó lọt vào accessible name và cho ra "eye Thu tiền". Bọc
 * `aria-hidden` để icon trở lại đúng vai trò trang trí — chữ (hoặc `aria-label` của nút) mới là tên.
 */
function decorative(icon: ReactNode): ReactNode {
  return icon ? <span aria-hidden="true">{icon}</span> : undefined;
}

function ActionButton({ action }: { action: RowAction }) {
  const commonProps = {
    type: 'text' as const,
    size: 'small' as const,
    danger: action.danger,
    loading: action.loading,
    icon: decorative(action.icon),
    // Nút chỉ-icon phải có tên; nút có chữ thì chữ đã là tên, thêm `aria-label` sẽ nhân đôi.
    'aria-label': action.showLabel ? undefined : action.label,
  };
  const content = action.showLabel ? action.label : null;

  const tooltip = action.disabled
    ? action.disabledReason
    : action.showLabel
      ? undefined
      : action.label;

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
 *  2. **Chặn sự kiện nổi bọt** lên `<tr>`. Hôm nay `VehicleTable` đặt `onRow.onClick` trên hàng
 *     mà cột hành động không chặn, nên bấm "Sửa" sinh HAI lần điều hướng và trang chi tiết thắng
 *     — tức nút Sửa thực tế không dẫn tới trang sửa (D15.7). Chặn ở đây sửa cho mọi bảng cùng lúc.
 *  3. **Gom hành động phụ vào menu ⋮** thay vì kéo dài hàng nút.
 *
 * KHÔNG quyết định quyền: feature lọc trước bằng `hidden`, hoặc đơn giản là không truyền action.
 */
export function RowActions({
  actions,
  maxInline = DEFAULT_MAX_INLINE,
  overflowLabel = 'Thêm thao tác',
}: RowActionsProps) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;

  const inline = visible.slice(0, maxInline);
  const overflow = visible.slice(maxInline);

  const menuItems: MenuProps['items'] = overflow.map((action) => ({
    key: action.key,
    label: action.label,
    // Cùng lý do như nút: icon là trang trí, để nguyên thì tên mục menu thành "eye Xem chi tiết".
    icon: decorative(action.icon),
    danger: action.danger,
    disabled: action.disabled,
    onClick: action.onClick,
  }));

  return (
    // Hành động của hàng không được kích hoạt luôn cả hàng — xem điểm (2) ở docblock.
    <div className={styles.root} onClick={(event) => event.stopPropagation()} role="presentation">
      {inline.map((action) => (
        <ActionButton key={action.key} action={action} />
      ))}
      {overflow.length > 0 ? (
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            icon={decorative(<MoreOutlined />)}
            aria-label={overflowLabel}
          />
        </Dropdown>
      ) : null}
    </div>
  );
}
