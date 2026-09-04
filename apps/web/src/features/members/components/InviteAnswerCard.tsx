'use client';

import { Alert, App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { INVITE_STATUS } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAnswerInvite, useInvitePreview } from '../hooks/use-invites';
import styles from './InviteAnswerCard.module.css';

/**
 * Người được mời xem và trả lời.
 *
 * Ba trạng thái người dùng có thể rơi vào, và cả ba đều phải có lối đi tiếp:
 *
 *  1. **Chưa đăng nhập** — xem được nội dung lời mời (ai mời, vai gì, hạn bao giờ) nhưng chưa
 *     trả lời được. Nút mở thẳng modal đăng nhập với `next` trỏ về chính trang này, nên đăng
 *     nhập xong họ quay lại đúng chỗ thay vì rơi về trang chủ và mất luôn lời mời.
 *  2. **Đăng nhập nhầm tài khoản** — server trả `INVITE_EMAIL_MISMATCH`; câu lỗi nói rõ phải
 *     dùng hộp thư nào (đã che bớt).
 *  3. **Lời mời đã đóng** (đã trả lời / thu hồi / hết hạn) — không hiện nút nào, chỉ nói thật
 *     là hết hiệu lực. Hiện nút rồi để họ bấm vào một lỗi là tệ hơn.
 */
export function InviteAnswerCard({ token }: { token: string }) {
  const t = useTranslations('Members.invitePage');
  const tCommon = useTranslations('Common');
  const { modal } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const auth = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  const { data: me, isLoading: userLoading } = useCurrentUser();
  const preview = useInvitePreview(token);
  const { accept, decline } = useAnswerInvite(token);

  /** Kết quả cuối cùng — giữ ở state để màn cảm ơn không bị query nạp lại ghi đè. */
  const [answered, setAnswered] = useState<'accepted' | 'declined' | null>(null);

  if (preview.isLoading || userLoading) {
    return (
      <div className={styles.card}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Result
        status="warning"
        title={t('loadError')}
        subTitle={preview.error ? errorMessage(preview.error) : undefined}
        extra={
          <Link href={ROUTES.HOME}>
            <Button>{t('goHome')}</Button>
          </Link>
        }
      />
    );
  }

  const invite = preview.data;

  if (answered) {
    return (
      <Result
        status="success"
        title={answered === 'accepted' ? t('accepted', { shop: invite.tenantName }) : t('declined')}
        extra={
          answered === 'accepted' ? (
            <Link href={ROUTES.MANAGE.ROOT}>
              <Button type="primary">{t('goManage')}</Button>
            </Link>
          ) : (
            <Link href={ROUTES.HOME}>
              <Button>{t('goHome')}</Button>
            </Link>
          )
        }
      />
    );
  }

  if (invite.status !== INVITE_STATUS.PENDING) {
    return (
      <Result
        status="info"
        title={t('closedTitle')}
        subTitle={t('closedBody')}
        extra={
          <Link href={ROUTES.HOME}>
            <Button>{t('goHome')}</Button>
          </Link>
        }
      />
    );
  }

  const pending = accept.isPending || decline.isPending;

  function answer(kind: 'accepted' | 'declined') {
    const mutation = kind === 'accepted' ? accept : decline;
    mutation.mutate(undefined, {
      onSuccess: () => setAnswered(kind),
      onError: (err) => modal.error({ title: errorMessage(err), okText: tCommon('actions.close') }),
    });
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.intro}>{t('intro', { shop: invite.tenantName })}</p>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('role')}</dt>
          <dd>{domainLabel('tenantRole', invite.roleKey, invite.roleKey)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('invitedEmail')}</dt>
          <dd>{invite.invitedEmailMasked}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('expiresAt')}</dt>
          <dd>{fmt.dateTime(invite.expiresAt)}</dd>
        </div>
        {invite.invitedByName ? (
          <div className={styles.fact}>
            <dt>{t('invitedBy', { name: invite.invitedByName })}</dt>
            <dd />
          </div>
        ) : null}
      </dl>

      {me ? (
        <div className={styles.actions}>
          <Button
            type="primary"
            size="large"
            loading={accept.isPending}
            disabled={pending}
            onClick={() => answer('accepted')}
          >
            {t('accept')}
          </Button>
          <Button
            size="large"
            danger
            loading={decline.isPending}
            disabled={pending}
            onClick={() =>
              modal.confirm({
                title: t('declineConfirm'),
                okText: t('decline'),
                okButtonProps: { danger: true },
                cancelText: tCommon('actions.close'),
                onOk: () => answer('declined'),
              })
            }
          >
            {t('decline')}
          </Button>
        </div>
      ) : (
        <>
          <Alert type="info" showIcon message={t('signInPrompt')} className={styles.prompt} />
          <div className={styles.actions}>
            <Button type="primary" size="large" onClick={() => auth.open({ next: nextFromHere() })}>
              {t('signIn')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
