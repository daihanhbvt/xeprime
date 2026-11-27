'use client';

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Select, Tag, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  DEPOSIT_STATUS,
  PAYMENT_KIND,
  PERMISSION,
  bookingCollateralNeedsDescription,
  isBookingCollateralEditable,
  type BookingCollateralType,
} from '@xeprime/types';
import { normalizeCollateral } from '@xeprime/domain';
import { policyCollateral } from '@/features/rental-policies/collateral-text';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { useSettlement } from '@/features/settlement/hooks';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { absoluteMoney, isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import {
  useAddBookingCollateral,
  useRemoveBookingCollateral,
  useSetBookingCollateralReturned,
  useUpdateBookingCollateral,
} from '../../hooks/use-booking-collaterals';
import { CollateralCashDialog } from './CollateralCashDialog';
import { useBookingDetailActions } from './BookingDetailActions';
import styles from './CollateralSideCard.module.css';
import detailStyles from './BookingDetail.module.css';

/**
 * Thẻ "Cọc & thế chấp" ở cột phải chi tiết đơn (ADR 0109): cọc tiền + từng món tài sản khách để lại
 * (CCCD, bằng lái, xe máy kèm biển số…). Đánh dấu đã trả / hoàn tác được ở mọi trạng thái đơn; thêm /
 * gỡ chỉ khi đơn chưa khép (server chặn cùng luật). Đơn không có gì để giữ và không còn sửa được thì
 * ẩn hẳn thẻ.
 *
 * Cọc linh động theo từng đơn (26/11/2026): bút cạnh "Tiền cọc" sửa số tiền (đường sửa đơn sẵn có),
 * bút ở mỗi món chưa trả sửa loại + mô tả ngay tại dòng (`PATCH …/collaterals/:id`).
 *
 * Đây là NHÀ DUY NHẤT của cọc tiền trước lúc quyết toán (26/11/2026): số cọc, đã thu hay chưa,
 * còn thiếu bao nhiêu, và link ghi nhận đã thu. Thẻ "Phát sinh" chỉ đưa cọc trở lại ở chặng quyết
 * toán; dòng "Thu cọc tài sản" của Chuẩn bị bàn giao là một VIỆC cần làm, mở cùng hộp thu cọc.
 *
 * Ranh giới giữ nguyên từ thẻ Phát sinh: **cọc theo đơn không phải cọc đã thu** - chưa có phiếu thu
 * thì nói thẳng "Chưa thu", không hiện số 0 mập mờ. Phiên hỗ trợ gian hàng không đọc quyết toán
 * (ADR 0050 §10): thẻ chỉ còn số cọc theo đơn, không trạng thái, không nút.
 */
export function CollateralSideCard() {
  const t = useTranslations('Bookings.detailPage.side.collateral');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const {
    booking,
    moneyClosed,
    can,
    collateralAddRequest,
    cashEditRequest,
  } = useBookingDetailActions();
  const cardRef = useRef<HTMLElement>(null);
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.SETTLEMENT);
  // Cùng khoá cache với thẻ Phát sinh - không thêm request nào.
  const settlement = useSettlement(booking.id, !inSupport).data;
  const [depositOpen, setDepositOpen] = useState(false);

  const add = useAddBookingCollateral(booking.id);
  const remove = useRemoveBookingCollateral(booking.id);
  const setReturned = useSetBookingCollateralReturned(booking.id);
  const update = useUpdateBookingCollateral(booking.id);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cashOpen, setCashOpen] = useState(false);

  const items = booking.collaterals ?? [];
  // Chính sách cọc ĐÓNG BĂNG của đơn (ADR 0112 điều 2): nhận tài sản mà chưa ghi món nào ⇒ nhắc
  // các loại được chấp nhận (khách đưa MỘT loại).
  const policy = normalizeCollateral(policyCollateral(booking.priceSnapshot?.policy ?? null));
  const acceptedAssets =
    policy?.asset && policy.assetTypes.length > 0 && items.length === 0
      ? policy.assetTypes.map((code) => dl('collateralAssetType', code)).join(', ')
      : null;
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const editable = canUpdate && isBookingCollateralEditable(booking.status);
  const hasCash = !isZeroMoney(booking.depositAmount);
  const held = items.filter((item) => !item.returnedAt).length;

  const depositStatus = settlement?.depositStatus;
  // Phép trừ trên chuỗi tiền, không `Number` (ADR 0007) - đây là số điền sẵn vào ô nhập tiền.
  const depositOutstanding = settlement
    ? subtractMoney(settlement.depositRequired, settlement.depositReceived)
    : '0';
  const depositShort = !isNegativeMoney(depositOutstanding) && !isZeroMoney(depositOutstanding);
  // Thu DƯ (đã thu > phải thu): tiền thật đang thừa trong tay chủ xe - phải hiện, không gộp vào "đủ".
  const depositOver = isNegativeMoney(depositOutstanding);
  const hasReceived = settlement ? !isZeroMoney(settlement.depositReceived) : false;
  // Sửa số đã thu chỉ trước chặng hoàn cọc - sau đó sửa ở phần hoàn cọc (server cũng chặn).
  const canAdjustCollected =
    has(PERMISSION.PAYMENT_RECORD) &&
    (depositStatus === DEPOSIT_STATUS.NONE ||
      depositStatus === DEPOSIT_STATUS.NOT_RECEIVED ||
      depositStatus === DEPOSIT_STATUS.RECEIVED ||
      depositStatus === DEPOSIT_STATUS.AWAITING_REFUND);
  // Chỉ mời thu khi còn thiếu VÀ chưa sang giai đoạn hoàn: sau khi đã hoàn thì "thu thêm" là một
  // nghiệp vụ khác hẳn. Ghi tiền MỚI đóng trên đơn huỷ / khách không đến (server: BOOKING_MONEY_CLOSED).
  const canTakeDeposit =
    has(PERMISSION.PAYMENT_RECORD) &&
    !moneyClosed &&
    depositShort &&
    (depositStatus === DEPOSIT_STATUS.NOT_RECEIVED || depositStatus === DEPOSIT_STATUS.RECEIVED);

  /*
   * Dòng "Nhận tài sản thế chấp" của Chuẩn bị bàn giao gọi `openAddCollateral` ⇒ mở ô thêm món và
   * đưa thẻ vào tầm mắt. Bỏ qua giá trị đầu (0) - vào trang không mở sẵn.
   */
  // Chỉnh state ngay lúc render khi có lượt yêu cầu mới (không setState trong effect); effect chỉ cuộn.
  const [seenAddRequest, setSeenAddRequest] = useState(collateralAddRequest);
  if (collateralAddRequest !== seenAddRequest) {
    setSeenAddRequest(collateralAddRequest);
    if (collateralAddRequest && editable) {
      setEditingId(null);
      setAdding(true);
    }
  }
  useEffect(() => {
    if (!collateralAddRequest) return;
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [collateralAddRequest]);
  // "Chỉnh sửa" ở dòng "Thu cọc tiền" của Chuẩn bị bàn giao ⇒ mở đúng hộp Sửa tiền cọc này.
  const [seenCashRequest, setSeenCashRequest] = useState(cashEditRequest);
  if (cashEditRequest !== seenCashRequest) {
    setSeenCashRequest(cashEditRequest);
    if (cashEditRequest && can.edit) setCashOpen(true);
  }

  if (!hasCash && items.length === 0 && !editable) return null;

  const onError = (err: unknown) => message.error(errorMessage(err));

  function submitAdd(value: CollateralDraft) {
    if (add.isPending) return;
    add.mutate(value, {
      onSuccess: () => {
        message.success(t('added'));
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
          message.success(t('updated'));
          setEditingId(null);
        },
        onError,
      },
    );
  }

  return (
    <section ref={cardRef} className={detailStyles.sideCard} aria-label={t('title')}>
      <div className={detailStyles.sideCardHead}>
        <h2 className={detailStyles.sideTitle}>{t('title')}</h2>
        {items.length > 0 ? (
          <span className={styles.count}>{t('heldCount', { held, total: items.length })}</span>
        ) : null}
      </div>

      <div className={styles.cash}>
        <div className={styles.cashRow}>
          <span>{t('cash')}</span>
          <span className={styles.cashValue}>
            <b>{hasCash ? fmt.money(booking.depositAmount) : t('noCash')}</b>
            {can.edit ? (
              <button
                type="button"
                className={detailStyles.inlineEdit}
                aria-label={t('editCash')}
                title={t('editCash')}
                onClick={() => setCashOpen(true)}
              >
                <EditOutlined aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </div>
        {(hasCash || hasReceived) && settlement ? (
          <div className={styles.cashStatus}>
            <span
              className={cx(
                depositStatus === DEPOSIT_STATUS.NOT_RECEIVED && styles.cashPending,
                depositStatus === DEPOSIT_STATUS.RECEIVED &&
                  !depositShort &&
                  !depositOver &&
                  styles.cashDone,
                depositOver && styles.cashOver,
              )}
            >
              {depositOver && depositStatus === DEPOSIT_STATUS.RECEIVED
                ? t('cashOver', {
                    received: fmt.money(settlement.depositReceived),
                    amount: fmt.money(absoluteMoney(depositOutstanding) ?? '0'),
                  })
                : depositStatus === DEPOSIT_STATUS.NOT_RECEIVED
                  ? t('cashNotReceived')
                  : depositStatus === DEPOSIT_STATUS.RECEIVED
                    ? depositShort
                      ? t('cashPartial', {
                          received: fmt.money(settlement.depositReceived),
                          amount: fmt.money(depositOutstanding),
                        })
                      : t('cashReceived')
                    : dl('depositStatus', settlement.depositStatus)}
            </span>
            {canTakeDeposit ? (
              <button
                type="button"
                className={cx(detailStyles.textLink, styles.cashAction)}
                onClick={() => setDepositOpen(true)}
              >
                {t('takeDeposit')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <>
          <p className={styles.empty}>{t('empty')}</p>
          {acceptedAssets ? (
            <p className={styles.accepted}>
              {policy && policy.assetTypes.length > 1
                ? t('acceptedMany', { assets: acceptedAssets })
                : t('acceptedOne', { assets: acceptedAssets })}
            </p>
          ) : null}
        </>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const returned = Boolean(item.returnedAt);
            if (editingId === item.id) {
              return (
                <li key={item.id} className={styles.itemEditing}>
                  <CollateralItemForm
                    initial={{
                      collateralType: item.collateralType as BookingCollateralType,
                      description: item.description ?? '',
                    }}
                    submitLabel={tCommon('actions.save')}
                    pending={update.isPending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(value) => submitEdit(item.id, value)}
                  />
                </li>
              );
            }
            return (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemText}>
                  <span className={styles.itemType}>
                    {dl('bookingCollateralType', item.collateralType)}
                    {returned ? <Tag color="success">{t('returnedTag')}</Tag> : null}
                  </span>
                  {item.description ? (
                    <span className={styles.itemDesc}>{item.description}</span>
                  ) : null}
                  {returned && item.returnedAt ? (
                    <span className={styles.itemMeta}>
                      {item.returnedByName
                        ? t('returnedBy', {
                            name: item.returnedByName,
                            time: fmt.dateTime(item.returnedAt),
                          })
                        : t('returnedAt', { time: fmt.dateTime(item.returnedAt) })}
                    </span>
                  ) : null}
                </div>
                {canUpdate ? (
                  <div className={styles.itemActions}>
                    {/*
                      Ba thao tác cùng MỘT khuôn: nút biểu tượng nhỏ không viền + tooltip (Trả lại /
                      Hoàn tác / Sửa / Gỡ) - nhãn đọc màn hình qua `aria-label`.
                    */}
                    {returned ? (
                      <Tooltip title={t('undoReturn')}>
                        <Button
                          size="small"
                          type="text"
                          icon={<UndoOutlined />}
                          aria-label={t('undoReturn')}
                          loading={setReturned.isPending && setReturned.variables?.id === item.id}
                          onClick={() =>
                            setReturned.mutate({ id: item.id, returned: false }, { onError })
                          }
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={t('markReturned')}>
                        <Button
                          size="small"
                          type="text"
                          icon={<RollbackOutlined />}
                          aria-label={t('markReturned')}
                          loading={setReturned.isPending && setReturned.variables?.id === item.id}
                          onClick={() =>
                            setReturned.mutate(
                              { id: item.id, returned: true },
                              { onSuccess: () => message.success(t('returnedToast')), onError },
                            )
                          }
                        />
                      </Tooltip>
                    )}
                    {editable && !returned ? (
                      <Tooltip title={t('edit')}>
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          aria-label={t('edit')}
                          onClick={() => {
                            setAdding(false);
                            setEditingId(item.id);
                          }}
                        />
                      </Tooltip>
                    ) : null}
                    {editable && !returned ? (
                      <Popconfirm
                        title={t('removeConfirm')}
                        okText={t('remove')}
                        cancelText={tCommon('actions.cancel')}
                        onConfirm={() => remove.mutate(item.id, { onError })}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={t('remove')}
                          loading={remove.isPending && remove.variables === item.id}
                        />
                      </Popconfirm>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editable && items.length < BOOKING_COLLATERAL_MAX_ITEMS ? (
        adding ? (
          <CollateralItemForm
            initial={{ collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID, description: '' }}
            submitLabel={tCommon('actions.add')}
            pending={add.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={submitAdd}
          />
        ) : (
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
          >
            {t('add')}
          </Button>
        )
      ) : null}
      {/*
        Dùng LẠI đúng modal thu tiền của đơn, chỉ đổi `kind` - hai loại tiền cùng đi qua một đường
        ghi (`PaymentsService`). Dựng có điều kiện để mỗi lần mở là số còn thiếu mới nhất.
      */}
      {can.edit ? (
        <CollateralCashDialog
          bookingId={booking.id}
          current={booking.depositAmount}
          received={settlement ? settlement.depositReceived : null}
          collectedEditable={canAdjustCollected}
          open={cashOpen}
          onClose={() => setCashOpen(false)}
        />
      ) : null}
      {depositOpen ? (
        <RecordPaymentModal
          bookingId={booking.id}
          debtAmount={depositOutstanding}
          kind={PAYMENT_KIND.DEPOSIT}
          open
          onClose={() => setDepositOpen(false)}
        />
      ) : null}
    </section>
  );
}

interface CollateralDraft {
  collateralType: BookingCollateralType;
  description: string | null;
}

/**
 * Ô nhập MỘT món tài sản - cùng một khối cho "Thêm tài sản thế chấp" và sửa tại dòng, để hai lối
 * cùng luật (loại "khác" bắt buộc mô tả, gợi ý theo loại, giới hạn độ dài).
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
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const { message } = App.useApp();
  const [type, setType] = useState<BookingCollateralType>(initial.collateralType);
  const [description, setDescription] = useState(initial.description);
  const needsDescription = bookingCollateralNeedsDescription(type);

  function submit() {
    if (pending) return;
    const text = description.trim();
    if (needsDescription && !text) {
      message.warning(t('descriptionRequired'));
      return;
    }
    onSubmit({ collateralType: type, description: text || null });
  }

  return (
    <div className={styles.addForm}>
      <Select<BookingCollateralType>
        value={type}
        onChange={setType}
        aria-label={t('type')}
        options={BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
          value,
          label: dl('bookingCollateralType', value),
        }))}
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={BOOKING_COLLATERAL_DESCRIPTION_MAX}
        placeholder={
          type === BOOKING_COLLATERAL_TYPE.MOTORBIKE
            ? t('descriptionMotorbike')
            : needsDescription
              ? t('descriptionOther')
              : t('descriptionPlaceholder')
        }
        aria-label={t('description')}
        onPressEnter={submit}
      />
      <div className={styles.addActions}>
        <Button size="small" onClick={onCancel}>
          {tCommon('actions.cancel')}
        </Button>
        <Button size="small" type="primary" loading={pending} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
