'use client';

import { LockOutlined, MailOutlined, PhoneOutlined, SendOutlined } from '@ant-design/icons';
import { App, Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  accountEmailChangeSchema,
  accountPhoneChangeSchema,
  type AccountContactValues,
} from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useContactVerify } from '../hooks/use-contact-verify';
import { CONTACT_CHANNEL, type ContactChannel } from '../types';
import styles from './ContactVerifyModal.module.css';

const OTP_LENGTH = 6;

interface ContactVerifyModalProps {
  readonly channel: ContactChannel;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Giá trị hiện tại — chỉ để nói "đang là X", KHÔNG điền sẵn vào ô nhập (xem docblock). */
  readonly current: string | null;
}

/**
 * Đổi hoặc thêm email / số điện thoại — MỘT màn hình cho cả hai kênh.
 *
 * Hai bước, và bước hai là lý do màn hình này tồn tại: email và SĐT là định danh ĐĂNG NHẬP, nên
 * đổi chúng không thể chỉ là ghi một chuỗi. Người dùng phải chứng minh mình nhận được mã ở địa
 * chỉ/số MỚI, nếu không thì ai chiếm được một phiên sẽ chuyển tài khoản sang hộp thư của họ.
 *
 * Ô nhập luôn RỖNG chứ không điền sẵn giá trị cũ: việc ở đây là nhập một định danh mới, và một ô
 * đã có sẵn nội dung đúng thì mời người dùng bấm "Gửi mã" cho chính cái họ đang có.
 */
export function ContactVerifyModal({ channel, open, onClose, current }: ContactVerifyModalProps) {
  const t = useTranslations('Account.contact');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const isPhone = channel === CONTACT_CHANNEL.PHONE;
  const flow = useContactVerify(channel);
  const [code, setCode] = useState('');

  const resolver = useValidationResolver<AccountContactValues>(
    isPhone ? accountPhoneChangeSchema : accountEmailChangeSchema,
    'Account.validation',
  );
  const { control, handleSubmit } = useForm<AccountContactValues>({
    resolver,
    defaultValues: { identifier: '' },
  });

  /*
   * KHÔNG reset bằng effect: cả hai nơi gọi đều render hộp này CÓ ĐIỀU KIỆN (`AccountView`,
   * `QuickVehicleOwnerStep`), nên mỗi lần mở đã là một instance mới với state khởi tạo sạch —
   * mã cũ, lỗi cũ và định danh gõ dở của lượt trước không có đường sống sót sang lượt sau.
   * Reset trong effect vừa thừa vừa tạo một vòng render phụ, đúng thứ `react-hooks/set-state-in-effect`
   * chặn. Thêm nơi gọi thứ ba thì nó cũng phải render có điều kiện.
   */

  useEffect(() => {
    if (!flow.verified) return;
    message.success(isPhone ? t('phoneUpdated') : t('emailUpdated'));
    onClose();
  }, [flow.verified, isPhone, message, onClose, t]);

  const sendCode = handleSubmit((values) => flow.send(values.identifier));

  const title = isPhone
    ? current
      ? t('changePhoneTitle')
      : t('addPhoneTitle')
    : current
      ? t('changeEmailTitle')
      : t('addEmailTitle');

  /*
   * Nút chính nằm ở FOOTER của hộp thoại nhưng `<form>` ở trong thân, nên nó nối bằng
   * thuộc tính `form` — nhờ vậy Enter trong ô nhập vẫn gửi được. Bản trước đặt nút
   * `block` xếp chồng ngay trong thân, và đó là thứ làm hộp thoại trông như một danh sách
   * nút thay vì một biểu mẫu.
   */
  const formId = `${useId()}-contact`;
  const isIdentifierStep = flow.step === 'identifier';

  const footer = (
    <div className={styles.footer}>
      <Button onClick={onClose} disabled={flow.verifying}>
        {tCommon('actions.cancel')}
      </Button>
      {isIdentifierStep ? (
        <Button
          type="primary"
          htmlType="submit"
          form={formId}
          icon={<SendOutlined />}
          loading={flow.sending}
        >
          {t('sendCode')}
        </Button>
      ) : (
        <Button
          type="primary"
          loading={flow.verifying}
          disabled={code.length !== OTP_LENGTH}
          onClick={() => flow.verify(code)}
        >
          {t('confirmCode')}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={footer}
      confirmLoading={flow.sending || flow.verifying}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          {isIdentifierStep
            ? isPhone
              ? t('phoneLead')
              : t('emailLead')
            : t('codeSentTo')}{' '}
          {isIdentifierStep ? null : <strong className={styles.strong}>{flow.sentTo}</strong>}
        </p>

        {current && isIdentifierStep ? (
          <p className={styles.current}>
            {t('currentValue')} <strong className={styles.strong}>{current}</strong>
          </p>
        ) : null}

        {isIdentifierStep ? (
          <form id={formId} onSubmit={sendCode} noValidate className={styles.step}>
            <TextField
              control={control}
              name="identifier"
              type={isPhone ? 'tel' : 'email'}
              label={isPhone ? t('phoneLabel') : t('emailLabel')}
              placeholder={isPhone ? t('phonePlaceholder') : t('emailPlaceholder')}
              prefix={isPhone ? <PhoneOutlined /> : <MailOutlined />}
              autoComplete={isPhone ? 'tel' : 'email'}
              help={isPhone ? t('phoneHint') : t('emailHint')}
              autoFocus
              required
              disabled={flow.sending}
            />
          </form>
        ) : (
          <div className={styles.step}>
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={(full) => flow.verify(full)}
              disabled={flow.verifying}
              autoFocus
            />

            {flow.devCode ? (
              <p className={styles.devCode}>{t('devCode', { code: flow.devCode })}</p>
            ) : null}

            <div className={styles.altActions}>
              <Button type="link" size="small" onClick={flow.editIdentifier}>
                {isPhone ? t('editPhone') : t('editEmail')}
              </Button>
              <Button
                type="link"
                size="small"
                loading={flow.sending}
                disabled={flow.cooldown > 0}
                onClick={() => flow.send(flow.sentTo)}
              >
                {flow.cooldown > 0 ? t('resendIn', { seconds: flow.cooldown }) : t('resend')}
              </Button>
            </div>
          </div>
        )}

        {flow.error ? (
          <Alert type="error" showIcon title={errorMessage(flow.error)} className={styles.error} />
        ) : null}

        {/*
          Nói rõ nền tảng dùng số/email này vào việc gì. Người ta ngần ngại giao số điện thoại
          hơn hẳn giao một cái tên, và câu trả lời cho nỗi ngần ngại đó phải nằm NGAY chỗ hỏi —
          không phải trong trang điều khoản.
        */}
        <div className={styles.secure}>
          <span className={styles.secureIcon} aria-hidden="true">
            <LockOutlined />
          </span>
          <span className={styles.secureBody}>
            <span className={styles.secureTitle}>
              {isPhone ? t('securePhoneTitle') : t('secureEmailTitle')}
            </span>
            <span className={styles.secureDesc}>
              {isPhone ? t('securePhoneBody') : t('secureEmailBody')}
            </span>
          </span>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
