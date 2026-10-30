import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { formatOtpCooldown } from '../format-cooldown';
import type { usePhoneVerify } from '../hooks/use-phone-verify';
import { maskPhone } from '../mask';
import { OTP_LENGTH, OtpCodeInput } from './OtpCodeInput';

/**
 * Bước NHẬP MÃ OTP — bản native của web `OtpCodeStep` (ADR 0060), dùng ở bước hai của đăng ký tài
 * khoản. Chỉ là phần giao diện của một mã đã gửi: ô mã, đếm ngược gửi lại, "sửa thông tin", mã
 * dev/mã test. Việc mã đó MỞ ra cái gì thuộc về nơi gọi — component không gọi API nào ngoài gửi lại
 * mã qua `verify.send`.
 */
export function OtpCodeStep({
  phone,
  verify,
  code,
  onCodeChange,
  onSubmit,
  submitLabel,
  submitting,
  onEdit,
  editLabel,
}: {
  phone: string;
  verify: ReturnType<typeof usePhoneVerify>;
  code: string;
  onCodeChange: (code: string) => void;
  /** Bấm nút chính, hoặc gõ đủ 6 số. */
  onSubmit: (code: string) => void;
  submitLabel: string;
  submitting: boolean;
  /** Quay lại sửa thông tin — mã đã gửi vẫn tính cooldown ở server. */
  onEdit: () => void;
  editLabel: string;
}) {
  const colors = useColors();
  const t = useTranslations('Auth.otp');
  // Đếm ngược của cổng xác minh tài khoản — cùng câu + đồng hồ "00:58" với `VerifyAccountDialog` web.
  const tVerify = useTranslations('Auth.market.verify');
  const sent = verify.status === 'code_sent';
  const ready = code.length === OTP_LENGTH && !submitting;

  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        <OtpCodeInput
          value={code}
          onChange={onCodeChange}
          onComplete={(full) => {
            if (!submitting) onSubmit(full);
          }}
          disabled={submitting}
          autoFocus
        />
        {sent || verify.testCodeEnabled ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {sent ? t('codeHint', { phone: maskPhone(phone) }) : t('testCodeHint')}
          </Text>
        ) : null}
        {verify.devCode ? (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('devCode', { code: verify.devCode })}
          </Text>
        ) : null}
      </YStack>

      <Button
        label={submitLabel}
        icon="checkmark-outline"
        onPress={() => onSubmit(code)}
        loading={submitting}
        disabled={!ready}
      />

      <XStack ai="center" jc="space-between" gap={space.sm}>
        <InlineAction label={editLabel} onPress={submitting ? () => undefined : onEdit} />
        {verify.cooldown > 0 ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {tVerify('resendIn', { time: formatOtpCooldown(verify.cooldown) })}
          </Text>
        ) : (
          <InlineAction
            label={sent ? t('resend') : t('sendCode')}
            onPress={() => verify.send(phone)}
          />
        )}
      </XStack>
    </YStack>
  );
}
