import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PASSWORD_MIN } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale, type AppColors } from '@/theme/tokens';
import { PASSWORD_STRENGTH_STEPS, useChangePasswordForm } from '../hooks/use-change-password-form';

const STEPS = Array.from({ length: PASSWORD_STRENGTH_STEPS }, (_, i) => i + 1);
/** Figma `24231:108952`: bốn đoạn cao 6 cách 4, nhãn cách thanh 16. */
const BAR_HEIGHT = 6;
const BAR_GAP = 4;
const TICK = 16;
const GAP_12 = 12;

/** Nhãn gọn của bản vẽ cho bốn luật (web `SHORT_RULES`); luật lạ rơi về nhãn đầy đủ của hook. */
const SHORT_RULES = ['passwordTooShort', 'passwordNeedsLetter', 'passwordNeedsDigit', 'notSameAsCurrent'] as const;
type ShortRule = (typeof SHORT_RULES)[number];
const isShortRule = (key: string): key is ShortRule => (SHORT_RULES as readonly string[]).includes(key);

/** Nhãn + sắc của từng nấc độ mạnh 1…4 (web `STRENGTH`): đỏ · cam · cam đậm · xanh. */
const STRENGTH = {
  1: { key: 'weak', tone: (c: AppColors) => c.danger },
  2: { key: 'fair', tone: (c: AppColors) => c.warning },
  3: { key: 'good', tone: (c: AppColors) => c.warningHigh },
  4: { key: 'strong', tone: (c: AppColors) => c.success },
} as const;

/**
 * Khối "Mật khẩu" ngay trên trang "Tài khoản và bảo mật" của app Partner - Figma `24231:108836`,
 * bản native của web `AccountPasswordForm`.
 *
 * Luật là luật THẬT của server (`PASSWORD_RULES`: đủ ký tự, có chữ, có số, khác mật khẩu cũ) -
 * KHÔNG có "ký tự đặc biệt" của bản vẽ (người dùng chốt 17/11/2026 cho web, app theo). Thanh độ
 * mạnh chỉ để nhìn. "Quên mật khẩu" chỉ cho tài khoản đã có mật khẩu và TỰ ĐĂNG KÝ - tài khoản nhân
 * viên do chủ cấp (ADR 0087) không có SĐT riêng để nhận mã, chủ đặt lại cho họ.
 */
export function PartnerPasswordForm() {
  const colors = useColors();
  const t = useTranslations('Account.changePassword');
  const tHub = useTranslations('Account.securityPage.password');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const { form, onSubmit, hasPassword, managedAccount, formError, saving, requirements, strength } =
    useChangePasswordForm({ onSuccess: (note) => toast.showSuccess(note) });
  const { control, formState } = form;
  const level = strength > 0 ? STRENGTH[strength as keyof typeof STRENGTH] : null;

  const rows = useMemo(
    () =>
      requirements.map(({ key, label, met }) => ({
        key,
        met,
        label: !isShortRule(key)
          ? label
          : key === 'passwordTooShort'
            ? tHub('rules.passwordTooShort', { min: PASSWORD_MIN })
            : tHub(`rules.${key}`),
      })),
    [requirements, tHub],
  );

  return (
    <YStack gap={GAP_12}>
      {!hasPassword ? (
        <Callout tone="info" title={t('firstTimeTitle')}>
          {t('firstTimeBody')}
        </Callout>
      ) : null}
      {formError ? <Callout tone="danger">{formError}</Callout> : null}

      <YStack gap={space.md}>
        {hasPassword ? (
          <TextField
            control={control}
            name="currentPassword"
            label={t('currentPassword')}
            placeholder={t('placeholders.current')}
            lineIcon="lock-1"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!saving}
          />
        ) : null}
        <TextField
          control={control}
          name="newPassword"
          label={t('newPassword')}
          placeholder={t('placeholders.new')}
          lineIcon="lock-1"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!saving}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label={t('confirmPassword')}
          placeholder={t('placeholders.confirm')}
          lineIcon="lock-1"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
          editable={!saving}
        />

        <XStack ai="center" gap={space.md} accessibilityLiveRegion="polite">
          <XStack f={1} gap={BAR_GAP} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {STEPS.map((step) => (
              <YStack
                key={step}
                f={1}
                h={BAR_HEIGHT}
                br={radius.pill}
                bg={step <= strength ? colors.brandShape : colors.surfaceMuted}
              />
            ))}
          </XStack>
          {level ? (
            <Text
              col={level.tone(colors)}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.medium}
              fow={fontWeight.medium}
              fontStyle="italic"
            >
              {tHub(`strength.${level.key}`)}
            </Text>
          ) : null}
        </XStack>
      </YStack>

      <YStack gap={space.sm} accessibilityLabel={t('requirementsTitle')}>
        {rows.map(({ key, label, met }) => (
          <XStack key={key} ai="center" gap={space.sm}>
            <LineIcon name="tick-circle-fill" size={TICK} color={met ? colors.success : colors.borderInput} />
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              // Trình đọc màn hình không "thấy" dấu tích - nói ra bằng chữ.
              accessibilityLabel={`${label} - ${met ? t('requirementMet') : t('requirementUnmet')}`}
            >
              {label}
            </Text>
          </XStack>
        ))}
      </YStack>

      <XStack gap={GAP_12}>
        {hasPassword && !managedAccount ? (
          <YStack flexShrink={0}>
            <Button
              label={tHub('forgot')}
              variant="neutral"
              disabled={saving}
              onPress={() => navigateOnce(ROUTES.account.forgotPassword())}
            />
          </YStack>
        ) : null}
        <YStack f={1}>
          <Button
            label={hasPassword ? t('submit') : t('submitFirstTime')}
            loading={saving}
            // Sáng khi CẢ form hợp lệ (đủ ô, đạt luật, nhập lại khớp) - không phải "đã gõ gì đó" (như web).
            disabled={!formState.isValid && !saving}
            onPress={() => void onSubmit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
