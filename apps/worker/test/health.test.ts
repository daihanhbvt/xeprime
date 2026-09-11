import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WorkerHealth, startHealthServer } from '../src/lib/health';

/**
 * Sức khoẻ worker — thuần logic, không cần database.
 *
 * Điều đáng khoá nhất ở đây là hai thứ KHÔNG được báo động: một vòng lặp theo giờ im lặng hàng
 * giờ, và một instance không giành được advisory lock. Cả hai đều là trạng thái bình thường, và
 * một healthcheck hay báo động giả là một healthcheck sẽ bị người vận hành tắt đi — lúc đó nó
 * tệ hơn là không có.
 *
 * Thứ PHẢI báo động, và ở hai mức khác nhau: vòng lặp quan trọng im lặng quá ngưỡng là CHẾT
 * (503, chặn deploy); hàng đợi chiếu huy hiệu dồn là BÃO HOÀ (200 + degraded, hiện ra nhưng không
 * chặn deploy — nếu không thì không ai deploy được bản sửa cho chính đợt dồn đó).
 */
const servers: Array<{ close: () => void }> = [];

after(() => {
  for (const server of servers) server.close();
});

test('vòng lặp quan trọng im lặng quá ngưỡng → unhealthy', () => {
  const health = new WorkerHealth();
  health.register('chiếu huy hiệu', { critical: true, staleAfterMs: -1 });

  assert.equal(health.snapshot().status, 'unhealthy');
  assert.equal(health.snapshot().loops['chiếu huy hiệu']?.stale, true);
});

test('vòng lặp KHÔNG quan trọng im lặng thì vẫn ok', () => {
  const health = new WorkerHealth();
  health.register('đồng bộ ngày lễ', { critical: false, staleAfterMs: -1 });

  assert.equal(health.snapshot().status, 'ok');
  assert.equal(health.snapshot().loops['đồng bộ ngày lễ']?.stale, true);
});

test('một lượt thành công xoá trạng thái hỏng và reset số lần lỗi liên tiếp', () => {
  const health = new WorkerHealth();
  health.register('outbox pump', { critical: true, staleAfterMs: 60_000 });

  health.markFailure('outbox pump', new Error('db sập'));
  health.markFailure('outbox pump', new Error('db sập'));
  assert.equal(health.snapshot().loops['outbox pump']?.consecutiveFailures, 2);

  health.markSuccess('outbox pump');
  const loop = health.snapshot().loops['outbox pump'];
  assert.equal(loop?.consecutiveFailures, 0);
  assert.equal(loop?.lastError, null);
  assert.equal(health.snapshot().status, 'ok');
});

/**
 * Bão hoà và chết là HAI mức khác nhau, và ranh giới đó là một quyết định vận hành: nếu hàng đợi
 * dồn cũng trả 503 thì `deploy.sh` sẽ từ chối deploy đúng lúc đang cần deploy bản sửa cho chính
 * sự cố gây ra đợt dồn đó.
 */
test('hàng đợi huy hiệu trễ quá ngưỡng → degraded (KHÔNG phải unhealthy)', () => {
  const health = new WorkerHealth();
  health.register('chiếu huy hiệu', { critical: true, staleAfterMs: 60_000 });
  health.limitGauge('badgeQueueLagMs', 60_000);
  health.markSuccess('chiếu huy hiệu');

  health.setGauge('badgeQueueLagMs', 5_000);
  assert.equal(health.snapshot().status, 'ok');

  health.setGauge('badgeQueueLagMs', 90_000);
  assert.equal(health.snapshot().status, 'degraded', 'vòng lặp chạy đều nhưng không đuổi kịp');

  // Hàng đợi rỗng — `null` là "không đo được / không có gì chờ", không phải vượt ngưỡng.
  health.setGauge('badgeQueueLagMs', null);
  assert.equal(health.snapshot().status, 'ok');
});

test('thông điệp lỗi bị cắt ngắn — endpoint sức khoẻ không phải chỗ đổ payload', () => {
  const health = new WorkerHealth();
  health.register('push', { critical: true, staleAfterMs: 60_000 });
  health.markFailure('push', new Error('x'.repeat(5_000)));

  assert.equal(health.snapshot().loops['push']?.lastError?.length, 200);
});

test('endpoint trả 200 khi ok/degraded, và 503 CHỈ khi unhealthy', async () => {
  const health = new WorkerHealth();
  health.register('chiếu huy hiệu', { critical: true, staleAfterMs: 60_000 });
  health.markSuccess('chiếu huy hiệu');

  const server = startHealthServer(health, 0);
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  const ok = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { status: string };
  assert.equal(body.status, 'ok');

  // Bão hoà (hàng đợi dồn) vẫn là 200 — nó không được phép khoá cổng deploy.
  health.limitGauge('badgeQueueLagMs', 60_000);
  health.setGauge('badgeQueueLagMs', 120_000);
  const saturated = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(saturated.status, 200);
  assert.equal(((await saturated.json()) as { status: string }).status, 'degraded');

  // Vòng lặp CHẾT mới là 503.
  health.register('chiếu huy hiệu', { critical: true, staleAfterMs: -1 });
  const bad = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(bad.status, 503);

  // Đường dẫn khác trả 404 — không phục vụ gì ngoài `/health`.
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 404);
});
