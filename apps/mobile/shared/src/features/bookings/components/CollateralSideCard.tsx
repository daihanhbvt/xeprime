import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { LineIcon } from '@/components/icons/LineIcon';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  absoluteMoney,
  isNegativeMoney,
  isZeroMoney,
  normalizeCollateral,
  subtractMoney,
} from '@xeprime/domain';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  DEPOSIT_STATUS,
  PAYMENT_KIND,
  PERMISSION,
  STATUS_COLOR,
  bookingCollateralNeedsDescription,
  isBookingCollateralEditable,
  type BookingCollateralType,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { KebabActionsMenu } from '@/components/ui/KebabActionsMenu';
import type { SheetAction } from '@/components/ui/ActionSheetButtons';
import { policyCollateral } from '@/features/rental-policies/collateral-text';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextControl } from '@/components/ui/TextControl';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import type { BookingCollateral, BookingDetail } from '../api';
import {
  useAddBookingCollateral,
  useRemoveBookingCollateral,
  useSetBookingCollateralReturned,
  useUpdateBookingCollateral,
} from '../hooks/use-booking-collaterals';
import { useSettlement } from '@/features/settlement/hooks/use-settlement';
import { SideCard, SideTitle } from './BookingDetailSide';
import { CollateralCashSheet } from './CollateralCashSheet';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';

/**
 * Thẻ "Cọc & thế chấp" ở chi tiết đơn (ADR 0109) — native port of web
 * `detail/CollateralSideCard.tsx`: cọc tiền + từng món tài sản khách để lại. Đánh dấu đã trả / hoàn
 * tác được ở mọi trạng thái đơn; thêm / gỡ chỉ khi đơn chưa khép (server chặn cùng luật). Quyền
 * `bookings.update`. Đơn không có gì để giữ và không còn sửa được thì ẩn hẳn thẻ.
 */
/** Khe 12 của các ô con (khuôn thẻ cột phải). */
const GAP_12 = 12;

export function CollateralSideCard({
  booking,
  addRequest = 0,
  cashRequest = 0,
  closed = false,
  moneyClosed = false,
}: {
  booking: BookingDetail;
  /** Đơn đã khép (`isBookingFinal`) - web `can.edit` = `bookings.update` && !closed. */
  closed?: boolean;
  /** Đơn huỷ / khách không đến - không ghi tiền MỚI (server: `BOOKING_MONEY_CLOSED`). */
  moneyClosed?: boolean;
  /** Dòng "Thu cọc tiền" của Chuẩn bị bàn giao bấm "Chỉnh sửa" tăng số này => mở hộp Sửa tiền cọc. */
  cashRequest?: number;
  /**
   * Dòng "Nhận tài sản thế chấp" của Chuẩn bị bàn giao tăng số này => mở ô thêm món (web
   * `collateralAddRequest`). Giá trị đầu không mở sẵn.
   */
  addRequest?: number;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.side.collateral');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const { has } = usePermissions();

  const add = useAddBookingCollateral(booking.id);
  const remove = useRemoveBookingCollateral(booking.id);
  const setReturned = useSetBookingCollateralReturned(booking.id);
  const update = useUpdateBookingCollateral(booking.id);
  const [adding, setAdding] = useState(false);
  // Món đang sửa tại dòng (26/11/2026 - web `editingId`); mở sửa thì đóng ô thêm và ngược lại.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BookingCollateral | null>(null);

  const items = booking.collaterals ?? [];
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const editable = canUpdate && isBookingCollateralEditable(booking.status);
  // Chính sách cọc ĐÓNG BĂNG của đơn (ADR 0112 điều 2): nhận tài sản mà chưa ghi món nào => nhắc
  // các loại được chấp nhận (khách đưa MỘT loại).
  const policy = normalizeCollateral(policyCollateral(booking.priceSnapshot?.policy ?? null));
  const acceptedAssets =
    policy?.asset && policy.assetTypes.length > 0 && items.length === 0
      ? policy.assetTypes.map((code) => dl('collateralAssetType', code)).join(', ')
      : null;
  // Chỉnh state ngay lúc render khi có lượt yêu cầu mới (như web), không setState trong effect.
  const [seenAddRequest, setSeenAddRequest] = useState(addRequest);
  if (addRequest !== seenAddRequest) {
    setSeenAddRequest(addRequest);
    if (addRequest && editable) {
      setEditingId(null);
      setAdding(true);
    }
  }
  const [cashOpen, setCashOpen] = useState(false);
  const [seenCashRequest, setSeenCashRequest] = useState(cashRequest);
  if (cashRequest !== seenCashRequest) {
    setSeenCashRequest(cashRequest);
    if (cashRequest && canUpdate && !closed) setCashOpen(true);
  }
  // Cùng khoá cache với thẻ quyết toán - không thêm request.
  const settlement = useSettlement(booking.id).data;
  const depositStatus = settlement?.depositStatus;
  const depositLeft = settlement
    ? subtractMoney(settlement.depositRequired, settlement.depositReceived)
    : '0';
  const depositShort = !isNegativeMoney(depositLeft) && !isZeroMoney(depositLeft);
  // Thu DƯ: tiền thật đang thừa trong tay chủ xe - phải hiện, không gộp vào "đủ".
  const depositOver = isNegativeMoney(depositLeft);
  const hasReceived = settlement ? !isZeroMoney(settlement.depositReceived) : false;
  const canAdjustCollected =
    has(PERMISSION.PAYMENT_RECORD) &&
    (depositStatus === DEPOSIT_STATUS.NONE ||
      depositStatus === DEPOSIT_STATUS.NOT_RECEIVED ||
      depositStatus === DEPOSIT_STATUS.RECEIVED ||
      depositStatus === DEPOSIT_STATUS.AWAITING_REFUND);
  const hasCash = !isZeroMoney(booking.depositAmount);
  const held = items.filter((item) => !item.returnedAt).length;
  // Bút "Sửa tiền cọc" - web `can.edit`.
  const canEditCash = canUpdate && !closed;
  /*
   * Chỉ mời thu khi còn thiếu VÀ chưa sang giai đoạn hoàn: sau khi đã hoàn thì "thu thêm" là một
   * nghiệp vụ khác hẳn. Ghi tiền MỚI đóng trên đơn huỷ / khách không đến - web `canTakeDeposit`.
   */
  const canTakeDeposit =
    has(PERMISSION.PAYMENT_RECORD) &&
    !moneyClosed &&
    depositShort &&
    (depositStatus === DEPOSIT_STATUS.NOT_RECEIVED || depositStatus === DEPOSIT_STATUS.RECEIVED);
  const [depositOpen, setDepositOpen] = useState(false);

  if (!hasCash && items.length === 0 && !editable) return null;

  const canAddItem = editable && items.length < BOOKING_COLLATERAL_MAX_ITEMS;
  const onError = (err: unknown) => toast.showError(errorMessage(err));

  function submitAdd(value: CollateralDraft) {
    if (add.isPending) return;
    add.mutate(value, {
      onSuccess: () => {
        toast.showSuccess(t('added'));
        setAdding(false);
      },
      onError,
    });
  }

  function submitEdit(id: string, value: CollateralDraft) {
    if (update.isPending) return;
    update.mutate(
      { id, body: value },
      {
        onSuccess: () => {
          toast.showSuccess(t('updated'));
          setEditingId(null);
        },
        onError,
      },
    );
  }

  /* ⋮ của ô cọc tiền: Sửa tiền cọc (web bút) · Thu cọc (web link) - cùng cổng quyền. */
  const cashActions: SheetAction[] = [
    ...(canEditCash
      ? [{ key: 'edit', label: t('editCash'), icon: 'edit' as const, onPress: () => setCashOpen(true) }]
      : []),
    ...(canTakeDeposit
      ? [
          {
            key: 'take',
            label: t('takeDeposit'),
            icon: 'wallet' as const,
            onPress: () => setDepositOpen(true),
          },
        ]
      : []),
  ];

  /* ⋮ của một món: Đã trả / Hoàn tác (mọi trạng thái đơn) · Sửa · Gỡ (chỉ khi đơn còn sửa được). */
  function itemActions(item: BookingCollateral, returned: boolean, busy: boolean): SheetAction[] {
    return [
      returned
        ? {
            key: 'undo',
            label: t('undoReturn'),
            icon: 'rotate-left' as const,
            disabled: busy,
            onPress: () => setReturned.mutate({ id: item.id, returned: false }, { onError }),
          }
        : {
            key: 'return',
            label: t('markReturned'),
            icon: 'tick' as const,
            disabled: busy,
            onPress: () =>
              setReturned.mutate(
                { id: item.id, returned: true },
                { onSuccess: () => toast.showSuccess(t('returnedToast')), onError },
              ),
          },
      ...(editable && !returned
        ? [
            {
              key: 'edit',
              label: t('edit'),
              icon: 'edit' as const,
              onPress: () => {
                setAdding(false);
                setEditingId(item.id);
              },
            },
            {
              key: 'remove',
              label: t('remove'),
              icon: 'trash' as const,
              danger: true,
              onPress: () => setRemoving(item),
            },
          ]
        : []),
    ];
  }

  // Viên trạng thái thu cọc - gọn: "Đã nhận đủ" / "Chưa nhận" / "Đã nhận X, còn Y" / thu dư.
  const cashState =
    (hasCash || hasReceived) && settlement
      ? {
          color: depositOver
            ? STATUS_COLOR.DANGER
            : depositStatus === DEPOSIT_STATUS.NOT_RECEIVED || depositShort
              ? STATUS_COLOR.WARNING
              : depositStatus === DEPOSIT_STATUS.RECEIVED
                ? STATUS_COLOR.SUCCESS
                : STATUS_COLOR.NEUTRAL,
          label:
            depositOver && depositStatus === DEPOSIT_STATUS.RECEIVED
              ? t('cashOver', {
                  received: fmt.money(settlement.depositReceived),
                  amount: fmt.money(absoluteMoney(depositLeft) ?? '0'),
                })
              : depositStatus === DEPOSIT_STATUS.NOT_RECEIVED
                ? t('cashNotReceived')
                : depositStatus === DEPOSIT_STATUS.RECEIVED
                  ? depositShort
                    ? t('cashPartial', {
                        received: fmt.money(settlement.depositReceived),
                        amount: fmt.money(depositLeft),
                      })
                    : t('cashReceived')
                  : dl('depositStatus', settlement.depositStatus),
        }
      : null;
  const divider = { borderTopWidth: 1, borderTopColor: colors.border };

  /*
   * Bố cục gọn cho mobile (28/11/2026): MỘT danh sách phẳng, không khung lồng khung - dòng "Tiền
   * cọc" rồi từng món, vạch mảnh giữa các dòng. Mỗi dòng: chữ chính + chữ phụ (trạng thái chữ màu,
   * không viên) bên trái, số tiền / ⋮ bên phải.
   */
  return (
    <SideCard label={t('title')}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <XStack f={1} minWidth={0} ai="baseline" gap={space.sm}>
          <SideTitle>{t('title')}</SideTitle>
          {items.length > 0 ? (
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('heldCount', { held, total: items.length })}
            </Text>
          ) : null}
        </XStack>
        {/* Lối thêm ở góc phải tiêu đề - cùng khuôn "Khách hàng · Chỉnh sửa" của chi tiết đơn. */}
        {canAddItem && !adding ? (
          <Pressable
            onPress={() => {
              setEditingId(null);
              setAdding(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('add')}
            hitSlop={space.sm}
          >
            <XStack ai="center" gap={6}>
              <LineIcon name="add" size={16} color={colors.primary} />
              <Text col={colors.primary} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.medium}>
                {tCommon('add')}
              </Text>
            </XStack>
          </Pressable>
        ) : null}
      </XStack>

      <YStack>
        {/* Dòng tiền cọc */}
        <XStack ai="center" gap={space.sm} pb={GAP_12}>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
              {t('cash')}
            </Text>
            {cashState ? (
              <Text
                col={statusTextColor(cashState.color, colors)}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                numberOfLines={2}
              >
                {cashState.label}
              </Text>
            ) : null}
          </YStack>
          <Text
            col={hasCash ? colors.text : colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={hasCash ? fontWeight.semibold : fontWeight.regular}
          >
            {hasCash ? fmt.money(booking.depositAmount) : t('noCash')}
          </Text>
          <KebabActionsMenu title={t('cash')} actions={cashActions} />
        </XStack>

        {items.length === 0 ? (
          <YStack gap={2} pt={GAP_12} {...divider}>
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('empty')}
            </Text>
            {acceptedAssets ? (
              <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {policy && policy.assetTypes.length > 1
                  ? t('acceptedMany', { assets: acceptedAssets })
                  : t('acceptedOne', { assets: acceptedAssets })}
              </Text>
            ) : null}
          </YStack>
        ) : (
          items.map((item) => {
            const returned = Boolean(item.returnedAt);
            const busy = setReturned.isPending && setReturned.variables?.id === item.id;
            if (editingId === item.id) {
              return (
                <YStack key={item.id} py={GAP_12} {...divider}>
                  <CollateralItemForm
                    initial={{
                      collateralType: item.collateralType as BookingCollateralType,
                      description: item.description ?? '',
                    }}
                    submitLabel={tCommon('save')}
                    pending={update.isPending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(value) => submitEdit(item.id, value)}
                  />
                </YStack>
              );
            }
            const meta = returned && item.returnedAt
              ? item.returnedByName
                ? t('returnedBy', { name: item.returnedByName, time: fmt.dateTime(item.returnedAt) })
                : t('returnedAt', { time: fmt.dateTime(item.returnedAt) })
              : t('heldTagApp');
            return (
              <XStack key={item.id} ai="center" gap={space.sm} py={GAP_12} opacity={busy ? 0.6 : 1} {...divider}>
                <YStack f={1} minWidth={0} gap={2}>
                  <Text numberOfLines={1} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                    <Text col={returned ? colors.textMuted : colors.text} fow={fontWeight.semibold}>
                      {dl('bookingCollateralType', item.collateralType)}
                    </Text>
                    {item.description ? (
                      <Text col={colors.textMuted}>{`  ${item.description}`}</Text>
                    ) : null}
                  </Text>
                  <Text
                    col={returned ? colors.success : colors.warningHigh}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    numberOfLines={1}
                  >
                    {meta}
                  </Text>
                </YStack>
                {canUpdate ? (
                  <KebabActionsMenu
                    title={dl('bookingCollateralType', item.collateralType)}
                    actions={itemActions(item, returned, busy)}
                  />
                ) : null}
              </XStack>
            );
          })
        )}
      </YStack>

      {canAddItem && adding ? (
        <YStack pt={space.sm} borderTopWidth={1} borderTopColor={colors.border}>
          <CollateralItemForm
            initial={{ collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID, description: '' }}
            submitLabel={tCommon('add')}
            pending={add.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={submitAdd}
          />
        </YStack>
      ) : null}

      <ConfirmSheet
        open={removing !== null}
        title={t('removeConfirm')}
        confirmLabel={t('remove')}
        tone="danger"
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: (err) => {
              setRemoving(null);
              onError(err);
            },
          });
        }}
      />
      {/*
        Dùng LẠI đúng tấm thu tiền của đơn, chỉ đổi `kind` - hai loại tiền cùng đi qua một đường ghi
        (`PaymentsService`). Dựng theo cờ mở để mỗi lần mở là số còn thiếu mới nhất (web).
      */}
      {depositOpen ? (
        <RecordPaymentSheet
          open
          onClose={() => setDepositOpen(false)}
          bookingId={booking.id}
          kind={PAYMENT_KIND.DEPOSIT}
          debtAmount={depositLeft}
        />
      ) : null}
      {canEditCash ? (
        <CollateralCashSheet
          bookingId={booking.id}
          current={booking.depositAmount}
          received={settlement ? settlement.depositReceived : null}
          collectedEditable={canAdjustCollected}
          open={cashOpen}
          onClose={() => setCashOpen(false)}
        />
      ) : null}
    </SideCard>
  );
}

/** Màu chữ trạng thái (thay viên): xanh đủ · cam thiếu · đỏ dư · xám khác. */
function statusTextColor(color: string, colors: ReturnType<typeof useColors>): string {
  if (color === STATUS_COLOR.SUCCESS) return colors.success;
  if (color === STATUS_COLOR.WARNING) return colors.warningHigh;
  if (color === STATUS_COLOR.DANGER) return colors.danger;
  return colors.textMuted;
}

interface CollateralDraft {
  collateralType: BookingCollateralType;
  description: string | null;
}

/**
 * Ô nhập MỘT món tài sản — native port of web `CollateralItemForm`: cùng một khối cho "Thêm tài sản"
 * và sửa tại dòng, để hai lối cùng luật (loại "khác" bắt buộc mô tả, gợi ý theo loại, giới hạn độ dài).
 */
function CollateralItemForm({
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: { collateralType: BookingCollateralType; description: string };
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: CollateralDraft) => void;
}) {
  const t = useTranslations('Bookings.detailPage.side.collateral');
  const tCommon = useTranslations('Common.actions');
  const dl = useDomainLabel();
  const [type, setType] = useState<BookingCollateralType>(initial.collateralType);
  const [description, setDescription] = useState(initial.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const needsDescription = bookingCollateralNeedsDescription(type);
  const typeOptions = useMemo(
    () =>
      BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
        value,
        label: dl('bookingCollateralType', value),
      })),
    [dl],
  );

  function submit() {
    if (pending) return;
    const text = description.trim();
    if (needsDescription && !text) {
      setDescriptionError(t('descriptionRequired'));
      return;
    }
    onSubmit({ collateralType: type, description: text || null });
  }

  return (
    <YStack gap={space.sm}>
      <SelectControl
        label={t('type')}
        value={type}
        options={typeOptions}
        onChange={(next) => {
          setType(next as BookingCollateralType);
          setDescriptionError(null);
        }}
      />
      <TextControl
        label={t('description')}
        value={description}
        onChangeText={(next) => {
          setDescription(next);
          if (descriptionError) setDescriptionError(null);
        }}
        maxLength={BOOKING_COLLATERAL_DESCRIPTION_MAX}
        required={needsDescription}
        placeholder={
          type === BOOKING_COLLATERAL_TYPE.MOTORBIKE
            ? t('descriptionMotorbike')
            : needsDescription
              ? t('descriptionOther')
              : t('descriptionPlaceholder')
        }
        {...(descriptionError ? { error: descriptionError } : {})}
      />
      <XStack gap={space.sm}>
        <YStack f={1}>
          <Button label={tCommon('cancel')} variant="secondary" disabled={pending} onPress={onCancel} />
        </YStack>
        <YStack f={1}>
          <Button label={submitLabel} loading={pending} onPress={submit} />
        </YStack>
      </XStack>
    </YStack>
  );
}
