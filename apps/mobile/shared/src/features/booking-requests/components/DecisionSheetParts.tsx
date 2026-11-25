import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';

/**
 * Mảnh dùng chung của ba tấm quyết định (Duyệt · Từ chối · Huỷ) — bản native của web
 * `DecisionReasonDialog.module.css` (05/11/2026): một câu dẫn có chữ đậm nói thẻ sẽ sang nhóm nào,
 * và chân tấm hai nút "Quay lại" + nút chính đặt cạnh nhau.
 */

function StrongText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

/** Thẻ `<b>` của message → chữ đậm native. Truyền thẳng vào `t.rich(key, { b: richBold })`. */
export const richBold = (chunks: ReactNode) => <StrongText>{chunks}</StrongText>;

/** Câu dẫn ngay dưới tiêu đề tấm — `BottomSheet.subtitle` chỉ nhận chuỗi trơn, nên dựng ở thân. */
export function DecisionLead({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/** Ô cảnh báo nền vàng (web `.warning`) — chữ chính, không giấu sau tooltip. */
export function DecisionWarning({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={space.xs} p={space.md} br={radius.md} bg={colors.warningSurface}>
      {children}
    </YStack>
  );
}

/**
 * Ô hệ quả nền đỏ nhạt của tấm Huỷ - Figma "Hủy khi Chờ thanh toán" `23930:44761`: nền
 * `status/error-low`, đệm 12, bo 12, chữ 14/20 `status/error-high`, không viền.
 */
export function DecisionDanger({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={space.xs} p={DANGER_PAD} br={radius.control} bg={colors.dangerSurface} accessibilityRole="text">
      {children}
    </YStack>
  );
}

/** Chữ trong `DecisionDanger` (14/20 đỏ). */
export function DecisionDangerText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.danger} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} flexShrink={1}>
      {children}
    </Text>
  );
}

const DANGER_PAD = 12;

/** Chữ đậm GIỮ màu đỏ của ô hệ quả (Figma: "trừ điểm uy tín" đậm cùng sắc đỏ). */
export const richBoldInherit = (chunks: ReactNode) => <Text fow={fontWeight.semibold}>{chunks}</Text>;

/**
 * Chân tấm theo khuôn tấm của app KHÁCH (`CancelTripSheet`): "Quay lại" dạng chữ co vừa nội dung
 * bên trái, nút chính lấy phần còn lại - người dùng chốt 10/11/2026 lấy phong cách app khách.
 */
export function DecisionFooter({
  backLabel,
  onBack,
  leading,
  confirm,
}: {
  backLabel?: string;
  onBack?: () => void;
  /**
   * Nút bên TRÁI tự dựng thay cho "Quay lại" dạng chữ - Figma v2 của tấm duyệt ("Từ chối" viền đỏ)
   * và tấm từ chối ("Quay lại" viền xám). `null` = chỉ còn nút chính chiếm trọn hàng.
   */
  leading?: ReactNode;
  confirm: ReactNode;
}) {
  const left =
    leading !== undefined ? (
      leading
    ) : backLabel && onBack ? (
      <Button label={backLabel} variant="ghost" onPress={onBack} />
    ) : null;
  return (
    <XStack gap={leading !== undefined ? FOOTER_GAP : space.sm}>
      {left ? <YStack flexShrink={0}>{left}</YStack> : null}
      <YStack f={1}>{confirm}</YStack>
    </XStack>
  );
}

/** Figma "Hành động" của chân tấm v2: hai nút cách 12. */
const FOOTER_GAP = 12;

/**
 * Dòng phụ dưới tiêu đề của ba tấm quyết định (Figma "#DH0123-921"): mã đơn khi đã có, chưa có
 * (yêu cầu chưa duyệt) thì "Gửi lúc …". Không kèm tên khách - thẻ tóm tắt / thẻ chuyến đã nói.
 */
export function useDecisionCodeLine(request: BookingRequestDecisionTarget): string | undefined {
  const t = useTranslations('BookingRequests.card');
  const fmt = useAppFormat();
  if (request.bookingCode) return t('bookingCode', { code: request.bookingCode });
  return request.createdAt ? t('sentAt', { value: fmt.dateTime(request.createdAt) }) : undefined;
}

/**
 * Thẻ tóm tắt của tấm Từ chối / Huỷ chuyến - Figma "Vehicle Summary" `24145:97095`: nền `bg/gray-50`,
 * đệm 12, bo 16; ảnh xe · tên khách 16/24 đậm vừa · tên xe 14/20.
 */
export function DecisionSummaryCard({
  request,
  label,
}: {
  request: BookingRequestDecisionTarget;
  /** Tên cho trình đọc màn hình ("khách · xe"). */
  label: string;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={SUMMARY_GAP} p={SUMMARY_PAD} br={radius.card} bg={colors.background} accessibilityLabel={label}>
      <VehicleThumb uri={request.vehicleImageUrl ?? null} recyclingKey={request.vehicleId} />
      <YStack f={1} minWidth={0} gap={4}>
        <Text
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {request.customerName}
        </Text>
        <Text
          col={colors.textBody}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {request.vehicleName}
        </Text>
      </YStack>
    </XStack>
  );
}

/** Figma thẻ tóm tắt: đệm 12, ảnh - chữ 12. */
const SUMMARY_PAD = 12;
const SUMMARY_GAP = 12;
