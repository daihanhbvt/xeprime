import type { ConversationSummary } from '@xeprime/api-client';
import { fireEvent, render } from '@testing-library/react-native';
import { CHAT_SIDE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { ConversationRow } from './ConversationRow';

/**
 * Một dòng hộp thư. Điều được khoá ở đây là hợp đồng ra ngoài: dòng CHỈ báo lên trên khi được
 * chạm (điều hướng là việc của màn), và mọi chữ đều là dữ liệu thật — không có badge nào vẽ ra
 * từ con số 0.
 */
const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'c1',
  vehicleId: 'v1',
  vehicleName: 'Kia Morning 2021',
  vehicleImageUrl: null,
  partyName: 'Salon Xe Cũ',
  partyAvatarUrl: null,
  side: CHAT_SIDE.CUSTOMER,
  lastMessageText: 'Dạ xe này chính chủ ạ',
  lastMessageAt: '2026-09-07T03:24:00.000Z',
  lastSenderType: 'shop_member',
  unread: 0,
  status: 'open',
  ...over,
});

describe('ConversationRow', () => {
  it('hiện tên gian hàng, ngữ cảnh xe và tin cuối', async () => {
    const view = await render(
      withIntl(<ConversationRow conversation={conversation()} onPress={jest.fn()} />),
    );

    expect(view.getByText('Salon Xe Cũ')).toBeTruthy();
    expect(view.getByText('Kia Morning 2021')).toBeTruthy();
    expect(view.getByText('Dạ xe này chính chủ ạ')).toBeTruthy();
  });

  it('vẽ badge khi còn tin chưa đọc, và KHÔNG vẽ khi đã đọc hết', async () => {
    const unread = await render(
      withIntl(<ConversationRow conversation={conversation({ unread: 3 })} onPress={jest.fn()} />),
    );
    expect(unread.getByText('3')).toBeTruthy();

    const read = await render(
      withIntl(<ConversationRow conversation={conversation({ unread: 0 })} onPress={jest.fn()} />),
    );
    expect(read.queryByText('0')).toBeNull();
  });

  it('chưa có tin nào thì mời bắt đầu, không để dòng trống', async () => {
    const view = await render(
      withIntl(
        <ConversationRow
          conversation={conversation({ lastMessageText: null, lastMessageAt: null })}
          onPress={jest.fn()}
        />,
      ),
    );

    // Có `vehicleName` ⇒ nói rõ đang về xe nào, thay vì một dòng trắng.
    expect(view.getByText('Về Kia Morning 2021')).toBeTruthy();
  });

  it('chạm vào dòng báo lên trên NGUYÊN hội thoại, không chỉ id', async () => {
    const onPress = jest.fn();
    const view = await render(
      withIntl(<ConversationRow conversation={conversation()} onPress={onPress} />),
    );

    await fireEvent.press(view.getByRole('button', { name: 'Salon Xe Cũ' }));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });
});
