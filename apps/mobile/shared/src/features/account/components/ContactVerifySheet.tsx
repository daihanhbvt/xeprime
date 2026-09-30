import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  accountEmailChangeSchema,
  accountPhoneChangeSchema,
  type AccountContactValues,
} from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InlineAction } from '@/components/ui/InlineAction';
import { TextField } from '@/components/ui/TextField';
import { OtpCodeInput, OTP_LENGTH } from '@/features/phone-verification/components/OtpCodeInput';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { CONTACT_CHANNEL, type ContactChannel } from '../api';
import { useContactVerify } from '../hooks/use-contact-verify';

interface Props {
  readonly channel: ContactChannel;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Giá trị hiện tại — chỉ để nói "đang là X", KHÔNG điền sẵn vào ô nhập (xem docblock). */
  readonly current: string | null;
}

/**
 * Đổi hoặc thêm email / số điện thoại — MỘT bề mặt cho cả hai kênh. Bản native của
 * `ContactVerifyModal`.
 *
 * Hai bước, và bước hai là lý do màn này tồn tại: email và SĐT là định danh ĐĂNG NHẬP, nên đổi
 * chúng không thể chỉ là ghi một chuỗi. Người dùng phải chứng minh mình nhận được mã ở địa chỉ/số
 * MỚI, nếu không thì ai chiếm được một phiên sẽ chuyển tài khoản sang hộp thư của họ.
 *
 * Ô nhập luôn RỖNG chứ không điền sẵn giá trị cũ: việc ở đây là nhập một định danh mới, và một ô
 * đã có sẵn nội dung đúng thì mời người dùng bấm "Gửi mã" cho chính cái họ đang có.
 */
export function ContactVerifySheet({ channel, open, onClose, current }: Props) {
  const t = useTranslations('Account.contact');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
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
   * KHÔNG có effect "reset khi mở" như bản web.
   *
   * Web giữ modal trong cây suốt vòng đời trang nên phải tự dọn state mỗi lượt mở. Ở đây màn cha
   * render tấm trượt theo điều kiện (`editingContact ? <sheet/> : null`) và gắn `key` theo kênh,
   * nên mỗi lượt mở là một lượt MOUNT mới — state đã sạch sẵn. Thêm effect vào chỉ là gọi
   * `setState` đồng bộ ngay trong effect, đúng thứ React Compiler cảnh báo.
   */

  useEffect(() => {
    if (!flow.verified) return;
    toast.showSuccess(isPhone ? t('phoneUpdated') : t('emailUpdated'));
    onClose();
  }, [flow.verified, isPhone, toast, onClose, t]);

  const sendCode = handleSubmit((values) => flow.send(values.identifier));

  const title = isPhone
    ? current
      ? t('changePhoneTitle')
      : t('addPhoneTitle')
    : current
      ? t('changeEmailTitle')
      : t('addEmailTitle');

  const isIdentifierStep = flow.step === 'identifier';

  const footer = (
    <XStack gap={space.sm}>
      <YStack flexShrink={0}>
        <Button
          label={tCommon('cancel')}
          variant="ghost"
          disabled={flow.verifying}
          onPress={onClose}
        />
      </YStack>
      {/*
        "Huỷ" co vừa chữ, nút gửi lấy phần còn lại — nhãn tiếng Việt "Gửi mã xác thực" dài 15
        ký tự kèm icon, cần mọi dp còn lại của hàng.
      */}
      <YStack f={1}>
        {isIdentifierStep ? (
          <Button
            label={t('sendCode')}
            icon="send-outline"
            loading={flow.sending}
            onPress={() => void sendCode()}
          />
        ) : (
          <Button
            label={t('confirmCode')}
            icon="checkmark-outline"
            loading={flow.verifying}
            disabled={code.length !== OTP_LENGTH}
            onPress={() => flow.verify(code)}
          />
        )}
      </YStack>
    </XStack>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={title} footer={footer}>
      <YStack gap={space.md}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {isIdentifierStep ? (isPhone ? t('phoneLead') : t('emailLead')) : t('codeSentTo')}
          {isIdentifierStep ? null : (
            <Text col={colors.text} fow={fontWeight.semibold}>
              {` ${flow.sentTo}`}
            </Text>
          )}
        </Text>

        {current && isIdentifierStep ? (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('currentValue')}
            <Text col={colors.text} fow={fontWeight.semibold}>
              {` ${current}`}
            </Text>
          </Text>
        ) : null}

        {isIdentifierStep ? (
          <TextField
            control={control}
            name="identifier"
            label={isPhone ? t('phoneLabel') : t('emailLabel')}
            placeholder={isPhone ? t('phonePlaceholder') : t('emailPlaceholder')}
            hint={isPhone ? t('phoneHint') : t('emailHint')}
            icon={isPhone ? 'call-outline' : 'mail-outline'}
            keyboardType={isPhone ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoComplete={isPhone ? 'tel' : 'email'}
            editable={!flow.sending}
            required
          />
        ) : (
          <YStack gap={space.md}>
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={(full) => flow.verify(full)}
              disabled={flow.verifying}
              autoFocus
            />

            {flow.devCode ? (
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('devCode', { code: flow.devCode })}
              </Text>
            ) : null}

            <XStack ai="center" jc="space-between" gap={space.sm}>
              <InlineAction
                label={isPhone ? t('editPhone') : t('editEmail')}
                onPress={flow.editIdentifier}
              />
              {flow.cooldown > 0 ? (
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {t('resendIn', { seconds: flow.cooldown })}
                </Text>
              ) : (
                <InlineAction label={t('resend')} onPress={() => flow.send(flow.sentTo)} />
              )}
            </XStack>
          </YStack>
        )}

        {flow.error ? <Callout tone="danger">{errorMessage(flow.error)}</Callout> : null}

        {/*
          Nói rõ nền tảng dùng số/email này vào việc gì. Người ta ngần ngại giao số điện thoại hơn
          hẳn giao một cái tên, và câu trả lời cho nỗi ngần ngại đó phải nằm NGAY chỗ hỏi — không
          phải trong trang điều khoản.
        */}
        <XStack ai="flex-start" gap={space.sm} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
          <YStack pt={1}>
            <Ionicons name="lock-closed-outline" size={iconSize.sm} color={colors.textMuted} />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {isPhone ? t('securePhoneTitle') : t('secureEmailTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {isPhone ? t('securePhoneBody') : t('secureEmailBody')}
            </Text>
          </YStack>
        </XStack>
      </YStack>
    </BottomSheet>
  );
}
