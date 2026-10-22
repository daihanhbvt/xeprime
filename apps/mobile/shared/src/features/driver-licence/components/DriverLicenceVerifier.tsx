import { useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
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
import { images } from '@/assets';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { resolveVerifierView, type DriverLicenceTrip } from '../driver-licence-view';
import { useDriverLicence, useDriverLicenceImage } from '../hooks/use-driver-licence';
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
export function DriverLicenceVerifier({
  trip,
  embedded = false,
}: {
  trip?: DriverLicenceTrip | null;
  /**
   * Khối Giấy tờ của tab Tài khoản (design "Verify Empty / Add"): chưa nộp thì là thẻ rỗng, còn
   * thêm / thay bằng đi qua tấm trượt "Thêm bằng lái" — như hộp thoại bên web.
   */
  embedded?: boolean;
}) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const query = useDriverLicence();
  const [replacing, setReplacing] = useState(false);
  const [adding, setAdding] = useState(false);
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
    // Khối Giấy tờ thay bằng trong tấm trượt — thẻ phía sau vẫn là bằng đang dùng.
    replacing: replacing && !embedded,
    pickedOver,
    today: vnDateKey(new Date()),
  });

  // Chọn ảnh là gửi ngay — tấm trượt đóng, tiến trình đọc và kết quả hiện trong thẻ.
  const closeAdd = () => {
    setAdding(false);
    setReplacing(false);
  };
  const addSheet = embedded ? (
    <BottomSheet open={adding || replacing} onClose={closeAdd} title={t('addModal.title')}>
      <YStack gap={space.md}>
        <DriverLicenceUploader processing={null} onSubmitted={closeAdd} />
        <AcceptedDocuments />
      </YStack>
    </BottomSheet>
  ) : null;

  if (embedded && !latest) {
    return (
      <Card>
        <YStack gap={space.lg} ai="center">
          <Image
            source={images.driverLicenceEmpty}
            style={styles.emptyArt}
            contentFit="contain"
            accessible={false}
          />
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} ta="center">
              {t('empty.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body} ta="center">
              {t('empty.body')}
            </Text>
          </YStack>
          <Button label={t('empty.add')} onPress={() => setAdding(true)} />
        </YStack>
        {addSheet}
      </Card>
    );
  }

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
          ) : null}
          <DriverLicenceDetails licence={view.verified} />
          <Button
            label={t('verified.replace')}
            variant="secondary"
            onPress={() => setReplacing(true)}
          />
        </YStack>
        {addSheet}
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

        {embedded && !view.processing ? (
          <Button label={t('empty.add')} onPress={() => setAdding(true)} />
        ) : (
          <DriverLicenceUploader
            processing={view.processing}
            onPick={() => setPickedOver(latest?.id ?? null)}
            onSubmitted={() => setReplacing(false)}
          />
        )}

        {replacing && !view.processing ? (
          <Button
            label={t('verified.cancelReplace')}
            variant="ghost"
            onPress={() => setReplacing(false)}
          />
        ) : null}

        {view.showAccepted && !embedded ? <AcceptedDocuments /> : null}
      </YStack>
      {addSheet}
    </Card>
  );
}

const BANNER_TONE = {
  success: { fg: colors.success, bg: colors.successSurface },
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

/** Vì sao chưa xác thực được + gợi ý chụp lại đúng chỗ hỏng. */
function RejectedNotice({ licence }: { licence: DriverLicence }) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
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
        {reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED ? (
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
      <LicencePhoto licenceId={licence.id} />
    </YStack>
  );
}

/**
 * ẢNH BẰNG đã nộp, hiện NGAY dưới dạng ảnh thu nhỏ — bản native của `LicencePhoto` (web, PR #183).
 *
 * URL ký sống 120 giây ở server; `useDriverLicenceImage` giữ cache 90 giây. Chạm ảnh ⇒ mở trình
 * xem; URL đã cũ thì xin lại TRƯỚC khi mở (không mở một trình xem trống). Ảnh không tải được — lỗi
 * xin URL, hay chính ảnh báo hỏng — thì khung chuyển sang trạng thái lỗi với nút "Thử lại"; lỗi
 * gắn với CHÍNH URL hỏng, nên URL mới tự xoá trạng thái đó.
 */
export function LicencePhoto({ licenceId }: { licenceId: string }) {
  const t = useTranslations('DriverLicence.image');
  const image = useDriverLicenceImage(licenceId);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const url = image.data?.url ?? null;
  const failed = image.isError || (url !== null && url === brokenUrl);
  const busy = image.isPending || opening;

  async function reveal() {
    if (busy) return;
    if (failed) {
      setBrokenUrl(null);
      void image.refetch();
      return;
    }
    if (!image.isStale) {
      setOpen(true);
      return;
    }
    setOpening(true);
    const fresh = await image.refetch();
    setOpening(false);
    if (fresh.isSuccess) setOpen(true);
  }

  return (
    <>
      <Pressable
        onPress={() => void reveal()}
        accessibilityRole="button"
        accessibilityLabel={failed ? t('retryLabel') : t('viewLabel')}
        accessibilityState={{ busy }}
      >
        <YStack
          h={PHOTO_HEIGHT}
          br={radius.md}
          ov="hidden"
          bg={colors.surfaceMuted}
          bw={1}
          bc={failed ? colors.warning : colors.border}
          ai="center"
          jc="center"
        >
          {url && !failed ? (
            <Image
              testID="licence-photo-thumb"
              source={{ uri: url }}
              style={[StyleSheet.absoluteFill, thumbStyles.blurred]}
              contentFit="cover"
              /*
               * Ảnh thu nhỏ NHOÈ, như web (`.photoImage { filter: blur(10px) }`): giấy tờ tuỳ thân
               * không hiện rõ trên màn ai cũng liếc được; chạm mới mở bản rõ trong `PhotoViewer`.
               */
              blurRadius={10}
              accessible={false}
              onError={() => setBrokenUrl(url)}
            />
          ) : null}
          <YStack ai="center" gap={space.xs}>
            {failed ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('loadFailed')}
              </Text>
            ) : null}
            <XStack
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={space.xs}
              br={radius.pill}
              bg={colors.surface}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Ionicons
                  name={failed ? 'refresh' : 'eye-outline'}
                  size={iconSize.sm}
                  color={colors.text}
                />
              )}
              {busy ? null : (
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {failed ? t('retry') : t('view')}
                </Text>
              )}
            </XStack>
          </YStack>
        </YStack>
      </Pressable>
      <PhotoViewer
        url={open ? url : null}
        unavailableLabel={t('loadFailed')}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Chiều cao khung ảnh thu nhỏ — đủ đọc ra đó là bằng nào mà không chiếm cả màn. */
const PHOTO_HEIGHT = 160;

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

/* `scale` đẩy viền nhoè ra ngoài khung — không có nó, mép ảnh lộ một quầng sáng (khớp web). */
const styles = StyleSheet.create({
  /* Hình 184 × 137 trong khung 160 của bản vẽ. */
  emptyArt: { width: 184, height: 160 },
});

const thumbStyles = StyleSheet.create({ blurred: { transform: [{ scale: 1.15 }] } });
