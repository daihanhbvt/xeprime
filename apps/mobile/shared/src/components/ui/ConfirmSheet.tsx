import type { ReactNode } from 'react';
import { Text } from 'tamagui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslations } from 'use-intl';
import { SheetConfirmFooter } from '@/components/ui/SheetConfirmFooter';
import { useColors } from '@/theme/ThemeProvider';
import { typeScale } from '@/theme/tokens';

/**
 * Tấm XÁC NHẬN một thao tác - cùng khung các tấm quyết định của màn Đơn thuê (Huỷ chuyến · Từ chối:
 * `BottomSheet chrome="v2"` + kẻ dưới tiêu đề), chân tấm "Huỷ" (viền, trái) + nút xác nhận
 * (`SheetConfirmFooter`, người dùng chốt 26/11/2026).
 * Dùng thay `AlertDialog` cho xác nhận huỷ/xoá trong app Partner.
 */
export function ConfirmSheet({
  open,
  title,
  subtitle,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'danger',
  loading = false,
  cancelLabel,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** Dòng phụ dưới tiêu đề (mã đơn, mã lệnh…). */
  subtitle?: ReactNode;
  /** Lời giải thích hậu quả - chữ 14/20 `text/gray/medium`. */
  message?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Nút phụ có hành động riêng (vd. "Thêm ảnh") thay cho "Huỷ" chỉ đóng tấm. */
  cancelLabel?: string;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const tCommon = useTranslations('Common.actions');
  return (
    <BottomSheet
      open={open}
      onClose={loading ? () => undefined : onClose}
      chrome="v2"
      /*
        Không có lời giải thích ⇒ không vẽ phần thân: chỉ đầu tấm + chân tấm, một vạch kẻ ở giữa.
        GIỮ `scroll` mặc định: `scroll={false}` cho tấm chiều cao CỐ ĐỊNH bằng trần (dành cho danh sách
        ảo hoá) ⇒ hộp xác nhận bị kéo gần hết màn, trắng trơn (lỗi "Tạm khoá" tài xế 27/11/2026).
      */
      {...(message ? { headerDivider: true } : { headerDivider: false, padded: false })}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      footer={
        <SheetConfirmFooter
          backLabel={cancelLabel ?? tCommon('cancel')}
          onBack={onCancel ?? onClose}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          tone={tone}
          loading={loading}
        />
      }
    >
      {typeof message === 'string' ? (
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {message}
        </Text>
      ) : (
        message ?? null
      )}
    </BottomSheet>
  );
}
