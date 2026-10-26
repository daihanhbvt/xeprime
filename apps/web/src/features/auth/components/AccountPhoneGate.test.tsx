import { App, Button } from 'antd';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_REALM } from '@xeprime/types';
import {
  AccountPhoneGate,
  AccountPhoneReminderProvider,
  useAccountPhonePrompt,
} from './AccountPhoneGate';

const me = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: me.data }) }));

/** Luồng OTP đứng yên ở bước nhập số — test này chỉ soát KHI NÀO hộp hiện, không soát OTP. */
const flow = vi.hoisted(() => ({ verified: false }));
vi.mock('@/features/account/hooks/use-contact-verify', () => ({
  useContactVerify: () => ({
    step: 'identifier',
    sentTo: '',
    cooldown: 0,
    devCode: null,
    sending: false,
    verifying: false,
    verified: flow.verified,
    error: null,
    send: vi.fn(),
    verify: vi.fn(),
    reset: vi.fn(),
    editIdentifier: vi.fn(),
  }),
}));

const signOut = vi.hoisted(() => vi.fn());
vi.mock('../hooks/use-logout', () => ({ useLogout: () => signOut }));

const SOCIAL_CUSTOMER = {
  id: 'U1',
  realm: ACCOUNT_REALM.CUSTOMER,
  displayName: 'Khách Google',
  phone: null,
  phoneVerified: false,
};

const TITLE = 'Xác minh số điện thoại';

/** Nút của một luồng cần SĐT (vd "Tiếp tục" của hộp đặt xe). */
function NeedsPhoneButton() {
  const prompt = useAccountPhonePrompt();
  return <Button onClick={() => prompt?.()}>Đặt xe</Button>;
}

function renderReminder() {
  const tree = () => (
    <App>
      <AccountPhoneReminderProvider>
        <NeedsPhoneButton />
      </AccountPhoneReminderProvider>
    </App>
  );
  const view = render(tree());
  return { rerenderTree: () => view.rerender(tree()) };
}

beforeEach(() => {
  me.data = undefined;
  flow.verified = false;
  signOut.mockReset();
  window.sessionStorage.clear();
});

afterEach(cleanup);

/**
 * Site KHÁCH — ADR 0071: nhắc xác minh SĐT, đóng được; luồng cần số mở lại hộp đúng lúc.
 */
describe('AccountPhoneReminderProvider', () => {
  it('tài khoản khách chưa xác minh SĐT → nhắc, có "Để sau", KHÔNG có "Đăng xuất"', () => {
    me.data = SOCIAL_CUSTOMER;
    renderReminder();

    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText(/Bạn vẫn tìm và xem xe bình thường khi chưa thêm/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
  });

  it('"Để sau" → đóng, và không nhắc lại trong cùng phiên tab (kể cả dựng lại vỏ)', () => {
    me.data = SOCIAL_CUSTOMER;
    renderReminder();

    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByText(TITLE)).toBeNull();

    // Vỏ site dựng lại (F5 trong cùng tab) — lượt "Để sau" còn nguyên.
    cleanup();
    renderReminder();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('đã "Để sau" nhưng luồng CẦN số gọi prompt → mở lại với câu của việc đặt xe', () => {
    me.data = SOCIAL_CUSTOMER;
    renderReminder();
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));

    fireEvent.click(screen.getByRole('button', { name: 'Đặt xe' }));

    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText(/Xác minh số điện thoại để gửi yêu cầu thuê xe/)).toBeTruthy();

    // Đóng lần nữa vẫn đóng được.
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('tài khoản KHÁC đăng nhập cùng tab → vẫn được nhắc (lượt "Để sau" theo tài khoản)', () => {
    me.data = SOCIAL_CUSTOMER;
    const { rerenderTree } = renderReminder();
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));

    me.data = { ...SOCIAL_CUSTOMER, id: 'U2' };
    rerenderTree();

    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it('đã xác minh SĐT, hay chưa đăng nhập → không hiện gì, prompt cũng không mở', () => {
    me.data = { ...SOCIAL_CUSTOMER, phone: '0901234567', phoneVerified: true };
    const { rerenderTree } = renderReminder();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt xe' }));
    expect(screen.queryByText(TITLE)).toBeNull();

    me.data = undefined;
    rerenderTree();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt xe' }));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('xác minh xong → hộp tự đóng', () => {
    me.data = SOCIAL_CUSTOMER;
    const { rerenderTree } = renderReminder();
    expect(screen.getByText(TITLE)).toBeTruthy();

    // `useContactVerify` báo đúng mã, rồi `/auth/me` làm mới mang số đã xác minh.
    flow.verified = true;
    act(() => rerenderTree());
    me.data = { ...SOCIAL_CUSTOMER, phone: '0901234567', phoneVerified: true };
    rerenderTree();

    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

/** Site PARTNER — ADR 0060 điều 5 giữ nguyên: bắt buộc, lối ra duy nhất là Đăng xuất. */
describe('AccountPhoneGate (site partner)', () => {
  it('tài khoản đối tác chưa xác minh SĐT → hộp bắt buộc, có "Đăng xuất", KHÔNG có "Để sau"', () => {
    me.data = { ...SOCIAL_CUSTOMER, realm: ACCOUNT_REALM.PARTNER };
    render(
      <App>
        <AccountPhoneGate signOutTo="/login" />
      </App>,
    );

    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Để sau' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('tài khoản nền tảng → không hiện gì', () => {
    me.data = { ...SOCIAL_CUSTOMER, realm: ACCOUNT_REALM.PLATFORM };
    render(
      <App>
        <AccountPhoneGate signOutTo="/login" />
      </App>,
    );

    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
