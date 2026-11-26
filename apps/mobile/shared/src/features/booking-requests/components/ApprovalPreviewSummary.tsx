import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { OwnerPayoutTable } from '@/features/bookings/components/OwnerPayoutTable';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { BookingRequestItem } from '../api';

export type ApprovalPreview = NonNullable<BookingRequestItem['approvalPreview']>;
export type ApprovalWindows = NonNullable<ApprovalPreview['windows']>;

/**
 * XEM TRƯỚC lượt duyệt cho gian hàng — bản native của `ApprovalPreviewSummary` web (ADR 0064).
 *
 * Hai khối theo Figma tấm duyệt v2: "Lợi nhuận chuyến" (`24145:96835`, nhóm thu/mở được, mặc định
 * MỞ, thu lại chỉ còn dòng "Số tiền cộng ví") với bảng cộng ví dùng chung với chi tiết đơn, và ô
 * nền xanh (`24145:97083`) nói hai cửa sổ của khách NẾU duyệt ngay + link "Chính sách huỷ".
 *
 * Mọi con số do server tính; `windows` của dài hạn do nơi gọi dựng bằng `holdWindowsPreview` trên
 * giờ nhận vừa chọn. Luôn gắn nhãn ƯỚC TÍNH — số chốt đóng băng lúc duyệt (ADR 0024).
 */
export function ApprovalPreviewSummary({
  preview,
  windows,
  windowsPendingHint,
  heading,
  showMoney = true,
  onLeave,
}: {
  preview: ApprovalPreview;
  /** Hai cửa sổ nếu duyệt ngay — `undefined` = dùng `preview.windows` của server. */
  windows?: ApprovalWindows | null;
  /** Câu thay cho khối cửa sổ khi chưa có giờ nhận (dài hạn chưa chọn giờ). */
  windowsPendingHint?: string;
  /** Tiêu đề khối tiền — hộp duyệt theo ngày dùng "Lợi nhuận chuyến" (web 05/11/2026). */
  heading?: string;
  /** `false` = chỉ hiện hai cửa sổ — số tiền server ước không phải tiền của chuyến này (dài hạn legacy). */
  showMoney?: boolean;
  /**
   * Gọi TRƯỚC khi link "Chính sách huỷ" mở màn khác: tấm trượt là `Modal` nên màn mới sẽ nằm DƯỚI
   * nó - nơi gọi đóng tấm trước.
   */
  onLeave?: () => void;
}) {
  const t = useTranslations('BookingRequests.approvalPreview');
  const title = heading ?? t('title');

  return (
    <>
      {showMoney ? (
        <InfoGroupCard
          title={title}
          collapsible
          // Figma tấm duyệt không có viên "Ước tính" (người dùng gỡ 20/11/2026).
          collapsedContent={
            <OwnerPayoutTable payout={preview.ownerPayout} label={title} variant="v2" summaryOnly />
          }
        >
          <OwnerPayoutTable payout={preview.ownerPayout} label={title} variant="v2" />
        </InfoGroupCard>
      ) : null}
      <ApprovalWindowNotes
        preview={preview}
        windows={windows === undefined ? preview.windows : windows}
        {...(windowsPendingHint === undefined ? {} : { windowsPendingHint })}
        {...(onLeave === undefined ? {} : { onLeave })}
      />
    </>
  );
}

/**
 * Hai cửa sổ của khách NẾU duyệt ngay (ADR 0066 · 0072) trong ô nền xanh như web
 * `ApprovalWindowNotes` — tách khỏi bảng tiền để đọc ra là LUẬT, không phải một dòng tiền.
 */
function ApprovalWindowNotes({
  preview,
  windows: w,
  windowsPendingHint,
  onLeave,
}: {
  preview: ApprovalPreview;
  windows: ApprovalWindows | null | undefined;
  windowsPendingHint?: string;
  onLeave?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.approvalPreview');
  const tApp = useTranslations('BookingRequests.approvalPreview.partnerApp');
  const fmt = useAppFormat();
  const openDoc = useOpenLegalDoc();

  if (preview.collectsHold && !w && !windowsPendingHint) return null;

  const note = (text: string) => (
    <Text col={colors.textBody} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
      {text}
    </Text>
  );

  return (
    <YStack gap={NOTE_GAP} p={NOTE_PAD} br={radius.control} bg={colors.infoLow}>
      {!preview.collectsHold ? (
        note(t('noHold'))
      ) : w ? (
        <>
          {/*
            App: MỘT câu hạn thanh toán (giờ in đậm) + link "Chính sách hủy" như Figma `24145:97083`
            (người dùng chốt 20/11/2026). Huỷ miễn phí / huỷ muộn đọc ở trang chính sách; web giữ 3 ý.
          */}
          <Text col={colors.textBody} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {tApp.rich('paymentWindow', {
              duration: fmt.minutesDuration(w.paymentWindowMinutes),
              time: fmt.dateTime(w.expiresAt),
              b: (chunks) => (
                <Text col={colors.textBody} fow={fontWeight.semibold}>
                  {chunks}
                </Text>
              ),
            })}
          </Text>
          {w.tooShort ? <Callout tone="warning" title={t('tooShort')} /> : null}
          <Text
            alignSelf="flex-start"
            col={colors.infoStrong}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.medium}
            textDecorationLine="underline"
            onPress={() => {
              onLeave?.();
              openDoc(LEGAL_DOC.CANCELLATION);
            }}
            accessibilityRole="link"
            suppressHighlighting
          >
            {t('cancelPolicy')}
          </Text>
        </>
      ) : windowsPendingHint ? (
        note(windowsPendingHint)
      ) : null}
    </YStack>
  );
}

/** Figma ô nền xanh `24145:97083`: đệm 8, các dòng cách 4, bo 12. */
const NOTE_PAD = 8;
const NOTE_GAP = 4;
