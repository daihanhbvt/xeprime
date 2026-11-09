'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { subscriptionEndsAtValid, subscriptionShiftPlan } from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { appWallClockToIso } from '@/lib/datetime';
import { useUpdateSubscription } from '../hooks/use-plan-mutations';
import {
  TERM_MAX_VEHICLES,
  buildTermEditSchema,
  termEditDefaults,
  termPriceEditable,
  toUpdateTermBody,
  type TermEditFormValues,
} from '../term-edit-form';
import type { Subscription } from '../types';
import styles from './TenantPlanSection.module.css';

/**
 * Sửa MỘT kỳ còn hạn (ADR 0080 điều 2): giá (chỉ kỳ admin gán), ngày kết thúc, trần số xe, ghi chú.
 *
 * Đổi ngày kết thúc thì các kỳ xếp sau dời theo — phần xem trước đọc CÙNG `subscriptionShiftPlan`
 * với server, nên ngày hộp này hứa là ngày server ghi. Kỳ từ hoá đơn đã trả không có ô giá (ẩn hẳn).
 *
 * Người gọi gắn `key={term.id}`: `defaultValues` của RHF chỉ đọc một lần, tái dùng một instance sẽ
 * mở form của kỳ B với số của kỳ A.
 */
export function EditTermDialog({
  tenantId,
  term,
  liveTerms,
  onClose,
}: {
  tenantId: string;
  term: Subscription;
  /** Chuỗi kỳ còn hạn — để xem trước các kỳ xếp sau sẽ dời theo. */
  liveTerms: readonly Subscription[];
  onClose: () => void;
}) {
  const t = useTranslations('AdminPlans.tenant');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const update = useUpdateSubscription(tenantId);
  const priceEditable = termPriceEditable(term);

  const schema = useMemo(
    () =>
      buildTermEditSchema(term, {
        required: t('edit.validation.required'),
        endsAtInvalid: t('edit.validation.endsAtInvalid'),
        vehiclesMin: t('edit.validation.vehiclesMin'),
        noteTooLong: t('edit.validation.noteTooLong'),
      }),
    [t, term],
  );

  const { control, handleSubmit } = useForm<TermEditFormValues>({
    resolver: yupResolver(schema),
    defaultValues: termEditDefaults(term),
  });
  const unlimited = useWatch({ control, name: 'unlimitedVehicles' });
  const endsAtValue = useWatch({ control, name: 'endsAt' });

  const shifts = useMemo(() => {
    if (!endsAtValue) return [];
    const iso = appWallClockToIso(endsAtValue);
    if (!subscriptionEndsAtValid(term, iso)) return [];
    return subscriptionShiftPlan(term, liveTerms, new Date(iso));
  }, [endsAtValue, liveTerms, term]);

  const onSubmit = handleSubmit((form) => {
    // Enter gửi form ngay cả khi nút OK đang quay — chặn lượt thứ hai ở đây.
    if (update.isPending) return;
    const body = toUpdateTermBody(term, form);
    if (Object.keys(body).length === 0) {
      message.info(t('edit.unchanged'));
      return;
    }
    update.mutate(
      { id: term.id, body },
      {
        onSuccess: () => {
          message.success(t('edit.success'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('edit.title', { plan: term.planName })}
      open
      onClose={onClose}
      okText={t('edit.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={update.isPending}
    >
      <div className={styles.assignBody}>
        <div className={styles.contextLine}>
          {t('edit.period', { from: fmt.date(term.startsAt), to: fmt.date(term.endsAt) })}
        </div>
        <DialogForm onSubmit={onSubmit} labelWidth="lg">
          {priceEditable ? (
            <NumberField
              control={control}
              name="price"
              label={t('edit.price')}
              money
              min={0}
              required
              help={t('edit.priceHelp')}
            />
          ) : null}
          <DateTimeField control={control} name="endsAt" label={t('edit.endsAt')} />
          <SwitchField
            control={control}
            name="unlimitedVehicles"
            label={t('edit.unlimitedVehicles')}
          />
          {unlimited ? null : (
            <NumberField
              control={control}
              name="maxVehicles"
              label={t('edit.maxVehicles')}
              min={1}
              max={TERM_MAX_VEHICLES}
              required
            />
          )}
          <TextAreaField
            control={control}
            name="note"
            label={t('edit.note')}
            placeholder={t('edit.notePlaceholder')}
            rows={3}
            maxLength={1000}
            showCount
          />
        </DialogForm>
        <span className={styles.help}>{t('edit.endsAtHelp')}</span>

        {shifts.length > 0 ? (
          <div className={styles.preview}>
            <div>{t('edit.shiftNotice', { count: shifts.length })}</div>
            <ul className={styles.cascadeList}>
              {shifts.map((shift) => (
                <li key={shift.term.id}>
                  {t('cascadeItem', {
                    plan: shift.term.planName,
                    from: fmt.date(shift.startsAt.toISOString()),
                    to: fmt.date(shift.endsAt.toISOString()),
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
