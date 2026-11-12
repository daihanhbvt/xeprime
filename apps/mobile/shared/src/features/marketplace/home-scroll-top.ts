/**
 * Kênh "cuộn trang chủ lên đầu" cho logo ở `AppTopBar` — thanh đó nằm ở layout `(tabs)`, NGOÀI
 * cây của `HomeScreen`, nên không cầm được ref của ScrollView. Bấm lại tab Khám phá không đi qua
 * đây: nó là sự kiện `tabPress` của navigator.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function requestHomeScrollTop() {
  listeners.forEach((listener) => listener());
}

export function onHomeScrollTop(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
