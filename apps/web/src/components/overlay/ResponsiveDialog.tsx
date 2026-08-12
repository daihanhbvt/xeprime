'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Drawer, Modal, Space } from 'antd';
import type { ReactNode } from 'react';

import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { XP_TOKENS } from '@/styles/theme';

import styles from './ResponsiveDialog.module.css';

/** Bề rộng modal desktop — Figma `125:1611` (SM 400 · MD 560 · LG 720), token hoá ở Wave 1A. */
const MODAL_WIDTH = {
  sm: XP_TOKENS['modal-width-sm'],
  md: XP_TOKENS['modal-width'],
  lg: XP_TOKENS['modal-width-lg'],
} as const;

/**
 * Trần chiều cao bottom sheet — Figma `130:1563` quy tắc 1 ("Mobile Bottom Sheet (max 85vh)").
 * `dvh` thay `vh`: trên mobile thanh địa chỉ co giãn, `vh` làm sheet tràn khỏi màn hình.
 */
const SHEET_MAX_HEIGHT = '85dvh';

export type DialogSize = keyof typeof MODAL_WIDTH;

/**
 * Hình thái mobile. Cả hai đều là **Drawer neo đáy** (`placement="bottom"`), khác nhau ở
 * chiều cao — Figma `130:1563` “Overlay Transformation Rules”:
 *  - `sheet`      quy tắc 1 + 4: nội dung <480px và mọi hộp xác nhận → sheet, trần 85dvh
 *  - `fullscreen` quy tắc 2 + 5: nội dung ≥480px và mọi overlay có form → cao 100%
 *
 * Quy tắc 5 là lý do `fullscreen` tồn tại: form cần chỗ cho bàn phím ảo, sheet cao 85dvh
 * bị bàn phím che mất phần nhập.
 */
export type DialogMobileMode = 'sheet' | 'fullscreen';

/** Mặc định suy từ `size` theo quy tắc 1/2 — `sm` (400px) < 480px nên là sheet. */
const DEFAULT_MOBILE_MODE: Record<DialogSize, DialogMobileMode> = {
  sm: 'sheet',
  md: 'fullscreen',
  lg: 'fullscreen',
};

interface ResponsiveDialogBaseProps {
  open: boolean;
  /** Người dùng yêu cầu đóng: nút đóng, phím Esc, hoặc bấm nền. */
  onClose: () => void;
  children: ReactNode;
  size?: DialogSize;
  /** Ghi đè hình thái mobile khi mặc định theo `size` không đúng. */
  mobileMode?: DialogMobileMode;
  /**
   * `undefined` → dựng footer mặc định từ `onOk`/`okText`/`cancelText`.
   * `null` → không footer (overlay tự dựng hành động trong thân).
   */
  footer?: ReactNode | null;
  onOk?: () => void;
  okText?: string;
  cancelText?: string;
  /**
   * Hành động không đảo ngược được (xoá, khoá, huỷ phiếu). Nút chính chuyển sang sắc thái
   * nguy hiểm của AntD (`colorError` từ token) — component KHÔNG tự đặt màu.
   */
  destructive?: boolean;
  okDisabled?: boolean;
  /**
   * Đang gửi. Đặt nút chính vào `loading` (AntD tự chặn click) và **khoá mọi đường đóng vô ý**
   * — đây là lớp chống gửi trùng. Nút đóng tường minh vẫn dùng được.
   */
  confirmLoading?: boolean;
  /** Cho phép đóng bằng Esc. Mặc định `true`; luôn bị khoá khi `confirmLoading`. */
  closeOnEsc?: boolean;
  /**
   * Cho phép đóng khi bấm nền. Mặc định `true`; luôn bị khoá khi `confirmLoading`.
   * Prop này là API của ResponsiveDialog; xuống AntD 6 nó đi qua `mask.closable`
   * (`maskClosable` trần đã deprecated).
   */
  maskClosable?: boolean;
  /** Mặc định `true`: mỗi lần mở là state mới. `false` khi cần giữ nội dung đã nhập. */
  destroyOnClose?: boolean;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}

/**
 * Tên khả truy cập là bắt buộc: hoặc có tiêu đề hiện ở header, hoặc ẩn tiêu đề nhưng phải
 * cấp `ariaLabel`. Union này biến việc quên cả hai thành lỗi biên dịch.
 */
type ResponsiveDialogProps = ResponsiveDialogBaseProps &
  (
    | { title: ReactNode; hideHeaderTitle?: false; ariaLabel?: string }
    | { title?: ReactNode; hideHeaderTitle: true; ariaLabel: string }
  );

/**
 * Overlay tác vụ dùng chung: Modal trên desktop, Drawer neo đáy ở ≤640px.
 *
 * Vì sao tồn tại (số liệu batch 1B.0): 19 overlay nghiệp vụ, **chỉ 3 cái responsive** và
 * **2 trong 3 cái đó đang hỏng** (truyền `size="88dvh"` cho Drawer — `size` chỉ nhận
 * `'default' | 'large'`, nên chiều cao không hề được áp).
 *
 * Ranh giới: chỉ lo VỎ overlay — hình thái, tiêu đề, footer, đường đóng, trạng thái gửi.
 * Không biết gì về nghiệp vụ, quyền, API hay validate; những thứ đó ở lại nơi gọi.
 *
 * Bẫy focus, Esc và **trả focus về phần tử đã mở** do rc-dialog/rc-drawer của AntD lo —
 * không tự dựng focus trap. Chồng lớp overlay lồng nhau do AntD quản qua `zIndexPopupBase`
 * (Wave 1A đặt = 1000), nên Modal mở từ trong Drawer luôn nằm trên.
 *
 * Hydration: `useIsMobile()` dùng `useSyncExternalStore`, snapshot phía server là `false`
 * (desktop). AntD chỉ dựng DOM của overlay sau lần mở đầu tiên, nên nhánh desktop/mobile
 * không tạo ra khác biệt DOM lúc hydrate khi `open={false}` — trạng thái mặc định của
 * mọi consumer trong kho.
 */
export function ResponsiveDialog({
  open,
  onClose,
  title,
  ariaLabel,
  hideHeaderTitle,
  children,
  size = 'md',
  mobileMode,
  footer,
  onOk,
  okText = 'Xác nhận',
  cancelText = 'Huỷ',
  destructive,
  okDisabled,
  confirmLoading = false,
  closeOnEsc = true,
  maskClosable = true,
  destroyOnClose = true,
  className,
  bodyClassName,
  'data-testid': testId,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const resolvedMobileMode = mobileMode ?? DEFAULT_MOBILE_MODE[size];

  // Đang gửi thì mọi đường đóng vô ý bị khoá, bất kể consumer cấu hình gì.
  const escEnabled = closeOnEsc && !confirmLoading;
  // `mask.closable` là dạng đúng ở AntD 6; chỉ đặt `closable`, `enabled` để mặc định (nền vẫn hiện).
  const maskConfig = { closable: maskClosable && !confirmLoading };

  const resolvedFooter =
    footer === undefined && onOk
      ? renderDefaultFooter({
          onClose,
          onOk,
          okText,
          cancelText,
          destructive,
          okDisabled,
          confirmLoading,
        })
      : footer;

  /**
   * Header ẩn vẫn PHẢI có tên khả truy cập.
   *
   * Không dùng `aria-label` trên `<Modal>`/`<Drawer>`: AntD không chuyển tiếp nó xuống phần tử
   * `role="dialog"` khi `title` rỗng, nên dialog mất tên (lỗi này đang có thật ở `AuthModal`,
   * ghi ở backlog D14.2). Cách chắc chắn là vẫn cấp `title` rồi ẩn bằng CSS — AntD tự nối
   * `aria-labelledby` vào đúng phần tử tiêu đề đó.
   */
  const headerTitle = hideHeaderTitle ? <span className={styles.srOnly}>{ariaLabel}</span> : title;

  if (isMobile) {
    const isSheet = resolvedMobileMode === 'sheet';

    return (
      <Drawer
        open={open}
        onClose={onClose}
        placement="bottom"
        // AntD 6: `size` thay `height` khi neo đáy; `height` đã deprecated.
        size={isSheet ? 'auto' : '100%'}
        title={headerTitle}
        // Quy tắc 6 (Figma): màn toàn trang đọc như một trang mới → mũi tên quay lại, không phải X.
        closeIcon={isSheet ? undefined : <ArrowLeftOutlined />}
        footer={resolvedFooter}
        mask={maskConfig}
        keyboard={escEnabled}
        destroyOnHidden={destroyOnClose}
        rootClassName={cx(styles.mobileRoot, isSheet && styles.sheetRoot, className)}
        classNames={{
          body: cx(styles.body, bodyClassName),
          footer: styles.footer,
          header: hideHeaderTitle ? styles.bareHeader : undefined,
        }}
        styles={isSheet ? { wrapper: { maxHeight: SHEET_MAX_HEIGHT } } : undefined}
        data-testid={testId}
      >
        {children}
      </Drawer>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={headerTitle}
      width={MODAL_WIDTH[size]}
      footer={resolvedFooter ?? null}
      centered
      mask={maskConfig}
      keyboard={escEnabled}
      destroyOnHidden={destroyOnClose}
      className={className}
      classNames={{
        body: cx(styles.body, bodyClassName),
        footer: styles.footer,
        header: hideHeaderTitle ? styles.bareHeader : undefined,
      }}
      data-testid={testId}
    >
      {children}
    </Modal>
  );
}

function renderDefaultFooter({
  onClose,
  onOk,
  okText,
  cancelText,
  destructive,
  okDisabled,
  confirmLoading,
}: {
  onClose: () => void;
  onOk: () => void;
  okText: string;
  cancelText: string;
  destructive?: boolean;
  okDisabled?: boolean;
  confirmLoading: boolean;
}): ReactNode {
  return (
    <Space>
      <Button onClick={onClose} disabled={confirmLoading}>
        {cancelText}
      </Button>
      <Button
        type="primary"
        danger={destructive}
        onClick={onOk}
        loading={confirmLoading}
        disabled={okDisabled}
      >
        {okText}
      </Button>
    </Space>
  );
}
