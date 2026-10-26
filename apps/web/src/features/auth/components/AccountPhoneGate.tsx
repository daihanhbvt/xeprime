'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ACCOUNT_REALM } from '@xeprime/types';
import { ContactVerifyModal } from '@/features/account/components/ContactVerifyModal';
import { CONTACT_CHANNEL } from '@/features/account/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useLogout } from '../hooks/use-logout';

/**
 * HOÀN THIỆN HỒ SƠ ở SITE PARTNER — tài khoản đối tác phải có SĐT ĐÃ XÁC MINH (ADR 0060 điều 5).
 *
 * Hộp này chỉ hiện với hai nhóm —
 *  - tài khoản vừa tạo bằng Google/Facebook (provider không cho SĐT; không bao giờ suy SĐT từ
 *    email hay tự bịa một số), và
 *  - tài khoản cũ có số chưa xác minh (đăng ký trước ADR 0060).
 *
 * Bắt buộc, không "để sau": đối tác không có số thì không chọn được tuyến cho thuê, không nhận
 * được lời mời thành viên, và khách không có số nào để liên lạc. Lối ra là Đăng xuất. Dùng lại đúng
 * luồng "thêm/đổi SĐT" của trang tài khoản (`ContactVerifyModal` → `POST /users/me/phone/*`) — mã
 * OTP ở đây chỉ gắn số vào TÀI KHOẢN ĐANG ĐĂNG NHẬP, không bao giờ cấp phiên. Số đã thuộc một tài
 * khoản khác cùng site ⇒ `PHONE_TAKEN`: người dùng đăng xuất và đăng nhập bằng tài khoản có số đó.
 *
 * Site KHÁCH không dùng hộp này mà dùng `AccountPhoneReminderProvider` (đóng được — ADR 0071).
 * Không làm gì với tài khoản `platform` — site quản trị đăng nhập bằng email (ADR 0053 điều 3).
 */
export function AccountPhoneGate({ signOutTo }: { signOutTo: string }) {
  const { data: user } = useCurrentUser();
  const signOut = useLogout(signOutTo);

  const needsPhone = user != null && user.realm !== ACCOUNT_REALM.PLATFORM && !user.phoneVerified;
  if (!needsPhone) return null;

  return (
    <ContactVerifyModal
      channel={CONTACT_CHANNEL.PHONE}
      open
      onClose={() => undefined}
      current={user.phone}
      required={{ onSignOut: () => void signOut() }}
    />
  );
}

/**
 * Tài khoản đã bấm "Để sau" trong phiên tab này — theo ID tài khoản, để đăng nhập một tài khoản
 * khác cùng tab vẫn được nhắc. `sessionStorage`: tab mới / lần ghé sau thì nhắc lại.
 */
const REMINDER_DISMISSED_KEY = 'xp.phoneReminderDismissedFor';

function readDismissedFor(): string | null {
  try {
    return window.sessionStorage.getItem(REMINDER_DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissedFor(userId: string) {
  try {
    window.sessionStorage.setItem(REMINDER_DISMISSED_KEY, userId);
  } catch {
    // Không ghi được (chế độ riêng tư, chặn dữ liệu trang) — state trong bộ nhớ vẫn giữ lượt đóng.
  }
}

export interface AccountPhonePromptOptions {
  /** Số điền sẵn — vd SĐT liên hệ khách vừa gõ ở màn Xem lại. Trống ⇒ số hiện có của tài khoản. */
  readonly phone?: string | null;
  /** Gọi khi khách xác minh XONG trong chính lượt hộp này — "Để sau" thì không gọi. */
  readonly onVerified?: () => void;
}

export type AccountPhonePrompt = (options?: AccountPhonePromptOptions) => void;

interface AccountPhonePromptContextValue {
  readonly prompt: AccountPhonePrompt;
  /** Tắt lời nhắc TỰ BẬT trong lúc một luồng tự hỏi số đúng lúc của nó; trả hàm bật lại. */
  readonly suppressReminder: () => () => void;
}

const AccountPhonePromptContext = createContext<AccountPhonePromptContextValue | null>(null);

/**
 * NHẮC XÁC MINH SĐT ở SITE KHÁCH (ADR 0071 — nới ADR 0060 điều 5 cho realm `customer`).
 *
 * Khách vào bằng Google/Facebook (hoặc tài khoản cũ chưa xác minh số) được nhắc MỘT lần mỗi phiên
 * tab, và đóng được bằng "Để sau": tìm xe, xem xe, lưu xe yêu thích không cần SĐT. Việc CẦN số thì
 * hỏi đúng lúc — luồng đặt xe gọi `useAccountPhonePrompt()` khi khách bấm GỬI yêu cầu, và hộp mở
 * lại kể cả khi đã "Để sau". Trong lúc luồng đó mở (`useSuppressAccountPhoneReminder`), lời nhắc
 * chung không tự bật đè lên — khách chưa xem gì đã bị hỏi số là đúng thứ ADR 0071 gỡ.
 *
 * Hộp là UX; chốt chặn thật vẫn ở server: gửi yêu cầu thuê ⇒ `PHONE_NOT_VERIFIED`, nhận lời mời
 * tài xế/thành viên đòi SĐT đã xác minh (ADR 0060 điều 6, 8).
 *
 * Xác minh xong thì `/auth/me` được làm mới (`useContactVerify`) và hộp tự biến mất.
 */
export function AccountPhoneReminderProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('Account.contact');
  const { data: user } = useCurrentUser();
  /*
   * `/auth/me` chỉ nạp ở client, nên lúc hydrate chưa có `user` và hộp chưa render — đọc
   * `sessionStorage` ngay trong lazy init không làm lệch HTML với server.
   */
  const [dismissedFor, setDismissedFor] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readDismissedFor(),
  );
  /**
   * Một luồng vừa CẦN số (đặt xe) — mở hộp bất kể đã "Để sau", với câu mở theo đúng việc đó.
   * `seq` dựng lại hộp ở mỗi lượt hỏi để số điền sẵn là số của lượt này.
   */
  const [prompted, setPrompted] = useState<
    (AccountPhonePromptOptions & { readonly seq: number }) | null
  >(null);
  const [suppressors, setSuppressors] = useState(0);

  const prompt = useCallback<AccountPhonePrompt>((options = {}) => {
    setPrompted((prev) => ({ ...options, seq: (prev?.seq ?? 0) + 1 }));
  }, []);
  const suppressReminder = useCallback(() => {
    setSuppressors((n) => n + 1);
    return () => setSuppressors((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ prompt, suppressReminder }), [prompt, suppressReminder]);

  const userId = user?.id ?? null;
  const close = useCallback(() => {
    setPrompted(null);
    if (!userId) return;
    setDismissedFor(userId);
    writeDismissedFor(userId);
  }, [userId]);

  const needsPhone = user != null && user.realm === ACCOUNT_REALM.CUSTOMER && !user.phoneVerified;
  const open =
    needsPhone && (prompted !== null || (suppressors === 0 && dismissedFor !== user.id));

  return (
    <AccountPhonePromptContext.Provider value={value}>
      {children}
      {/* Render CÓ ĐIỀU KIỆN — mỗi lần mở là một instance sạch (xem docblock `ContactVerifyModal`). */}
      {open ? (
        <ContactVerifyModal
          key={prompted?.seq ?? 0}
          channel={CONTACT_CHANNEL.PHONE}
          open
          onClose={close}
          onVerified={prompted?.onVerified}
          current={prompted?.phone?.trim() || user.phone}
          reminder={{ lead: prompted ? t('bookingLead') : t('reminderLead') }}
        />
      ) : null}
    </AccountPhonePromptContext.Provider>
  );
}

/**
 * Hàm mở hộp xác minh SĐT của site khách. Ngoài `AccountPhoneReminderProvider` (site partner,
 * test dựng lẻ một luồng) trả `null` — nơi gọi tự quyết, server vẫn là chốt.
 */
export function useAccountPhonePrompt(): AccountPhonePrompt | null {
  return useContext(AccountPhonePromptContext)?.prompt ?? null;
}

/** Luồng tự hỏi số đúng lúc của nó (hộp đặt xe) — lời nhắc chung không tự bật khi nó đang mở. */
export function useSuppressAccountPhoneReminder() {
  const suppressReminder = useContext(AccountPhonePromptContext)?.suppressReminder;
  useEffect(() => suppressReminder?.(), [suppressReminder]);
}
