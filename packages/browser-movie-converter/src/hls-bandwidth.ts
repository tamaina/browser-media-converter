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

// Quality is opaque in Mediabunny's public API. Numeric legacy rates can inform
// this heuristic; Quality objects use the geometry/audio estimates instead.
export function estimateHlsFallbackBandwidth(
  videoBitrate: unknown,
  resolution: { width: number; height: number } | null,
  audioBitrates: unknown[],
): number {
  const video = typeof videoBitrate === 'number'
    ? videoBitrate
    : resolution ? Math.max(150_000, Math.round(resolution.width * resolution.height * 6)) : 1_000_000;
  const audio = audioBitrates.reduce<number>((sum, bitrate) => sum + (typeof bitrate === 'number' ? bitrate : 128_000), 0);
  return Math.max(1, video + audio);
}
