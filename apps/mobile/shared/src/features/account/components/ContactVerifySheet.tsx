import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
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
import { FitOneLineText } from '@/components/ui/FitOneLineText';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { OtpCodeInput, OTP_LENGTH } from '@/features/phone-verification/components/OtpCodeInput';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import { maskEmailHead, maskPhoneTail } from '@/features/phone-verification/mask';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { CONTACT_CHANNEL, type ContactChannel } from '../api';
import { useContactVerify } from '../hooks/use-contact-verify';

interface Props {
  readonly channel: ContactChannel;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Giá trị hiện tại — chỉ để nói "đang là X", KHÔNG điền sẵn vào ô nhập của lượt ĐỔI (xem docblock). */
  readonly current: string | null;
  /**
   * Tấm BẮT BUỘC — tài khoản chưa có SĐT đã xác minh (ADR 0060, `AccountPhoneGate`). Không đóng
   * được bằng nút X, vuốt hay bấm nền; lối ra duy nhất ngoài xác minh là "Đăng xuất". Ô nhập điền
   * sẵn SĐT hiện có (chưa xác minh) của tài khoản: việc ở đây là CHỨNG MINH số đó, không phải đổi.
   */
  readonly required?: { readonly onSignOut: () => void };
  /**
   * Tấm NHẮC — app khách (ADR 0071, `AccountPhoneReminderProvider`). Giống tấm bắt buộc ở chỗ
   * điền sẵn SĐT hiện có và nói rõ vì sao cần, nhưng ĐÓNG ĐƯỢC: nút phụ là "Để sau" (gọi
   * `onClose`). `lead` là câu mở theo ngữ cảnh mở tấm (nhắc chung, hay đang gửi yêu cầu thuê).
   */
  readonly reminder?: { readonly lead: string };
  /**
   * Xác minh CHÍNH định danh đang có (nút "Xác minh" cạnh email/SĐT chưa xác minh — web
   * `verifyCurrent`): mở tấm là gửi mã ngay tới `current`, không qua bước nhập. Gửi lỗi thì tấm
   * đứng ở bước nhập, điền sẵn `current`.
   */
  readonly verifyCurrent?: boolean;
  /** Xác minh đúng mã xong — gọi trước `onClose` (đóng vì xác minh, không phải vì "Để sau"). */
  readonly onVerified?: () => void;
}

/** Figma `24231:109668`: hai đoạn 4px cách 8 dưới thân - đoạn 2 sáng khi sang bước nhập mã. */
const STEP_BAR = 4;
/** Figma `24231:109459` "Profile Settings": khối "được bảo mật" đệm 12, các dòng cách 8. */
const SECURE_PAD = 12;
const NO_SHRINK = { flexShrink: 0 } as const;

/**
 * Đổi, thêm hoặc xác minh email / số điện thoại — MỘT tấm cho cả hai kênh. Bản native của web
 * `ContactVerifyModal`; dáng theo Figma Partner `24231:109262` (nhập) · `24231:109668` (mã).
 *
 * Hai bước, và bước hai là lý do tấm này tồn tại: email và SĐT là định danh ĐĂNG NHẬP, nên đổi
 * chúng không thể chỉ là ghi một chuỗi. Người dùng phải chứng minh mình nhận được mã ở địa chỉ/số
 * MỚI, nếu không thì ai chiếm được một phiên sẽ chuyển tài khoản sang hộp thư của họ.
 *
 * Lượt ĐỔI: ô nhập luôn RỖNG chứ không điền sẵn giá trị cũ - việc ở đây là nhập một định danh mới;
 * dưới ô là "Số đang dùng", và ở bước mã là câu "Số cũ … sẽ không còn hiệu lực".
 *
 * Không có effect "reset khi mở": mọi nơi gọi render tấm theo điều kiện và gắn `key`, nên mỗi lượt
 * mở là một lượt MOUNT mới - state đã sạch sẵn.
 */
export function ContactVerifySheet({
  channel,
  open,
  onClose,
  current,
  required,
  reminder,
  verifyCurrent = false,
  onVerified,
}: Props) {
  const colors = useColors();
  const t = useTranslations('Account.contact');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const isPhone = channel === CONTACT_CHANNEL.PHONE;
  /** Tấm hỏi SĐT cho CHÍNH tài khoản (bắt buộc hoặc nhắc) — không phải lượt đổi số ở màn tài khoản. */
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

  // Xác minh định danh đang có: gửi mã ngay khi mở - một lần cho mỗi lần mở tấm.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!verifyCurrent || !current || autoSent.current) return;
    autoSent.current = true;
    flow.send(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flow.verified) return;
    toast.showSuccess(isPhone ? t('phoneUpdated') : t('emailUpdated'));
    onVerified?.();
    onClose();
    // `onVerified` cố ý ngoài deps (như web): chỉ lượt `verified` bật lên mới được gọi nó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.verified, isPhone, toast, onClose, t]);

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

  const isIdentifierStep = flow.step === 'identifier';
  const mask = (value: string) => (isPhone ? maskPhoneTail(value) : maskEmailHead(value));

  /** Đoạn đậm trong câu - lặp lại MỌI thuộc tính chữ (Text lồng của Tamagui không kế thừa chắc chắn). */
  const strong = useCallback(
    (chunks: ReactNode) => (
      <Text
        col={colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fontFamily={FONT_FAMILY.semibold}
        fow={fontWeight.semibold}
      >
        {chunks}
      </Text>
    ),
    [colors.text],
  );

  const footer = (
    <XStack gap={space.sm + space.xs}>
      <YStack flexShrink={0}>
        {required ? (
          <Button
            label={t('signOut')}
            variant="neutral"
            disabled={flow.verifying}
            onPress={required.onSignOut}
          />
        ) : (
          <Button
            label={reminder ? t('later') : tCommon('cancel')}
            variant="neutral"
            disabled={flow.verifying}
            onPress={onClose}
          />
        )}
      </YStack>
      {/* "Huỷ" co vừa chữ, nút chính lấy phần còn lại. */}
      <YStack f={1}>
        {isIdentifierStep ? (
          <Button label={t('sendCode')} loading={flow.sending} onPress={() => void sendCode()} />
        ) : (
          <Button
            label={
              isChange ? (isPhone ? t('confirmPhoneChange') : t('confirmEmailChange')) : t('confirmCode')
            }
            loading={flow.verifying}
            disabled={code.length !== OTP_LENGTH}
            onPress={() => flow.verify(code)}
          />
        )}
      </YStack>
    </XStack>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      chrome="v2"
      headerDivider
      // Tấm bắt buộc: không đường đóng vô ý nào — "Đăng xuất" ở footer là lối ra tường minh.
      dismissable={!required}
    >
      <YStack gap={isIdentifierStep ? space.sm + space.xs : space.md}>
        {isIdentifierStep ? (
          <>
            <TextField
              control={control}
              name="identifier"
              label={isPhone ? t('phoneLabel') : t('emailLabel')}
              placeholder={isPhone ? t('phonePlaceholder') : t('emailPlaceholder')}
              {...(isChange ? {} : { hint: isPhone ? t('phoneHint') : t('emailHint') })}
              icon={isPhone ? 'call-outline' : 'mail-outline'}
              keyboardType={isPhone ? 'phone-pad' : 'email-address'}
              autoCapitalize="none"
              autoComplete={isPhone ? 'tel' : 'email'}
              editable={!flow.sending}
              autoFocus
              required
              afterControl={
                isChange && current ? (
                  <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                    {t.rich(isPhone ? 'currentPhone' : 'currentEmail', { value: current, strong: (chunks) => (
                      <Text
                        col={colors.text}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                        fontFamily={FONT_FAMILY.body}
                        fow={fontWeight.regular}
                      >
                        {chunks}
                      </Text>
                    ) })}
                  </Text>
                ) : undefined
              }
            />

            {/*
              Nói rõ nền tảng dùng số/email này vào việc gì - câu trả lời cho nỗi ngần ngại giao
              số điện thoại phải nằm NGAY chỗ hỏi, không phải trong trang điều khoản.
            */}
            <YStack bg={colors.background} br={radius.control} p={SECURE_PAD} gap={space.sm}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
              >
                {isPhone ? t('securePhoneTitle') : t('secureEmailTitle')}
              </Text>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {isPhone ? t('securePhoneBody') : t('secureEmailBody')}
              </Text>
            </YStack>
          </>
        ) : (
          <>
            <YStack ai="center" gap={2}>
              <Text
                col={colors.text}
                fos={typeScale.heading.fontSize}
                lh={typeScale.heading.lineHeight}
                fow={fontWeight.semibold}
                ta="center"
              >
                {t('codeTitle')}
              </Text>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} ta="center">
                {t.rich(isPhone ? 'codeSentPhone' : 'codeSentEmail', {
                  target: mask(flow.sentTo),
                  strong,
                })}
              </Text>
            </YStack>

            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={(full) => flow.verify(full)}
              disabled={flow.verifying}
              invalid={Boolean(flow.error)}
              look="v2"
              autoFocus
            />

            {flow.devCode ? (
              <Text col={colors.placeholder} fos={typeScale.label.fontSize} ta="center">
                {t('devCode', { code: flow.devCode })}
              </Text>
            ) : null}

            <XStack ai="center" jc="space-between" gap={space.sm}>
              {/* Figma `24231:109924` là MỘT dòng (whitespace-nowrap): thiếu chỗ thì co chữ, không xuống hàng. */}
              <YStack f={1} minWidth={0}>
                <FitOneLineText
                  col={colors.textMuted}
                  fontSize={typeScale.body.fontSize}
                  lineHeight={typeScale.body.lineHeight}
                >
                  {(size) => (
                    <>
                      {`${t('noCode')} `}
                      {flow.cooldown > 0 ? (
                        t.rich('resendAfter', {
                          time: formatOtpCooldown(flow.cooldown),
                          strong: (chunks) => (
                            <Text
                              col={colors.text}
                              fos={size}
                              fontFamily={FONT_FAMILY.semibold}
                              fow={fontWeight.semibold}
                            >
                              {chunks}
                            </Text>
                          ),
                        })
                      ) : (
                        <Text
                          col={colors.textMuted}
                          fos={size}
                          fontFamily={FONT_FAMILY.medium}
                          fow={fontWeight.medium}
                          textDecorationLine="underline"
                          accessibilityRole="button"
                          onPress={flow.sending ? undefined : () => flow.send(flow.sentTo)}
                        >
                          {t('resend')}
                        </Text>
                      )}
                    </>
                  )}
                </FitOneLineText>
              </YStack>
              <Pressable
                onPress={flow.editIdentifier}
                accessibilityRole="button"
                hitSlop={space.sm}
                style={NO_SHRINK}
              >
                <Text
                  numberOfLines={1}
                  col={colors.brandLink}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                >
                  {isPhone ? t('editPhoneFull') : t('editEmail')}
                </Text>
              </Pressable>
            </XStack>

            {isChange && current ? (
              <Text
                col={colors.textPlaceholder}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fontStyle="italic"
                ta="center"
              >
                {isPhone ? t('phoneChangeNote', { old: maskPhoneTail(current) }) : t('emailChangeNote')}
              </Text>
            ) : null}
          </>
        )}

        {flow.error ? <Callout tone="danger">{errorMessage(flow.error)}</Callout> : null}

        {/* Hai bước: nhập → mã. Chỉ để nhìn - tiêu đề và nút đã nói đang ở bước nào. */}
        <XStack gap={space.sm} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <YStack f={1} h={STEP_BAR} br={radius.pill} bg={colors.brandShape} />
          <YStack
            f={1}
            h={STEP_BAR}
            br={radius.pill}
            bg={isIdentifierStep ? colors.surfaceMuted : colors.brandShape}
          />
        </XStack>
      </YStack>
    </BottomSheet>
  );
}
