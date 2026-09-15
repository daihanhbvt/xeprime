import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OWNER_STAGE } from '@xeprime/types';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { WalletView } from '@/features/wallet/components/WalletView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('earnings'), robots: { index: false, follow: false } };
}

/**
 * Tiền cho thuê xe — ví điểm của GIAN HÀNG, ở khu `/account` (ADR 0033 điều 2).
 *
 * Cùng một `WalletView scope="shop"` với `/manage/balance`: một sổ, một màn, hai đường vào. Lý
 * do có đường thứ hai là chủ xe tuyến hoa hồng KHÔNG vào được `/manage` — `canUseManagePortal`
 * trả false và `AppShell` đẩy họ ra — mà ADR 0032 khiến mỗi chuyến hoàn thành của họ đều sinh
 * khoản XePrime phải trả `D − T`. Thiếu màn này thì tiền vào sổ rồi mắc kẹt: không xem được,
 * không rút được.
 *
 * `WithdrawDialog` đã có sẵn nút thêm tài khoản nhận tiền phạm vi `shop`, nên chủ xe khai số tài
 * khoản ngay trong luồng rút — không cần dựng thêm một màn tài khoản ngân hàng thứ hai ở đây.
 *
 * KHÔNG gác bằng `PLAN_FEATURE`, đúng như bản `/manage`: đây là tiền của chính họ, và ADR 0027
 * điều 3 nói gói hết hạn là `read_only` chứ không phải `hidden`.
 *
 * ## Vì sao `minStage` là `registering`, khác lịch/khai thuế/hợp đồng
 *
 * Mặc định của `OwnerGate` là bậc `owner` — phải có ít nhất một xe ĐANG BÁN trên chợ — với lý do
 * đúng cho phần lớn màn: một màn rỗng không giải thích được vì sao nó rỗng thì tệ hơn là không
 * có màn. Nhưng SỔ TIỀN là ngoại lệ, vì hai lẽ:
 *
 *  1. Một chủ xe từng cho thuê rồi TẠM ẨN hết xe sẽ tụt về bậc `registering`. Gác ở bậc `owner`
 *     nghĩa là khoá luôn phần tiền họ ĐÃ kiếm được — mà ADR 0033 điều 1 nói điểm không hết hạn
 *     và không bị thu hồi, nên nó cũng không được vô hình. Ẩn đường vào một sổ công nợ là một
 *     cách không trả tiền.
 *  2. "0 điểm" là một câu ĐÚNG và tự giải thích, không giống một lịch rỗng trông như hỏng.
 */
export default function AccountEarningsPage() {
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <WalletView scope="shop" />
    </OwnerGate>
  );
}
