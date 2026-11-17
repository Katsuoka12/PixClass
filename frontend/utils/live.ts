export function liveRedirect(value: unknown): string | null {
  return typeof value === 'string' && /^\/live\/join\?t=[a-f0-9]{64}$/.test(value) ? value : null;
}

export function jitsiRoomUrl(domain: string, room: string, displayName: string): string | null {
  if (!/^[a-zA-Z0-9.-]+(?::[1-9]\d{0,4})?$/.test(domain) || !/^st-[a-f0-9]{48}$/.test(room)) return null;
  try {
    const url = new URL(`https://${domain}/${room}`);
    if (url.username || url.password || (url.port && Number(url.port) > 65535)) return null;
    url.hash = `userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`;
    return url.href;
  } catch { return null; }
}
