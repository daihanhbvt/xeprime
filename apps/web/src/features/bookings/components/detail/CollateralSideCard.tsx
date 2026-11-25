'use client';

import { CheckOutlined, DeleteOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Select, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  PERMISSION,
  bookingCollateralNeedsDescription,
  isBookingCollateralEditable,
  type BookingCollateralType,
} from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import {
  useAddBookingCollateral,
  useRemoveBookingCollateral,
  useSetBookingCollateralReturned,
} from '../../hooks/use-booking-collaterals';
import { useBookingDetailActions } from './BookingDetailActions';
import styles from './CollateralSideCard.module.css';
import detailStyles from './BookingDetail.module.css';

/**
 * Thẻ "Cọc & thế chấp" ở cột phải chi tiết đơn (ADR 0109): cọc tiền + từng món tài sản khách để lại
 * (CCCD, bằng lái, xe máy kèm biển số…). Đánh dấu đã trả / hoàn tác được ở mọi trạng thái đơn; thêm /
 * gỡ chỉ khi đơn chưa khép (server chặn cùng luật). Đơn không có gì để giữ và không còn sửa được thì
 * ẩn hẳn thẻ.
 */
export function CollateralSideCard() {
  const t = useTranslations('Bookings.detailPage.side.collateral');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { booking } = useBookingDetailActions();

  const add = useAddBookingCollateral(booking.id);
  const remove = useRemoveBookingCollateral(booking.id);
  const setReturned = useSetBookingCollateralReturned(booking.id);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<BookingCollateralType>(BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
  const [description, setDescription] = useState('');

  const items = booking.collaterals ?? [];
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const editable = canUpdate && isBookingCollateralEditable(booking.status);
  const hasCash = !isZeroMoney(booking.depositAmount);
  const held = items.filter((item) => !item.returnedAt).length;

  if (!hasCash && items.length === 0 && !editable) return null;

  const onError = (err: unknown) => message.error(errorMessage(err));
  const needsDescription = bookingCollateralNeedsDescription(type);

  function submitAdd() {
    if (add.isPending) return;
    const text = description.trim();
    if (needsDescription && !text) {
      message.warning(t('descriptionRequired'));
      return;
    }
    add.mutate(
      { collateralType: type, description: text || null },
      {
        onSuccess: () => {
          message.success(t('added'));
          setAdding(false);
          setType(BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
          setDescription('');
        },
        onError,
      },
    );
  }

  return (
    <section className={detailStyles.sideCard} aria-label={t('title')}>
      <div className={detailStyles.sideCardHead}>
        <h2 className={detailStyles.sideTitle}>{t('title')}</h2>
        {items.length > 0 ? (
          <span className={styles.count}>{t('heldCount', { held, total: items.length })}</span>
        ) : null}
      </div>

      <div className={styles.cashRow}>
        <span>{t('cash')}</span>
        <b>{hasCash ? fmt.money(booking.depositAmount) : t('noCash')}</b>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const returned = Boolean(item.returnedAt);
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
                    {returned ? (
                      <Button
                        size="small"
                        type="text"
                        icon={<UndoOutlined />}
                        loading={setReturned.isPending && setReturned.variables?.id === item.id}
                        onClick={() =>
                          setReturned.mutate({ id: item.id, returned: false }, { onError })
                        }
                      >
                        {tCommon('actions.undo')}
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        icon={<CheckOutlined />}
                        loading={setReturned.isPending && setReturned.variables?.id === item.id}
                        onClick={() =>
                          setReturned.mutate(
                            { id: item.id, returned: true },
                            { onSuccess: () => message.success(t('returnedToast')), onError },
                          )
                        }
                      >
                        {t('markReturned')}
                      </Button>
                    )}
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
              onPressEnter={submitAdd}
            />
            <div className={styles.addActions}>
              <Button size="small" onClick={() => setAdding(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button size="small" type="primary" loading={add.isPending} onClick={submitAdd}>
                {tCommon('actions.add')}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        )
      ) : null}
    </section>
  );
}
