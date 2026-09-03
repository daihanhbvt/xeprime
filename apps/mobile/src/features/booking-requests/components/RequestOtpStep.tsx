import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OtpCodeInput, OTP_LENGTH } from '@/features/phone-verification/components/OtpCodeInput';
import { maskPhone } from '@/features/phone-verification/mask';
import type { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Bước xác thực SĐT — CHỈ xuất hiện khi hệ thống chưa biết số này là của khách.
 *
 * Mã KHÔNG đi trong body của yêu cầu thuê: `CreateBookingRequestDto` không có trường token.
 * Xác thực xảy ra TRƯỚC (purpose `booking`), server tự tra khi nhận yêu cầu — nên bước này chỉ
 * cần gọi `verify` rồi báo cho wizard đi tiếp.
 */
export function RequestOtpStep({
  phone,
  otp,
  onVerified,
  onEditPhone,
}: {
  phone: string;
  otp: ReturnType<typeof usePhoneVerify>;
  onVerified: () => void;
  onEditPhone: () => void;
}) {
  const t = useTranslations('BookingRequests.flow.otp');
  const tActions = useTranslations('BookingRequests.flow.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const [code, setCode] = useState('');

  // Lỗi đi bằng TOAST chứ không phải dòng đỏ dưới ô: bàn phím che nửa dưới màn, đúng chỗ dòng đỏ rơi vào.
  function confirm(next = code) {
    if (next.length !== OTP_LENGTH || otp.verifying) return;
    otp.verify(phone, next, { onError: (error) => toast.showError(errorMessage(error)) });
  }

  function resend() {
    otp.send(phone);
  }

  // Trong effect chứ không trong thân render: gọi `setStep` lúc render là update-during-render
  // của component khác, React cảnh báo đúng vì nó có thể lặp vô hạn.
  useEffect(() => {
    if (otp.status === 'verified') onVerified();
  }, [onVerified, otp.status]);

  return (
    <Card>
      <YStack gap={space.lg} ai="center">
        <YStack
          w={space.xl + space.md}
          h={space.xl + space.md}
          br={radius.pill}
          bg={colors.primaryLight}
          ai="center"
          jc="center"
        >
          <Ionicons name="phone-portrait-outline" size={iconSize.lg} color={colors.primaryActive} />
        </YStack>

        <YStack gap={space.xs} ai="center">
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} ta="center">
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
            {t('hint', { phone: maskPhone(phone) })}
          </Text>
        </YStack>

        <OtpCodeInput
          value={code}
          onChange={(next) => {
            if (otp.error) otp.clearError();
            setCode(next);
          }}
          onComplete={confirm}
          disabled={otp.verifying}
          autoFocus
        />

        {/* `devCode` chỉ có ở môi trường mock — production không bao giờ trả trường này. */}
        {otp.devCode ? (
          <YStack alignSelf="stretch" p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('devCode', { code: otp.devCode })}
            </Text>
          </YStack>
        ) : null}

        <YStack alignSelf="stretch">
          <Button
            label={tActions('verify')}
            size="lg"
            loading={otp.verifying}
            disabled={code.length !== OTP_LENGTH}
            onPress={() => confirm()}
          />
        </YStack>

        <XStack gap={space.sm} alignSelf="stretch">
          <YStack f={1}>
            {/* Nhãn NGẮN: hai nút chia đôi một hàng trên màn hẹp, nhãn đầy đủ bị cắt mất phần nói nó làm gì. */}
            <Button label={t('editPhoneShort')} variant="ghost" onPress={onEditPhone} />
          </YStack>
          <YStack f={1}>
            <Button
              label={otp.cooldown > 0 ? t('resendIn', { seconds: otp.cooldown }) : t('resend')}
              variant="ghost"
              disabled={otp.cooldown > 0 || otp.sending}
              onPress={resend}
            />
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}
