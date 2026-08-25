import { Redirect } from 'expo-router';

/** Điểm vào của base: mở app là vào thẳng màn đăng nhập. */
export default function IndexRoute() {
  return <Redirect href="/login" />;
}
