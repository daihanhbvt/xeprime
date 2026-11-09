import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@xeprime/domain';
import {
  HANDOVER_PREP_ITEM,
  handoverPhotoSlotsFor,
  PAYMENT_KIND,
  type HandoverPhotoSlot,
  type HandoverPrepItem,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { useCreateContract } from '@/features/contracts/hooks/use-contract';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useSetHandoverPrepCheck } from '../hooks/use-booking-extensions';
import type { BookingDetail, BookingHandoverPrep } from '../api';

type PrepKey = 'confirm' | 'documents' | 'rent' | 'deposit' | 'contract' | 'photos' | 'driver';
type ManualCheck = BookingHandoverPrep['manualChecks'][number];

interface PrepRowState {
  key: PrepKey;
  autoDone: boolean;
  manualItem?: HandoverPrepItem;
  manual: ManualCheck | null;
  done: boolean;
}

/** Phần cọc còn thiếu (không âm) — như `depositOutstanding` của web. */
function depositOutstanding(prep: Pick<BookingHandoverPrep, 'depositRequired' | 'depositReceived'>) {
  const left = subtractMoney(prep.depositRequired, prep.depositReceived);
  return isNegativeMoney(left) ? '0' : left;
}

/**
 * Trạng thái từng việc chuẩn bị bàn giao — chép đúng `prepRowStates` của web
 * (`detail/handover-readiness.ts`) để hai client đếm giống nhau.
 */
export function prepRowStates(
  prep: BookingHandoverPrep,
  can: { collect: boolean; contract: boolean },
): PrepRowState[] {
  const manualOf = (item: HandoverPrepItem) =>
    prep.manualChecks.find((check) => check.item === item) ?? null;
  const row = (key: PrepKey, autoDone: boolean, manualItem?: HandoverPrepItem): PrepRowState => {
    const manual = manualItem && !autoDone ? manualOf(manualItem) : null;
    return { key, autoDone, manualItem, manual, done: autoDone || manual !== null };
  };
  return [
    row('confirm', true),
    row('documents', prep.documentsReady, HANDOVER_PREP_ITEM.DOCUMENTS),
    ...(can.collect ? [row('rent', isZeroMoney(prep.rentDueAmount))] : []),
    ...(can.collect && !isZeroMoney(prep.depositRequired)
      ? [row('deposit', isZeroMoney(depositOutstanding(prep)))]
      : []),
    ...(can.contract
      ? [row('contract', prep.contractId != null, HANDOVER_PREP_ITEM.CONTRACT)]
      : []),
    row('photos', prep.pickupPhotoCount >= prep.pickupPhotoRequired, HANDOVER_PREP_ITEM.PHOTOS),
    ...(prep.driverReady == null
      ? []
      : [row('driver', prep.driverReady === true, HANDOVER_PREP_ITEM.DRIVER)]),
  ];
}

/**
 * Góc ảnh bắt buộc còn trống của một biên bản (chưa có biên bản = trống cả bộ) — web
 * `missingPhotoSlots`. Bộ góc theo LOẠI XE: xe máy không bao giờ bị báo thiếu trái/phải.
 */
export function missingPhotoSlots(
  photos: readonly { slot: string }[] | undefined,
  vehicleType: string | null | undefined,
): HandoverPhotoSlot[] {
  const filled = new Set((photos ?? []).map((photo) => photo.slot));
  return handoverPhotoSlotsFor(vehicleType).filter((slot) => !filled.has(slot));
}

/**
 * "CHUẨN BỊ BÀN GIAO" — bản native của `HandoverPrepCard` (web, 03/11/2026). Trạng thái do SERVER
 * suy (`booking.handoverPrep`); giấy tờ, hợp đồng, ảnh, tài xế đánh dấu TAY được bằng vòng tròn của
 * dòng khi việc diễn ra ngoài hệ thống. Hai việc TIỀN không đánh dấu tay — "Xác nhận đã thu" ghi một
 * phiếu thu thật ở lối thu tiền của màn đơn. Tuyến hoa hồng không có hai dòng tiền (`can.collect`).
 */
export function HandoverPrepCard({
  booking,
  can,
}: {
  booking: BookingDetail;
  can: { collect: boolean; contract: boolean; markPrep: boolean; documents: boolean; managePhotos: boolean };
}) {
  const t = useTranslations('Bookings.detailPage.prep');
  const colors = useColors();
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const setCheck = useSetHandoverPrepCheck(booking.id);
  const navigateOnce = useNavigateOnce();
  const createContract = useCreateContract();
  const [collecting, setCollecting] = useState<'rent' | 'deposit' | null>(null);
  const prep = booking.handoverPrep;
  if (!prep) return null;

  /*
   * Nút cuối dòng mở ĐÚNG lối đã có trên màn đơn (web `HandoverPrepCard`): giấy tờ → sổ khách,
   * thu tiền / thu cọc → tấm ghi phiếu thu, hợp đồng → tạo (idempotent) rồi mở, ảnh → biên bản.
   */
  const openContract = () =>
    createContract.mutate(booking.id, {
      onSuccess: (contract) => navigateOnce(ROUTES.manage.contract(contract.id)),
      onError: (err) => toast.showError(errorMessage(err)),
    });
  const actionOf = (key: PrepKey): ReactNode => {
    switch (key) {
      case 'documents':
        return can.documents && booking.tenantCustomerId ? (
          <RowAction
            label={t('documentsAction')}
            onPress={() => navigateOnce(ROUTES.manage.customerDetail(booking.tenantCustomerId!))}
          />
        ) : null;
      case 'rent':
        return isZeroMoney(prep.rentDueAmount) ? null : (
          <RowAction label={t('collectAction')} onPress={() => setCollecting('rent')} />
        );
      case 'deposit':
        return isZeroMoney(depositOutstanding(prep)) ? null : (
          <RowAction label={t('collectAction')} onPress={() => setCollecting('deposit')} />
        );
      case 'contract':
        return (
          <RowAction
            label={prep.contractId ? t('contractView') : t('contractCreate')}
            loading={createContract.isPending}
            onPress={openContract}
          />
        );
      case 'photos':
        return can.managePhotos ? (
          <RowAction
            label={t('photosAction')}
            onPress={() => navigateOnce(ROUTES.manage.handoverPhotos(booking.id))}
          />
        ) : null;
      default:
        return null;
    }
  };

  const bold = (chunks: ReactNode) => <Text fow={fontWeight.bold}>{chunks}</Text>;
  const bodies: Record<PrepKey, { title: string; body: ReactNode }> = {
    confirm: {
      title: t('confirm'),
      body: [booking.customerName, booking.customerPhone].filter(Boolean).join(' · '),
    },
    documents: {
      title: t('documents'),
      body: prep.documentsReady ? t('documentsDone') : t('documentsPending'),
    },
    rent: {
      title: t('rent'),
      body: isZeroMoney(prep.rentDueAmount)
        ? t('rentDone')
        : t.rich('rentPending', { amount: fmt.money(prep.rentDueAmount), b: bold }),
    },
    deposit: {
      title: t('deposit'),
      body: isZeroMoney(depositOutstanding(prep))
        ? t('depositDone', { amount: fmt.money(prep.depositReceived) })
        : isZeroMoney(prep.depositReceived)
          ? t.rich('depositPending', { amount: fmt.money(prep.depositRequired), b: bold })
          : t.rich('depositPartial', {
              received: fmt.money(prep.depositReceived),
              amount: fmt.money(depositOutstanding(prep)),
              b: bold,
            }),
    },
    contract: {
      title: t('contract'),
      body: prep.contractSigned
        ? t('contractSigned')
        : prep.contractId
          ? t('contractDraft')
          : t('contractNone'),
    },
    photos: {
      title: t('photos'),
      body:
        prep.pickupPhotoCount >= prep.pickupPhotoRequired
          ? t('photosDone')
          : t('photosPending', { count: prep.pickupPhotoCount, total: prep.pickupPhotoRequired }),
    },
    driver: {
      title: t('driver'),
      body: prep.driverReady ? t('driverDone') : t('driverPending'),
    },
  };

  const rows = prepRowStates(prep, can);
  const done = rows.filter((row) => row.done).length;

  const toggle = (item: HandoverPrepItem, checked: boolean) => {
    if (setCheck.isPending) return;
    setCheck.mutate({ item, checked }, { onError: (err) => toast.showError(errorMessage(err)) });
  };

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>
        <XStack ai="center" gap={space.sm}>
          <YStack f={1}>
            <ProgressBar percent={rows.length === 0 ? 0 : (done / rows.length) * 100} size="sm" />
          </YStack>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('progress', { done, total: rows.length })}
          </Text>
        </XStack>
        {rows.map((row) => {
          const { title, body } = bodies[row.key];
          const togglable = row.manualItem != null && (row.manual || !row.done) && can.markPrep;
          const mark = (
            <YStack
              w={22}
              h={22}
              br={radius.pill}
              ai="center"
              jc="center"
              bw={row.done ? 0 : 1.5}
              bc={colors.borderInput}
              bg={row.done ? colors.success : 'transparent'}
            >
              {row.done ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
            </YStack>
          );
          return (
            <XStack key={row.key} ai="flex-start" gap={space.sm} py={space.xs}>
              {togglable ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: row.manual !== null, disabled: setCheck.isPending }}
                  accessibilityLabel={
                    row.manual ? t('unmark', { item: title }) : t('markDone', { item: title })
                  }
                  hitSlop={space.sm}
                  disabled={setCheck.isPending}
                  onPress={() => toggle(row.manualItem!, row.manual === null)}
                >
                  {mark}
                </Pressable>
              ) : (
                mark
              )}
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {title}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {body}
                </Text>
                {row.manual ? (
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {row.manual.checkedByName
                      ? t('manualBy', {
                          name: row.manual.checkedByName,
                          time: fmt.shortDateTime(row.manual.checkedAt),
                        })
                      : t('manualByUnknown', { time: fmt.shortDateTime(row.manual.checkedAt) })}
                  </Text>
                ) : null}
              </YStack>
              {actionOf(row.key)}
            </XStack>
          );
        })}
      </YStack>
      {collecting ? (
        <RecordPaymentSheet
          open
          onClose={() => setCollecting(null)}
          bookingId={booking.id}
          {...(collecting === 'deposit'
            ? { kind: PAYMENT_KIND.DEPOSIT, debtAmount: depositOutstanding(prep) }
            : { debtAmount: booking.debtAmount })}
        />
      ) : null}
    </Card>
  );
}

function RowAction({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Button
      label={label}
      variant="outline"
      size="sm"
      block={false}
      loading={loading}
      onPress={onPress}
    />
  );
}
