export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function nextTask(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return '🌐';
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
