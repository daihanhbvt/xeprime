import { useState, type ReactNode } from 'react';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Linking, Pressable } from 'react-native';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { CheckMark } from '@/components/ui/CheckMark';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, isZeroMoney, subtractMoney, telHref } from '@xeprime/domain';
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
import { SectionHeader } from '@/components/ui/CardTitle';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
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
  onDocuments,
  onPhotos,
  embedded = false,
}: {
  booking: BookingDetail;
  /** Nằm trong thẻ tab của màn chi tiết (Figma `24158:103159`): không khung, không tiêu đề. */
  embedded?: boolean;
  can: { collect: boolean; contract: boolean; markPrep: boolean; documents: boolean; managePhotos: boolean };
  /** Mở giấy tờ khách NGAY trên đơn (web `BookingCustomerDocumentsDialog`). */
  onDocuments: () => void;
  /** Cuộn tới khối ảnh bàn giao trong trang - khối đó tự tạo nháp biên bản khi chụp (web). */
  onPhotos: () => void;
}) {
  const t = useTranslations('Bookings.detailPage.prep');
  const colors = useColors();
  const fmt = useAppFormat();
  const toast = useAppToast();
  const tApp = useTranslations('Bookings.detailPage.prep.partnerApp');
  const tCall = useTranslations('BookingRequests.actions');
  /*
   * App: dòng xác nhận chỉ còn nút GỌI như Figma (người dùng chốt 20/11/2026); nhắn tin / Zalo vẫn có
   * ở thẻ đơn ngoài danh sách. Không SĐT thì không nút.
   */
  const tel = telHref(booking.customerPhone);
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
      case 'confirm':
        return tel ? (
          <RowAction
            label={tCall('callAria', { name: booking.customerName, phone: booking.customerPhone ?? '' })}
            icon="calling"
            onPress={() => void Linking.openURL(tel)}
          />
        ) : null;
      case 'documents':
        return can.documents && booking.tenantCustomerId ? (
          <RowAction label={t('documentsAction')} icon="edit" onPress={onDocuments} />
        ) : null;
      case 'rent':
        return isZeroMoney(prep.rentDueAmount) ? null : (
          <RowAction label={t('collectAction')} icon="tick" onPress={() => setCollecting('rent')} />
        );
      case 'deposit':
        return isZeroMoney(depositOutstanding(prep)) ? null : (
          <RowAction label={t('collectAction')} icon="tick" onPress={() => setCollecting('deposit')} />
        );
      case 'contract':
        return (
          <RowAction
            label={prep.contractId ? t('contractView') : t('contractCreate')}
            icon={prep.contractId ? 'eye' : 'plus'}
            loading={createContract.isPending}
            onPress={openContract}
          />
        );
      case 'photos':
        return can.managePhotos ? (
          <RowAction label={t('photosAction')} icon="upload" onPress={onPhotos} />
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
      // App: câu ngắn như Figma ("Chưa có GPLX / CCCD"); web giữ câu dài.
      body: prep.documentsReady ? t('documentsDone') : tApp('documentsPending'),
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
          : tApp('photosPending'),
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

  const content = (
      <YStack gap={embedded ? 0 : space.sm}>
        {embedded ? null : <SectionHeader icon="document-text-outline">{t('title')}</SectionHeader>}
        {/* Figma (tab "Chuẩn bị") không có dòng tiến độ - chỉ thẻ đứng riêng mới vẽ (người dùng 20/11/2026). */}
        {embedded ? null : (
          <XStack ai="center" gap={space.sm}>
            <YStack f={1}>
              <ProgressBar percent={rows.length === 0 ? 0 : (done / rows.length) * 100} size="sm" />
            </YStack>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('progress', { done, total: rows.length })}
            </Text>
          </XStack>
        )}
        {rows.map((row, index) => {
          const { title, body } = bodies[row.key];
          const togglable = row.manualItem != null && (row.manual || !row.done) && can.markPrep;
          // Figma "_Checkbox base" (check circle): đã xong = tròn vàng, dấu tích trắng - `CheckMark` chung.
          const mark = <CheckMark checked={row.done} shape="circle" />;
          return (
            <XStack
              key={row.key}
              ai="center"
              gap={12}
              py={embedded ? space.sm : space.xs}
              {...(embedded && index > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : {})}
            >
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
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={2}>
                  {title}
                </Text>
                <Text col={colors.placeholder} fos={fontSize.body}>
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
  );
  const sheet = collecting ? (
        <RecordPaymentSheet
          open
          onClose={() => setCollecting(null)}
          bookingId={booking.id}
          {...(collecting === 'deposit'
            ? { kind: PAYMENT_KIND.DEPOSIT, debtAmount: depositOutstanding(prep) }
            : // Phần khách còn đưa TẬN TAY (web `openPay`): `D` trả trước qua XePrime không đòi lại ở quầy.
              { debtAmount: booking.counterDueAmount, counterDue: true })}
        />
      ) : null;
  return embedded ? (
    <>
      {content}
      {sheet}
    </>
  ) : (
    <Card>
      {content}
      {sheet}
    </Card>
  );
}

/** Figma: nút vuông 36 chỉ icon ở cuối dòng việc - nhãn đọc cho trình đọc màn hình. */
function RowAction({
  label,
  icon,
  onPress,
  loading = false,
}: {
  label: string;
  /** Nét icon Figma (bộ `LineIcon`): gọi · bút · tick · con mắt · cộng · tải lên. */
  icon: LineIconName;
  onPress: () => void;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <IconSquareButton label={label} size="md" disabled={loading} onPress={onPress}>
      <LineIcon name={icon} size={20} color={colors.textMuted} />
    </IconSquareButton>
  );
}
