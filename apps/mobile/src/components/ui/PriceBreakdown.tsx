import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { subtractMoney } from '@xeprime/domain';
import { FEE_BEARER, FEE_LINE, PRICE_ROW } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * PHỤ PHÍ PHÍA KHÁCH — ADR 0029 điều 1, cùng shape với `PriceBreakdownFees` bên web.
 *
 * Là khối RIÊNG chứ không nhét vào `rows`: `rows` là bảng kê giá THUÊ và `totalAmount = Σ rows`
 * là doanh thu của gian hàng. Trộn phí của XePrime / ngân sách / hãng bảo hiểm vào đó là nói dối
 * cả hai phía.
 */
export interface PriceBreakdownFeesInput {
  lines: ReadonlyArray<{
    key: string;
    bearer: string;
    percent: number;
    amount: string;
    partnerName?: string | null;
  }>;
  customerTotalAmount: string;
  /**
   * `P` — TÀI TRỢ mã khuyến mãi của XePrime (ADR 0046). `'0'`/vắng = chuyến không dùng mã.
   *
   * Dòng RIÊNG, không trộn vào `lines`: `lines` là các khoản khách PHẢI TRẢ THÊM, còn đây là
   * khoản trừ đi — và nó khác `PRICE_ROW.DISCOUNT` (khuyến mãi của chủ xe) ở chỗ AI bỏ tiền.
   */
  promoDiscountAmount?: string | null;
  /** Mã đã áp — tên hiển thị của dòng giảm trên. */
  promo?: { code: string; name?: string } | null;
  /** Khách chuyển online để giữ chỗ; null/undefined = chuyến này không cần giữ chỗ. */
  holdAmount?: string | null;
  /**
   * B − D — khách trả TRỰC TIẾP chủ xe lúc nhận xe, do server tính sẵn
   * (`CustomerFeeBreakdownDto`). Ưu tiên trường này thay vì tự trừ
   * `customerTotalAmount − holdAmount` ở client; thiếu thì mới rơi về phép trừ (đơn/snapshot
   * cũ chưa có trường này).
   */
  payAtPickupAmount?: string | null;
}

/** Một dòng breakdown — cùng shape với `PriceBreakdownRowDto` của API/snapshot. */
export interface PriceBreakdownRowInput {
  key: string;
  label: string;
  sublabel?: string | null;
  /** VND chuỗi; dòng giảm giá mang dấu âm ('-120000'). */
  amount: string;
}

/**
 * # BẢNG CHI TIẾT GIÁ DÙNG CHUNG — bản native của `components/data-display/PriceBreakdown` (web)
 *
 * Cùng Figma `237:1988`, cùng thứ tự khối, cùng nhãn: các dòng breakdown → gạch ngang → TỔNG →
 * tiền cọc → ghi chú cọc. Mọi con số đến từ `PricingService`; ở đây KHÔNG cộng trừ gì.
 *
 * Ba quy tắc nhấn mạnh lấy nguyên từ `PriceBreakdown.module.css`, vì chúng mang NGHĨA chứ không
 * phải trang trí:
 *   - dòng `discount` tô ĐỎ cả nhãn lẫn số — đỏ là màu ngữ nghĩa của khoản giảm trừ;
 *   - dòng 0đ KHÔNG VẼ (ADR 0046) — trước đây chúng tô mờ, nhưng trên màn hẹp thì một bảng đầy
 *     "0 ₫" đẩy những dòng có tiền thật xuống dưới nếp gấp;
 *   - TỔNG dùng `color-price` cỡ h3 đậm, nhãn viết hoa — đây là con số khách thật sự trả.
 *
 * **Tiền cọc KHÔNG nằm trong tổng.** Nó là khối riêng dưới gạch ngang, kèm câu giải thích hoàn
 * cọc. Bản trước của app dán số cọc vào một dòng mang nhãn "Gói thuê" — sai cả nghĩa lẫn nhãn.
 */
export function PriceBreakdown({
  rows,
  totalAmount,
  totalLabel,
  depositAmount,
  title,
  badge,
  footer,
  fees,
  audience = 'customer',
  collapsible = false,
  promoSlot,
}: {
  rows: readonly PriceBreakdownRowInput[];
  /** Tổng khách trả TRƯỚC cọc. */
  totalAmount: string;
  totalLabel?: string;
  /** Cọc thế chấp — không nằm trong tổng; bỏ trống thì ẩn cả khối cọc. */
  depositAmount?: string | null;
  title?: string;
  /** Chip cạnh tiêu đề (nguồn chính sách, "Tạm tính"…). */
  badge?: string;
  footer?: React.ReactNode;
  /** Có mặt ⇒ hiện thêm khối phụ phí phía khách rồi mới tới "Tổng bạn trả". */
  fees?: PriceBreakdownFeesInput | null;
  /**
   * Người đang đọc bảng này là CHỦ XE hay KHÁCH. Mặc định là khách — bề mặt đông hơn, và mặc định
   * an toàn phải là "ít lộ hơn".
   *
   * Quyết định đúng một chuyện: có vẽ những dòng do CHỦ XE chịu hay không. Thuế khấu trừ là ví dụ
   * điển hình — nó KHÔNG cộng vào tổng khách (ADR 0032 điều 3), nên với khách nó chỉ là một con số
   * lạ nằm giữa hoá đơn của mình. Với chủ xe thì ngược lại: đó là dòng giải thích vì sao số thực
   * nhận thấp hơn tổng khách trả.
   */
  audience?: 'customer' | 'owner';
  /**
   * Gấp các dòng kê chi tiết (bảng giá thuê + từng khoản phụ phí) sau một nút "Xem chi tiết",
   * mặc định ĐÓNG — chỉ tổng cuối/cọc/tiền giữ chỗ hiện ngay. Mặc định của prop là `false` để
   * KHÔNG đổi hành vi ở màn đặt xe (khách cần thấy đủ trước khi bấm gửi): chỉ màn xem lại sau
   * khi đã đặt (chi tiết chuyến) mới bật, nơi con số đã chốt và bảng dài chỉ còn là tra cứu.
   */
  collapsible?: boolean;
  /**
   * Khối HÀNH ĐỘNG chèn giữa bảng tạm tính và tổng cộng — ô áp mã khuyến mãi của luồng đặt xe
   * (ADR 0046). Là một `slot` vì bảng này dùng chung cho báo giá, chi tiết chuyến và đơn cũ —
   * chỉ MỘT trong ba bề mặt có ô áp mã.
   */
  promoSlot?: React.ReactNode;
}) {
  const tCommon = useTranslations('Common.components.price');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(!collapsible);
  const showItems = !collapsible || expanded;

  /*
   * Dòng do CHỦ XE chịu chỉ vẽ cho chủ xe. Với khách, thuế khấu trừ là một con số lạ nằm giữa hoá
   * đơn của họ mà họ không trả — nó không cộng vào tổng (ADR 0032 điều 3), nên hiện ra chỉ làm
   * người ta tưởng mình đang gánh thuế của người khác.
   */
  const feeLines = (fees?.lines ?? []).filter(
    (line) => audience === 'owner' || line.bearer !== FEE_BEARER.OWNER,
  );

  /*
   * Có khối phụ phí ⇒ `totalAmount` (giá thuê) KHÔNG còn là số cuối cùng khách phải chuẩn bị —
   * `fees.customerTotalAmount` mới là. Vẽ to-đậm CẢ HAI khiến người đọc không biết số nào là
   * "cái phải trả" (phản hồi người dùng 18/09/2026), nên dòng này hạ xuống mức phụ khi có phí.
   */

  /*
   * DÒNG 0đ KHÔNG VẼ.
   *
   * `buildDailyQuote` cố ý sinh "Phí phát sinh ngoài giờ" và "Dịch vụ cộng thêm" bằng 0 để
   * snapshot của đơn có chỗ cho chúng về sau. Đúng cho DỮ LIỆU, sai cho MÀN HÌNH — và trên màn
   * 390px thì hai dòng "0 ₫" đẩy những dòng có tiền thật xuống dưới nếp gấp.
   *
   * Chỉ ẩn ở UI; TỔNG không bao giờ ẩn, kể cả khi bằng 0.
   */
  const visibleRows = rows.filter((row) => Number(row.amount) !== 0);
  const visibleFeeLines = feeLines.filter((line) => Number(line.amount) !== 0);
  const promoDiscount = Number(fees?.promoDiscountAmount ?? 0);
  /*
   * Mã khuyến mãi CŨNG kéo khối phụ phí ra (ADR 0046): một chuyến tuyến gói không có dòng phí nào
   * nhưng có mã thì `customerTotalAmount` vẫn khác `totalAmount`.
   */
  const hasFees = Boolean(fees) && (visibleFeeLines.length > 0 || promoDiscount > 0);
  const payAtHandoverAmount =
    fees?.payAtPickupAmount ??
    (fees?.holdAmount ? subtractMoney(fees.customerTotalAmount, fees.holdAmount) : null);

  return (
    <YStack gap={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {title ?? tCommon('title')}
        </Text>
        {badge ? (
          <XStack bg={colors.surfaceSelected} br={radius.sm} px={space.xs} py={2}>
            <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
              {badge}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      {collapsible ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {expanded ? tCommon('collapse') : tCommon('viewDetails')}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={iconSize.sm}
              color={colors.primaryActive}
            />
          </XStack>
        </Pressable>
      ) : null}

      {showItems && visibleRows.length > 0 ? (
        <YStack gap={space.sm} pt={space.sm} borderTopWidth={1} borderColor={colors.borderSubtle}>
          {visibleRows.map((row, index) => {
            const isDiscount = row.key === PRICE_ROW.DISCOUNT;

            return (
              <XStack key={`${row.key}-${index}`} ai="flex-start" jc="space-between" gap={space.sm}>
                <YStack f={1} gap={2}>
                  <Text
                    col={isDiscount ? colors.danger : colors.text}
                    fos={fontSize.bodySm}
                    fow={fontWeight.semibold}
                  >
                    {row.label}
                  </Text>
                  {row.sublabel ? (
                    <Text col={colors.placeholder} fos={fontSize.label}>
                      {row.sublabel}
                    </Text>
                  ) : null}
                </YStack>
                <Text
                  col={isDiscount ? colors.danger : colors.text}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                >
                  {fmt.money(row.amount)}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      ) : null}

      <YStack gap={6} pt={space.sm} borderTopWidth={1} borderColor={colors.borderSubtle}>
        <XStack ai="baseline" jc="space-between" gap={space.sm}>
          {/*
            Viết hoa theo đúng web (`.totalLabel`). Đây là MỘT nhãn cố định, ngắn — không phải
            luật "viết hoa mọi nhãn", thứ làm dấu thanh tiếng Việt chồng nhau ở cỡ nhỏ.
          */}
          <Text
            col={hasFees ? colors.textMuted : colors.text}
            fos={fontSize.bodySm}
            fow={hasFees ? fontWeight.semibold : fontWeight.bold}
            letterSpacing={hasFees ? undefined : 0.4}
          >
            {hasFees
              ? (totalLabel ?? tCommon('subtotal'))
              : (totalLabel ?? tCommon('subtotal')).toLocaleUpperCase('vi')}
          </Text>
          <Text
            col={hasFees ? colors.textMuted : colors.price}
            fos={hasFees ? fontSize.body : fontSize.h3}
            fow={hasFees ? fontWeight.semibold : fontWeight.bold}
          >
            {fmt.money(totalAmount)}
          </Text>
        </XStack>

        {depositAmount != null ? (
          <>
            <XStack ai="baseline" jc="space-between" gap={space.sm}>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {tCommon('deposit')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {fmt.money(depositAmount)}
              </Text>
            </XStack>
            {/*
              Web treo `depositHint` trong một tooltip cạnh nhãn. Native không có hover, và một
              biểu tượng "i" phải chạm mới nói được điều kiện hoàn cọc thì phần lớn khách sẽ
              không chạm — nên câu đó nằm thẳng dưới dòng cọc, cùng chỗ với `depositNote`.
            */}
            <Text col={colors.placeholder} fos={fontSize.label} fontStyle="italic">
              {tCommon('depositNote')}
            </Text>
            <Text col={colors.placeholder} fos={fontSize.label}>
              {tCommon('depositHint')}
            </Text>
          </>
        ) : null}
      </YStack>

      {/*
        Ô ÁP MÃ — SAU bảng tạm tính, TRƯỚC tổng cộng. Ngoài khối phụ phí có chủ đích: nó phải hiện
        cả khi chuyến chưa có phụ phí nào, vì một chuyến không có dòng phí vẫn áp mã được.
      */}
      {promoSlot}

      {fees && hasFees ? (
        <YStack gap={space.sm} pt={space.sm} borderTopWidth={1} borderColor={colors.borderSubtle}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {tCommon('feesTitle')}
          </Text>

          {showItems
            ? visibleFeeLines.map((line) => {
                // Dòng do CHỦ XE chịu không cộng vào tổng khách — nói rõ ngay tại dòng, nếu không
                // khách tự cộng vào rồi thấy tổng không khớp.
                const ownerBorne = line.bearer === FEE_BEARER.OWNER;

                return (
                  <XStack key={line.key} ai="flex-start" jc="space-between" gap={space.sm}>
                    <YStack f={1} gap={2}>
                      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                        {domainLabel('feeLine', line.key)}
                      </Text>
                      <Text col={colors.placeholder} fos={fontSize.label}>
                        {(ownerBorne ? tCommon('ownerNet') : `${line.percent}%`) +
                          (line.partnerName ? ` · ${line.partnerName}` : '')}
                      </Text>
                    </YStack>
                    <Text
                      col={ownerBorne ? colors.placeholder : colors.text}
                      fos={fontSize.bodySm}
                      fow={fontWeight.semibold}
                    >
                      {fmt.money(line.amount)}
                    </Text>
                  </XStack>
                );
              })
            : null}

          {/*
            MÃ KHUYẾN MÃI — dòng TRỪ, LUÔN hiện (không gấp theo `showItems`): khách vừa chủ động
            áp mã, giấu nó sau nút "Xem chi tiết" là không cho họ thấy việc mình vừa làm có tác dụng.
          */}
          {promoDiscount > 0 ? (
            <XStack ai="flex-start" jc="space-between" gap={space.sm}>
              <YStack f={1} gap={2}>
                <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {domainLabel('feeLine', FEE_LINE.PROMO)}
                </Text>
                {fees.promo ? (
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {fees.promo.code}
                    {fees.promo.name ? ` · ${fees.promo.name}` : ''}
                  </Text>
                ) : null}
              </YStack>
              <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                −{fmt.money(String(promoDiscount))}
              </Text>
            </XStack>
          ) : null}

          <XStack ai="baseline" jc="space-between" gap={space.sm}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold} letterSpacing={0.4}>
              {tCommon('customerTotal').toLocaleUpperCase('vi')}
            </Text>
            <Text col={colors.price} fos={fontSize.h3} fow={fontWeight.bold}>
              {fmt.money(fees.customerTotalAmount)}
            </Text>
          </XStack>

          {/*
            Hai con số HÀNH ĐỘNG — chuyển ngay bao nhiêu, trả tay chủ xe khi nhận xe bao nhiêu
            (ADR 0028 điều 7A). Bọc trong một khối nền riêng để đọc thành MỘT kế hoạch thanh
            toán: bản trước tô nhạt cả hai như dòng phụ phí phụ nên chúng chìm mất cạnh "tiền
            thuê" to đậm phía trên (phản hồi người dùng 18/09/2026).
          */}
          {fees.holdAmount ? (
            <YStack gap={6} px={space.md} py={space.sm} br={radius.sm} bg={colors.surfaceMuted}>
              <XStack ai="baseline" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {tCommon('holdAmount')}
                </Text>
                {/* Chuyển ngay — màu nhấn thương hiệu, đây là khoản cần hành động trước. */}
                <Text col={colors.primaryActive} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                  {fmt.money(fees.holdAmount)}
                </Text>
              </XStack>
              {payAtHandoverAmount != null ? (
                <XStack ai="baseline" jc="space-between" gap={space.sm}>
                  <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {tCommon('payAtHandover')}
                  </Text>
                  {/* Trả tay chủ xe lúc nhận — vẫn là tiền thật nên KHÔNG mờ, chỉ nhẹ hơn số trên. */}
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {fmt.money(payAtHandoverAmount)}
                  </Text>
                </XStack>
              ) : null}
              {/*
                Web treo `holdHint` trong tooltip cạnh nhãn. Native không có hover, nên câu giải
                thích nằm thẳng dưới hai dòng tiền — cùng cách đã làm cho `depositHint`.
              */}
              <Text col={colors.placeholder} fos={fontSize.label}>
                {tCommon('holdHint')}
              </Text>
            </YStack>
          ) : null}

          <Text col={colors.placeholder} fos={fontSize.label}>
            {tCommon('feesNote')}
          </Text>
        </YStack>
      ) : null}

      {footer}
    </YStack>
  );
}
