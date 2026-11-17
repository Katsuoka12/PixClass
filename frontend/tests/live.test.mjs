import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { liveRedirect, jitsiRoomUrl } from '../utils/live.ts';

test('login return only accepts the exact local live token route', () => {
  const path = `/live/join?t=${'a'.repeat(64)}`;
  assert.equal(liveRedirect(path), path);
  for (const invalid of ['https://evil.test', '//evil.test/live/join', '/live/join?t=abc', `${path}&redirect=https://evil.test`, `${path}#evil`, ['/live/join']]) assert.equal(liveRedirect(invalid), null);
});
test('fallback room URL rejects script/credential/path injection and encodes display name', () => {
  const room = `st-${'b'.repeat(48)}`;
  assert.equal(jitsiRoomUrl('meet.jit.si', room, 'ครู "ทดสอบ"'), `https://meet.jit.si/${room}#userInfo.displayName=${encodeURIComponent(JSON.stringify('ครู "ทดสอบ"'))}`);
  for (const domain of ['javascript:alert(1)', 'https://meet.jit.si', 'user@host.test', 'host.test/path', 'host.test:0']) assert.equal(jitsiRoomUrl(domain, room, 'A'), null);
  assert.equal(jitsiRoomUrl('meet.jit.si', '../other', 'A'), null);
});
