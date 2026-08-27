/*
 * Mở đường hầm USB cho máy Android thật: cổng trên MÁY ĐIỆN THOẠI được nối về PC.
 *
 *   tcp:8081 -> Metro (bundle JS)
 *   tcp:4000 -> API NestJS
 *
 * Nhờ vậy `EXPO_PUBLIC_API_URL=http://localhost:4000` chạy đúng trên máy thật: `localhost`
 * của điện thoại đã trỏ về `127.0.0.1` của PC. Không có tunnel thì `localhost` là chính
 * điện thoại (connect refused) và `10.0.2.2` là địa chỉ CHỈ emulator mới có (timeout).
 *
 * Không có adb / chưa cắm máy thì im lặng bỏ qua — script này còn chạy trên iOS và web.
 */
import { spawnSync } from 'node:child_process';

const PORTS = [8081, 4000];

for (const port of PORTS) {
  const result = spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.error?.code === 'ENOENT') {
    console.warn('[adb-reverse] không tìm thấy adb trên PATH — bỏ qua.');
    break;
  }
  if (result.status !== 0) {
    const reason = String(result.stderr ?? '').trim() || `exit ${result.status}`;
    console.warn(`[adb-reverse] tcp:${port} không mở được — ${reason}`);
    continue;
  }
  console.log(`[adb-reverse] tcp:${port} -> PC ✓`);
}
