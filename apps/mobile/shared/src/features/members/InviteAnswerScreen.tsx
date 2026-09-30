import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { INVITE_STATUS } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import { useAnswerInvite, useInvitePreview } from './hooks/use-members';

/**
 * Người được mời xem và trả lời — bản native của `InviteAnswerCard`, màn `/invites/[token]`.
 *
 * Màn này CÔNG KHAI, và đó là điểm mấu chốt: người mở nó chưa thuộc gian hàng nào và có thể còn
 * chưa có tài khoản. Đặt nó sau cổng phiên hay sau `ScopeGuard` là bắt họ đăng nhập vào một nơi họ
 * chưa có quyền vào — đúng lý do web để trang này ở nhóm `(public)`.
 *
 * Bốn trạng thái, và cả bốn đều phải có lối đi tiếp:
 *
 *  1. **Chưa đăng nhập** — ĐỌC được nội dung lời mời (ai mời, vai gì, hạn bao giờ) nhưng chưa trả
 *     lời được. Nút dẫn sang đăng nhập; quay lại là màn này vẫn ở trong ngăn xếp.
 *  2. **Đăng nhập nhầm tài khoản** — server trả `INVITE_EMAIL_MISMATCH`, và câu lỗi của nó nói rõ
 *     phải dùng hộp thư nào (đã che bớt). Không đoán hộ ở client.
 *  3. **Lời mời đã đóng** (đã trả lời · bị thu hồi · hết hạn) — KHÔNG hiện nút nào. Bày nút ra rồi
 *     để họ bấm vào một lỗi thì tệ hơn là nói thẳng nó đã hết hiệu lực.
 *  4. **Vừa trả lời xong** — kết quả giữ ở state màn, không đọc lại từ query: một lượt refetch nền
 *     sẽ ghi đè màn cảm ơn bằng trạng thái "đã đóng" và người dùng tưởng mình bấm hụt.
 */
export function InviteAnswerScreen({ token }: { token: string }) {
  const t = useTranslations('Members.invitePage');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();

  const { data: me, isLoading: userLoading } = useCurrentUser();
  const preview = useInvitePreview(token);
  const { accept, decline } = useAnswerInvite(token);

  const [answered, setAnswered] = useState<'accepted' | 'declined' | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const goHome = () => navigateOnce(ROUTES.explore.home());
  const header = <AppHeader title={t('title')} onBack={() => router.back()} />;

  if (preview.isLoading || userLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={5} />
        </Screen>
      </>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="mail-unread-outline"
            title={t('loadError')}
            {...(preview.error ? { description: errorMessage(preview.error) } : {})}
            actionLabel={t('goHome')}
            onAction={goHome}
          />
        </Screen>
      </>
    );
  }

  const invite = preview.data;

  if (answered) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon={answered === 'accepted' ? 'checkmark-circle-outline' : 'close-circle-outline'}
            title={
              answered === 'accepted'
                ? t('accepted', { shop: invite.tenantName })
                : t('declined')
            }
            actionLabel={answered === 'accepted' ? t('goManage') : t('goHome')}
            onAction={
              answered === 'accepted' ? () => navigateOnce(ROUTES.manage.home()) : goHome
            }
          />
        </Screen>
      </>
    );
  }

  if (invite.status !== INVITE_STATUS.PENDING) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="time-outline"
            title={t('closedTitle')}
            description={t('closedBody')}
            actionLabel={t('goHome')}
            onAction={goHome}
          />
        </Screen>
      </>
    );
  }

  const busy = accept.isPending || decline.isPending;

  function answer(kind: 'accepted' | 'declined') {
    const mutation = kind === 'accepted' ? accept : decline;
    mutation.mutate(undefined, {
      onSuccess: () => {
        setConfirmingDecline(false);
        setAnswered(kind);
      },
      onError: (error) => {
        setConfirmingDecline(false);
        toast.showError(errorMessage(error));
      },
    });
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.body}>
                {t('intro', { shop: invite.tenantName })}
              </Text>

              <DataRow
                label={t('role')}
                value={domainLabel('tenantRole', invite.roleKey, invite.roleKey)}
              />
              <DataRow label={t('invitedEmail')} value={invite.invitedEmailMasked} />
              <DataRow label={t('expiresAt')} value={fmt.dateTime(invite.expiresAt)} />
              {invite.invitedByName ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('invitedBy', { name: invite.invitedByName })}
                </Text>
              ) : null}
            </YStack>
          </Card>

          {me ? (
            <YStack gap={space.sm}>
              <Button
                label={t('accept')}
                size="lg"
                loading={accept.isPending}
                disabled={busy}
                onPress={() => answer('accepted')}
              />
              <Button
                label={t('decline')}
                variant="secondary"
                disabled={busy}
                onPress={() => setConfirmingDecline(true)}
              />
            </YStack>
          ) : (
            <>
              {/*
                Chưa đăng nhập thì vẫn ĐỌC được lời mời — chỉ không trả lời được. Giấu hẳn nội dung
                sau cổng đăng nhập là bắt người ta đăng nhập để biết mình đang được mời làm gì.
              */}
              <Callout tone="info">{t('signInPrompt')}</Callout>
              <Button
                label={t('signIn')}
                size="lg"
                onPress={() => navigateOnce(ROUTES.account.login())}
              />
            </>
          )}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirmingDecline}
        title={t('declineConfirm')}
        confirmLabel={t('decline')}
        cancelLabel={tCommon('close')}
        loading={decline.isPending}
        onCancel={() => setConfirmingDecline(false)}
        onConfirm={() => answer('declined')}
      />
    </>
  );
}
