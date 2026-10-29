import { useTranslations } from 'use-intl';
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
import { CONTACT_CHANNEL } from '@/features/account/api';
import { ContactVerifySheet } from '@/features/account/components/ContactVerifySheet';
import { useCurrentUser, useLogout } from './hooks/use-auth';

const noop = () => undefined;

/**
 * HOÀN THIỆN HỒ SƠ ở APP PARTNER — tài khoản đối tác phải có SĐT ĐÃ XÁC MINH (ADR 0060 điều 5).
 * Bản native của web `AccountPhoneGate`, gắn ở vỏ app Partner (bọc ngoài `Stack`, trong
 * `SessionBoundary`).
 *
 * Tấm này chỉ hiện với hai nhóm —
 *  - tài khoản vừa tạo bằng Google/Facebook/Apple (provider không cho SĐT; không bao giờ suy SĐT
 *    từ email hay tự bịa một số), và
 *  - tài khoản cũ có số chưa xác minh (đăng ký trước ADR 0060).
 *
 * Bắt buộc, không "để sau": đối tác không có số thì không chọn được tuyến cho thuê, không nhận
 * được lời mời thành viên, và khách không có số nào để liên lạc. Lối ra là Đăng xuất. Dùng lại đúng
 * luồng "thêm/đổi SĐT" của màn tài khoản (`ContactVerifySheet` → `POST /users/me/phone/*`) — mã chỉ
 * gắn số vào TÀI KHOẢN ĐANG ĐĂNG NHẬP, không cấp phiên. Số đã thuộc tài khoản khác cùng app ⇒
 * `PHONE_TAKEN`: người dùng đăng xuất và đăng nhập bằng tài khoản có số đó.
 *
 * App KHÁCH không dùng tấm này mà dùng `AccountPhoneReminderProvider` (đóng được — ADR 0071).
 * Không làm gì với tài khoản `platform`.
 */
export function AccountPhoneGate() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  const needsPhone = user != null && user.realm !== ACCOUNT_REALM.PLATFORM && !user.phoneVerified;
  if (!needsPhone) return null;

  return (
    <ContactVerifySheet
      // `key` theo tài khoản: đổi tài khoản là một lượt mount mới, state cũ không rò sang.
      key={user.id}
      channel={CONTACT_CHANNEL.PHONE}
      open
      onClose={noop}
      current={user.phone ?? null}
      required={{ onSignOut: () => logout.mutate() }}
    />
  );
}

/**
 * Tài khoản đã bấm "Để sau" trong lần mở app này — theo ID tài khoản, để đăng nhập một tài khoản
 * khác vẫn được nhắc. Web giữ ở `sessionStorage` (mất khi đóng tab); bản native giữ trong BỘ NHỚ
 * tiến trình — mở lại app thì nhắc lại, cùng nghĩa "một lần mỗi phiên".
 */
let dismissedForInMemory: string | null = null;

export interface AccountPhonePromptOptions {
  /** Số điền sẵn — vd SĐT liên hệ khách vừa gõ ở màn Xem lại. Trống ⇒ số hiện có của tài khoản. */
  readonly phone?: string | null;
  /** Gọi khi khách xác minh XONG trong chính lượt tấm này — "Để sau" thì không gọi. */
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
 * NHẮC XÁC MINH SĐT ở APP KHÁCH (ADR 0071 — nới ADR 0060 điều 5 cho realm `customer`). Bản native
 * của web `AccountPhoneReminderProvider`.
 *
 * Khách vào bằng Google/Facebook/Apple (hoặc tài khoản cũ chưa xác minh số) được nhắc MỘT lần mỗi
 * lần mở app, và đóng được bằng "Để sau": tìm xe, xem xe, lưu xe yêu thích không cần SĐT. Việc CẦN
 * số thì hỏi đúng lúc — luồng đặt xe gọi `useAccountPhonePrompt()` khi khách bấm GỬI yêu cầu, và
 * tấm mở lại kể cả khi đã "Để sau". Trong lúc luồng đó mở (`useSuppressAccountPhoneReminder`), lời
 * nhắc chung không tự bật đè lên.
 *
 * Tấm là UX; chốt chặn thật vẫn ở server: gửi yêu cầu thuê ⇒ `PHONE_NOT_VERIFIED`, nhận lời mời
 * tài xế đòi SĐT đã xác minh (ADR 0060 điều 6, 8). Xác minh xong thì `/auth/me` được làm mới và tấm
 * tự biến mất.
 */
export function AccountPhoneReminderProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('Account.contact');
  const { data: user } = useCurrentUser();
  const [dismissedFor, setDismissedFor] = useState<string | null>(() => dismissedForInMemory);
  /**
   * Một luồng vừa CẦN số (đặt xe) — mở tấm bất kể đã "Để sau", với câu mở theo đúng việc đó.
   * `seq` dựng lại tấm ở mỗi lượt hỏi để số điền sẵn là số của lượt này.
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
    dismissedForInMemory = userId;
    setDismissedFor(userId);
  }, [userId]);

  const needsPhone = user != null && user.realm === ACCOUNT_REALM.CUSTOMER && !user.phoneVerified;
  const open =
    needsPhone && (prompted !== null || (suppressors === 0 && dismissedFor !== user.id));

  return (
    <AccountPhonePromptContext.Provider value={value}>
      {children}
      {/* Render CÓ ĐIỀU KIỆN — mỗi lần mở là một lượt mount sạch (xem docblock `ContactVerifySheet`). */}
      {open ? (
        <ContactVerifySheet
          key={`${user.id}:${prompted?.seq ?? 0}`}
          channel={CONTACT_CHANNEL.PHONE}
          open
          onClose={close}
          onVerified={prompted?.onVerified}
          current={prompted?.phone?.trim() || user.phone || null}
          reminder={{ lead: prompted ? t('bookingLead') : t('reminderLead') }}
        />
      ) : null}
    </AccountPhonePromptContext.Provider>
  );
}

/**
 * Hàm mở tấm xác minh SĐT của app khách. Ngoài `AccountPhoneReminderProvider` (app Partner, test
 * dựng lẻ một luồng) trả `null` — nơi gọi tự quyết, server vẫn là chốt.
 */
export function useAccountPhonePrompt(): AccountPhonePrompt | null {
  return useContext(AccountPhonePromptContext)?.prompt ?? null;
}

/** Luồng tự hỏi số đúng lúc của nó (đặt xe) — lời nhắc chung không tự bật khi nó đang mở. */
export function useSuppressAccountPhoneReminder() {
  const suppressReminder = useContext(AccountPhonePromptContext)?.suppressReminder;
  useEffect(() => suppressReminder?.(), [suppressReminder]);
}
