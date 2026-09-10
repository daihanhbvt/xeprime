import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { ChatComposer } from './ChatComposer';

/**
 * Ô soạn tin.
 *
 * Ba hợp đồng được khoá, và cả ba đều là chuyện MẤT DỮ LIỆU nếu sai: không gửi được tin rỗng,
 * một cú chạm chỉ gửi một tin, và ô nhập được dọn ngay khi gửi (tin đã nằm trong danh sách ở
 * trạng thái `pending`, giữ chữ lại là mời người dùng gõ đè lên nội dung vừa gửi).
 */
jest.mock('@/components/feedback/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}));

const PLACEHOLDER = 'Nhập tin nhắn của bạn…';

describe('ChatComposer', () => {
  it('nút gửi khoá khi chưa có gì để gửi', async () => {
    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));

    const send = view.getByRole('button', { name: 'Gửi' });
    expect(send.props.accessibilityState.disabled).toBe(true);
  });

  it('không gọi onSend với tin RỖNG hay chỉ có khoảng trắng', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const view = await render(withIntl(<ChatComposer onSend={onSend} />));

    await fireEvent.changeText(view.getByLabelText(PLACEHOLDER), '    ');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('gửi text đã cắt khoảng trắng, rồi DỌN ô nhập', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const view = await render(withIntl(<ChatComposer onSend={onSend} />));

    const input = view.getByLabelText(PLACEHOLDER);
    await fireEvent.changeText(input, '  Chào shop  ');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ text: 'Chào shop' }));
    expect(input.props.value).toBe('');
  });

  /** Chốt chống gửi đôi là một `ref`, không phải state — hai cú chạm liên tiếp chỉ ra một tin. */
  it('chạm hai lần thật nhanh chỉ gửi MỘT tin', async () => {
    let release: (() => void) | undefined;
    const onSend = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await fireEvent.changeText(view.getByLabelText(PLACEHOLDER), 'Bấm nhanh');

    const send = view.getByRole('button', { name: 'Gửi' });
    await fireEvent.press(send);
    await fireEvent.press(send);

    expect(onSend).toHaveBeenCalledTimes(1);
    // Thả cho lời gọi kết thúc TRONG `act`: nó còn một `setBusy(false)` ở nhánh `finally`, và
    // để nó chạy ngoài act là cảnh báo React trong log của mọi lần chạy sau.
    await act(async () => {
      release?.();
    });
  });

  it('`disabled` chặn cả gõ lẫn gửi — thread đang lỗi thì không soạn tin vào hư không', async () => {
    const onSend = jest.fn();
    const view = await render(withIntl(<ChatComposer onSend={onSend} disabled />));

    expect(view.getByLabelText(PLACEHOLDER).props.editable).toBe(false);
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
