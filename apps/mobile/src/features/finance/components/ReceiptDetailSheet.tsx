import { Children, Fragment, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  isAutoReceipt,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { moneyToVietnameseWords, vehicleLabel } from '@xeprime/domain';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useApproveReceipt, useCancelReceipt, useReceiptDetail } from '../hooks/use-finance';

const THUMB = 92;

const styles = StyleSheet.create({
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
});

/** Chứng từ là ảnh hay PDF — server không trả MIME, nên đọc từ đuôi URL như web đang làm. */
const isPdfUrl = (url: string) => url.toLowerCase().split('?')[0]?.endsWith('.pdf') === true;

/**
 * Chi tiết MỘT phiếu thu/chi — bản native của `ReceiptDetailDrawer`.
 *
 * **Một implementation cho MỌI lối vào**: sổ Thu-Chi, tab Thu-Chi của hồ sơ khách, khối tiền của
 * hồ sơ xe. Một bản chi tiết riêng cho từng bề mặt là ba nơi phải nhớ cập nhật cùng lúc, và cái
 * bị bỏ quên sẽ là cái người dùng đang mở.
 *
 * Ba việc thẻ danh sách không làm được: (1) chỉ ra tiền này thuộc đơn/xe/khách nào và **đi sang
 * được**, (2) cho xem chứng từ, (3) nói ai tạo, ai duyệt, lúc nào. Với một sổ tiền thì cả ba đều
 * không phải trang trí — đó là toàn bộ khả năng đối chiếu.
 *
 * Hai hành động (duyệt · huỷ) đứng ở CHÂN tấm trượt, sau `receipt.approve` + feature gate. Phiếu
 * TỰ ĐỘNG không huỷ tay được: backend chặn bằng `RECEIPT_SOURCE_LOCKED`, ẩn nút ở đây chỉ để
 * người dùng không bấm vào một hành động chắc chắn thất bại.
 */
export function ReceiptDetailSheet({
  receiptId,
  onClose,
}: {
  /** `null` = đóng, và KHÔNG phát request nào. */
  receiptId: string | null;
  onClose: () => void;
}) {
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
      title={data?.receiptNo ?? t('title')}
      footer={
        showFooter ? (
          <XStack gap={space.sm}>
            {actions?.cancel ? (
              <YStack f={1}>
                <Button
                  label={t('cancelAction')}
                  variant="danger"
                  icon="close-circle-outline"
                  loading={pending}
                  /*
                   * Huỷ phiếu là một phép GHI y như duyệt, nên nó khoá cùng lúc với duyệt khi gói
                   * hết hạn (ADR 0027 điều 3). Bản trước chỉ khoá nút duyệt: câu "đang ở chế độ
                   * chỉ xem" hiện ngay bên trên một cái nút vẫn bấm được, và cú bấm đó chắc chắn
                   * ăn 403 từ guard backend.
                   */
                  disabled={!finance.canWrite}
                  onPress={() => setConfirming('cancel')}
                />
              </YStack>
            ) : null}
            {actions?.approve ? (
              <YStack f={1}>
                <Button
                  label={tActions('approve')}
                  icon="checkmark-circle-outline"
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
          {/* Số tiền là thứ TO NHẤT của tấm — mọi thứ còn lại là ngữ cảnh của nó. */}
          <YStack gap={space.xs}>
            <XStack ai="center" gap={space.sm}>
              <Text
                f={1}
                minWidth={0}
                col={data.type === RECEIPT_TYPE.INCOME ? colors.success : colors.danger}
                fos={fontSize.h2}
                fow={fontWeight.bold}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {data.type === RECEIPT_TYPE.INCOME ? '+' : '−'} {fmt.money(data.amount)}
              </Text>
              <StatusBadge
                label={domainLabel('receiptStatus', data.status)}
                color={RECEIPT_STATUS_META[data.status as ReceiptStatus].color}
              />
            </XStack>
            {/*
              Số tiền bằng chữ — chỗ duy nhất bắt được lỗi thừa một số 0.

              NGHIÊNG và ở mực mờ nhất, đúng `.words` của web: nó không phải một dữ liệu thứ hai
              để đọc, nó là chính con số bên trên viết lại bằng chữ. Cùng mực với con số thì mắt
              phải dừng lại hai lần cho một thông tin.
            */}
            <Text col={colors.placeholder} fos={fontSize.bodySm} fontStyle="italic">
              {moneyToVietnameseWords(data.amount)}
            </Text>
            <XStack gap={space.xs} flexWrap="wrap">
              <StatusBadge
                label={domainLabel('receiptType', data.type)}
                color={RECEIPT_TYPE_META[data.type as ReceiptType].color}
                size="sm"
              />
              <StatusBadge
                label={domainLabel('receiptSource', data.source)}
                color={RECEIPT_SOURCE_META[data.source as ReceiptSource].color}
                size="sm"
              />
            </XStack>
          </YStack>

          {auto ? (
            <Callout tone="info" title={t('auto.title')}>
              {/*
                Lối đi nằm TRONG NGOẶC ngay sau câu nghiệp vụ, không phải một dòng riêng bên dưới.

                Câu này nói "muốn sửa thì thao tác ở nghiệp vụ sinh ra phiếu"; cái link CHÍNH LÀ
                chỗ đó. Tách nó xuống một dòng riêng thì nó đọc như một hành động thứ hai, không
                liên quan tới câu vừa đọc — đúng lý do web đặt nó trong ngoặc giữa câu.
              */}
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('auto.body', { source: domainLabel('receiptSource', data.source) })}
                {autoLink ? (
                  <>
                    {' ('}
                    <Text
                      col={colors.link}
                      fow={fontWeight.semibold}
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
            </Callout>
          ) : null}

          {/* Gói hết hạn: nói RÕ là chế độ chỉ xem, không để nút tắt trông như thiếu quyền. */}
          {showFooter && !finance.canWrite ? (
            <Callout tone="warning">{tFeature('readOnlyTooltip')}</Callout>
          ) : null}

          <Section title={t('sections.info')}>
            <InfoRow label={t('rows.occurredAt')}>
              <InfoText>{fmt.date(data.occurredAt)}</InfoText>
            </InfoRow>
            <InfoRow label={t('rows.category')}>
              <InfoText>{data.categoryName ?? tLabels('emptyValue')}</InfoText>
            </InfoRow>
            <InfoRow label={t('rows.method')}>
              <InfoText>{domainLabel('paymentMethod', data.paymentMethod)}</InfoText>
            </InfoRow>
            <InfoRow label={t('rows.referenceCode')}>
              {data.referenceCode ? (
                /* Nút chép đứng NGAY CẠNH mã: người ta nghĩ tới việc chép khi đang NHÌN cái mã. */
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <InfoText>{data.referenceCode}</InfoText>
                  <InlineAction
                    label={t('copyReference')}
                    onPress={() => void copyReference(data.referenceCode!)}
                  />
                </XStack>
              ) : (
                <InfoText>{tLabels('emptyValue')}</InfoText>
              )}
            </InfoRow>
            {/*
              Diễn giải là câu người ghi tự viết — nó xuống DÒNG RIÊNG, chiếm trọn bề ngang.

              Nhét nó vào cột giá trị (rộng ~200dp sau khi trừ cột nhãn) thì một câu bình thường
              đã thành sáu bảy dòng chữ trong một cột hẹp, và cả khối đọc ra như bị vỡ.
            */}
            <InfoBlock label={t('rows.description')}>
              <InfoText>{data.description ?? tLabels('emptyValue')}</InfoText>
            </InfoBlock>
          </Section>

          {/*
            Khối LIÊN QUAN: giá trị CHÍNH LÀ cái link, không phải một nút "Xem xe" đứng cạnh.

            Trước đây mỗi hàng có tên xe (mực đen) cộng thêm một nút chữ "Xem xe" — hai thứ cho
            một việc, và cột giá trị vì thế bị chia đôi rồi xuống dòng. Web tô luôn cái tên thành
            link: bấm vào chính thứ mình đang đọc, và hàng chỉ còn một cột chữ.
          */}
          <Section title={t('sections.related')}>
            <InfoRow label={t('rows.booking')}>
              {data.bookingId && canViewBooking ? (
                <InfoLink
                  label={data.bookingCode ?? t('viewBooking')}
                  onPress={() => goTo(ROUTES.manage.bookingDetail(data.bookingId!))}
                />
              ) : (
                <InfoText>{data.bookingCode ?? tLabels('emptyValue')}</InfoText>
              )}
            </InfoRow>
            <InfoRow label={t('rows.vehicle')}>
              {data.vehicleId && canViewVehicle ? (
                <InfoLink
                  label={vehicleLabel(data.vehicleName, data.plateNumber) || t('viewVehicle')}
                  onPress={() => goTo(ROUTES.manage.vehicleDetail(data.vehicleId!))}
                />
              ) : (
                <InfoText>
                  {vehicleLabel(data.vehicleName, data.plateNumber) || tLabels('emptyValue')}
                </InfoText>
              )}
            </InfoRow>
            <InfoRow label={t('rows.customer')}>
              {data.tenantCustomerId && canViewCustomer ? (
                <InfoLink
                  label={data.customerName ?? t('viewCustomer')}
                  onPress={() => goTo(ROUTES.manage.customerDetail(data.tenantCustomerId!))}
                />
              ) : (
                <InfoText>{data.customerName ?? tLabels('emptyValue')}</InfoText>
              )}
            </InfoRow>
          </Section>

          {data.attachments.length > 0 ? (
            <Section title={t('sections.attachments')} rows={false}>
              <XStack flexWrap="wrap" gap={space.sm}>
                {data.attachments.map((url) =>
                  isPdfUrl(url) ? (
                    /*
                      PDF không có ảnh thu nhỏ trên native — mở bằng trình duyệt hệ thống. Web
                      cũng chỉ có một lối "mở ra xem"; ở đây nó là ứng dụng ngoài thay vì overlay.
                    */
                    <Pressable
                      key={url}
                      onPress={() => void Linking.openURL(url)}
                      accessibilityRole="button"
                      accessibilityLabel={t('attachmentAlt')}
                    >
                      <YStack
                        w={THUMB}
                        h={THUMB}
                        br={radius.md}
                        bw={1}
                        bc={colors.border}
                        bg={colors.surfaceMuted}
                        ai="center"
                        jc="center"
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={iconSize.lg}
                          color={colors.textMuted}
                        />
                      </YStack>
                    </Pressable>
                  ) : (
                    <Pressable
                      key={url}
                      onPress={() => setViewing(url)}
                      accessibilityRole="button"
                      accessibilityLabel={t('attachmentAlt')}
                    >
                      <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
                    </Pressable>
                  ),
                )}
              </XStack>
            </Section>
          ) : null}

          <Section title={t('sections.trace')}>
            <InfoRow label={t('rows.createdBy')}>
              <InfoText>
                {`${data.requestedByName ?? tLabels('emptyValue')} · ${fmt.dateTime(data.createdAt)}`}
              </InfoText>
            </InfoRow>
            {data.approvedAt ? (
              <InfoRow label={t('rows.approvedBy')}>
                <InfoText>
                  {`${data.approvedByName ?? tLabels('emptyValue')} · ${fmt.dateTime(data.approvedAt)}`}
                </InfoText>
              </InfoRow>
            ) : null}
            {data.cancelledAt ? (
              <InfoRow label={t('rows.cancelledBy')}>
                <InfoText>
                  {`${data.cancelledByName ?? tLabels('emptyValue')} · ${fmt.dateTime(data.cancelledAt)}`}
                </InfoText>
              </InfoRow>
            ) : null}
          </Section>

          <PhotoViewer
            url={viewing}
            unavailableLabel={tStates('imageUnavailable')}
            onClose={() => setViewing(null)}
          />

          {/* Cả hai hành động đụng tiền nên đều phải xác nhận — đúng như web. */}
          <AlertDialog
            open={confirming !== null}
            /* Tiêu đề là CÂU HỎI, nút là hành động — đúng cặp `title`/`okText` của Popconfirm web. */
            title={
              confirming === 'approve'
                ? tTable('actions.approveConfirm')
                : tTable('actions.cancelConfirm')
            }
            confirmLabel={
              confirming === 'approve' ? tActions('approve') : tTable('actions.cancelOk')
            }
            destructive={confirming === 'cancel'}
            loading={pending}
            onCancel={() => setConfirming(null)}
            onConfirm={() => run(confirming === 'approve' ? 'approve' : 'cancel')}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

/**
 * Bề rộng cột NHÃN của mọi hàng trong tấm chi tiết.
 *
 * Cố định chứ không theo tỉ lệ: `DataRow` chia 3:7, nghĩa là "Ngày phát sinh" chỉ được ~100dp
 * ở màn 390 — vừa đúng ngưỡng để nó xuống hai dòng trong khi giá trị bên cạnh ("04/09/2026") chỉ
 * chiếm một phần ba cột của nó. Cả khối đọc ra như bị vỡ, và đó chính là hàng bạn thấy hỏng.
 *
 * 108 đủ cho nhãn dài nhất của tấm này ở cả hai ngôn ngữ ("Ngày phát sinh" ~86dp, "Mã tham
 * chiếu" ~80dp) mà vẫn để lại hơn nửa bề ngang cho giá trị. Cùng cách web làm:
 * `grid-template-columns: minmax(96px, max-content) 1fr`.
 */
const LABEL_WIDTH = 108;

/**
 * Một hàng NHÃN — GIÁ TRỊ của tấm chi tiết: nhãn cột trái cố định, giá trị chiếm phần còn lại và
 * căn TRÁI.
 *
 * Căn trái chứ không căn phải như `DataRow`: ở một bảng tiền thì căn phải giúp dò cột số, còn ở
 * đây giá trị là chữ (tên xe, tên khách, mã tham chiếu, một câu diễn giải) — chữ căn phải thì mỗi
 * dòng bắt đầu ở một chỗ khác nhau và mắt không có mép nào để bám.
 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <XStack ai="flex-start" gap={space.sm} px={space.md} py={space.sm}>
      <YStack w={LABEL_WIDTH} flexShrink={0}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {label}
        </Text>
      </YStack>
      <YStack f={1} minWidth={0}>
        {children}
      </YStack>
    </XStack>
  );
}

/** Hàng có nhãn ĐỨNG TRÊN và giá trị chiếm trọn bề ngang — cho câu dài (diễn giải). */
function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <YStack gap={2} px={space.md} py={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      {children}
    </YStack>
  );
}

/**
 * Giá trị thường.
 *
 * **CÙNG cỡ chữ với nhãn** — cả ba khối của tấm này chỉ có đúng một bậc chữ (`bodySm`), kể cả
 * nút "Sao chép" nằm chung hàng với mã tham chiếu. Thứ bậc trong một hàng do MÀU và ĐỘ ĐẬM làm:
 * nhãn mực mờ thường, giá trị mực đen medium, lối đi màu link, hành động màu gold đậm.
 *
 * Bản trước cho giá trị to hơn nhãn một bậc. Đọc từng hàng riêng thì hợp lý, nhưng nhìn cả vùng
 * — bốn khối, mười mấy hàng — thì nó thành chữ to chữ nhỏ xen kẽ, và cột nhãn 12px đứng cạnh cột
 * giá trị 14px làm hai cột lệch đường chân chữ ở mọi hàng.
 */
function InfoText({ children }: { children: string }) {
  return (
    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
      {children}
    </Text>
  );
}

/**
 * Giá trị LÀ một lối đi — chữ xanh dương như link trên web, không phải một nút chữ đứng cạnh.
 *
 * `colors.link` chứ không `primaryActive` (gold): gold trong app này là màu của HÀNH ĐỘNG (nút
 * chính, viên đang chọn). Một chỗ để đi sang màn khác là link, và người dùng đã học màu link ở
 * mọi phần mềm họ dùng — mượn màu gold ở đây là bắt họ học lại một lần nữa cho đúng một chỗ.
 */
function InfoLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text
      col={colors.link}
      fos={fontSize.bodySm}
      fow={fontWeight.medium}
      accessibilityRole="link"
      onPress={onPress}
    >
      {label}
    </Text>
  );
}

/**
 * Một khối của tấm chi tiết: tiêu đề chuẩn của app + thẻ có KẺ CHIA giữa các hàng.
 *
 * Bản trước là một mảng nền xám phẳng, tiêu đề chữ nhỏ mờ, các hàng dính nhau cách 4px và không
 * có gì ngăn giữa. Ba lỗi cộng lại ra đúng cảm giác "nhợt và vỡ": nền xám kéo cả khối chìm xuống
 * dưới mọi thứ quanh nó, không có kẻ chia thì bốn cặp nhãn-giá-trị đọc thành một đám chữ, và
 * 4px thì chữ của hàng này chạm chân chữ hàng trên.
 *
 * Giờ nó dùng đúng khuôn đã chốt ở màn Tài chính: `BlockTitle` (vạch gold dẫn + đường kẻ) trên
 * một thẻ TRẮNG, mỗi hàng một vùng đệm thật và ngăn nhau bằng kẻ mảnh. Cùng một app thì một khối
 * nhãn-giá-trị phải trông giống nhau ở mọi màn, không phải mỗi tấm trượt một kiểu.
 *
 * Kẻ chia do CHÍNH khối chèn, không phải nơi gọi tự xen: nơi gọi có những hàng chỉ hiện khi có dữ
 * liệu (`approvedAt`, `cancelledAt`), và tự xen thì sẽ có ngày một đường kẻ đứng trơ ở đáy thẻ.
 * `Children.toArray` bỏ sẵn các nhánh `null` nên đếm ở đây luôn là số hàng THẬT.
 */
function Section({
  title,
  children,
  rows = true,
}: {
  title: string;
  children: React.ReactNode;
  /**
   * `false` = nội dung tự do (dải ảnh chứng từ), thẻ giữ đệm bình thường và không kẻ chia gì cả.
   */
  rows?: boolean;
}) {
  const items = Children.toArray(children);

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{title}</BlockTitle>
      {rows ? (
        <Card padded={false}>
          <YStack>
            {items.map((item, index) => (
              <Fragment key={index}>
                {index > 0 ? <Divider /> : null}
                {item}
              </Fragment>
            ))}
          </YStack>
        </Card>
      ) : (
        <Card>{children}</Card>
      )}
    </YStack>
  );
}
