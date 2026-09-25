'use client';

import { ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Drawer, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';

import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { XP_TOKENS } from '@/styles/theme';

import styles from './DetailDrawer.module.css';
import { useTranslations } from 'next-intl';

/**
 * Bề rộng panel desktop — token Wave 1A (`--xp-drawer-width` / `-lg`) + `xl` và `split`
 * (24/09/2026).
 *
 * `xl` là panel làm việc RỘNG (màn duyệt xe: hồ sơ + danh mục kiểm tra hai cột): ~75% màn lớn,
 * trần 1400px, phủ gần hết vùng nội dung ở desktop nhỏ — một biểu thức `clamp()` trong token,
 * không phải một con số, nên không có nhánh JS theo bề rộng màn hình.
 *
 * `split` là panel ĐỨNG CẠNH danh sách (đi cùng `modeless`): ~46% màn hình, 560–780px — đủ cho
 * nội dung hai cột mà phần bảng còn lại vẫn đọc được. Trang chừa chỗ cho bảng bằng CHÍNH token
 * này (`--xp-drawer-width-split`), nên hai bên không thể lệch nhau.
 */
const DRAWER_WIDTH = {
  md: XP_TOKENS['drawer-width'],
  lg: XP_TOKENS['drawer-width-lg'],
  xl: XP_TOKENS['drawer-width-xl'],
  split: XP_TOKENS['drawer-width-split'],
} as const;

/** Props riêng của panel `modeless` — xem prop `modeless` và chỗ trải nó bên dưới. */
const MODELESS_PROPS = { mask: false, 'aria-modal': false } as const;

/** Hai cỡ phủ kín màn hình từ tablet trở xuống — xem `.tabletFullWrapper`. */
const FULL_ON_TABLET: ReadonlySet<DetailDrawerSize> = new Set<DetailDrawerSize>(['xl', 'split']);

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
  /**
   * Nút đóng ở CUỐI header (sau `extra`) thay cho đầu header — cho panel mà `extra` là một cụm
   * điều hướng (trước/sau) và dấu X đứng cuối cụm là thứ tự người dùng quen. Chỉ áp ở desktop:
   * toàn màn hình vẫn là mũi tên quay lại ở ĐẦU (Figma quy tắc 6).
   */
  closeAtEnd?: boolean;
  /**
   * Panel ĐỨNG CẠNH nội dung trang thay vì chặn nó: không mask tối, không khoá cuộn trang, không
   * bẫy focus, không `aria-modal` — người dùng (kể cả trình đọc màn hình) vẫn đọc và bấm được
   * danh sách phía sau (chọn đơn khác là đổi nội dung panel). Ở desktop panel nằm DƯỚI topbar của
   * AppShell để chuông thông báo và menu tài khoản không bị che suốt lúc panel mở. Esc vẫn đóng
   * panel kể cả khi focus đang ở ngoài nó: rc-drawer bắt Esc ở `window` theo ngăn xếp portal,
   * nên một dropdown đang mở vẫn được đóng TRƯỚC.
   *
   * Trang dùng cờ này phải tự chừa chỗ cho nội dung (xem cỡ `split`), nếu không panel sẽ đè lên
   * đúng phần người dùng đang cần nhìn.
   */
  modeless?: boolean;
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
  errorTitle,
  // Mặc định KHÔNG có mô tả: các panel đang chạy chỉ hiện tiêu đề lỗi. Thêm câu mặc định sẽ
  // là chữ mới không ai viết. Nơi gọi nào cần thì tự truyền.
  errorDescription,
  retryText,
  ariaLabel,
  destroyOnClose = true,
  closeAtEnd = false,
  modeless = false,
  className,
  bodyClassName,
  'data-testid': testId,
}: DetailDrawerProps) {
  const tCommon = useTranslations('Common');
  const errorTitleText = errorTitle ?? tCommon('states.loadError');
  const retryLabel = retryText ?? tCommon('actions.retry');
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
      closable={
        isMobile
          ? { closeIcon: <ArrowLeftOutlined /> }
          : closeAtEnd
            ? { placement: 'end', closeIcon: <CloseOutlined /> }
            : true
      }
      destroyOnHidden={destroyOnClose}
      /*
       * Chỉ TRẢI hai prop này khi modeless — không bao giờ truyền `undefined` tường minh.
       * rc-drawer gắn cứng `aria-modal="true"` rồi trải props của ta lên SAU, nên một khoá
       * `aria-modal: undefined` sẽ xoá luôn giá trị mặc định của mọi panel thường. Panel không
       * chặn trang thì không mask và không được báo trình đọc màn hình rằng trang phía sau đã trơ.
       */
      {...(modeless ? MODELESS_PROPS : {})}
      className={className}
      classNames={{
        body: cx(styles.body, bodyClassName),
        footer: styles.footer,
        /*
         * Panel `xl` là một bàn làm việc hai cột: ở tablet nó chỉ còn cách phủ kín màn hình (một
         * panel 75% của 900px là hai cột 400px — không đọc được cột nào). `split` cũng vậy: ở
         * tablet không còn chỗ để đứng cạnh danh sách. Làm bằng CSS thay vì thêm một hook media
         * query: `md`/`lg` giữ nguyên hành vi cũ, và không có thêm một nhánh render theo bề
         * rộng màn hình.
         */
        wrapper:
          cx(
            FULL_ON_TABLET.has(size) && styles.tabletFullWrapper,
            modeless && styles.modelessWrapper,
          ) || undefined,
      }}
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
          title={errorTitleText}
          subTitle={errorDescription}
          extra={
            onRetry ? (
              <Button type="primary" onClick={onRetry}>
                {retryLabel}
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
