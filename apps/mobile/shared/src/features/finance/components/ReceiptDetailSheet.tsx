import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  STATUS_COLOR,
  RECEIPT_TYPE,
  isAutoReceipt,
} from '@xeprime/types';
import { metaColor } from '@/lib/status-meta';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { LineIcon } from '@/components/icons/LineIcon';
import { FONT_FAMILY } from '@/theme/fonts';
import { ReceiptAttachmentRow, isPdfUrl } from './ReceiptAttachmentRow';
import { Callout } from '@/components/ui/Callout';
import { InfoHint } from '@/components/ui/InfoHint';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useScreenFocused } from '@/hooks/use-screen-focused';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { space, typeScale } from '@/theme/tokens';
import { useApproveReceipt, useCancelReceipt, useReceiptDetail } from '../hooks/use-finance';

export function ReceiptDetailSheet({
  receiptId,
  onClose,
}: {
  /** `null` = đóng, và KHÔNG phát request nào. */
  receiptId: string | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts.detail');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const tStates = useTranslations('Common.states');
  const tTable = useTranslations('Finance.receipts.table');
  const tToast = useTranslations('Finance.receipts.toast');
  const tFeature = useTranslations('ManageCommon.feature');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  /*
   * Tấm trượt ẨN khi rời màn, KHÔNG bị đóng — xem `goTo` và prop `open` bên dưới.
   */
  const focused = useScreenFocused();

  const [viewing, setViewing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'approve' | 'cancel' | null>(null);

  const canApprove = permissions.has(PERMISSION.RECEIPT_APPROVE);
  const canViewBooking = permissions.has(PERMISSION.BOOKING_VIEW);
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);
  const canViewCustomer = permissions.has(PERMISSION.CUSTOMER_VIEW);

  const query = useReceiptDetail(receiptId);
  const approve = useApproveReceipt();
  const cancel = useCancelReceipt();
  const data = query.data;

  const auto = data ? isAutoReceipt(data.source) : false;

  /**
   * Lối đi của phiếu TỰ ĐỘNG — về đơn nếu có, không thì về xe.
   *
   * Phiếu bảo dưỡng KHÔNG gắn đơn, nên chỉ dựng theo `bookingId` là người dùng nhận một câu
   * "thao tác ở nghiệp vụ đó" mà không có chỗ nào để đi — đúng định nghĩa của một đường cụt.
   */
  const autoLink =
    data && data.bookingId && canViewBooking
      ? {
          label: t('auto.openBooking'),
          onPress: () => goTo(ROUTES.manage.bookingDetail(data.bookingId!)),
        }
      : data && data.vehicleId && canViewVehicle
        ? {
            label: t('auto.openVehicle'),
            onPress: () => goTo(ROUTES.manage.vehicleDetail(data.vehicleId!)),
          }
        : null;
  /**
   * Điều kiện lấy ĐÚNG của web: chỉ phiếu NHẬP TAY mới thao tác được, duyệt chỉ với
   * nháp/chờ-duyệt, huỷ với mọi phiếu chưa huỷ.
   */
  const actions =
    canApprove && data && !auto
      ? {
          approve:
            data.status === RECEIPT_STATUS.PENDING_APPROVAL || data.status === RECEIPT_STATUS.DRAFT,
          cancel: data.status !== RECEIPT_STATUS.CANCELLED,
        }
      : null;
  const showFooter = Boolean(actions && (actions.approve || actions.cancel));
  const pending = approve.isPending || cancel.isPending;

  const run = (kind: 'approve' | 'cancel') => {
    if (!data) return;
    const done = {
      onSuccess: () => {
        toast.showSuccess(kind === 'approve' ? tToast('approved') : tToast('cancelled'));
        setConfirming(null);
        onClose();
      },
      onError: (error: unknown) => {
        toast.showError(errorMessage(error));
        setConfirming(null);
      },
    };
    if (kind === 'approve') approve.mutate(data.id, done);
    else cancel.mutate({ id: data.id }, done);
  };

  /** Điều hướng ra khỏi tấm trượt phải ĐÓNG nó trước — nếu không nó nằm đè lên màn vừa mở. */
  /**
   * Đi sang màn khác mà KHÔNG đóng tấm trượt.
   *
   * Bản trước gọi `onClose()` rồi mới đẩy màn: bấm vào đơn thuê là mất luôn phiếu đang xem, quay
   * lui thì về cuốn sổ trống — người dùng phải tìm lại đúng cái phiếu đó để mở lần nữa, mà đối
   * chiếu tiền thì thường phải qua lại vài lượt giữa phiếu và đơn.
   *
   * `onClose()` ở đó không thừa: `BottomSheet` dựng trên `Modal` của React Native, mà `Modal`
   * nằm trên MỌI thứ — kể cả màn vừa được đẩy lên. Để nguyên thì nó che mất màn đơn thuê.
   *
   * Cách đúng là tách hai việc: `receiptId` (phiếu nào đang xem) do màn cha giữ và không ai đụng
   * tới; còn việc VẼ RA thì tắt trong lúc màn mất tiêu điểm. Quay về là tiêu điểm trở lại và tấm
   * trượt hiện lại đúng phiếu cũ, dữ liệu lấy thẳng từ cache nên không có nhịp tải nào.
   */
  const goTo = (href: Parameters<typeof navigateOnce>[0]) => {
    navigateOnce(href);
  };

  const copyReference = async (value: string) => {
    await Clipboard.setStringAsync(value);
    toast.showSuccess(tActions('copied'));
  };

  return (
    <BottomSheet
      open={receiptId !== null && focused}
      onClose={onClose}
      /*
        Đầu tấm 3 dòng (chốt 26/11/2026):
          Chi tiết phiếu (!)      - (!) chỉ với phiếu tự động: chạm đọc "phiếu sinh từ ..."
          #MÃ-PHIẾU  [trạng thái]
          ngày tạo
      */
      title={t('title')}
      {...(data
        ? {
            subtitle: (
              <YStack gap={2}>
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  {data.receiptNo ? (
                    <Text
                      col={colors.text}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fontFamily={FONT_FAMILY.semibold}
                      flexShrink={1}
                    >
                      {`#${data.receiptNo}`}
                    </Text>
                  ) : null}
                  <Pill
                    size="sm"
                    label={domainLabel('receiptStatus', data.status)}
                    tone={pillToneOfStatusColor(
                      data.status === RECEIPT_STATUS.CANCELLED
                        ? STATUS_COLOR.NEUTRAL
                        : metaColor(RECEIPT_STATUS_META, data.status),
                    )}
                  />
                </XStack>
                <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={22}>
                  {fmt.date(data.createdAt)}
                </Text>
              </YStack>
            ),
            ...(auto
              ? {
                  titleAdornment: (
                    <InfoHint
                      lineIcon="info-circle-16"
                      label={t('auto.title')}
                      content={
                        <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                          {t('auto.body', { source: domainLabel('receiptSource', data.source) })}
                          {autoLink ? (
                            <>
                              {' ('}
                              <Text
                                col={colors.infoStrong}
                                fos={typeScale.body.fontSize}
                                fontFamily={FONT_FAMILY.semibold}
                                accessibilityRole="link"
                                onPress={autoLink.onPress}
                              >
                                {autoLink.label}
                              </Text>
                              {')'}
                            </>
                          ) : null}
                          .
                        </Text>
                      }
                    />
                  ),
                }
              : {}),
          }
        : {})}
      chrome="v2"
      headerDivider
      footer={
        showFooter ? (
          /* Figma "Footer cố định" `24512:128037`: "Hủy phiếu" viền đỏ + nút vàng, hai nút chia đôi. */
          /* Hai nút đúng 50/50: `w="50%"` + đệm 6 mỗi bên (flexBasis không ăn với `Button` - đã thử trên máy). */
          <XStack mx={-6}>
            {actions?.cancel ? (
              <YStack f={1} px={6}>
                <Button
                  label={t('cancelAction')}
                  variant="dangerOutline"
                  shape="square"
                  loading={pending}
                  /* Huỷ phiếu là phép GHI như duyệt - khoá cùng khi gói hết hạn (ADR 0027 điều 3). */
                  disabled={!finance.canWrite}
                  onPress={() => setConfirming('cancel')}
                />
              </YStack>
            ) : null}
            {actions?.approve ? (
              <YStack f={1} px={6}>
                <Button
                  label={t('approveAction')}
                  variant="gradient"
                  shape="square"
                  loading={pending}
                  disabled={!finance.canWrite}
                  onPress={() => setConfirming('approve')}
                />
              </YStack>
            ) : null}
          </XStack>
        ) : null
      }
    >
      {query.isPending ? (
        <SkeletonText lines={6} />
      ) : query.isError ? (
        <ScreenError
          error={query.error}
          title={t('errorTitle')}
          onRetry={() => void query.refetch()}
        />
      ) : data ? (
        <>
          {/* Figma `24512:128142`: số tiền 24/32 semibold + số bằng chữ nghiêng 14 `text/gray/low`. Không viên trạng thái (chốt 26/11/2026). */}
          <YStack gap={2}>
            <Text
              col={data.type === RECEIPT_TYPE.INCOME ? colors.success : colors.danger}
              fos={24}
              lh={32}
              fontFamily={FONT_FAMILY.semibold}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {`${data.type === RECEIPT_TYPE.INCOME ? '+' : '-'}${fmt.money(data.amount)}`}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontStyle="italic">
              {fmt.moneyWords(data.amount)}
            </Text>
          </YStack>

          {/* Gói hết hạn: nói RÕ là chế độ chỉ xem, không để nút tắt trông như thiếu quyền. */}
          {showFooter && !finance.canWrite ? (
            <Callout tone="warning">{tFeature('appReadOnlyTooltip')}</Callout>
          ) : null}

          <Section title={t('sections.info')}>
            <Row label={t('rows.type')}>
              <Pill
                label={domainLabel('receiptType', data.type)}
                tone={data.type === RECEIPT_TYPE.INCOME ? 'success' : 'danger'}
              />
            </Row>
            <Row label={t('rows.source')}>
              <Pill
                label={domainLabel('receiptSource', data.source)}
                tone={pillToneOfStatusColor(metaColor(RECEIPT_SOURCE_META, data.source))}
              />
            </Row>
            <Row label={t('rows.occurredAt')} value={fmt.date(data.occurredAt)} />
            <Row label={t('rows.category')} value={data.categoryName ?? null} />
            <Row label={t('rows.method')} value={domainLabel('paymentMethod', data.paymentMethod)} />
            <Row label={t('rows.referenceCode')}>
              {data.referenceCode ? (
                /* Icon chép nhỏ NGAY CẠNH mã (giữ, chốt 26/11/2026). */
                <XStack ai="center" gap={space.xs} flexShrink={1}>
                  <Value>{data.referenceCode}</Value>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('copyReference')}
                    hitSlop={space.sm}
                    onPress={() => void copyReference(data.referenceCode!)}
                  >
                    <LineIcon name="copy" size={16} color={colors.placeholder} />
                  </Pressable>
                </XStack>
              ) : (
                <Value muted>{tLabels('emptyValue')}</Value>
              )}
            </Row>
            <Row label={t('rows.description')} value={data.description ?? null} last />
          </Section>

          <Section title={t('sections.related')}>
            <Row label={t('rows.booking')}>
              {data.bookingId && canViewBooking ? (
                <Value link onPress={() => goTo(ROUTES.manage.bookingDetail(data.bookingId!))}>
                  {data.bookingCode ?? t('viewBooking')}
                </Value>
              ) : (
                <Value muted={!data.bookingCode}>{data.bookingCode ?? tLabels('emptyValue')}</Value>
              )}
            </Row>
            <Row label={t('rows.vehicle')} {...(data.plateNumber ? { sub: data.plateNumber } : {})}>
              {data.vehicleId && canViewVehicle ? (
                <Value link onPress={() => goTo(ROUTES.manage.vehicleDetail(data.vehicleId!))}>
                  {data.vehicleName ?? t('viewVehicle')}
                </Value>
              ) : (
                <Value muted={!data.vehicleName}>{data.vehicleName ?? tLabels('emptyValue')}</Value>
              )}
            </Row>
            <Row label={t('rows.customer')} last>
              {data.tenantCustomerId && canViewCustomer ? (
                <Value link onPress={() => goTo(ROUTES.manage.customerDetail(data.tenantCustomerId!))}>
                  {data.customerName ?? t('viewCustomer')}
                </Value>
              ) : (
                <Value muted={!data.customerName}>{data.customerName ?? tLabels('emptyValue')}</Value>
              )}
            </Row>
          </Section>

          {/* Figma không vẽ chứng từ - dựng bằng CÙNG dòng tệp của form tạo phiếu, chạm để xem. */}
          {data.attachments.length > 0 ? (
            <YStack gap={space.sm}>
              <SectionTitle>{t('sections.attachments')}</SectionTitle>
              {data.attachments.map((url) => (
                <ReceiptAttachmentRow
                  key={url}
                  url={url}
                  openLabel={t('attachmentAlt')}
                  onOpen={(target) =>
                    isPdfUrl(target) ? void Linking.openURL(target) : setViewing(target)
                  }
                />
              ))}
            </YStack>
          ) : null}

          <Section title={t('sections.trace')}>
            <Row
              label={t('rows.createdBy')}
              value={data.requestedByName ?? tLabels('emptyValue')}
              sub={fmt.dateTime(data.createdAt)}
              last={!data.approvedAt && !data.cancelledAt}
            />
            {data.approvedAt ? (
              <Row
                label={t('rows.approvedBy')}
                value={data.approvedByName ?? tLabels('emptyValue')}
                sub={fmt.dateTime(data.approvedAt)}
                last={!data.cancelledAt}
              />
            ) : null}
            {data.cancelledAt ? (
              <Row
                label={t('rows.cancelledBy')}
                value={data.cancelledByName ?? tLabels('emptyValue')}
                sub={fmt.dateTime(data.cancelledAt)}
                last
              />
            ) : null}
          </Section>

          <PhotoViewer
            url={viewing}
            unavailableLabel={tStates('imageUnavailable')}
            onClose={() => setViewing(null)}
          />

          {/* Xác nhận duyệt / huỷ: popup chuẩn app (ConfirmSheet, hai nút một hàng). */}
          <ConfirmSheet
            open={confirming !== null}
            title={
              confirming === 'approve'
                ? tTable('actions.approveConfirm')
                : tTable('actions.cancelConfirm')
            }
            confirmLabel={
              confirming === 'approve' ? tActions('approve') : tTable('actions.cancelOk')
            }
            /*
              Luôn có câu hỏi rõ "Bạn có chắc chắn muốn duyệt phiếu chi #…?" (chốt 26/11/2026). Thiếu
              câu, popup lồng trong tấm chi tiết bị kéo giãn trống hết màn (thấy trên máy).
            */
            message={t(confirming === 'cancel' ? 'confirmCancel' : 'confirmApprove', {
              type: data.type === RECEIPT_TYPE.INCOME ? 'income' : 'expense',
              no: data.receiptNo ?? '',
            })}
            tone={confirming === 'cancel' ? 'danger' : 'primary'}
            loading={pending}
            onClose={() => setConfirming(null)}
            onConfirm={() => run(confirming === 'approve' ? 'approve' : 'cancel')}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

/** Tiêu đề khối - Figma 14/20 semibold `text/gray/low`, VIẾT HOA, không thẻ. */
function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.placeholder}
      fos={typeScale.body.fontSize}
      lh={typeScale.body.lineHeight}
      fontFamily={FONT_FAMILY.semibold}
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

/** Một khối: tiêu đề + các hàng kẻ chân `stroke/gray-50` (Figma `24512:128165`). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap={space.sm}>
      <SectionTitle>{title}</SectionTitle>
      <YStack>{children}</YStack>
    </YStack>
  );
}

/**
 * Một hàng nhãn - giá trị: nhãn trái 14 regular `text/gray/low`, giá trị PHẢI 14 medium, dòng phụ
 * (biển số, giờ) dưới giá trị 14 regular `text/gray/low`. Cao tối thiểu 40, kẻ chân trừ hàng cuối.
 */
function Row({
  label,
  value,
  sub,
  last = false,
  children,
}: {
  label: string;
  value?: string | null;
  sub?: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const tLabels = useTranslations('Common.labels');
  return (
    <XStack
      ai={sub ? 'flex-start' : 'center'}
      jc="space-between"
      gap={space.md}
      minHeight={40}
      py={sub ? space.md : space.sm}
      borderBottomWidth={last ? 0 : 1}
      borderColor={colors.background}
    >
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.body}>
        {label}
      </Text>
      <YStack ai="flex-end" gap={2} flexShrink={1} minWidth={0}>
        {children ?? (
          <Value muted={!value}>{value ?? tLabels('emptyValue')}</Value>
        )}
        {sub ? (
          <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.body} ta="right">
            {sub}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/** Giá trị: đen medium; `link` = xanh `status/information-high` bấm được; `muted` = "-" xám nhạt. */
function Value({
  children,
  link = false,
  muted = false,
  onPress,
}: {
  children: string;
  link?: boolean;
  muted?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Text
      col={link ? colors.infoStrong : muted ? colors.textPlaceholder : colors.text}
      fos={typeScale.body.fontSize}
      lh={typeScale.body.lineHeight}
      fontFamily={FONT_FAMILY.medium}
      ta="right"
      {...(link && onPress ? { accessibilityRole: 'link' as const, onPress } : {})}
    >
      {children}
    </Text>
  );
}
