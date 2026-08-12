'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Drawer, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';

import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { XP_TOKENS } from '@/styles/theme';

import styles from './DetailDrawer.module.css';

/** Bề rộng panel desktop — token Wave 1A (`--xp-drawer-width` / `-lg`). */
const DRAWER_WIDTH = {
  md: XP_TOKENS['drawer-width'],
  lg: XP_TOKENS['drawer-width-lg'],
} as const;

export type DetailDrawerSize = keyof typeof DRAWER_WIDTH;

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Tiêu đề panel — cũng là tên khả truy cập. */
  title: ReactNode;
  children: ReactNode;
  size?: DetailDrawerSize;
  /** Góc phải header: StatusTag, nút hành động… */
  extra?: ReactNode;
  footer?: ReactNode;
  /**
   * Ba trạng thái nội dung, đã chuẩn hoá. Component KHÔNG nhận query hook hay API client —
   * nơi gọi tự rút ra từ TanStack Query rồi truyền xuống dạng boolean.
   * Thứ tự ưu tiên: `error` → `loading` → `children`.
   */
  loading?: boolean;
  error?: boolean;
  /** Có hàm này thì trạng thái lỗi hiện nút thử lại. */
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;
  retryText?: string;
  /** Dùng khi `title` không phải chuỗi (ví dụ có StatusTag lồng trong). */
  ariaLabel?: string;
  /** Mặc định `true`: đóng panel là bỏ nội dung, mở lại nạp mới. */
  destroyOnClose?: boolean;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}

/**
 * Panel chi tiết dùng chung: Drawer phải trên desktop, **toàn màn hình trên mobile**.
 *
 * Toàn màn hình là bắt buộc chứ không phải lựa chọn — Figma `130:1563` quy tắc 3:
 * *“Desktop Drawer → Mobile Full-Screen Page (luôn luôn)”*. Panel chi tiết chứa bảng, mô tả
 * dài và hành động; nhét vào bottom sheet là tự tạo vùng cuộn lồng nhau.
 *
 * Vì sao tồn tại (số liệu batch 1B.0): 7 panel `*DetailDrawer.tsx` lặp cùng một khung
 * (Drawer + Skeleton khi tải + Result khi lỗi + `extra` ở header), mỗi cái một bề rộng
 * (480/520/560/640), **không cái nào** đổi hình thái trên mobile, và **không cái nào có test**.
 *
 * Ranh giới: chỉ lo vỏ + ba trạng thái nội dung. Không biết feature nào, không gọi API,
 * không đọc quyền. `children` vẫn thuộc về feature.
 *
 * Modal lồng bên trong (khoá gian hàng, ẩn xe, ghi nhận thanh toán…) hoạt động bình thường:
 * AntD tự tăng z-index theo ngữ cảnh từ `zIndexPopupBase`, nên Modal luôn nằm trên Drawer.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  children,
  size = 'md',
  extra,
  footer,
  loading = false,
  error = false,
  onRetry,
  errorTitle = 'Không tải được dữ liệu',
  // Mặc định KHÔNG có mô tả: các panel đang chạy chỉ hiện tiêu đề lỗi. Thêm câu mặc định sẽ
  // là chữ mới không ai viết. Nơi gọi nào cần thì tự truyền.
  errorDescription,
  retryText = 'Thử lại',
  ariaLabel,
  destroyOnClose = true,
  className,
  bodyClassName,
  'data-testid': testId,
}: DetailDrawerProps) {
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      aria-label={ariaLabel}
      extra={extra}
      footer={footer}
      // Mobile: trượt kín viewport → đọc như một trang mới, nên nút đóng là mũi tên quay lại
      // (Figma quy tắc 6). Desktop: panel phải, giữ nút X mặc định.
      placement="right"
      // AntD 6: `size` thay cả `width` lẫn `height` (chọn theo `placement`); `width` đã deprecated.
      size={isMobile ? '100%' : DRAWER_WIDTH[size]}
      closeIcon={isMobile ? <ArrowLeftOutlined /> : undefined}
      destroyOnHidden={destroyOnClose}
      className={className}
      classNames={{ body: cx(styles.body, bodyClassName), footer: styles.footer }}
      data-testid={testId}
    >
      {renderContent()}
    </Drawer>
  );

  function renderContent(): ReactNode {
    // Lỗi thắng loading: refetch nền không được che mất thông báo lỗi đang hiện.
    if (error) {
      return (
        <Result
          status="error"
          title={errorTitle}
          subTitle={errorDescription}
          extra={
            onRetry ? (
              <Button type="primary" onClick={onRetry}>
                {retryText}
              </Button>
            ) : undefined
          }
        />
      );
    }

    if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;

    return children;
  }
}
