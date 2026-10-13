import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { appConfigApi } from '@/api/app-config/api';
import { usePartnerAppConfig } from './use-partner-app-config';

/** Cờ `isPlanPromotionEnabled` — không realtime; hỏi lại GET mỗi lần màn được dựng/focus. */
const mockUseEffect = useEffect;
const mockFocusEffects: (() => void)[] = [];

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect);
    mockUseEffect(effect, [effect]);
  },
}));

jest.mock('@/hooks/use-app-active', () => ({
  useRefetchOnForeground: jest.fn(),
}));

jest.mock('@/api/app-config/api', () => ({
  appConfigApi: { partner: jest.fn() },
}));

const partnerMock = appConfigApi.partner as jest.Mock;

function Probe() {
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  return <Text testID="flag">{String(isPlanPromotionEnabled)}</Text>;
}

async function renderProbe(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    client,
    ...(await render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )),
  };
}

beforeEach(() => {
  partnerMock.mockReset();
  mockFocusEffects.length = 0;
});

describe('usePartnerAppConfig', () => {
  it('ẩn khi đang tải', async () => {
    partnerMock.mockReturnValue(new Promise(() => undefined));
    const { getByTestId } = await renderProbe();
    expect(getByTestId('flag').props.children).toBe('false');
  });

  it('ẩn khi GET lỗi', async () => {
    partnerMock.mockRejectedValue(new Error('network'));
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(partnerMock).toHaveBeenCalled());
    expect(getByTestId('flag').props.children).toBe('false');
  });

  it('hiện khi server bật cờ', async () => {
    partnerMock.mockResolvedValue({ isPlanPromotionEnabled: true, version: 2 });
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(getByTestId('flag').props.children).toBe('true'));
  });

  it('hỏi lại mỗi lần màn được dựng lại dù đã có cache', async () => {
    partnerMock.mockResolvedValue({ isPlanPromotionEnabled: false, version: 1 });
    const first = await renderProbe();
    await waitFor(() => expect(partnerMock).toHaveBeenCalled());
    await first.unmount();
    const calls = partnerMock.mock.calls.length;
    await renderProbe(first.client);
    await waitFor(() => expect(partnerMock.mock.calls.length).toBeGreaterThan(calls));
  });

  it('hỏi lại khi màn được focus và áp cờ mới', async () => {
    partnerMock.mockResolvedValue({ isPlanPromotionEnabled: false, version: 1 });
    const { getByTestId } = await renderProbe();
    await waitFor(() => expect(partnerMock).toHaveBeenCalled());
    partnerMock.mockResolvedValue({ isPlanPromotionEnabled: true, version: 2 });
    const calls = partnerMock.mock.calls.length;
    mockFocusEffects[mockFocusEffects.length - 1]!();
    await waitFor(() => expect(partnerMock.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(getByTestId('flag').props.children).toBe('true'));
  });
});
