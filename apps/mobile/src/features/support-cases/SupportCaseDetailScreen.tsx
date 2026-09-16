import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  canTransitionSupportCase,
  STATUS_COLOR,
  type SupportCaseStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextControl } from '@/components/ui/TextControl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  SUPPORT_SURFACE,
  type SupportCaseDetail,
  type SupportCaseEvent,
  type SupportSurface,
} from './api';
import {
  usePostSupportMessage,
  useSupportCase,
  useTransitionSupportCase,
} from './hooks/use-support-cases';

/**
 * Một yêu cầu hỗ trợ — bản native của `SupportCaseDetailPanel`, bề mặt KHÁCH.
 *
 * Ba thứ của bề mặt nền tảng KHÔNG có ở đây, đúng như web: nhãn mức ưu tiên, ô đánh dấu "ghi chú
 * nội bộ", và hộp kết luận. Ghi chú nội bộ đã bị server lọc khỏi dòng thời gian trước khi trả —
 * client không phải tự giấu.
 */
export function SupportCaseDetailScreen({
  caseId,
  surface,
}: {
  caseId: string;
  surface: SupportSurface;
}) {
  const t = useTranslations('SupportCases.detail');
  const router = useRouter();
  const query = useSupportCase(surface, caseId);

  const back = () =>
    goBackOr(
      router,
      surface === SUPPORT_SURFACE.TENANT ? ROUTES.manage.supportCases() : ROUTES.account.support(),
    );

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={6} />
        </Screen>
      </>
    );
  }

  if (query.isError || !query.data) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('loadError')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader title={t('title')} onBack={back} />
      <Screen edges={['left', 'right', 'bottom']}>
        <SupportCaseBody row={query.data} surface={surface} />
      </Screen>
    </>
  );
}

function SupportCaseBody({ row, surface }: { row: SupportCaseDetail; surface: SupportSurface }) {
  const t = useTranslations('SupportCases.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const status = row.status as SupportCaseStatus;
  const meta = SUPPORT_CASE_STATUS_META[status];
  const closed = status === SUPPORT_CASE_STATUS.CLOSED;

  return (
    <YStack gap={space.lg}>
      <Card>
        <YStack gap={space.sm}>
          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            <Text col={colors.textMuted} fos={fontSize.label}>
              {row.code}
            </Text>
            <StatusBadge
              label={domainLabel('supportCaseStatus', status, meta?.label)}
              color={meta?.color ?? STATUS_COLOR.NEUTRAL}
              size="sm"
            />
            <StatusBadge
              label={domainLabel('supportCaseCategory', row.category)}
              color={STATUS_COLOR.NEUTRAL}
              size="sm"
            />
          </XStack>

          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            {row.subject}
          </Text>

          <Divider />

          <DataRow
            label={t('openedBy')}
            value={`${row.openedByName}${LIST_SEPARATOR}${domainLabel('supportCaseParty', row.openedByScope)}`}
          />
          {row.tenantName ? <DataRow label={t('tenant')} value={row.tenantName} /> : null}
          {row.bookingCode ? <DataRow label={t('booking')} value={row.bookingCode} /> : null}
          {row.assigneeName ? <DataRow label={t('assignee')} value={row.assigneeName} /> : null}
          <DataRow label={t('createdAt')} value={fmt.dateTime(row.createdAt)} />

          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {row.description}
          </Text>
        </YStack>
      </Card>

      {row.resolution ? (
        <Callout tone="success" title={t('resolution')}>
          {row.resolution}
        </Callout>
      ) : null}

      <YStack gap={space.sm}>
        <BlockTitle>{t('timeline')}</BlockTitle>
        {row.events.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('noEvents')}
          </Text>
        ) : (
          <Card padded={false}>
            <YStack p={space.md} gap={space.sm}>
              {row.events.map((event, index) => (
                <YStack key={event.id} gap={space.sm}>
                  {index > 0 ? <Divider /> : null}
                  <TimelineEvent event={event} />
                </YStack>
              ))}
            </YStack>
          </Card>
        )}
      </YStack>

      {/*
        Yêu cầu ĐÃ ĐÓNG thì cả khối trả lời biến mất, thay bằng một câu nói rõ vì sao — chứ không
        phải một ô nhập bị khoá mà người dùng gõ vào rồi mới biết là không gửi được.
      */}
      {closed ? (
        <Callout tone="info">{t('closedNotice')}</Callout>
      ) : (
        <ReplyBox row={row} surface={surface} />
      )}
    </YStack>
  );
}

function TimelineEvent({ event }: { event: SupportCaseEvent }) {
  const t = useTranslations('SupportCases.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <YStack gap={2}>
      <XStack ai="center" gap={space.xs} flexWrap="wrap">
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {event.actorName}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {fmt.dateTime(event.createdAt)}
        </Text>
      </XStack>

      {event.body ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {event.body}
        </Text>
      ) : null}

      {event.toStatus ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('statusChanged', {
            status: domainLabel('supportCaseStatus', event.toStatus),
          })}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * Trả lời và đóng yêu cầu.
 *
 * Bề mặt KHÁCH chỉ đi được tới `closed` — mọi nấc khác (`in_progress`, `waiting_party`,
 * `resolved`) là việc của nền tảng, và server từ chối phần còn lại. Lọc ở đây để không bày ra một
 * nút chắc chắn hỏng, nhưng lớp chặn thật vẫn ở backend (CLAUDE.md §6).
 */
function ReplyBox({ row, surface }: { row: SupportCaseDetail; surface: SupportSurface }) {
  const t = useTranslations('SupportCases.detail');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const post = usePostSupportMessage(surface);
  const transition = useTransitionSupportCase(surface);

  const [body, setBody] = useState('');

  const status = row.status as SupportCaseStatus;
  const targets = SUPPORT_CASE_STATUS_VALUES.filter(
    (next) => next === SUPPORT_CASE_STATUS.CLOSED && canTransitionSupportCase(status, next),
  );

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('reply')}</BlockTitle>

      <TextControl
        label={t('replyLabel')}
        value={body}
        onChangeText={setBody}
        placeholder={t('replyPlaceholder')}
        multiline
      />

      <Button
        label={t('send')}
        disabled={!body.trim()}
        loading={post.isPending}
        onPress={() =>
          post.mutate(
            { id: row.id, body: body.trim() },
            {
              onSuccess: () => setBody(''),
              onError: (error) => toast.showError(errorMessage(error)),
            },
          )
        }
      />

      {targets.map((next) => (
        <Button
          key={next}
          label={t('moveTo', { status: domainLabel('supportCaseStatus', next) })}
          variant="secondary"
          loading={transition.isPending}
          onPress={() =>
            transition.mutate(
              { id: row.id, status: next, note: null },
              { onError: (error) => toast.showError(errorMessage(error)) },
            )
          }
        />
      ))}
    </YStack>
  );
}
