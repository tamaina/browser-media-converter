export function patchHlsMasterPlaylistText(text: string, bandwidths: number[]): string {
  let variantIndex = 0;
  return text.replace(/^#EXT-X-(?:I-FRAME-)?STREAM-INF:([^\r\n]*)$/gm, (line: string, attrs: string) => {
    const bandwidth = bandwidths[variantIndex++];

    // 1.61.1 still emits zero for some multi-variant VOD playlists. Preserve
    // upstream's measured positive bitrate and all codec/resolution metadata.
    if (readPositiveBandwidth(attrs)) return line;
    return replaceBandwidthAttribute(line, bandwidth ?? 1);
  });
}

function replaceBandwidthAttribute(line: string, bandwidth: number): string {
  const positiveBandwidth = Math.max(1, Math.round(bandwidth));
  return /(?<![\w-])BANDWIDTH=\d+/.test(line)
    ? line.replace(/(?<![\w-])BANDWIDTH=\d+/, `BANDWIDTH=${positiveBandwidth}`)
    : `${line},BANDWIDTH=${positiveBandwidth}`;
}

function readPositiveBandwidth(attrs: string): number | null {
  const value = attrs.match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1];
  if (!value) return null;
  const bandwidth = Number(value);
  return bandwidth > 0 ? bandwidth : null;
}
