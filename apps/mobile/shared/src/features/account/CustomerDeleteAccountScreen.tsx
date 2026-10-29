import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import { Controller } from 'react-hook-form';
import { isPositiveMoney } from '@xeprime/domain';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { TENANT_ROLE } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/CheckMark';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { useAccountDeletionImpact } from './components/AccountDeletionImpact';
import {
  ACCOUNT_DELETION_ITEMS,
  useAccountDeletionForm,
  useAccountDeletionRequest,
} from './hooks/use-account-deletion';

/** `--xp-space-20` — khe giữa các khối của hộp web (ngoài thang 4·8·16·24). */
const GAP_20 = space.md + space.xs;
/** `--xp-space-12` — khe trong một khối. */
const GAP_12 = space.sm + space.xs;
/** Ô tròn 44 của biểu tượng quy trình / đang xử lý. */
const ROUND_ICON = 44;
/** Ô tròn 22 của dấu kiểm điều kiện. */
const CHECK_ICON = 22;

/**
 * "Yêu cầu xoá tài khoản" của APP KHÁCH — bản native của `AccountDeletionDialog` web (trang Bảo
 * mật tài khoản, design Account / Security - Delete, Figma `21621:68914` · `21621:69376`).
 *
 * Web là hộp thoại mở trên trang Bảo mật; app là một màn đẩy vào (cùng nội dung, cùng thứ tự):
 *
 *  - Chưa có yêu cầu: "Kiểm tra điều kiện" (số dư, đang chờ chuyển, lệnh rút còn giữ tiền, chuyến
 *    đi thuê chưa khép — chỉ để biết, KHÔNG chặn) → mảng đỏ "Quy trình xử lý" → dữ liệu bị xử lý →
 *    ô tick xác nhận. Chân màn: Quay lại · Gửi yêu cầu (đỏ, chỉ bật khi đã tick).
 *  - Đã có yêu cầu đang mở: mảng xanh "đang xử lý" (mã + lúc gửi) → dữ liệu bị xử lý. Chân màn:
 *    Quay lại · Rút yêu cầu (rút NGAY như web, không hỏi lại).
 *
 * Gửi xong màn KHÔNG đóng: danh sách case làm mới và màn tự sang trạng thái "đang xử lý".
 *
 * App Partner giữ `DeleteAccountScreen` (bản nhúng `DeleteAccountView` của site partner).
 */
export function CustomerDeleteAccountScreen() {
  const colors = useColors();
  const t = useTranslations('Account.deleteAccount');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const toast = useAppToast();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const { pendingQuery, pending, openCase, withdraw } = useAccountDeletionRequest();
  // Kéo để làm mới — yêu cầu xoá có thể vừa được nền tảng xử lý.
  const pull = usePullRefresh(pendingQuery.refetch);
  const { control, onSubmit, reset, formState } = useAccountDeletionForm(openCase);
  const busy = openCase.isPending || withdraw.isPending;

  const back = () => {
    // Một lần mở là một lần đọc mới — tick xác nhận không đi theo sang lần mở sau.
    reset();
    goBackOr(router, ROUTES.account.changePassword());
  };

  const footer =
    pendingQuery.isLoading || pendingQuery.isError ? null : (
      <XStack gap={space.sm}>
        <YStack f={1}>
          <Button
            label={tCommon('back')}
            icon="arrow-back"
            variant="secondary"
            disabled={busy}
            onPress={back}
          />
        </YStack>
        <YStack f={1}>
          {pending ? (
            <Button
              label={t('withdraw')}
              icon="arrow-undo-outline"
              loading={withdraw.isPending}
              onPress={() => {
                if (withdraw.isPending) return;
                withdraw.mutate(pending.id, {
                  onSuccess: () => toast.showSuccess(t('withdrawn')),
                  onError: (err) => toast.showError(errorMessage(err)),
                });
              }}
            />
          ) : (
            <Button
              // Nhãn NGẮN trên nút chia đôi hàng (người dùng chốt 28/10/2026) — nhãn dài bị cắt "…".
              label={t('submitShort')}
              accessibilityLabel={t('submit')}
              icon="send-outline"
              variant="danger"
              loading={openCase.isPending}
              disabled={!formState.isValid}
              onPress={() => void onSubmit()}
            />
          )}
        </YStack>
      </XStack>
    );

  return (
    <>
      <AppHeader onBack={back} title={t('title')} subtitle={t('dialogSubtitle')} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={footer}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
      >
        {pendingQuery.isLoading ? (
          <MiniRowsSkeleton rows={6} />
        ) : pendingQuery.isError ? (
          <ScreenError
            error={pendingQuery.error}
            title={t('loadError')}
            onRetry={() => void pendingQuery.refetch()}
          />
        ) : pending ? (
          <YStack gap={GAP_20} accessibilityLiveRegion="polite">
            <YStack gap={space.xs} p={space.md} br={radius.lg} bg={colors.infoSurface}>
              <YStack
                w={ROUND_ICON}
                h={ROUND_ICON}
                br={radius.pill}
                bg={colors.surface}
                ai="center"
                jc="center"
                mb={space.xs}
              >
                <ActivityIndicator color={colors.info} />
              </YStack>
              <Text col={colors.info} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                {t('pendingTitle')}
              </Text>
              <Text col={colors.info} fos={fontSize.body}>
                {t('pendingBody', { code: pending.code })}
              </Text>
              <Text col={colors.info} fos={fontSize.body}>
                {t('sentAt', { date: fmt.dateTime(pending.createdAt) })}
              </Text>
            </YStack>
            <DeletedData />
          </YStack>
        ) : (
          <YStack gap={GAP_20}>
            <Conditions />

            <XStack
              ai="flex-start"
              gap={space.md}
              p={space.md}
              br={radius.lg}
              bg={colors.dangerSurface}
              accessibilityRole="summary"
            >
              <YStack
                w={ROUND_ICON}
                h={ROUND_ICON}
                br={radius.pill}
                bg={colors.surface}
                ai="center"
                jc="center"
              >
                <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
              </YStack>
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.danger} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                  {t('warningTitle')}
                </Text>
                <Text col={colors.danger} fos={fontSize.body}>
                  {t('warningBody')}
                </Text>
              </YStack>
            </XStack>

            <DeletedData />

            <Controller
              control={control}
              name="acknowledged"
              render={({ field }) => (
                <Pressable
                  disabled={openCase.isPending}
                  onPress={() => field.onChange(!field.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: field.value, disabled: openCase.isPending }}
                  accessibilityLabel={t('acknowledge')}
                >
                  <XStack
                    ai="flex-start"
                    gap={space.sm}
                    minHeight={sizing.touchTarget}
                    py={space.xs}
                  >
                    <YStack pt={2}>
                      <CheckMark checked={field.value} />
                    </YStack>
                    <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                      {t('acknowledge')}
                    </Text>
                  </XStack>
                </Pressable>
              )}
            />
          </YStack>
        )}
      </Screen>
    </>
  );
}

/** "Kiểm tra điều kiện xoá tài khoản" — số dư, lệnh rút, chuyến chưa khép (chỉ để biết, không chặn). */
function Conditions() {
  const colors = useColors();
  const t = useTranslations('Account.deleteAccount');
  const tImpact = useTranslations('Account.deletionImpact');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { user, wallet, holding, openTrips, loading, failed } = useAccountDeletionImpact();

  const checks = [
    { key: 'withdrawals', ok: holding === 0, label: tImpact('withdrawals', { count: holding }) },
    { key: 'trips', ok: openTrips === 0, label: tImpact('openTrips', { count: openTrips }) },
  ];

  return (
    <YStack gap={GAP_12}>
      <SectionHead title={t('conditionsTitle')} text={t('conditionsBody')} />

      {loading ? (
        <MiniRowsSkeleton rows={3} />
      ) : (
        <>
          {wallet ? (
            <YStack gap={space.md} p={space.md} bw={1} bc={colors.border} br={radius.lg}>
              <XStack ai="center" flexWrap="wrap" columnGap={space.md} rowGap={space.sm}>
                <YStack f={1} minWidth={0}>
                  <Text col={colors.textMuted} fos={fontSize.body}>
                    {tImpact('balance')}
                  </Text>
                  <Text
                    mt={2}
                    col={colors.primaryHover}
                    fos={fontSize.bodyLg}
                    fow={fontWeight.semibold}
                  >
                    {fmt.money(wallet.available)}
                  </Text>
                </YStack>
                {/* Rút tiền là việc của mục Quản lý thanh toán — đây chỉ là lối tắt tới đó. */}
                {isPositiveMoney(wallet.available) ? (
                  <Button
                    label={t('withdrawNow')}
                    variant="secondary"
                    size="sm"
                    onPress={() => navigateOnce(ROUTES.account.balance())}
                  />
                ) : null}
              </XStack>
              <YStack>
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {tImpact('pending')}
                </Text>
                <Text
                  mt={2}
                  col={colors.primaryHover}
                  fos={fontSize.bodyLg}
                  fow={fontWeight.semibold}
                >
                  {fmt.money(wallet.pending)}
                </Text>
              </YStack>
            </YStack>
          ) : null}

          <YStack gap={space.sm}>
            {user?.tenant ? (
              <CheckLine
                ok={false}
                label={
                  user.tenant.roleKey === TENANT_ROLE.SHOP_OWNER
                    ? tImpact('ownerNote')
                    : tImpact('memberNote')
                }
              />
            ) : null}
            {checks.map((check) => (
              <CheckLine key={check.key} ok={check.ok} label={check.label} />
            ))}
          </YStack>

          {failed ? <Note>{tImpact('loadError')}</Note> : null}
          <Note>{tImpact('settleFirst')}</Note>
        </>
      )}
    </YStack>
  );
}

/** "Dữ liệu nào sẽ bị xử lý" — danh sách chấm đỏ + ghi chú lưu trữ theo luật. */
function DeletedData() {
  const colors = useColors();
  const t = useTranslations('Account.deleteAccount');

  return (
    <YStack gap={GAP_12}>
      <SectionHead title={t('dataTitle')} text={t('confirmBody')} />
      <YStack gap={space.sm}>
        {ACCOUNT_DELETION_ITEMS.map((item) => (
          <XStack key={item} ai="flex-start" gap={space.sm} paddingLeft={2}>
            {/* Chấm đỏ đầu dòng như bản vẽ — ký hiệu, không phải nội dung. */}
            <YStack w={6} h={6} br={radius.pill} bg={colors.danger} mt={8} />
            <Text f={1} col={colors.text} fos={fontSize.body}>
              {t(`items.${item}`)}
            </Text>
          </XStack>
        ))}
      </YStack>
      <Note>{t('retentionNote')}</Note>
    </YStack>
  );
}

function SectionHead({ title, text }: { title: string; text: string }) {
  const colors = useColors();
  return (
    <YStack gap={2}>
      <Text
        col={colors.text}
        fos={fontSize.bodyLg}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {text}
      </Text>
    </YStack>
  );
}

/** Một dòng điều kiện — ô tròn 22: đạt = dấu tích xanh, chưa = dấu chấm than cam. */
function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" gap={space.sm}>
      <YStack
        w={CHECK_ICON}
        h={CHECK_ICON}
        br={radius.pill}
        bg={ok ? colors.successSurface : colors.warningSurface}
        ai="center"
        jc="center"
      >
        <Ionicons
          name={ok ? 'checkmark' : 'alert'}
          size={12}
          color={ok ? colors.success : colors.warning}
        />
      </YStack>
      <Text f={1} col={colors.text} fos={fontSize.body}>
        {label}
      </Text>
    </XStack>
  );
}

function Note({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={fontSize.bodySm} fontStyle="italic">
      {children}
    </Text>
  );
}
