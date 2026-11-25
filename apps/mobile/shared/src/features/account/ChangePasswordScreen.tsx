import { Ionicons } from '@/components/icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SUPPORT_CASE_CATEGORY } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { RevealStack } from '@/components/motion/RevealStack';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SettingRow } from '@/components/ui/SettingRow';
import { TextField } from '@/components/ui/TextField';
import { SUPPORT_SURFACE, useSupportCases } from '@/features/support-cases/hooks/use-support-cases';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { layout } from '@/theme/layout';
import { useChangePasswordForm } from './hooks/use-change-password-form';

/**
 * Đổi mật khẩu ở khu tài khoản — MỘT form cho hai tình huống, phân nhánh theo `MeDto.hasPassword`.
 * Bản native của `ChangePasswordForm` bên web.
 *
 *  - Đã có mật khẩu → hỏi mật khẩu hiện tại, gọi `POST /auth/password/change`. Sai mật khẩu cũ là
 *    lỗi TRÊN Ô (mã `CURRENT_PASSWORD_INCORRECT`), không phải một thông báo chung.
 *  - Chưa có (tài khoản OTP / mạng xã hội) → nói rõ đây là đặt lần đầu, không hỏi mật khẩu cũ, và
 *    gọi `POST /auth/password/set`. Không bao giờ dùng token quên/đặt lại để giả một lần đổi.
 *
 * Bảng "Yêu cầu của mật khẩu" tick theo `PASSWORD_RULES` — cùng nguồn với schema, nên bảng nói
 * đạt thì submit không thể đỏ vì luật mật khẩu.
 *
 * Sau khi thành công: reset form và invalidate `auth.me` để `hasPassword` đảo sang `true` — form
 * tự chuyển từ "đặt lần đầu" sang "đổi" mà không cần mở lại màn.
 *
 * Quy tắc "Không trùng với mật khẩu hiện tại" chỉ có khi đã có mật khẩu — luật của backend
 * (`PASSWORD_UNCHANGED`); bảng chỉ nói trước điều server sẽ từ chối. Cùng luật với web.
 *
 * `variant="security"` — màn "Bảo mật tài khoản" của APP KHÁCH (web `AccountSecurityView`, design
 * Account / Security 22/10/2026): tiêu đề của mục gộp, và cuối màn là lối gửi YÊU CẦU xoá tài
 * khoản (kèm trạng thái nếu đã gửi). Web mở yêu cầu đó trong một hộp thoại; app đẩy lên màn
 * `DeleteAccountScreen` — cùng thông tin, cùng luồng support case. App Partner giữ `default`
 * (menu của nó có hai lối riêng).
 */
export function ChangePasswordScreen({
  variant = 'default',
}: { variant?: 'default' | 'security' } = {}) {
  const isSecurity = variant === 'security';
  const colors = useColors();
  const t = useTranslations('Account.changePassword');
  const tSecurity = useTranslations('Account.security');
  const tDelete = useTranslations('Account.deleteAccount');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const toast = useAppToast();
  /** Câu báo thành công đang hiện trong hộp (chỉ `variant="security"`) - `null` là hộp đóng. */
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const tCommonActions = useTranslations('Common.actions');
  /*
   * Yêu cầu xoá đang mở (nếu có) - CÙNG khoá truy vấn với `DeleteAccountScreen`, nên hai màn đọc
   * một bản cache. Chỉ hỏi ở biến thể bảo mật.
   */
  const deletionQuery = useSupportCases(
    SUPPORT_SURFACE.CUSTOMER,
    { category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION, limit: 1 },
    { enabled: isSecurity },
  );
  const pendingDeletion = deletionQuery.data?.items[0];

  /* Luật, lượt gọi API và cách báo lỗi trên ô sống ở `useChangePasswordForm` (dùng chung với Partner). */
  const { form, onSubmit, hasPassword, formError, saving, requirements } = useChangePasswordForm({
    onSuccess: (note) => {
      if (isSecurity) setSuccessNote(note);
      else toast.showSuccess(note);
    },
  });
  const { control, formState } = form;

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={isSecurity ? tSecurity('title') : t('title')}
        subtitle={isSecurity ? tSecurity('customerSubtitle') : t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        {/* Mỗi khối trượt so le lúc mở / hiện khi cuộn tới (app khách; Partner tĩnh). */}
        <RevealStack gap={space.md}>
          {!hasPassword ? (
            <Callout tone="info" title={t('firstTimeTitle')}>
              {t('firstTimeBody')}
            </Callout>
          ) : null}
          {formError ? <Callout tone="danger">{formError}</Callout> : null}

          <Card>
            <YStack gap={space.md}>
              {hasPassword ? (
                <TextField
                  control={control}
                  name="currentPassword"
                  label={t('currentPassword')}
                  placeholder={isSecurity ? t('placeholders.current') : undefined}
                  icon="lock-closed-outline"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  editable={!saving}
                  required
                />
              ) : null}
              <TextField
                control={control}
                name="newPassword"
                label={t('newPassword')}
                placeholder={isSecurity ? t('placeholders.new') : undefined}
                icon="lock-closed-outline"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!saving}
                required
              />
              <TextField
                control={control}
                name="confirmPassword"
                label={t('confirmPassword')}
                placeholder={isSecurity ? t('placeholders.confirm') : undefined}
                icon="lock-closed-outline"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                editable={!saving}
                required
              />

              <Button
                label={hasPassword ? t('submit') : t('submitFirstTime')}
                icon="checkmark-outline"
                loading={saving}
                disabled={!formState.isDirty && !saving}
                onPress={() => void onSubmit()}
              />
            </YStack>
          </Card>

          {/*
            Bảng yêu cầu nằm DƯỚI form, không phải cột bên phải như web: ở 360dp không có cột thứ
            hai, và người dùng cần nó ngay sau khi gõ ô mật khẩu mới — đặt trên đầu thì nó bị bàn
            phím che đúng lúc đang gõ.
          */}
          <Card tone="muted" lift="flat">
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('requirementsTitle')}
              </Text>
              {requirements.map(({ key, label, met }) => {
                return (
                  <XStack key={key} ai="center" gap={space.xs}>
                    <Ionicons
                      name={met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={iconSize.sm}
                      color={met ? colors.success : colors.placeholder}
                    />
                    <Text
                      f={1}
                      col={met ? colors.text : colors.textMuted}
                      fos={fontSize.bodySm}
                      // Trình đọc màn hình không "thấy" được biểu tượng tick — nói ra bằng chữ.
                      accessibilityLabel={`${label} - ${
                        met ? t('requirementMet') : t('requirementUnmet')
                      }`}
                    >
                      {label}
                    </Text>
                  </XStack>
                );
              })}
            </YStack>
          </Card>

          {/*
            Lối yêu cầu xoá đứng CUỐI màn, tông đỏ, tách khỏi form — việc một lần, khó lùi lại
            (design: dòng chữ đỏ dưới thẻ). Đã gửi thì mô tả là trạng thái của yêu cầu.
          */}
          {isSecurity ? (
            <Card padded={false}>
              <YStack px={layout.padX} py={space.xs}>
                <SettingRow
                  icon="trash-outline"
                  label={tDelete('title')}
                  description={
                    pendingDeletion
                      ? `${tDelete('pendingTitle')} · ${domainLabel(
                          'supportCaseStatus',
                          pendingDeletion.status,
                        )}`
                      : tDelete('subtitle')
                  }
                  href={ROUTES.account.deleteAccount()}
                  danger
                />
              </YStack>
            </Card>
          ) : null}
        </RevealStack>
      </Screen>

      {/*
        Khu tài khoản báo thành công bằng HỘP như web (`ChangePasswordForm appearance="account"`):
        dấu tích tròn vành xanh, tiêu đề, câu báo, nút Xác nhận trọn bề ngang. Màn Partner giữ toast.
      */}
      {isSecurity ? (
        <SuccessSheet
          open={successNote !== null}
          title={t('successTitle')}
          body={successNote}
          actionLabel={tCommonActions('confirm')}
          onAction={() => setSuccessNote(null)}
        />
      ) : null}
    </>
  );
}

