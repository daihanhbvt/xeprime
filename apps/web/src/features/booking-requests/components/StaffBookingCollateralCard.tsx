'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Segmented } from 'antd';
import { useTranslations } from 'next-intl';
import { useFieldArray, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  STAFF_COLLATERAL_MODE,
  STAFF_COLLATERAL_MODE_VALUES,
  collateralModeHasAssets,
  collateralModeHasCash,
  type StaffBookingValues,
  type StaffCollateralMode,
} from '../staff-booking-schema';
import reviewStyles from './BookingReviewStep.module.css';
import styles from './StaffBookingCards.module.css';

/**
 * Thẻ "Cọc & thế chấp" của luồng ĐẶT HỘ (ADR 0109): khách cọc TIỀN, để lại TÀI SẢN (CCCD, bằng lái,
 * xe máy kèm biển số…), cả hai, hoặc không cọc — mức cọc thay đổi theo từng khách, không cố định theo
 * xe. Cọc tiền điền sẵn từ chính sách xe; danh sách tài sản in lên đơn và hợp đồng, đánh dấu đã trả
 * ở chi tiết đơn khi khách trả xe.
 */
export function StaffBookingCollateralCard({
  control,
  setValue,
}: {
  control: Control<StaffBookingValues>;
  setValue: UseFormSetValue<StaffBookingValues>;
}) {
  const t = useTranslations('BookingRequests.staffFlow.review.collateral');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' }) as StaffCollateralMode;
  const items = useFieldArray({ control, name: 'collaterals' });
  const types = useWatch({ control, name: 'collaterals' });

  const changeMode = (next: StaffCollateralMode) => {
    setValue('collateralMode', next, { shouldDirty: true });
    // Chọn có tài sản mà danh sách còn trống ⇒ mở sẵn một dòng (CCCD là thứ khách hay để lại nhất).
    if (collateralModeHasAssets(next) && items.fields.length === 0) {
      items.append({ collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID, description: '' });
    }
  };

  return (
    <section className={reviewStyles.card} aria-label={t('title')}>
      <h3 className={reviewStyles.cardTitle}>{t('title')}</h3>
      <p className={reviewStyles.cardLead}>{t('lead')}</p>
      <Segmented<StaffCollateralMode>
        block
        value={mode}
        onChange={changeMode}
        aria-label={t('modeLabel')}
        options={STAFF_COLLATERAL_MODE_VALUES.map((value) => ({
          value,
          label: t(`mode.${value}`),
        }))}
      />
      <Form component={false} layout="vertical" colon={false}>
        {collateralModeHasCash(mode) ? (
          <NumberField
            control={control}
            name="depositAmount"
            label={t('cash')}
            help={t('cashHint')}
            money
            min={0}
          />
        ) : null}

        {collateralModeHasAssets(mode) ? (
          <>
            <div className={styles.listHead}>
              <span className={styles.listTitle}>{t('assetsTitle')}</span>
              <span className={styles.listHint}>{t('assetsHint')}</span>
            </div>
            {items.fields.map((field, index) => {
              const type = types?.[index]?.collateralType;
              return (
                <div key={field.id} className={styles.lineRow}>
                  <SelectField
                    control={control}
                    name={`collaterals.${index}.collateralType`}
                    label={t('type')}
                    options={BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
                      value,
                      label: domainLabel('bookingCollateralType', value),
                    }))}
                  />
                  <TextField
                    control={control}
                    name={`collaterals.${index}.description`}
                    label={t('description')}
                    placeholder={
                      type === BOOKING_COLLATERAL_TYPE.MOTORBIKE
                        ? t('descriptionMotorbike')
                        : type === BOOKING_COLLATERAL_TYPE.OTHER
                          ? t('descriptionOther')
                          : t('descriptionPlaceholder')
                    }
                    required={type === BOOKING_COLLATERAL_TYPE.OTHER}
                    autoComplete="off"
                  />
                  <Button
                    type="text"
                    className={styles.removeBtn}
                    icon={<DeleteOutlined />}
                    aria-label={t('remove')}
                    onClick={() => items.remove(index)}
                  />
                </div>
              );
            })}
            {items.fields.length < BOOKING_COLLATERAL_MAX_ITEMS ? (
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() =>
                  items.append({
                    collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID,
                    description: '',
                  })
                }
              >
                {t('add')}
              </Button>
            ) : null}
          </>
        ) : null}

        {mode === STAFF_COLLATERAL_MODE.NONE ? (
          <p className={styles.listHint}>{t('noneHint')}</p>
        ) : null}
      </Form>
    </section>
  );
}
