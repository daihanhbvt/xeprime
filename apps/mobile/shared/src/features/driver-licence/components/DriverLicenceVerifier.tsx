import { useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_REJECT_REASON,
  vnDateKey,
  type DriverLicenceRejectReason,
} from '@xeprime/types';
import type { DriverLicence } from '@/api/driver-licence/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { driverLicenceApi } from '@/api/driver-licence/api';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { resolveVerifierView, type DriverLicenceTrip } from '../driver-licence-view';
import { useDriverLicence, useRequestDriverLicenceReview } from '../hooks/use-driver-licence';
import { DriverLicenceUploader } from './DriverLicenceUploader';

const ACCEPTED_KEYS = ['vn', 'idp', 'foreign'] as const;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Xác thực bằng lái — MỘT component cho cả màn "Giấy tờ & Xác minh" lẫn bước bằng lái trong luồng
 * đặt xe (ADR 0057). Bản native của `DriverLicenceVerifier` bên web; quyết định nhánh nằm ở
 * `resolveVerifierView` (thuần, có test). Màn hình hoàn toàn do trạng thái SERVER quyết; component
 * chỉ thêm "đang thay bằng mới" và "vừa chọn ảnh mới".
 *
 * Có `trip` (luồng đặt xe) thì "hợp lệ" nghĩa là hợp lệ CHO CHUYẾN ĐÓ — cùng một hàm với cổng ở
 * server, nên giao diện không bao giờ nói "được" ở chỗ server sẽ nói "không".
 */
export function DriverLicenceVerifier({ trip }: { trip?: DriverLicenceTrip | null }) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const query = useDriverLicence();
  const [replacing, setReplacing] = useState(false);
  const [pickedOver, setPickedOver] = useState<string | null | undefined>(undefined);
  const booking = Boolean(trip);

  if (query.isPending) {
    return (
      <Card>
        <SkeletonText lines={4} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <YStack gap={space.sm}>
        <Callout tone="danger">{t('error.load')}</Callout>
        <Button
          label={t('error.retry')}
          icon="refresh"
          variant="secondary"
          onPress={() => void query.refetch()}
        />
      </YStack>
    );
  }

  const latest = query.data.latest;
  const view = resolveVerifierView({
    overview: query.data,
    trip: trip ?? null,
    replacing,
    pickedOver,
    today: vnDateKey(new Date()),
  });

  if (view.kind === 'usable') {
    return (
      <Card>
        <YStack gap={space.md}>
          <StatusBanner
            tone="success"
            icon="checkmark-circle"
            title={booking ? t('verified.bookingTitle') : t('verified.title')}
            body={booking ? null : t('verified.body')}
          />
          {view.rejected ? (
            <Callout tone="warning">
              {t('verified.replaceFailed', {
                reason: t(
                  `reasons.${(view.rejected.rejectionReason ?? 'other') as DriverLicenceRejectReason}`,
                ),
              })}
            </Callout>
          ) : view.pendingReplace ? (
            <Callout tone="info">{t('verified.replacePending')}</Callout>
          ) : null}
          <DriverLicenceDetails licence={view.verified} />
          <Button
            label={t('verified.replace')}
            variant="secondary"
            onPress={() => setReplacing(true)}
          />
        </YStack>
      </Card>
    );
  }

  if (view.kind === 'pending') {
    return (
      <Card>
        <YStack gap={space.md}>
          <StatusBanner
            tone="waiting"
            icon="time"
            title={t('pending.title')}
            body={booking ? t('pending.bookingBody') : t('pending.body')}
          />
          <Button
            label={t('pending.replace')}
            variant="secondary"
            onPress={() => setReplacing(true)}
          />
        </YStack>
      </Card>
    );
  }

  return (
    <Card>
      <YStack gap={space.md}>
        {view.rejected ? (
          <RejectedNotice licence={view.rejected} />
        ) : view.tripIssue && view.verified ? (
          <Callout tone="warning">
            {t(`tripIssue.${view.tripIssue}`, {
              date: view.verified.expiresOn ? fmt.dateKey(view.verified.expiresOn) : '',
            })}
          </Callout>
        ) : (
          <YStack gap={space.xs}>
            {booking ? null : (
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('intro.title')}
              </Text>
            )}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {booking ? t('intro.bookingBody') : t('intro.body')}
            </Text>
          </YStack>
        )}

        <DriverLicenceUploader
          processing={view.processing}
          onPick={() => setPickedOver(latest?.id ?? null)}
          onSubmitted={() => setReplacing(false)}
        />

        {replacing && !view.processing ? (
          <Button
            label={t('verified.cancelReplace')}
            variant="ghost"
            onPress={() => setReplacing(false)}
          />
        ) : null}

        {view.showAccepted ? <AcceptedDocuments /> : null}
      </YStack>
    </Card>
  );
}

const BANNER_TONE = {
  success: { fg: colors.success, bg: colors.successSurface },
  waiting: { fg: colors.warning, bg: colors.warningSurface },
  danger: { fg: colors.danger, bg: colors.dangerSurface },
} as const;

function StatusBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: keyof typeof BANNER_TONE;
  icon: IoniconName;
  title: string;
  body?: string | null;
}) {
  const skin = BANNER_TONE[tone];
  return (
    <XStack gap={space.sm} ai="flex-start" p={space.md} br={radius.lg} bg={skin.bg}>
      <Ionicons name={icon} size={iconSize.md} color={skin.fg} />
      <YStack f={1} gap={space.xs}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {title}
        </Text>
        {body ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {body}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/** Vì sao chưa xác thực được + gợi ý chụp lại đúng chỗ hỏng + (nếu được) nhờ người xem lại. */
function RejectedNotice({ licence }: { licence: DriverLicence }) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const review = useRequestDriverLicenceReview();
  const reason = (licence.rejectionReason ?? 'other') as DriverLicenceRejectReason;
  // Hết hạn: hiện NGÀY máy đọc được — khách thấy ngay nếu máy đọc lệch một chữ số.
  const reasonText =
    reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED && licence.expiresOn
      ? t('rejected.expiredOn', { date: fmt.dateKey(licence.expiresOn) })
      : t(`reasons.${reason}`);
  const skin = BANNER_TONE.danger;

  return (
    <XStack
      gap={space.sm}
      ai="flex-start"
      p={space.md}
      br={radius.lg}
      bg={skin.bg}
      accessibilityRole="alert"
    >
      <Ionicons name="close-circle" size={iconSize.md} color={skin.fg} />
      <YStack f={1} gap={space.xs}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('rejected.title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {reasonText}
        </Text>
        {reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED && licence.canRequestReview ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('rejected.expiredMisread')}
          </Text>
        ) : null}
        {licence.qualityIssues.map((issue) => (
          <Text key={issue} col={colors.textMuted} fos={fontSize.label}>
            {`• ${t(`issues.${issue as 'blurry'}`)}`}
          </Text>
        ))}
        {licence.reviewNote ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('rejected.note', { note: licence.reviewNote })}
          </Text>
        ) : null}
        {licence.canRequestReview ? (
          <YStack pt={space.xs}>
            <Button
              label={t('rejected.requestReview')}
              icon="sync-outline"
              variant="secondary"
              loading={review.isPending}
              onPress={() =>
                review.mutate(licence.id, {
                  onSuccess: () => toast.showSuccess(t('rejected.reviewRequested')),
                  onError: (error) => toast.showError(errorMessage(error)),
                })
              }
            />
          </YStack>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Thông tin ĐÃ CHỐT trên bằng — cho chính chủ đối chiếu với tấm bằng trong ví: đọc sai chỗ nào
 * thì thấy ngay và nộp lại.
 */
export function DriverLicenceDetails({ licence }: { licence: DriverLicence }) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const drives = [
    licence.coversCar ? t('fields.car') : null,
    licence.coversMotorbike ? t('fields.motorbike') : null,
  ].filter(Boolean);

  const rows: Array<{ key: string; label: string; value: string | null }> = [
    { key: 'name', label: t('fields.fullName'), value: licence.fullName },
    { key: 'number', label: t('fields.number'), value: licence.licenceNumber },
    { key: 'classes', label: t('fields.classes'), value: licence.classes.join(', ') || null },
    {
      key: 'expires',
      label: t('fields.expiresOn'),
      value: licence.noExpiry
        ? t('fields.noExpiry')
        : licence.expiresOn
          ? fmt.dateKey(licence.expiresOn)
          : null,
    },
    {
      key: 'kind',
      label: t('fields.kind'),
      value: licence.kind ? dl('driverLicenceKind', licence.kind) : null,
    },
  ];

  return (
    <YStack gap={space.sm}>
      {rows
        .filter((row) => row.value)
        .map((row) => (
          <XStack key={row.key} gap={space.md} jc="space-between" ai="flex-start">
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {row.label}
            </Text>
            <Text
              f={1}
              ta="right"
              col={colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
            >
              {row.value}
            </Text>
          </XStack>
        ))}
      {drives.length > 0 ? (
        <XStack gap={space.xs} ai="center">
          <Ionicons name="car-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
            {`${t('fields.drives')}: `}
            <Text col={colors.text} fow={fontWeight.semibold}>
              {drives.join(LIST_SEPARATOR)}
            </Text>
          </Text>
        </XStack>
      ) : null}
      {/* Bằng nước ngoài: máy chỉ nhận dạng, không đọc hạng/hạn — nói thẳng ai sẽ kiểm (ADR 0057). */}
      {licence.kind && licence.kind !== DRIVER_LICENCE_KIND.VN ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('fields.foreignNote')}
        </Text>
      ) : null}
      <LicenceImageButton licenceId={licence.id} />
    </YStack>
  );
}

/**
 * Mở ảnh đã nộp. URL ký sống 120 giây nên chỉ xin LÚC BẤM, không xin sẵn khi màn mở.
 */
function LicenceImageButton({ licenceId }: { licenceId: string }) {
  const t = useTranslations('DriverLicence.image');
  const toast = useAppToast();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      setUrl((await driverLicenceApi.image(licenceId)).url);
    } catch {
      toast.showError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        label={t('view')}
        icon="eye-outline"
        variant="ghost"
        loading={loading}
        onPress={() => void open()}
      />
      <PhotoViewer url={url} unavailableLabel={t('loadFailed')} onClose={() => setUrl(null)} />
    </>
  );
}

function AcceptedDocuments() {
  const t = useTranslations('DriverLicence.accepted');
  return (
    <YStack gap={space.xs} pt={space.sm} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {t('title')}
      </Text>
      {ACCEPTED_KEYS.map((key) => (
        <Text key={key} col={colors.textMuted} fos={fontSize.label}>
          {`• ${t(key)}`}
        </Text>
      ))}
    </YStack>
  );
}
