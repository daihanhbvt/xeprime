import { memo, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { telHref, toAppTz } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useBooking } from '@/features/bookings/hooks/use-bookings';
import {
  RENTAL_STAGE_TONE,
  rentalStageOfBookingStatus,
} from '@/features/bookings/rental-stages';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { mixHex } from '@/theme/color-mix';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource } from '../api';
import { serviceAccent, stageFill } from '../calendar-tone';

/** Thân tấm: khối khách ↔ khối dòng cách 12, các dòng cách 8 (Figma "Filter Form" `24729:79076`). */
const BODY_GAP = 12;
const ROW_GAP = 8;
const BADGE_PAD_X = 8;
const DOT = 6;

export interface QuickBookingTarget {
  event: CalendarEvent;
  resource: CalendarResource;
}

/**
 * "Chi tiết nhanh đơn" - Figma Lịch thuê xe (`24729:79063`). Chạm thẻ ĐƠN trên lịch mở tấm này
 * (người dùng chốt 27/11/2026); yêu cầu chờ duyệt vẫn đi thẳng vào màn duyệt.
 *
 * Mọi con số đọc từ CHÍNH event của lịch (mã, tiền, giờ nhận/trả, tên khách, `paidPercent` server
 * tính) - không tính lại gì. SĐT là thứ duy nhất phải hỏi thêm: nó đến từ `GET /bookings/:id`, nơi
 * server đã áp cổng liên hệ của ADR 0056 - không có SĐT thì không có nút "Liên hệ khách".
 *
 * Viên tiền: Figma ghi "Đã cọc giữ chỗ" - ADR 0044 cấm gọi tiền giữ chỗ là "cọc", nên viên nói
 * đúng trạng thái thu tiền như dấu trên thẻ lịch ("Đã thu đủ" · "Đã thu n%" · "Chưa thu").
 */
export const QuickBookingSheet = memo(function QuickBookingSheet({
  target,
  onClose,
  onOpenDetail,
}: {
  target: QuickBookingTarget | null;
  onClose: () => void;
  onOpenDetail: (bookingId: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const tBoard = useTranslations('Bookings.board');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const event = target?.event ?? null;
  const resource = target?.resource ?? null;
  const bookingId = event?.sourceId ?? '';
  const detail = useBooking(bookingId, target !== null);
  const phone = detail.data?.customerPhone ?? null;
  const tel = telHref(phone);

  const stage = event ? rentalStageOfBookingStatus(event.status) : null;
  const stageColor = stage ? stageFill(RENTAL_STAGE_TONE[stage], colors) : colors.placeholder;
  const stageText = stage
    ? tBoard(`stage.${stage}`)
    : event?.status
      ? domainLabel('bookingStatus', event.status)
      : null;

  const accent = serviceAccent(event?.serviceType, colors);
  const paidPercent = event?.paidPercent ?? null;
  const paidLabel =
    paidPercent == null
      ? null
      : paidPercent >= 100
        ? t('event.paidFull')
        : paidPercent > 0
          ? t('event.paidPartial', { percent: paidPercent })
          : t('event.unpaid');

  const plate = resource?.plateNumber ?? resource?.code ?? null;

  return (
    <BottomSheet
      open={target !== null}
      onClose={onClose}
      title={t('quick.title')}
      chrome="v2"
      headerDivider
      headerAction={
        stageText ? (
          <XStack
            ai="center"
            gap={6}
            px={BADGE_PAD_X}
            py={2}
            br={radius.pill}
            bg={mixHex(stageColor, colors.surface, 0.08)}
            bw={1}
            bc={mixHex(stageColor, colors.surface, 0.5)}
          >
            <YStack w={DOT} h={DOT} br={DOT / 2} bg={stageColor} />
            <Text
              col={stageColor}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
            >
              {stageText}
            </Text>
          </XStack>
        ) : undefined
      }
      footer={
        event?.sourceId ? (
          <XStack gap={12}>
            {tel ? (
              <YStack flexShrink={0}>
                <Button
                  label={t('quick.contact')}
                  variant="neutral"
                  onPress={() => void Linking.openURL(tel)}
                />
              </YStack>
            ) : null}
            <YStack f={1}>
              <Button
                label={t('quick.detail')}
                variant="gradient"
                onPress={() => onOpenDetail(event.sourceId as string)}
              />
            </YStack>
          </XStack>
        ) : undefined
      }
    >
      {event ? (
        <YStack gap={BODY_GAP}>
          <YStack gap={2}>
            <XStack ai="flex-start" jc="space-between" gap={8}>
              <Text
                f={1}
                minWidth={0}
                col={colors.text}
                fos={typeScale.title.fontSize}
                lh={typeScale.title.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={2}
              >
                {event.customerName ?? t('event.customerHidden')}
              </Text>
              {event.serviceType ? (
                <YStack
                  px={BADGE_PAD_X}
                  py={2}
                  br={radius.pill}
                  bg={accent.wash}
                  bw={1}
                  bc={mixHex(accent.accent, colors.surface, 0.45)}
                >
                  <Text
                    col={accent.accent}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {domainLabel('serviceType', event.serviceType)}
                  </Text>
                </YStack>
              ) : null}
            </XStack>
            <XStack ai="center" gap={10} flexWrap="wrap">
              {phone ? (
                <Text
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.regular}
                >
                  {phone}
                </Text>
              ) : null}
              {event.code ? (
                <Text
                  col={colors.placeholder}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.regular}
                  fontStyle="italic"
                >
                  {`#${event.code}`}
                </Text>
              ) : null}
            </XStack>
          </YStack>

          <YStack gap={ROW_GAP} ai="flex-end">
            <InfoRow label={t('quick.vehicle')}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {resource?.name ?? event.title}
                {plate ? (
                  <>
                    <Text col={colors.borderInput} fow={fontWeight.medium}>
                      {'  |  '}
                    </Text>
                    <Text col={colors.placeholder} fow={fontWeight.medium}>
                      {plate}
                    </Text>
                  </>
                ) : null}
              </Text>
            </InfoRow>
            <InfoRow label={t('quick.pickup')} value={fmt.rentalPoint(toAppTz(event.startAt))} />
            <InfoRow label={t('quick.return')} value={fmt.rentalPoint(toAppTz(event.endAt))} />
            {event.amount ? <InfoRow label={t('quick.amount')} value={fmt.money(event.amount)} /> : null}
            {paidLabel ? (
              <YStack
                px={BADGE_PAD_X}
                py={2}
                br={6}
                bg={paidPercent != null && paidPercent > 0 ? colors.infoLow : colors.surfaceMuted}
              >
                <Text
                  col={paidPercent != null && paidPercent > 0 ? colors.infoStrong : colors.textMuted}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                >
                  {paidLabel}
                </Text>
              </YStack>
            ) : null}
          </YStack>
        </YStack>
      ) : null}
    </BottomSheet>
  );
});

/** Một dòng "nhãn ⟷ giá trị" (Figma "Text and supporting text" `24729:79095`): nhãn 14/20 `text/gray/low`, giá trị 14/20 medium. */
function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack alignSelf="stretch" ai="center" jc="space-between" gap={12}>
      <Text
        flexShrink={0}
        col={colors.placeholder}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.regular}
      >
        {label}
      </Text>
      <YStack f={1} minWidth={0} ai="flex-end">
        {children ?? (
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
      </YStack>
    </XStack>
  );
}
