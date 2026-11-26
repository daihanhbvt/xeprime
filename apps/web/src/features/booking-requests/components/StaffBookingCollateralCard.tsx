'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import {
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { StaffBookingValues } from '../staff-booking-schema';
import reviewStyles from './BookingReviewStep.module.css';
import styles from './StaffBookingCards.module.css';

/**
 * Thẻ "Cọc & thế chấp" của luồng ĐẶT HỘ (ADR 0109): một ô tiền cọc và một danh sách tài sản (CCCD, bằng
 * lái, xe máy kèm biển số…). Nhập khoản nào thì đơn ghi khoản đó - tiền cọc để 0 và danh sách trống
 * nghĩa là không cọc. Không có ô chọn "hình thức": server vốn suy chế độ từ dữ liệu (cọc tiền > 0, có
 * dòng tài sản), nên bắt người dùng chọn trước rồi mới nhập là thừa một bước.
 *
 * Tiền cọc điền sẵn từ chính sách xe; danh sách tài sản in lên đơn và hợp đồng, đánh dấu đã trả ở chi
 * tiết đơn khi khách trả xe.
 */
export function StaffBookingCollateralCard({ control }: { control: Control<StaffBookingValues> }) {
  const t = useTranslations('BookingRequests.staffFlow.review.collateral');
  const domainLabel = useDomainLabel();
  const items = useFieldArray({ control, name: 'collaterals' });
  const types = useWatch({ control, name: 'collaterals' });
  const canAdd = items.fields.length < BOOKING_COLLATERAL_MAX_ITEMS;

  return (
    <section className={reviewStyles.card} aria-label={t('title')}>
      <h3 className={reviewStyles.cardTitle}>{t('title')}</h3>
      <p className={reviewStyles.cardLead}>{t('lead')}</p>
      <Form component={false} layout="vertical" colon={false}>
        <NumberField
          control={control}
          name="depositAmount"
          label={t('cash')}
          help={t('cashHint')}
          money
          min={0}
        />

        <div className={styles.assets}>
          <div className={styles.assetsHead}>
            <span className={styles.listTitle}>{t('assetsTitle')}</span>
            {canAdd ? (
              <Button
                type="link"
                size="small"
                className={styles.assetsAdd}
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
          </div>

          {items.fields.length === 0 ? (
            <p className={styles.listHint}>{t('assetsHint')}</p>
          ) : (
            <ul className={styles.assetList}>
              {items.fields.map((field, index) => {
                const type = types?.[index]?.collateralType;
                return (
                  <li key={field.id} className={styles.assetRow}>
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
                      className={styles.assetRemove}
                      icon={<DeleteOutlined />}
                      aria-label={t('remove')}
                      onClick={() => items.remove(index)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Form>
    </section>
  );
}
