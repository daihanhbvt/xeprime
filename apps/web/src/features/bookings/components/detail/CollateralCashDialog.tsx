'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import { useUpdateBooking } from '../../hooks/use-booking-mutations';
import styles from './CollateralSideCard.module.css';

const DEPOSIT_MAX = 999_999_999_999;

interface CollateralCashDialogProps {
  bookingId: string;
  /** Cọc tiền đang ghi trên đơn - chuỗi tiền (ADR 0007). */
  current: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Sửa tiền cọc của MỘT đơn ngay trên thẻ "Cọc & thế chấp" (26/11/2026 - cọc linh động theo từng
 * khách, ADR 0109). Đi qua đúng đường sửa đơn sẵn có (`PATCH /bookings/:id`, trường
 * `depositAmount`), nên quyền và luật đơn đã khép do server giữ. Khoản đã thu nằm ở sổ thu tiền,
 * không đổi theo con số này - thẻ tự tính lại "còn thiếu" từ quyết toán.
 */
export function CollateralCashDialog({
  bookingId,
  current,
  open,
  onClose,
}: CollateralCashDialogProps) {
  const t = useTranslations('Bookings.detailPage.side.collateral.cashDialog');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateBooking(bookingId);

  const schema = useMemo(
    () =>
      yup.object({
        depositAmount: yup
          .number()
          .typeError(t('invalid'))
          .min(0, t('negative'))
          .max(DEPOSIT_MAX, t('invalid'))
          .required(t('required')),
      }),
    [t],
  );
  type Values = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { depositAmount: Number(current) || 0 },
  });

  // Mở lại sau khi số vừa đổi ⇒ nạp số đang lưu, không giữ số gõ dở của lần trước.
  useEffect(() => {
    if (open) reset({ depositAmount: Number(current) || 0 });
  }, [open, current, reset]);

  function submit(values: Values) {
    if (update.isPending) return;
    update.mutate(
      { depositAmount: String(values.depositAmount) },
      {
        onSuccess: () => {
          message.success(t('saved'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={tCommon('actions.save')}
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={update.isPending}
    >
      <DialogForm labelPosition="top" onSubmit={(event) => void handleSubmit(submit)(event)}>
        <div className={styles.cashCurrent}>
          <span>{t('current')}</span>
          <b>{isZeroMoney(current) ? t('none') : fmt.money(current)}</b>
        </div>
        <NumberField
          control={control}
          name="depositAmount"
          label={t('field')}
          help={t('hint')}
          money
          min={0}
          required
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
