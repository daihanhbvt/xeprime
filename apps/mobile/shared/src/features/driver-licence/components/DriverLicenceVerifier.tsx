import { useState, type ComponentProps, type ReactNode } from 'react';
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
import { elevation } from '@/theme/elevation';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { resolveVerifierView, type DriverLicenceTrip } from '../driver-licence-view';
import { useDriverLicence, useDriverLicenceImage } from '../hooks/use-driver-licence';
import { DriverLicenceUploader } from './DriverLicenceUploader';

const ACCEPTED_KEYS = ['vn', 'idp', 'foreign'] as const;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** `line-height: 22px` của chữ body 14 trong băng trạng thái (`.bannerTitle`, `.bannerBody`). */
const BODY_LINE_HEIGHT = 22;
/** `--xp-line-height-body-lg` (24) — nhãn/giá trị của lưới thông tin bằng (`.fact`). */
const BODY_LG_LINE_HEIGHT = 24;
/** `--xp-space-12` — khe biểu tượng ↔ chữ của băng trạng thái (`.banner`). */
const GAP_12 = space.sm + space.xs;
/** `--xp-space-20` — khe ngang của lưới thông tin bằng (`.facts` column-gap). */
const GAP_20 = space.md + space.xs;
/** Biểu tượng 20 của băng trạng thái (`.bannerIcon { font-size: 20px }`). */
const BANNER_ICON = 20;

/**
 * Xác thực bằng lái — MỘT component cho cả khối "Giấy tờ & Xác minh" lẫn bước bằng lái trong luồng
 * đặt xe (ADR 0057). Bản native của `DriverLicenceVerifier` web; quyết định nhánh nằm ở
 * `resolveVerifierView` (thuần, có test). Màn hình hoàn toàn do trạng thái SERVER quyết; component
 * chỉ thêm "đang thay bằng mới" và "vừa chọn ảnh mới".
 *
 * Có `trip` (luồng đặt xe) thì "hợp lệ" nghĩa là hợp lệ CHO CHUYẾN ĐÓ — cùng một hàm với cổng ở
 * server, nên giao diện không bao giờ nói "được" ở chỗ server sẽ nói "không".
 *
 * KHUNG (`.panel` / `.panelEmbedded` web): trong bước đặt xe hay khối Giấy tờ, nơi chứa ĐÃ là khung
 * (tiêu đề bước / `AccountPanel`), nên bộ xác thực vẽ PHẲNG — không viền, không bóng, không đệm, khe
 * giữa thông báo · thông tin bằng · nút là `space-lg` (24). Chỉ khi đứng một mình mới là thẻ (viền
 * `color-border`, bo `border-radius-lg`, bóng `shadow-card`, khe `space-md`).
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
  const colors = useColors();
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const query = useDriverLicence();
  const [replacing, setReplacing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickedOver, setPickedOver] = useState<string | null | undefined>(undefined);
  const booking = Boolean(trip);
  const flat = booking || embedded;

  if (query.isPending) {
    return (
      <Panel flat={flat}>
        <SkeletonText lines={4} />
      </Panel>
    );
  }
  if (query.isError) {
    // `<Alert type="error" action={<Button size="small" icon={<ReloadOutlined />}>}>` web.
    return (
      <YStack gap={space.sm}>
        <Callout tone="danger">{t('error.load')}</Callout>
        <Button
          label={t('error.retry')}
          icon="refresh"
          variant="secondary"
          size="sm"
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
  // Hộp "Thêm bằng lái" web (`.modalBody`: khe `space-md`, bộ tải + giấy tờ được chấp nhận).
  const addSheet = embedded ? (
    <BottomSheet open={adding || replacing} onClose={closeAdd} title={t('addModal.title')}>
      <YStack gap={space.md}>
        <DriverLicenceUploader processing={null} onSubmitted={closeAdd} />
        <AcceptedDocuments />
      </YStack>
    </BottomSheet>
  ) : null;

  // 1. Bằng dùng được (cho chuyến này, nếu có chuyến).
  if (view.kind === 'usable') {
    return (
      <Panel flat={flat} success>
        {/* Băng xanh `.banner_success`. */}
        <StatusBanner
          tone="success"
          icon="checkmark-circle"
          title={booking ? t('verified.bookingTitle') : t('verified.title')}
          body={booking ? null : t('verified.body')}
        />
        <DriverLicenceDetails licence={view.verified} />
        {/*
          Bằng mới vừa nộp chưa thành — `.replaceFailed` web: MỘT dòng chú thích dưới thông tin
          bằng, không phải khối cảnh báo (việc chính vẫn là băng xanh phía trên). Biểu tượng
          chấm than `color-warning-strong` cỡ body-lg (16), chữ `text-secondary` body 14 / 22.
        */}
        {view.rejected ? (
          <XStack ai="flex-start" gap={space.sm} accessibilityRole="text">
            <YStack pt={3}>
              <Ionicons name="alert-circle" size={iconSize.sm} color={colors.warningStrong} />
            </YStack>
            <ReplaceFailedText licence={view.rejected} />
          </XStack>
        ) : null}
        {/* `.footerActions`: nút `EditOutlined` mặc định, màn ≤575px trọn bề ngang. */}
        <Button
          label={t('verified.replace')}
          icon="create-outline"
          variant="secondary"
          onPress={() => setReplacing(true)}
        />
        {addSheet}
      </Panel>
    );
  }

  // 2. Khối Giấy tờ, chưa nộp lần nào: thẻ rỗng + nút mở tấm "Thêm bằng lái" (design "Verify Empty").
  if (embedded && !latest) {
    return (
      <Panel flat={flat}>
        <EmptyState onAdd={() => setAdding(true)} />
        {addSheet}
      </Panel>
    );
  }

  // 3. Cần nộp (lại) / đang thay bằng / máy đang đọc — CÙNG một khung.
  let notice: ReactNode = (
    <PanelHeading
      title={booking ? null : t('intro.title')}
      body={booking ? t('intro.bookingBody') : t('intro.body')}
    />
  );
  if (view.rejected) {
    notice = <RejectedNotice licence={view.rejected} />;
  } else if (view.tripIssue && view.verified) {
    notice = (
      <Callout tone="warning">
        {t(`tripIssue.${view.tripIssue}`, {
          date: view.verified.expiresOn ? fmt.dateKey(view.verified.expiresOn) : '',
        })}
      </Callout>
    );
  }

  // Khối Giấy tờ, máy không đang đọc: thông báo + nút mở tấm thêm bằng; KHÔNG có danh sách giấy tờ
  // được chấp nhận ở đây (nó nằm trong tấm) — như nhánh `embedded && !processing` của web.
  if (embedded && !view.processing) {
    return (
      <Panel flat={flat}>
        {notice}
        <Button label={t('empty.add')} variant="gradient" onPress={() => setAdding(true)} />
        {addSheet}
      </Panel>
    );
  }

  return (
    <Panel flat={flat}>
      {notice}
      <DriverLicenceUploader
        processing={view.processing}
        onPick={() => setPickedOver(latest?.id ?? null)}
        onSubmitted={() => setReplacing(false)}
      />
      {/* Nút `type="text"` "Huỷ thay bằng" của web. */}
      {replacing && !view.processing ? (
        <Button
          label={t('verified.cancelReplace')}
          variant="ghost"
          onPress={() => setReplacing(false)}
        />
      ) : null}
      {/* Web: `!verified && !rejected` — gồm cả khối Giấy tờ lúc máy đang đọc ảnh vừa nộp. */}
      {view.showAccepted ? <AcceptedDocuments /> : null}
      {addSheet}
    </Panel>
  );
}

/**
 * Khung của bộ xác thực — `.panel` / `.panelEmbedded` / `.panelSuccess` web.
 *
 * `flat`: phẳng, khe `space-lg` (bước đặt xe, khối Giấy tờ). Còn lại là thẻ đứng riêng: viền 1px
 * `color-border` (bằng hợp lệ: viền `color-success`), bo `border-radius-lg`, bóng `shadow-card`,
 * đệm `space-md` (màn ≤575px web hạ `space-lg` → `md`), khe `space-md`.
 */
function Panel({
  flat,
  success = false,
  children,
}: {
  flat: boolean;
  success?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  if (flat) return <YStack gap={space.lg}>{children}</YStack>;
  return (
    <Card {...(success ? { borderColor: colors.success } : {})}>
      <YStack gap={space.md}>{children}</YStack>
    </Card>
  );
}

/**
 * Thẻ rỗng của khối Giấy tờ — `.empty` web (design "Verify Empty", Figma `20043:49464`): canh giữa,
 * khe `space-lg`. Hình 160 × 160 (`width={160}` + `.emptyArt { height: 160px; object-fit: contain }`
 * — tranh 184 × 137 thu vừa khung). Tiêu đề `.emptyTitle` h3 (18) semibold `color-text`; mô tả
 * `.emptyBody` body-lg (16) / 24 `text-secondary`. Nút CtaButton gradient (mặc định của web).
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  const colors = useColors();
  const t = useTranslations('DriverLicence.empty');
  return (
    <YStack gap={space.lg} ai="center">
      <Image
        source={images.driverLicenceEmpty}
        style={styles.emptyArt}
        contentFit="contain"
        accessible={false}
      />
      <YStack gap={space.xs}>
        <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} ta="center">
          {t('title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodyLg} lh={BODY_LG_LINE_HEIGHT} ta="center">
          {t('body')}
        </Text>
      </YStack>
      <Button label={t('add')} variant="gradient" onPress={onAdd} />
    </YStack>
  );
}

/**
 * Lời dẫn của khung nộp bằng — `.heading` web (khe `space-xs`): tiêu đề `.headingTitle` h4 semibold
 * `color-text`, thân `.headingBody` body 14 `text-secondary`. `title = null`: bước "Xác thực bằng
 * lái" của luồng đặt xe đã có tiêu đề.
 */
function PanelHeading({ title, body }: { title: string | null; body: string }) {
  const colors = useColors();
  return (
    <YStack gap={space.xs}>
      {title ? (
        <Text
          col={colors.text}
          fos={fontSize.h4}
          fow={fontWeight.semibold}
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : null}
      <Text col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
        {body}
      </Text>
    </YStack>
  );
}

function ReplaceFailedText({ licence }: { licence: DriverLicence }) {
  const colors = useColors();
  const t = useTranslations('DriverLicence');
  return (
    <Text f={1} col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
      {t('verified.replaceFailed', {
        reason: t(`reasons.${(licence.rejectionReason ?? 'other') as DriverLicenceRejectReason}`),
      })}
    </Text>
  );
}

const useBannerTone = themed(
  (colors) =>
    ({
      // `.banner_success`: nền `color-success-bg`, biểu tượng + tiêu đề `color-success`.
      success: { fg: colors.success, bg: colors.successSurface, title: colors.success },
      // `.banner_danger`: nền `color-error-bg`, biểu tượng `color-error`, tiêu đề `color-text`.
      danger: { fg: colors.danger, bg: colors.dangerSurface, title: colors.text },
    }) as const,
);

/**
 * Băng trạng thái — `.banner` web: hàng ngang khe 12, đệm `space-md`, bo `border-radius-control`
 * (12). Biểu tượng 20 lùi 1px cho thẳng dòng tiêu đề 22. Tiêu đề body 14 / 22 semibold; thân
 * body 14 / 22 `text-secondary`, cách tiêu đề `space-xs`.
 */
function StatusBanner({
  tone,
  icon,
  title,
  body,
  children,
  role = 'summary',
}: {
  tone: keyof ReturnType<typeof useBannerTone>;
  icon: IoniconName;
  title: string;
  body?: string | null;
  children?: ReactNode;
  role?: 'summary' | 'alert';
}) {
  const colors = useColors();
  const skin = useBannerTone()[tone];
  return (
    <XStack
      gap={GAP_12}
      ai="flex-start"
      p={space.md}
      br={radius.control}
      bg={skin.bg}
      accessibilityRole={role}
    >
      <YStack pt={1}>
        <Ionicons name={icon} size={BANNER_ICON} color={skin.fg} />
      </YStack>
      <YStack f={1} gap={space.xs}>
        <Text col={skin.title} fos={fontSize.body} lh={BODY_LINE_HEIGHT} fow={fontWeight.semibold}>
          {title}
        </Text>
        {body ? (
          <Text col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
            {body}
          </Text>
        ) : null}
        {children}
      </YStack>
    </XStack>
  );
}

/** Vì sao chưa xác thực được + gợi ý chụp lại đúng chỗ hỏng — `RejectedNotice` web (băng đỏ). */
function RejectedNotice({ licence }: { licence: DriverLicence }) {
  const colors = useColors();
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const reason = (licence.rejectionReason ?? 'other') as DriverLicenceRejectReason;
  // Hết hạn: hiện NGÀY máy đọc được — khách thấy ngay nếu máy đọc lệch một chữ số.
  const reasonText =
    reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED && licence.expiresOn
      ? t('rejected.expiredOn', { date: fmt.dateKey(licence.expiresOn) })
      : t(`reasons.${reason}`);

  return (
    <StatusBanner
      tone="danger"
      icon="close-circle"
      title={t('rejected.title')}
      body={reasonText}
      role="alert"
    >
      {reason === DRIVER_LICENCE_REJECT_REASON.EXPIRED ? (
        <Text col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
          {t('rejected.expiredMisread')}
        </Text>
      ) : null}
      {/* `.issueList`: danh sách chấm, body-sm `text-secondary`, thụt `space-lg`. */}
      {licence.qualityIssues.length > 0 ? (
        <YStack gap={2} paddingLeft={space.sm}>
          {licence.qualityIssues.map((issue) => (
            <Text key={issue} col={colors.textMuted} fos={fontSize.bodySm}>
              {`• ${t(`issues.${issue as 'blurry'}`)}`}
            </Text>
          ))}
        </YStack>
      ) : null}
      {licence.reviewNote ? (
        <Text col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
          {t('rejected.note', { note: licence.reviewNote })}
        </Text>
      ) : null}
    </StatusBanner>
  );
}

/**
 * Thông tin ĐÃ CHỐT trên bằng — cho chính chủ đối chiếu với tấm bằng trong ví: đọc sai chỗ nào
 * thì thấy ngay và nộp lại.
 *
 * Bố cục `DriverLicenceDetails` web ở chỗ đứng hẹp (`.details` flex-wrap ⇒ ảnh TRƯỚC, thông tin
 * xuống dưới, khe dọc `space-md`). Thông tin (`.detailsBody`, khe `space-sm`):
 *   - LƯỚI (`.facts`): 2 cột đều, khe dọc `space-md` · ngang 20. Mỗi ô (`.fact`, Figma
 *     `20043:49081`): nhãn `text-tertiary` trên giá trị `color-text` medium, cả hai body-lg 16 / 24,
 *     cách nhau `space-xs`. Ô "Loại bằng" (`.factWide`) chiếm trọn hàng.
 *   - "Lái được" (`.drives`): biểu tượng ô tô + chữ `text-secondary`, phần giá trị đậm.
 *   - Bằng nước ngoài: một dòng `.drives` nói ai kiểm hạng/hạn (ADR 0057).
 */
export function DriverLicenceDetails({ licence }: { licence: DriverLicence }) {
  const colors = useColors();
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const drives = [
    licence.coversCar ? t('fields.car') : null,
    licence.coversMotorbike ? t('fields.motorbike') : null,
  ].filter(Boolean);

  const rows: Array<{ key: string; label: string; value: string | null; wide?: boolean }> = [
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
      wide: true,
    },
  ];

  return (
    <YStack gap={space.md}>
      <LicencePhoto licenceId={licence.id} />
      <YStack gap={space.sm}>
        {/* Lưới 2 cột: mỗi ô rộng một nửa trừ nửa khe ngang — `XStack` wrap thay `grid`. */}
        <XStack flexWrap="wrap" columnGap={GAP_20} rowGap={space.md}>
          {rows
            .filter((row) => row.value)
            .map((row) => (
              <YStack
                key={row.key}
                gap={space.xs}
                minWidth={0}
                width={row.wide ? '100%' : undefined}
                flexBasis={row.wide ? undefined : FACT_HALF_BASIS}
                flexGrow={row.wide ? 0 : 1}
                maxWidth={row.wide ? undefined : FACT_HALF_MAX}
              >
                <Text col={colors.placeholder} fos={fontSize.bodyLg} lh={BODY_LG_LINE_HEIGHT}>
                  {row.label}
                </Text>
                <Text
                  col={colors.text}
                  fos={fontSize.bodyLg}
                  lh={BODY_LG_LINE_HEIGHT}
                  fow={fontWeight.medium}
                  fontVariant={TABULAR_NUMS}
                >
                  {row.value}
                </Text>
              </YStack>
            ))}
        </XStack>
        {drives.length > 0 ? (
          <XStack gap={space.xs} ai="center">
            <Ionicons name="car-outline" size={iconSize.sm} color={colors.textMuted} />
            <Text f={1} col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
              {`${t('fields.drives')}: `}
              <Text col={colors.text} fow={fontWeight.semibold}>
                {drives.join(LIST_SEPARATOR)}
              </Text>
            </Text>
          </XStack>
        ) : null}
        {/* Bằng nước ngoài: máy chỉ nhận dạng, không đọc hạng/hạn — nói thẳng ai sẽ kiểm (ADR 0057). */}
        {licence.kind && licence.kind !== DRIVER_LICENCE_KIND.VN ? (
          <Text col={colors.textMuted} fos={fontSize.body} lh={BODY_LINE_HEIGHT}>
            {t('fields.foreignNote')}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}

/**
 * Hai cột đều của `.facts` (`repeat(2, minmax(0, 1fr))`): mỗi ô nửa hàng mọc từ 40% rồi chia đều
 * phần còn lại sau khe 20; trần 48% giữ một ô LẺ cuối hàng ở nửa cột thay vì nở trọn hàng.
 */
const FACT_HALF_BASIS = '40%';
const FACT_HALF_MAX = '48%';
const TABULAR_NUMS: ['tabular-nums'] = ['tabular-nums'];

/**
 * ẢNH BẰNG đã nộp, hiện NGAY dưới dạng ảnh thu nhỏ — bản native của `LicencePhoto` (web, PR #183).
 *
 * Khung `.photo` web: rộng 256 (`flex: 0 0 256px; max-width: 100%`), cao 188, viền 1px
 * `color-border` (lỗi: viền đứt nét), bo `border-radius-control` (12), nền dải `bg-muted → bg-sand`
 * (app vẽ `bg-muted` phẳng — chỉ thấy khi chưa có ảnh). Ảnh NHOÈ (`blur(10px)`, `scale(1.15)`). Viên
 * giữa (`.photoPill`): đệm 4 × 12, bo pill, nền `bg-container`, bóng `shadow-sm`, chữ
 * `font-size-sm` (12) medium `color-text`.
 *
 * URL ký sống 120 giây ở server; `useDriverLicenceImage` giữ cache 90 giây. Chạm ảnh ⇒ mở trình
 * xem; URL đã cũ thì xin lại TRƯỚC khi mở (không mở một trình xem trống). Ảnh không tải được — lỗi
 * xin URL, hay chính ảnh báo hỏng — thì khung chuyển sang trạng thái lỗi với nút "Thử lại"; lỗi
 * gắn với CHÍNH URL hỏng, nên URL mới tự xoá trạng thái đó.
 */
export function LicencePhoto({ licenceId }: { licenceId: string }) {
  const colors = useColors();
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
        style={styles.photoHit}
      >
        <YStack
          h={PHOTO_HEIGHT}
          br={radius.control}
          ov="hidden"
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.border}
          borderStyle={failed ? 'dashed' : 'solid'}
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
          {/* `.photoCover`: phủ giữa khung, khe `space-xs`, đệm `space-sm`. */}
          <YStack ai="center" gap={space.xs} p={space.sm}>
            {failed ? (
              // `.photoNote`: `font-size-sm` `text-secondary`, canh giữa.
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t('loadFailed')}
              </Text>
            ) : null}
            <XStack
              ai="center"
              gap={space.xs}
              px={space.sm + space.xs}
              py={space.xs}
              br={radius.pill}
              bg={colors.surface}
              style={elevation.xs}
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

/** `.photo { height: 188px }` của web — khung dáng thẻ ID-1. */
const PHOTO_HEIGHT = 188;
/** `.photo { flex: 0 0 256px }` — khung rộng 256, hẹp hơn thì co về bề ngang khung chứa. */
const PHOTO_WIDTH = 256;

/**
 * "Giấy tờ được chấp nhận" — `.accepted` web: gạch trên `color-border-subtle`, đệm trên
 * `space-sm`. Tiêu đề `.acceptedTitle` `font-size-sm` semibold `text-secondary`, cách danh sách
 * `space-xs`; danh sách `.acceptedList` chấm, khe 2, `font-size-sm` `text-tertiary`.
 */
function AcceptedDocuments() {
  const colors = useColors();
  const t = useTranslations('DriverLicence.accepted');
  return (
    <YStack gap={space.xs} pt={space.sm} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {t('title')}
      </Text>
      <YStack gap={2}>
        {ACCEPTED_KEYS.map((key) => (
          <Text key={key} col={colors.placeholder} fos={fontSize.label}>
            {`• ${t(key)}`}
          </Text>
        ))}
      </YStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  /* `width={160}` + `.emptyArt { height: 160px; object-fit: contain }` của web. */
  emptyArt: { width: 160, height: 160 },
  photoHit: { width: PHOTO_WIDTH, maxWidth: '100%' },
});

/* `scale` đẩy viền nhoè ra ngoài khung — không có nó, mép ảnh lộ một quầng sáng (khớp web). */
const thumbStyles = StyleSheet.create({ blurred: { transform: [{ scale: 1.15 }] } });
