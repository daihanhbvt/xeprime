import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoGroupCard, type InfoGroupLink } from '@/components/ui/InfoGroupCard';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useColors } from '@/theme/ThemeProvider';
import { typeScale } from '@/theme/tokens';

/**
 * Một KHỐI của Tổng quan — dựng trên "Nhóm thông tin" của design v2 (`InfoGroupCard`, Figma
 * Overview MB `24175:52345`): tiêu đề 16/24, link đầu khối / chú thích mờ bên phải, link chân khối
 * dồn phải.
 *
 * Mỗi khối tự chịu trạng thái của mình (chờ · lỗi · rỗng): một khối lỗi KHÔNG kéo cả màn thành
 * màn lỗi, và lỗi KHÁC rỗng - không bao giờ biến lỗi thành danh sách trống.
 */
export function DashboardPanel({
  title,
  loading = false,
  error = false,
  empty,
  extra,
  onRetry,
  errorTitle,
  action,
  footer,
  subheader,
  children,
}: {
  title: string;
  loading?: boolean;
  error?: boolean;
  empty?: string;
  /** Chú thích mờ bên phải tiêu đề (vd "90 ngày qua"). */
  extra?: string;
  onRetry?: () => void;
  /** Câu lỗi riêng của khối (web: `EmptyState` với message của khối, vd `agenda.loadError`). */
  errorTitle?: string;
  /** Link ở ĐẦU khối ("Quản lý xe →", "Báo cáo →"). */
  action?: InfoGroupLink;
  /** Link ở CHÂN khối ("Xem tất cả trong Đơn thuê xe →"). */
  footer?: InfoGroupLink;
  /** Hàng ngay dưới tiêu đề (tab gạch chân). */
  subheader?: ReactNode;
  children?: ReactNode;
}) {
  const colors = useColors();
  const tStates = useTranslations('Common.states');
  const hasRows = Boolean(children);
  const settled = !loading && !error;

  return (
    <InfoGroupCard
      title={title}
      {...(extra ? { extra } : {})}
      {...(action ? { headerLink: action } : {})}
      {...(subheader && settled ? { subheader } : {})}
      {...(footer && settled ? { footerLink: footer } : {})}
    >
      {loading ? (
        <MiniRowsSkeleton />
      ) : error ? (
        <EmptyState
          variant="error"
          title={errorTitle ?? tStates('error')}
          {...(onRetry ? { onRetry } : {})}
        />
      ) : hasRows ? (
        children
      ) : empty ? (
        <YStack minHeight={EMPTY_MIN_HEIGHT} ai="center" jc="center">
          <Text
            col={colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            ta="center"
          >
            {empty}
          </Text>
        </YStack>
      ) : null}
    </InfoGroupCard>
  );
}

/** Rỗng dạng chữ - web `MiniList .empty { min-height: 96px }`. */
const EMPTY_MIN_HEIGHT = 96;
