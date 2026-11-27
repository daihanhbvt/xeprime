'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  DepositRequiredSavedError,
  useSaveDepositEdit,
} from '@/features/payments/hooks/use-payments';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { absoluteMoney, isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import styles from './CollateralSideCard.module.css';

const DEPOSIT_MAX = 999_999_999_999;

interface CollateralCashDialogProps {
  bookingId: string;
  /** Cọc tiền đang ghi trên đơn - chuỗi tiền (ADR 0007). */
  current: string;
  /** Cọc RÒNG đã thu (quyết toán). `null` = chưa đọc được / phiên hỗ trợ - ẩn hẳn phần "Đã thu". */
  received: string | null;
  /**
   * Được sửa số đã thu không: có quyền ghi thu tiền và cọc chưa sang chặng hoàn. Sửa sau khi đã ghi
   * hoàn cọc đi qua phần hoàn cọc (server cũng chặn).
   */
  collectedEditable: boolean;
  open: boolean;
  onClose: () => void;
}

/**
 * Sửa tiền cọc của MỘT đơn ngay trên thẻ "Cọc & thế chấp" (ADR 0109). Hai con số, hai đường ghi:
 *  - "Mức cọc phải thu" - `PATCH /bookings/:id` (`depositAmount`), quyền sửa đơn;
 *  - "Đã thu" - `POST /bookings/:id/deposit-adjustments`: server tính chênh với cọc ròng và ghi thêm
 *    một khoản thu cọc hoặc một khoản trả lại khách. Không sửa/xoá khoản cũ - sổ chỉ thêm.
 * Dòng tóm tắt (thu dư / còn thiếu / đã đủ) tính lại ngay khi gõ, bằng phép trừ trên chuỗi tiền.
 * Không hỏi lý do: phiếu điều chỉnh mang ghi chú mặc định, audit giữ số cũ → số mới.
 */
export function CollateralCashDialog({
  bookingId,
  current,
  received,
  collectedEditable,
  open,
  onClose,
}: CollateralCashDialogProps) {
  const t = useTranslations('Bookings.detailPage.side.collateral.cashDialog');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveDepositEdit(bookingId);
  const showCollected = received !== null;
  const receivedNum = Number(received ?? 0) || 0;

  const schema = useMemo(
    () =>
      yup.object({
        depositAmount: yup
          .number()
          .typeError(t('invalid'))
          .min(0, t('negative'))
          .max(DEPOSIT_MAX, t('invalid'))
          .required(t('required')),
        collectedAmount: yup
          .number()
          .typeError(t('invalid'))
          .min(0, t('negative'))
          .max(DEPOSIT_MAX, t('invalid'))
          .required(t('collectedRequired')),
      }),
    [t],
  );
  type Values = yup.InferType<typeof schema>;

  const defaults = (): Values => ({
    depositAmount: Number(current) || 0,
    collectedAmount: receivedNum,
  });
  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: defaults(),
  });

  // Mở lại sau khi số vừa đổi ⇒ nạp số đang lưu, không giữ số gõ dở của lần trước.
  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `defaults` chỉ đọc current/received
  }, [open, current, received, reset]);

  const [requiredLive, collectedLive] = useWatch({
    control,
    name: ['depositAmount', 'collectedAmount'],
  });
  const requiredStr = String(Math.max(0, Number(requiredLive) || 0));
  const collectedStr = String(Math.max(0, Number(collectedLive) || 0));
  const balance = subtractMoney(collectedStr, requiredStr);
  const adjustDiff = subtractMoney(collectedStr, received ?? '0');
  const collectedChanged = showCollected && collectedEditable && !isZeroMoney(adjustDiff);

  const summary = isZeroMoney(collectedStr)
    ? isZeroMoney(requiredStr)
      ? null
      : { text: t('summaryNone'), tone: styles.cashPending }
    : isZeroMoney(balance)
      ? { text: t('summaryEven'), tone: styles.cashDone }
      : isNegativeMoney(balance)
        ? {
            text: t('summaryShort', { amount: fmt.money(absoluteMoney(balance) ?? '0') }),
            tone: styles.cashPending,
          }
        : { text: t('summaryOver', { amount: fmt.money(balance) }), tone: styles.cashOver };

  const pending = save.isPending;

  async function submit(values: Values) {
    if (pending) return;
    const nextRequired = String(values.depositAmount);
    const requiredChanged = nextRequired !== String(Number(current) || 0);
    if (requiredChanged || collectedChanged) {
      try {
        await save.mutateAsync({
          depositAmount: requiredChanged ? nextRequired : null,
          collectedAmount: collectedChanged ? String(values.collectedAmount) : null,
        });
      } catch (err) {
        // Mức cọc đã lưu mà số đã thu lỗi - nói rõ phần nào chưa xong, giữ hộp mở để sửa tiếp.
        message.error(
          err instanceof DepositRequiredSavedError
            ? t('requiredSavedAdjustFailed', { error: errorMessage(err.cause) })
            : errorMessage(err),
        );
        return;
      }
    }
    message.success(t('saved'));
    onClose();
  }

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={tCommon('actions.save')}
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={pending}
    >
      <DialogForm labelPosition="top" onSubmit={(event) => void handleSubmit(submit)(event)}>
        <div className={styles.cashCurrent}>
          <span>{t('current')}</span>
          <b>{isZeroMoney(current) ? t('none') : fmt.money(current)}</b>
        </div>
        <NumberField
          control={control}
          name="depositAmount"
          label={t('requiredLabel')}
          help={t('hint')}
          money
          min={0}
          required
        />
        {showCollected ? (
          collectedEditable ? (
            <>
              <NumberField
                control={control}
                name="collectedAmount"
                label={t('collected')}
                help={t('collectedHint')}
                money
                min={0}
                required
              />
              {collectedChanged ? (
                <p className={styles.cashAdjustNote}>
                  {isNegativeMoney(adjustDiff)
                    ? t('adjustDown', { amount: fmt.money(absoluteMoney(adjustDiff) ?? '0') })
                    : t('adjustUp', { amount: fmt.money(adjustDiff) })}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.cashAdjustNote}>
              {t('collectedLocked', { amount: fmt.money(received ?? '0') })}
            </p>
          )
        ) : null}
        {showCollected && summary ? (
          <p className={cx(styles.cashSummary, summary.tone)} role="status" aria-live="polite">
            {summary.text}
          </p>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
