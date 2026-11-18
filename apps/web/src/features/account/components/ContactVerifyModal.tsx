'use client';

import { App, Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { OTP_POLICY } from '@xeprime/types';
import {
  accountEmailChangeSchema,
  accountPhoneChangeSchema,
  type AccountContactValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { LineIcon } from '@/components/icons/LineIcon';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { OtpDigitBoxes } from '@/features/phone-verification/components/OtpDigitBoxes';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import { maskEmailHead, maskPhoneTail } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { cx } from '@/lib/cx';
import { useContactVerify } from '../hooks/use-contact-verify';
import { CONTACT_CHANNEL, type ContactChannel } from '../types';
import styles from './ContactVerifyModal.module.css';

const OTP_LENGTH = OTP_POLICY.CODE_LENGTH;

interface ContactVerifyModalProps {
  readonly channel: ContactChannel;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Giá trị hiện tại - để nói "đang dùng X"; chỉ điền sẵn vào ô nhập khi hộp hỏi CHÍNH nó. */
  readonly current: string | null;
  /**
   * Hộp BẮT BUỘC - tài khoản chưa có SĐT đã xác minh (ADR 0060, `AccountPhoneGate`). Không đóng
   * được bằng nút X, Esc hay bấm nền; lối ra duy nhất ngoài xác minh là "Đăng xuất". Ô nhập điền
   * sẵn SĐT hiện có (chưa xác minh) của tài khoản: việc ở đây là CHỨNG MINH số đó, không phải đổi.
   */
  readonly required?: { readonly onSignOut: () => void };
  /**
   * Hộp NHẮC - site khách (ADR 0071, `AccountPhoneReminderProvider`). Giống hộp bắt buộc ở chỗ
   * điền sẵn SĐT hiện có và nói rõ vì sao cần, nhưng ĐÓNG ĐƯỢC: nút phụ là "Để sau" (gọi
   * `onClose`). `lead` là câu mở theo ngữ cảnh mở hộp (nhắc chung, hay đang gửi yêu cầu thuê).
   */
  readonly reminder?: { readonly lead: string };
  /**
   * XÁC MINH định danh HIỆN CÓ (nút "Xác minh" của trang tài khoản partner): mở hộp là gửi mã thẳng
   * tới `current`, không qua bước nhập. Gửi lỗi thì hộp đứng ở bước nhập, điền sẵn `current`.
   */
  readonly verifyCurrent?: boolean;
  /** Xác minh đúng mã xong - gọi trước `onClose` (đóng vì xác minh, không phải vì "Để sau"). */
  readonly onVerified?: () => void;
}

/**
 * Đổi, thêm hoặc xác minh email / số điện thoại - MỘT hộp cho cả hai kênh, mọi nơi gọi (trang tài
 * khoản hai site, hộp bắt buộc xác minh SĐT, wizard đăng xe nhanh). Design `24131:71845` (nhập) ·
 * `24131:72204` (mã): thanh hai bước dưới thân, mã sáu ô.
 *
 * Hai bước, và bước hai là lý do hộp này tồn tại: email và SĐT là định danh, nên đổi chúng không
 * thể chỉ là ghi một chuỗi. Người dùng phải chứng minh mình nhận được mã ở địa chỉ/số MỚI, nếu
 * không thì ai chiếm được một phiên sẽ chuyển tài khoản sang hộp thư của họ.
 *
 * Ô nhập RỖNG khi đổi (không điền sẵn giá trị cũ): một ô đã có sẵn nội dung đúng thì mời người
 * dùng bấm "Gửi mã" cho chính cái họ đang có. Giá trị cũ đứng ngay dưới ô ("Số đang dùng").
 */
export function ContactVerifyModal({
  channel,
  open,
  onClose,
  current,
  required,
  reminder,
  verifyCurrent = false,
  onVerified,
}: ContactVerifyModalProps) {
  const t = useTranslations('Account.contact');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const isPhone = channel === CONTACT_CHANNEL.PHONE;
  /** Hộp hỏi SĐT cho CHÍNH tài khoản (bắt buộc hoặc nhắc) - không phải lượt đổi số. */
  const asksAccountPhone = Boolean(required || reminder);
  /** Lượt ĐỔI sang một định danh khác định danh đang có - mới có "Số đang dùng" và câu hết hiệu lực. */
  const isChange = Boolean(current) && !asksAccountPhone && !verifyCurrent;
  const flow = useContactVerify(channel);
  const [code, setCode] = useState('');

  const resolver = useValidationResolver<AccountContactValues>(
    isPhone ? accountPhoneChangeSchema : accountEmailChangeSchema,
    'Account.validation',
  );
  const { control, handleSubmit } = useForm<AccountContactValues>({
    resolver,
    defaultValues: { identifier: asksAccountPhone || verifyCurrent ? (current ?? '') : '' },
  });

  /*
   * KHÔNG reset bằng effect: mọi nơi gọi render hộp này CÓ ĐIỀU KIỆN (`LoginMethods`, `AccountView`,
   * `AccountPhoneGate`, `QuickVehicleOwnerStep`), nên mỗi lần mở đã là một instance mới với state
   * khởi tạo sạch. Thêm nơi gọi mới thì nó cũng phải render có điều kiện.
   */

  /*
   * "Xác minh": gửi mã ngay khi mở. Cờ ref chặn lượt gửi thứ hai khi StrictMode chạy effect hai lần
   * (ref sống qua lượt gắn lại giả lập) - lượt thứ hai sẽ vấp cooldown của server và hiện lỗi giả.
   */
  const autoSent = useRef(false);
  useEffect(() => {
    if (!verifyCurrent || !current || autoSent.current) return;
    autoSent.current = true;
    flow.send(current);
    // Chỉ một lần cho mỗi lần mở hộp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flow.verified) return;
    message.success(isPhone ? t('phoneUpdated') : t('emailUpdated'));
    onVerified?.();
    onClose();
    // `onVerified` cố ý ngoài deps: chỉ lượt `verified` bật lên mới được gọi nó, không phải mỗi lần
    // nơi gọi truyền một hàm mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.verified, isPhone, message, onClose, t]);

  const sendCode = handleSubmit((values) => flow.send(values.identifier));

  const title = asksAccountPhone
    ? t('requiredTitle')
    : verifyCurrent
      ? isPhone
        ? t('verifyPhoneTitle')
        : t('verifyEmailTitle')
      : current
        ? isPhone
          ? t('updatePhoneTitle')
          : t('updateEmailTitle')
        : isPhone
          ? t('addPhoneTitle')
          : t('addEmailTitle');

  const subtitle = required
    ? t('requiredLead')
    : reminder
      ? reminder.lead
      : isPhone
        ? t('phoneSubtitle')
        : t('emailSubtitle');

  /*
   * Nút chính nằm ở FOOTER nhưng `<form>` ở trong thân, nên nó nối bằng thuộc tính `form` - nhờ
   * vậy Enter trong ô nhập vẫn gửi được.
   */
  const formId = `${useId()}-contact`;
  const isIdentifierStep = flow.step === 'identifier';
  const mask = (value: string) => (isPhone ? maskPhoneTail(value) : maskEmailHead(value));

  const footer = (
    <div className={styles.footer}>
      {required ? (
        <Button size="large" onClick={required.onSignOut} disabled={flow.verifying}>
          {t('signOut')}
        </Button>
      ) : (
        <Button size="large" onClick={onClose} disabled={flow.verifying}>
          {reminder ? t('later') : tCommon('actions.cancel')}
        </Button>
      )}
      {isIdentifierStep ? (
        <Button
          size="large"
          type="primary"
          htmlType="submit"
          form={formId}
          loading={flow.sending}
        >
          {t('sendCode')}
        </Button>
      ) : (
        <Button
          size="large"
          type="primary"
          loading={flow.verifying}
          disabled={code.length !== OTP_LENGTH}
          onClick={() => flow.verify(code)}
        >
          {isChange
            ? isPhone
              ? t('confirmPhoneChange')
              : t('confirmEmailChange')
            : t('confirmCode')}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      // Hộp bắt buộc: không đường đóng vô ý nào - nút "Đăng xuất" ở footer là lối ra tường minh.
      onClose={required ? () => undefined : onClose}
      closable={!required}
      closeOnEsc={!required}
      maskClosable={!required}
      title={<DialogHeading title={title} hint={subtitle} />}
      size="sm"
      className={styles.dialog}
      footer={footer}
      confirmLoading={flow.sending || flow.verifying}
    >
      <div className={styles.body}>
        {isIdentifierStep ? (
          <form id={formId} onSubmit={sendCode} noValidate className={styles.step}>
            <TextField
              control={control}
              name="identifier"
              type={isPhone ? 'tel' : 'email'}
              label={isPhone ? t('phoneLabel') : t('emailLabel')}
              placeholder={isPhone ? t('phonePlaceholder') : t('emailPlaceholder')}
              prefix={<LineIcon name={isPhone ? 'calling' : 'mail'} className={styles.inputIcon} />}
              autoComplete={isPhone ? 'tel' : 'email'}
              help={
                isChange && current
                  ? t.rich(isPhone ? 'currentPhone' : 'currentEmail', {
                      value: current,
                      strong: (chunks) => <strong className={styles.strong}>{chunks}</strong>,
                    })
                  : isPhone
                    ? t('phoneHint')
                    : t('emailHint')
              }
              autoFocus
              required
              disabled={flow.sending}
            />

            {/*
              Nói rõ nền tảng dùng số/email này vào việc gì - câu trả lời cho nỗi ngần ngại giao
              số điện thoại phải nằm NGAY chỗ hỏi, không phải trong trang điều khoản.
            */}
            <div className={styles.secure}>
              <p className={styles.secureTitle}>
                {isPhone ? t('securePhoneTitle') : t('secureEmailTitle')}
              </p>
              <p className={styles.secureBody}>
                {isPhone ? t('securePhoneBody') : t('secureEmailBody')}
              </p>
            </div>
          </form>
        ) : (
          <div className={styles.codeStep}>
            <div className={styles.codeHead}>
              <p className={styles.codeTitle}>{t('codeTitle')}</p>
              <p className={styles.codeSent}>
                {t.rich(isPhone ? 'codeSentPhone' : 'codeSentEmail', {
                  target: mask(flow.sentTo),
                  strong: (chunks) => <strong className={styles.strong}>{chunks}</strong>,
                })}
              </p>
            </div>

            <OtpDigitBoxes
              value={code}
              onChange={setCode}
              onComplete={(full) => flow.verify(full)}
              readOnly={flow.verifying}
              invalid={Boolean(flow.error)}
              autoFocus
            />

            {flow.devCode ? (
              <p className={styles.devCode}>{t('devCode', { code: flow.devCode })}</p>
            ) : null}

            <div className={styles.resendRow}>
              <span className={styles.resend}>
                {t('noCode')}{' '}
                {flow.cooldown > 0 ? (
                  t.rich('resendAfter', {
                    time: formatOtpCooldown(flow.cooldown),
                    strong: (chunks) => <strong className={styles.strong}>{chunks}</strong>,
                  })
                ) : (
                  <button
                    type="button"
                    className={styles.resendLink}
                    disabled={flow.sending}
                    onClick={() => flow.send(flow.sentTo)}
                  >
                    {t('resend')}
                  </button>
                )}
              </span>
              <Button type="link" className={styles.edit} onClick={flow.editIdentifier}>
                {isPhone ? t('editPhoneFull') : t('editEmail')}
              </Button>
            </div>

            {isChange && current ? (
              <p className={styles.changeNote}>
                {isPhone
                  ? t('phoneChangeNote', { old: maskPhoneTail(current) })
                  : t('emailChangeNote')}
              </p>
            ) : null}
          </div>
        )}

        {flow.error ? (
          <Alert type="error" showIcon title={errorMessage(flow.error)} className={styles.error} />
        ) : null}

        {/* Hai bước: nhập → mã. Chỉ để nhìn - tiêu đề và nút đã nói đang ở bước nào. */}
        <div className={styles.steps} aria-hidden="true">
          <span className={cx(styles.stepBar, styles.stepDone)} />
          <span className={cx(styles.stepBar, !isIdentifierStep && styles.stepDone)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
