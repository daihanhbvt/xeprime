import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEPOSIT_STATUS_META,
  PERMISSION,
  SURCHARGE_CATEGORY_META,
  type DepositStatus,
  type SurchargeCategory,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { RefundSheet } from './components/RefundSheet';
import { SurchargeSheet } from './components/SurchargeSheet';
import { useAddSurcharge, useSettlement, useVoidSurcharge } from './hooks/use-settlement';
import type { BookingSettlement, BookingSurcharge } from './api';

/**
 * Quyết toán cuối chuyến (BKG-10, 11).
 *
 * Hai cặp con số dễ nhầm nhất, và màn này tách chúng ra tường minh:
 *
 * - `depositRequired` = mức cọc **đơn khai** — CHƯA chắc đã thu.
 * - `depositReceived` = cọc **thật sự đã thu**.
 *
 * Gộp hai giá trị đó lại là chỗ chủ xe hoàn một khoản họ chưa từng nhận. Cả `proposedRefund`
 * lẫn `additionalDue` đều do SERVER tính từ cặp này; không dòng nào ở đây cộng trừ tiền.
 */
export function SettlementScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings.settlement');
  const router = useRouter();
  const query = useSettlement(bookingId);

  const back = () => goBackOr(router, ROUTES.manage.bookingDetail(bookingId));
  const refreshing = query.isRefetching;
  const onRefresh = () => void query.refetch();

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
          <YStack gap={layout.section}>
            <Skeleton height={140} />
            <SkeletonText lines={4} />
            <Skeleton height={120} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('errorTitle')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <SettlementBody
      bookingId={bookingId}
      settlement={query.data}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={back}
    />
  );
}

function SettlementBody({
  bookingId,
  settlement,
  refreshing,
  onRefresh,
  onBack,
}: {
  bookingId: string;
  settlement: BookingSettlement;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Bookings.settlement');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const [recording, setRecording] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const addSurcharge = useAddSurcharge(bookingId);
  const voidSurcharge = useVoidSurcharge(bookingId);

  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);
  const canVoid = permissions.has(PERMISSION.PAYMENT_VOID);
  const depositStatus = settlement.depositStatus as DepositStatus;
  const depositMeta = DEPOSIT_STATUS_META[depositStatus];

  return (
    <>
      <AppHeader title={t('title')} onBack={onBack} />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          <Card>
            <YStack gap={space.sm}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('title')}
                </Text>
                <StatusBadge
                  label={domainLabel('depositStatus', depositStatus, depositMeta.label)}
                  color={depositMeta.color}
                  size="sm"
                />
              </XStack>

              {/*
                Hai dòng cọc KHÔNG được gộp: "đơn khai 3 triệu" và "đã thu 0" là hai sự thật khác
                nhau, và gộp lại là chỗ chủ xe hoàn một khoản họ chưa từng nhận.
              */}
              <DataRow
                label={t('depositRequired')}
                hint={t('depositRequiredHint')}
                value={fmt.money(settlement.depositRequired)}
                tone="muted"
              />
              <DataRow
                label={t('depositReceived')}
                value={fmt.money(settlement.depositReceived)}
                strong
              />
              <DataRow label={t('surchargeTotal')} value={fmt.money(settlement.surchargeTotal)} />

              <Divider />

              <DataRow
                label={t('proposedRefund')}
                value={fmt.money(settlement.proposedRefund)}
                strong
              />
              {isZeroMoney(settlement.additionalDue) ? null : (
                <DataRow
                  label={t('additionalDue')}
                  hint={t('additionalDueHint')}
                  value={fmt.money(settlement.additionalDue)}
                  tone="danger"
                  strong
                />
              )}

              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('formulaNote')}
              </Text>
            </YStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('surcharges.title')}
              </Text>

              {settlement.surcharges.length === 0 ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('surcharges.empty')}
                </Text>
              ) : (
                settlement.surcharges.map((row) => (
                  <SurchargeRow
                    key={row.id}
                    surcharge={row}
                    canRemove={canVoid}
                    loading={voidSurcharge.isPending}
                    onRemove={() =>
                      voidSurcharge.mutate(
                        { id: row.id, reason: t('surcharges.removeReason') },
                        {
                          onSuccess: () => toast.showSuccess(t('surcharges.removeSuccess')),
                          onError: (error) => toast.showError(errorMessage(error)),
                        },
                      )
                    }
                  />
                ))
              )}

              {canRecord ? (
                <Button
                  label={t('surcharges.add')}
                  variant="secondary"
                  icon="add-circle-outline"
                  onPress={() => setRecording(true)}
                />
              ) : null}
            </YStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('refund.title')}
              </Text>

              {settlement.refund ? (
                <>
                  <DataRow
                    label={t('refund.amountLabel')}
                    value={fmt.money(settlement.refund.refundAmount)}
                    strong
                  />
                  <DataRow
                    label={t('refund.methodLabel')}
                    value={domainLabel('refundMethod', settlement.refund.refundMethod)}
                  />
                  <DataRow
                    label={t('refund.noteLabel')}
                    value={fmt.dateTime(settlement.refund.refundedAt)}
                  />
                  {settlement.refund.recordedByName ? (
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {t('refund.recordedBy', { name: settlement.refund.recordedByName })}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('refund.disclaimer')}
              </Text>

              {/*
                Ghi nhận hoàn cần `payments.record`; ĐIỀU CHỈNH một bản ghi đã có cần
                `payments.void` — sửa một con số tiền đã ghi sổ là quyền khác hẳn với ghi mới.
              */}
              {settlement.refund ? (
                canVoid ? (
                  <Button
                    label={t('refund.correct')}
                    variant="secondary"
                    onPress={() => setRefunding(true)}
                  />
                ) : null
              ) : canRecord ? (
                <Button label={t('refund.record')} onPress={() => setRefunding(true)} />
              ) : null}
            </YStack>
          </Card>
        </YStack>
      </Screen>

      {recording ? (
        <SurchargeSheet
          open
          onClose={() => setRecording(false)}
          overtime={settlement.overtime}
          loading={addSurcharge.isPending}
          onConfirm={(body) =>
            addSurcharge.mutate(body, {
              onSuccess: () => {
                toast.showSuccess(t('surcharges.addSuccess'));
                setRecording(false);
              },
              onError: (error) => toast.showError(errorMessage(error)),
            })
          }
        />
      ) : null}

      {/*
        Mount CÓ ĐIỀU KIỆN, không phải `open={...}` trên một cây luôn sống.
        
        `useForm` chốt `defaultValues` ở lần render ĐẦU TIÊN. Mount sẵn nghĩa là số tiền hoàn
        mặc định bị đóng băng ở `proposedRefund` lúc mở màn — thêm một khoản phụ phí xong rồi
        mở tấm hoàn cọc sẽ thấy con số TRƯỚC khi trừ phụ phí, và bấm là ghi sổ đúng con số sai đó.
      */}
      {refunding ? (
        <RefundSheet
          open
          onClose={() => setRefunding(false)}
          bookingId={bookingId}
          settlement={settlement}
          onDone={() => setRefunding(false)}
        />
      ) : null}
    </>
  );
}

function SurchargeRow({
  surcharge,
  canRemove,
  loading,
  onRemove,
}: {
  surcharge: BookingSurcharge;
  canRemove: boolean;
  loading: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations('Bookings.settlement.surcharges');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const meta = SURCHARGE_CATEGORY_META[surcharge.category as SurchargeCategory];

  return (
    <YStack gap={space.xs} py={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <StatusBadge
          label={domainLabel('surchargeCategory', surcharge.category, meta.label)}
          color={meta.color}
          size="sm"
        />
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {fmt.money(surcharge.amount)}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {surcharge.reason}
      </Text>
      {surcharge.createdByName ? (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('recordedBy', {
            name: surcharge.createdByName,
            time: fmt.dateTime(surcharge.createdAt),
          })}
        </Text>
      ) : null}
      {/*
        Chỉ GỠ, không sửa — web không có đường sửa một khoản đã ghi, và đó là quyết định đúng:
        một khoản tiền đã vào sổ thì sửa nó tại chỗ là mất dấu con số cũ. Ghi sai thì gỡ rồi ghi
        lại, và nhật ký giữ cả hai bước.

        Lý do gỡ là chuỗi CỐ ĐỊNH (`removeReason`) đúng như web, không hỏi người dùng.
      */}
      {canRemove ? (
        <XStack>
          <Button
            label={t('remove')}
            variant="ghost"
            block={false}
            loading={loading}
            onPress={onRemove}
          />
        </XStack>
      ) : null}
    </YStack>
  );
}
