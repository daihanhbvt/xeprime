import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS, PERMISSION, type BookingStatus } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useHandoverContext } from '@/features/handovers/hooks/use-handovers';
import type { Handover } from '@/features/handovers/api';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { toAppTz } from '@xeprime/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * "QUẢN LÝ CHUYẾN ĐI" — bản native của `BookingOperationPanel`: kể chuyến đã đi tới đâu và chặng
 * kế là gì.
 *
 * **KHÔNG chứa nút xác nhận** — hành động chính sống ở thanh dính đáy, để cả màn chỉ có đúng MỘT
 * chỗ bấm cho một việc. Hai nơi cùng đọc `useHandoverContext` nên dùng chung một query.
 *
 * Cùng nhánh với web: thiếu quyền xem thì GIỮ thẻ và nói thiếu quyền gì; lỗi tải dịch theo MÃ
 * (`useErrorMessage`); thiếu `handovers.confirm` thì nói rõ vì sao không có nút chốt bàn giao.
 */
export function BookingTripCard({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: BookingStatus;
}) {
  const t = useTranslations('Bookings.trip');
  const tActions = useTranslations('Common.actions');
  const tPermission = useTranslations('ManageCommon.permission');
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = permissions.has(PERMISSION.HANDOVER_CONFIRM);
  const query = useHandoverContext(bookingId, canView);

  if (!canView) {
    return (
      <Card>
        <Callout tone="warning" title={t('forbiddenTitle')}>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {`${t('forbiddenBody')}
${tPermission('requires')} ${PERMISSION.HANDOVER_VIEW}`}
          </Text>
        </Callout>
      </Card>
    );
  }

  if (query.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <CardTitle>{t('title')}</CardTitle>
          <SkeletonText lines={2} />
        </YStack>
      </Card>
    );
  }

  /*
   * Lỗi tải KHÔNG được nuốt im: thẻ biến mất thì người trực tưởng đơn chưa có gì để bàn giao.
   * Web `BookingOperationPanel` giữ thẻ, nói lý do (dịch theo MÃ lỗi) và cho thử lại.
   */
  if (query.isError) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <CardTitle>{t('title')}</CardTitle>
          <Callout tone="danger" title={t('loadError')}>
            <YStack gap={space.xs}>
              <Text col={colors.danger} fos={fontSize.bodySm}>
                {errorMessage(query.error)}
              </Text>
              <XStack>
                <Button
                  label={tActions('retry')}
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={() => void query.refetch()}
                />
              </XStack>
            </YStack>
          </Callout>
        </YStack>
      </Card>
    );
  }

  const context = query.data;
  if (!context) return null;

  const pickup = context.pickup;
  const returned = context.return;
  const ended =
    bookingStatus === BOOKING_STATUS.CANCELLED || bookingStatus === BOOKING_STATUS.NO_SHOW;

  /** Chặng kế tiếp — CHỈ để kể trạng thái; nút bấm nằm ở thanh hành động. */
  const next = !pickup?.confirmedAt
    ? t('notStarted')
    : !returned?.confirmedAt
      ? t('inProgress')
      : null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle>{t('title')}</CardTitle>

        {/*
          Mốc hiện ra là `occurredAt` (GIỜ BÀN GIAO THẬT), không phải `confirmedAt` (giờ bấm nút):
          giao xe ngoài bãi rồi 20 phút sau mới xác nhận là chuyện thường, và số đó còn đi vào tính
          phí ngoài giờ. Điều kiện HIỆN vẫn là `confirmedAt` vì nháp chưa có mốc nào để kể; lùi về
          `confirmedAt` cho biên bản cũ chưa có `occurredAt`.
        */}
        {pickup?.confirmedAt ? <Milestone handover={pickup} kind="pickup" /> : null}
        {returned?.confirmedAt ? <Milestone handover={returned} kind="return" /> : null}

        {/* Đơn huỷ / không đến: nói ra thay vì mời xác nhận giao xe cho một đơn không bao giờ giao. */}
        {ended ? <Notice tone="info">{t('ended')}</Notice> : next ? <Notice>{next}</Notice> : null}

        {!ended && next && !canConfirm ? (
          <Callout tone="info" title={t('confirmForbiddenTitle')}>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('confirmForbiddenBody')}
            </Text>
          </Callout>
        ) : null}
      </YStack>
    </Card>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
      {children}
    </Text>
  );
}

/**
 * Một mốc đã xác nhận — đúng `HandoverBanner` bên web: "{Đã giao xe} lúc {giờ}", dòng Odo, ghi chú.
 *
 * Giờ là `occurredAt` (GIỜ BÀN GIAO THẬT), lùi về `confirmedAt` cho biên bản cũ. Odo `null` KHÁC
 * HẲN 0: không đọc được đồng hồ là sự thật cần nói, "0 km" là con số sai.
 */
function Milestone({ handover, kind }: { handover: Handover; kind: 'pickup' | 'return' }) {
  const t = useTranslations('Bookings.trip');
  const fmt = useAppFormat();

  const at = handover.occurredAt ?? handover.confirmedAt;
  const when = at ? fmt.rentalPoint(toAppTz(at)) : '';
  const action = kind === 'pickup' ? t('pickedUp') : t('returned');
  const odo =
    handover.odometerKm != null
      ? t('odometerRecorded', { km: fmt.km(handover.odometerKm) })
      : t('noOdometer');

  return (
    <XStack ai="flex-start" gap={space.sm} p={space.sm} br={radius.md} bg={colors.successSurface}>
      <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} />
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('doneAt', { action, when })}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {odo}
        </Text>
        {handover.notes ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {handover.notes}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

function Notice({ children, tone = 'default' }: { children: string; tone?: 'default' | 'info' }) {
  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      p={space.sm}
      br={radius.md}
      bg={tone === 'info' ? colors.infoSurface : colors.surfaceMuted}
    >
      <Ionicons
        name="information-circle-outline"
        size={iconSize.sm}
        color={tone === 'info' ? colors.info : colors.textMuted}
      />
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}
