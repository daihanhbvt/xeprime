import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isBookingRequestPastDue, LONG_TERM_PACKAGE_MONTHS, SERVICE_TYPE } from '@xeprime/types';
import type { Dayjs } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { Chip } from '@/components/ui/Chip';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fieldFontSize, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { ApproveBookingRequestInput, BookingRequestItem } from '../api';

/**
 * Duyệt yêu cầu — hai hình thái, cùng một tấm.
 *
 * **Theo ngày**: lịch đã có trong yêu cầu, chỉ xác nhận (body rỗng).
 * **Dài hạn**: BẮT BUỘC chọn `scheduledPickupAt`; ngày trả do SERVER tính bằng tháng lịch nên tấm
 * này không có ô ngày trả và không nhân `số tháng × 30` để đoán trước (ADR 0011).
 *
 * Quá hạn thì so `respondBy` chứ không so cột `status`: worker ghi `expired` trễ một nhịp, và cửa
 * sổ đó là một lỗ để duyệt yêu cầu đã chết.
 */
export function ApproveRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestItem;
  onConfirm: (body?: ApproveBookingRequestInput) => void;
  loading: boolean;
}) {
  const t = useTranslations('BookingRequests');
  const fmt = useAppFormat();

  const longTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const pastDue = isBookingRequestPastDue(request.respondBy);

  const [pickupAt, setPickupAt] = useState<Dayjs | null>(null);
  const [packageMonths, setPackageMonths] = useState<number | null>(
    request.longTermPackageMonths ?? null,
  );
  const [picking, setPicking] = useState(false);

  const ready = !pastDue && (!longTerm || Boolean(pickupAt && packageMonths));

  function confirm() {
    if (!longTerm) {
      onConfirm();
      return;
    }
    if (!pickupAt || !packageMonths) return;
    onConfirm({
      scheduledPickupAt: pickupAt.toISOString(),
      longTermPackageMonths: packageMonths as ApproveBookingRequestInput['longTermPackageMonths'],
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={longTerm ? t('longTerm.title') : t('approve.title')}
      footer={
        <Button
          label={t('approve.confirm')}
          loading={loading}
          disabled={!ready}
          onPress={confirm}
        />
      }
    >
      {pastDue ? (
        <YStack bg={colors.dangerSurface} p={space.md} br={radius.md}>
          <Text col={colors.danger} fos={fontSize.bodySm}>
            {t('approve.expired')}
          </Text>
        </YStack>
      ) : null}

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <DataRow label={t('approve.vehicle')} value={request.vehicleName} />
          <DataRow
            label={t('approve.customer')}
            value={`${request.customerName} · ${request.customerPhone}`}
          />
          {longTerm ? (
            <DataRow label={t('longTerm.pickupWish')} value={fmt.pickupWish(request)} />
          ) : request.pickupAt && request.returnAt ? (
            <DataRow
              label={t('approve.schedule')}
              value={fmt.shortDateTimeRange(request.pickupAt, request.returnAt)}
            />
          ) : null}
        </YStack>
      </Card>

      {longTerm ? (
        <>
          {/* Yêu cầu LEGACY không mang gói: cố ý KHÔNG suy từ khoảng ngày cũ, gian hàng tự chọn. */}
          {request.longTermPackageMonths ? (
            <DataRow
              label={t('longTerm.chosenPackageLabel')}
              value={fmt.packageLabel(request.longTermPackageMonths) ?? ''}
            />
          ) : (
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('longTerm.legacyPackageLabel')}
              </Text>
              <XStack gap={space.xs} flexWrap="wrap">
                {LONG_TERM_PACKAGE_MONTHS.map((months) => (
                  <Chip
                    key={months}
                    label={fmt.packageLabel(months) ?? String(months)}
                    selected={packageMonths === months}
                    size="sm"
                    onPress={() => setPackageMonths(months)}
                  />
                ))}
              </XStack>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('longTerm.legacyPackageHint')}
              </Text>
            </YStack>
          )}

          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fieldFontSize.label} fow={fontWeight.semibold}>
              {t('longTerm.pickupLabel')}
            </Text>
            <Card onPress={() => setPicking(true)} accessibilityLabel={t('longTerm.pickupLabel')}>
              <Text
                col={pickupAt ? colors.text : colors.placeholder}
                fos={fieldFontSize.value}
                fow={fontWeight.medium}
              >
                {pickupAt ? fmt.rentalPoint(pickupAt) : t('longTerm.pickupPlaceholder')}
              </Text>
            </Card>
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {t('longTerm.pickupHint')}
            </Text>
            {/* KHÔNG in ngày trả: nó = ngày nhận + N THÁNG LỊCH do server tính, client tự cộng sẽ sai (ADR 0011). */}
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {t('longTerm.returnHint')}
            </Text>
          </YStack>

          {/* Dùng lại tấm chọn khoảng thuê nhưng chỉ lấy đầu NHẬN — tấm đòi đủ hai đầu, đầu trả bị bỏ qua. */}
          <RentalRangeSheet
            open={picking}
            value={{ pickupAt, returnAt: pickupAt?.add(1, 'day') ?? null }}
            mode="daily"
            onChange={(next) => setPickupAt(next.pickupAt)}
            onModeChange={() => undefined}
            onApply={() => setPicking(false)}
            onCancel={() => setPicking(false)}
          />
        </>
      ) : null}

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('approve.effect')}
      </Text>
      {request.deliveryRequested ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('approve.deliveryNote')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}
