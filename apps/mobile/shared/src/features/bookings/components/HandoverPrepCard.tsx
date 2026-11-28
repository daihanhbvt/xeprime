import { useState, type ReactNode } from 'react';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Linking, Pressable } from 'react-native';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { CheckMark } from '@/components/ui/CheckMark';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  isNegativeMoney,
  isZeroMoney,
  normalizeCollateral,
  subtractMoney,
  telHref,
  type NormalizedCollateral,
} from '@xeprime/domain';
import {
  BOOKING_COLLATERAL_MAX_ITEMS,
  COLLATERAL_COMBINATION,
  HANDOVER_PREP_ITEM,
  PERMISSION,
  isBookingCollateralEditable,
  handoverPhotoSlotsFor,
  PAYMENT_KIND,
  type HandoverPhotoSlot,
  type HandoverPrepManualItem,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { policyCollateral } from '@/features/rental-policies/collateral-text';
import { useDomainLabel } from '@/i18n/domain';
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

export type PrepKey =
  | 'confirm'
  | 'documents'
  | 'rent'
  | 'deposit'
  | 'asset'
  | 'collateralEither'
  | 'contract'
  | 'photos'
  | 'driver';

/** Khoá chữ `Bookings.detailPage.prep.*` của từng dòng (`collateralEither` => `either`). */
export function prepTitleKey(key: PrepKey) {
  return key === 'collateralEither' ? 'either' : key;
}

/**
 * Cọc của đơn cho khối chuẩn bị bàn giao - web `prepCollateralOf`: chính sách ĐÓNG BĂNG lúc tạo đơn
 * (`priceSnapshot.policy`, ADR 0112 điều 2, chịu cả mã cũ `cash` / `asset`) + số món tài sản đã ghi
 * (ADR 0109). Số tiền cọc KHÔNG đọc từ snapshot - đọc `depositRequired` của server.
 */
export interface PrepCollateral {
  policy: NormalizedCollateral | null;
  recorded: number;
}

export function prepCollateralOf(booking: {
  priceSnapshot?: { policy?: Parameters<typeof policyCollateral>[0] } | null;
  collaterals?: readonly unknown[] | null;
}): PrepCollateral {
  return {
    policy: normalizeCollateral(policyCollateral(booking.priceSnapshot?.policy ?? null)),
    recorded: booking.collaterals?.length ?? 0,
  };
}

/** Việc cọc lúc giao xe - web `collateralPrepPlan` (miễn => none; cả hai => either / both). */
export type CollateralPrepPlan = 'none' | 'cash' | 'asset' | 'either' | 'both';

export function collateralPrepPlan(
  prep: Pick<BookingHandoverPrep, 'depositRequired'>,
  collateral: PrepCollateral | undefined,
): CollateralPrepPlan {
  const cash = !isZeroMoney(prep.depositRequired);
  const asset = collateral?.policy?.asset === true;
  if (cash && asset) {
    return collateral?.policy?.combination === COLLATERAL_COMBINATION.ALL ? 'both' : 'either';
  }
  if (asset) return 'asset';
  return cash ? 'cash' : 'none';
}
type ManualCheck = BookingHandoverPrep['manualChecks'][number];

interface PrepRowState {
  key: PrepKey;
  autoDone: boolean;
  manualItem?: HandoverPrepManualItem;
  manual: ManualCheck | null;
  done: boolean;
}

/** Phần cọc còn thiếu (không âm) — như `depositOutstanding` của web. */
function depositOutstanding(prep: Pick<BookingHandoverPrep, 'depositRequired' | 'depositReceived'>) {
  const left = subtractMoney(prep.depositRequired, prep.depositReceived);
  return isNegativeMoney(left) ? '0' : left;
}

/** Phần cọc THU DƯ (đã thu − phải thu, không âm) - `'0'` khi chưa vượt. Web `depositOverCollected`. */
function depositOverCollected(
  prep: Pick<BookingHandoverPrep, 'depositRequired' | 'depositReceived'>,
) {
  const over = subtractMoney(prep.depositReceived, prep.depositRequired);
  return isNegativeMoney(over) ? '0' : over;
}

/**
 * Trạng thái từng việc chuẩn bị bàn giao — chép đúng `prepRowStates` của web
 * (`detail/handover-readiness.ts`) để hai client đếm giống nhau.
 */
export function prepRowStates(
  prep: BookingHandoverPrep,
  can: { collect: boolean; contract: boolean },
  collateral?: PrepCollateral,
): PrepRowState[] {
  const manualOf = (item: HandoverPrepManualItem) =>
    prep.manualChecks.find((check) => check.item === item) ?? null;
  const row = (key: PrepKey, autoDone: boolean, manualItem?: HandoverPrepManualItem): PrepRowState => {
    const manual = manualItem && !autoDone ? manualOf(manualItem) : null;
    return { key, autoDone, manualItem, manual, done: autoDone || manual !== null };
  };
  const plan = collateralPrepPlan(prep, collateral);
  const cashDone = isZeroMoney(depositOutstanding(prep));
  const assetDone = (collateral?.recorded ?? 0) > 0;
  const collateralRows: PrepRowState[] = [];
  if ((plan === 'cash' || plan === 'both') && can.collect) {
    collateralRows.push(row('deposit', cashDone));
  }
  if (plan === 'asset' || plan === 'both') collateralRows.push(row('asset', assetDone));
  // Một trong hai: tài sản xong được cả khi không ghi sổ thu, nên dòng luôn có.
  if (plan === 'either') collateralRows.push(row('collateralEither', cashDone || assetDone));
  return [
    row('confirm', true),
    row('documents', prep.documentsReady, HANDOVER_PREP_ITEM.DOCUMENTS),
    ...(can.collect ? [row('rent', isZeroMoney(prep.rentDueAmount))] : []),
    ...collateralRows,
    ...(can.contract
      ? [row('contract', prep.contractId != null, HANDOVER_PREP_ITEM.CONTRACT)]
      : []),
    // Ảnh bàn giao KHÔNG đánh dấu tay (26/11/2026, web `prepRowStates`): chỉ xong khi biên bản đủ ảnh -
    // cùng luật với phần cảnh báo góc ảnh trống lúc bấm giao xe. Server bỏ qua dấu cũ, từ chối dấu mới.
    row('photos', prep.pickupPhotoCount >= prep.pickupPhotoRequired),
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
  onAddCollateral,
  onEditCash,
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
  /** Mở ô "Thêm tài sản thế chấp" của thẻ Cọc & thế chấp (web `openAddCollateral`). */
  onAddCollateral?: () => void;
  /** "Chỉnh sửa" ở dòng cọc tiền đã xong ⇒ mở hộp Sửa tiền cọc của thẻ Cọc & thế chấp (web). */
  onEditCash?: () => void;

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
  const dl = useDomainLabel();
  const { has } = usePermissions();
  const prep = booking.handoverPrep;
  if (!prep) return null;

  // Cọc theo chính sách ĐÓNG BĂNG của đơn (ADR 0112 điều 2) + món tài sản đã ghi (ADR 0109).
  const collateral = prepCollateralOf(booking);
  const collateralPlan = collateralPrepPlan(prep, collateral);
  const assetTypes = collateral.policy?.assetTypes ?? [];
  const assetList = assetTypes.map((code) => dl('collateralAssetType', code)).join(', ');
  const cashDone = isZeroMoney(depositOutstanding(prep));
  const canAddAsset =
    onAddCollateral != null &&
    has(PERMISSION.BOOKING_UPDATE) &&
    isBookingCollateralEditable(booking.status) &&
    (booking.collaterals?.length ?? 0) < BOOKING_COLLATERAL_MAX_ITEMS;
  const addAssetAction =
    canAddAsset && onAddCollateral ? (
      <RowAction label={t('assetAction')} icon="plus" onPress={onAddCollateral} />
    ) : null;

  // "Chỉnh sửa" ở dòng cọc ĐÃ XONG mở lại đúng chỗ sửa sẵn có (web `HandoverPrepCard`).
  const editCashAction =
    onEditCash && has(PERMISSION.BOOKING_UPDATE) ? (
      <RowAction label={t('editAction')} icon="edit" onPress={onEditCash} />
    ) : null;

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
        return isZeroMoney(depositOutstanding(prep)) ? editCashAction : (
          <RowAction label={t('collectAction')} icon="tick" onPress={() => setCollecting('deposit')} />
        );
      case 'asset':
        return collateral.recorded > 0 ? null : addAssetAction;
      case 'collateralEither':
        return collateral.recorded > 0 ? null : cashDone ? editCashAction : (
          <XStack gap={space.xs}>
            {can.collect ? (
              <RowAction label={t('deposit')} icon="tick" onPress={() => setCollecting('deposit')} />
            ) : null}
            {addAssetAction}
          </XStack>
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
      // Thu DƯ (đã thu > phải thu) nói rõ phần thừa - web `depositOverCollected`.
      body: !isZeroMoney(depositOverCollected(prep))
        ? t.rich('depositOver', {
            received: fmt.money(prep.depositReceived),
            amount: fmt.money(depositOverCollected(prep)),
            b: bold,
          })
        : isZeroMoney(depositOutstanding(prep))
        ? t('depositDone', { amount: fmt.money(prep.depositReceived) })
        : isZeroMoney(prep.depositReceived)
          ? t.rich('depositPending', { amount: fmt.money(prep.depositRequired), b: bold })
          : t.rich('depositPartial', {
              received: fmt.money(prep.depositReceived),
              amount: fmt.money(depositOutstanding(prep)),
              b: bold,
            }),
    },
    asset: {
      title: t('asset'),
      body:
        collateral.recorded > 0
          ? t('assetDone', { count: collateral.recorded })
          : assetTypes.length > 1
            ? t('assetPendingMany', { assets: assetList })
            : assetTypes.length === 1
              ? t('assetPendingOne', { assets: assetList })
              : t('assetPendingAny'),
    },
    collateralEither: {
      title: t('either'),
      body:
        collateral.recorded > 0
          ? t('eitherDoneAsset')
          : cashDone
            ? isZeroMoney(depositOverCollected(prep))
              ? t('eitherDoneCash', { amount: fmt.money(prep.depositReceived) })
              : t.rich('eitherDoneCashOver', {
                  received: fmt.money(prep.depositReceived),
                  amount: fmt.money(depositOverCollected(prep)),
                  b: bold,
                })
            : t.rich('eitherPending', {
                amount: fmt.money(prep.depositRequired),
                assets:
                  assetTypes.length > 1
                    ? t('eitherAssetsMany', { assets: assetList })
                    : assetTypes.length === 1
                      ? t('eitherAssetsOne', { assets: assetList })
                      : t('eitherAssetsAny'),
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

  const rows = prepRowStates(prep, can, collateral);
  const done = rows.filter((row) => row.done).length;

  const toggle = (item: HandoverPrepManualItem, checked: boolean) => {
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
        {collateralPlan === 'none' && collateral.policy?.none ? (
          <Text col={colors.placeholder} fos={fontSize.label} pt={space.xs}>
            {t('collateralNone')}
          </Text>
        ) : null}
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
