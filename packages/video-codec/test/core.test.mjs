import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AV1_LEVELS,
  AVC_LEVELS,
  AVC_PROFILES,
  HEVC_LEVELS,
  VP9_LEVELS,
  VP9_PROFILES,
  buildVideoCodecString,
  parseVideoCodecString,
  planVideoCodecString,
  selectAv1Level,
} from '../dist/index.js';

describe('planVideoCodecString', () => {
  it('plans AV1 10-bit 4:2:0 using the vendored formatter', () => {
    const planned = planVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    });
    assert.equal(planned.codec, 'av01.0.08M.10');
    assert.deepEqual(planned.settings, {
      codec: 'av1',
      profile: 'Main',
      level: '4.0',
      tier: 'Main',
      frameRate: 30,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    });
  });

  it('uses frame rate for level selection', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      frameRate: 60,
      bitDepth: 8,
      chromaSubsampling: '420',
    }), 'av01.0.09M.08');
  });

  it('selects AV1 High tier when bitrate needs it and High tier is allowed', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 20_000_000,
      bitDepth: 8,
      chromaSubsampling: '420',
    }), 'av01.0.08H.08');
  });

  it('can keep AV1 level selection to Main tier', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 20_000_000,
      tier: 'Main',
      bitDepth: 8,
      chromaSubsampling: '420',
    }), 'av01.0.09M.08');
  });

  it('can force AV1 High tier selection', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 640,
      height: 360,
      tier: 'High',
      bitDepth: 8,
      chromaSubsampling: '420',
    }), 'av01.0.08H.08');
  });

  it('uses AV1 tile constraints when explicitly provided', () => {
    assert.equal(selectAv1Level({
      width: 640,
      height: 360,
      frameRate: 30,
      tileRows: 4,
      tileCols: 4,
    }).level, '3.0');
  });

  it('plans AV1 high profile for 4:4:4 8-bit', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 640,
      height: 360,
      preferredAllowingMaxBitrate: 1_000_000,
      bitDepth: 8,
      chromaSubsampling: '444',
    }), 'av01.1.01M.08');
  });

  it('can force AV1 full form without extra color metadata', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 640,
      height: 360,
      preferredAllowingMaxBitrate: 1_000_000,
      bitDepth: 8,
      chromaSubsampling: '444',
    }, { style: 'full' }), 'av01.1.01M.08.0.000.01.01.01.0');
  });

  it('plans AV1 color metadata fields when provided', () => {
    const planned = planVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
      cicp: [9, 16, 9, false],
    });
    assert.equal(planned.codec, 'av01.0.08M.10.0.110.09.16.09.0');
    assert.deepEqual(planned.settings.cicp, [9, 16, 9, false]);
  });

  it('can force AV1 short form even with extra color metadata', () => {
    assert.equal(buildVideoCodecString({
      codec: 'av1',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
      cicp: [9, 16, 9, false],
    }, { style: 'short' }), 'av01.0.08M.10');
  });

  it('plans VP9 profile 2 for 10-bit 4:2:0', () => {
    assert.equal(buildVideoCodecString({
      codec: 'vp9',
      width: 1280,
      height: 720,
      preferredAllowingMaxBitrate: 2_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'vp09.02.31.10');
  });

  it('can force VP9 full form without extra color metadata', () => {
    assert.equal(buildVideoCodecString({
      codec: 'vp9',
      width: 1280,
      height: 720,
      preferredAllowingMaxBitrate: 2_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    }, { style: 'full' }), 'vp09.02.31.10.01.01.01.01.00');
  });

  it('plans VP9 color metadata fields when provided', () => {
    assert.equal(buildVideoCodecString({
      codec: 'vp9',
      width: 1280,
      height: 720,
      preferredAllowingMaxBitrate: 2_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
      cicp: [9, 16, 9, false],
    }), 'vp09.02.31.10.09.16.09.01.00');
  });

  it('plans AVC high 10 when requested', () => {
    assert.equal(buildVideoCodecString({
      codec: 'avc',
      width: 1280,
      height: 720,
      preferredAllowingMaxBitrate: 4_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'avc1.6e001f');
  });

  it('plans HEVC Main 10 when requested', () => {
    assert.equal(buildVideoCodecString({
      codec: 'hevc',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'hev1.2.6.L120.B0');
  });

  it('selects HEVC High tier when bitrate needs it and High tier is allowed', () => {
    assert.equal(buildVideoCodecString({
      codec: 'hevc',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 20_000_000,
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'hev1.2.6.H120.B0');
  });

  it('can keep HEVC level selection to Main tier', () => {
    assert.equal(buildVideoCodecString({
      codec: 'hevc',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 20_000_000,
      tier: 'Main',
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'hev1.2.6.L123.B0');
  });

  it('can force HEVC High tier selection', () => {
    assert.equal(buildVideoCodecString({
      codec: 'hevc',
      width: 1920,
      height: 1080,
      tier: 'High',
      bitDepth: 10,
      chromaSubsampling: '420',
    }), 'hev1.2.6.H120.B0');
  });

  it('rejects unsupported HEVC chroma combinations', () => {
    assert.throws(() => buildVideoCodecString({
      codec: 'hevc',
      width: 1920,
      height: 1080,
      preferredAllowingMaxBitrate: 8_000_000,
      bitDepth: 10,
      chromaSubsampling: '444',
    }), /No default HEVC profile/u);
  });

  it('exports structured codec spec tables and selectors', () => {
    assert.ok(AV1_LEVELS.some((level) => level.level === '4.0' && level.maxHSize >= 1920));
    assert.ok(AV1_LEVELS.some((level) => level.level === '6.3' && level.maxTiles === 128 && level.maxTileCols === 16));
    assert.ok(AVC_LEVELS.some((level) => level.level === '4.1' && level.maxCpb === 62_500_000));
    assert.ok(AVC_PROFILES.some((profile) => profile.profile === 'High 10' && profile.bitDepths.includes(10)));
    assert.ok(HEVC_LEVELS.some((level) => level.level === '4' && level.tier === 'Main' && level.maxTileRows === 5));
    assert.ok(VP9_LEVELS.some((level) => level.level === '5.1' && level.maxTiles === 8 && level.maxCpbSize === 46_000_000));
    assert.ok(VP9_PROFILES.some((profile) => profile.profile === 2 && profile.bitDepths.includes(10)));
    assert.equal(selectAv1Level({
      width: 1920,
      height: 1080,
      frameRate: 30,
      preferredAllowingMaxBitrate: 8_000_000,
    }).level, '4.0');
  });
});

describe('parseVideoCodecString', () => {
  it('parses AV1 short and full codec strings', () => {
    assert.deepEqual(parseVideoCodecString('av01.0.08M.10'), {
      codec: 'av01.0.08M.10',
      settings: {
        codec: 'av1',
        profile: 'Main',
        level: '4.0',
        tier: 'Main',
        bitDepth: 10,
        chromaSubsampling: '420',
      },
    });
    assert.deepEqual(parseVideoCodecString('av01.0.08M.10.0.110.09.16.09.0'), {
      codec: 'av01.0.08M.10.0.110.09.16.09.0',
      settings: {
        codec: 'av1',
        profile: 'Main',
        level: '4.0',
        tier: 'Main',
        bitDepth: 10,
        chromaSubsampling: '420',
        monochrome: false,
        cicp: [9, 16, 9, false],
      },
    });
  });

  it('parses VP9 short and full codec strings', () => {
    assert.deepEqual(parseVideoCodecString('vp09.02.31.10'), {
      codec: 'vp09.02.31.10',
      settings: {
        codec: 'vp9',
        profile: 2,
        level: '3.1',
        bitDepth: 10,
        chromaSubsampling: '420',
      },
    });
    assert.deepEqual(parseVideoCodecString('vp09.02.31.10.09.16.09.01.00'), {
      codec: 'vp09.02.31.10.09.16.09.01.00',
      settings: {
        codec: 'vp9',
        profile: 2,
        level: '3.1',
        bitDepth: 10,
        chromaSubsampling: '420',
        cicp: [9, 16, 9, false],
      },
    });
  });

  it('parses AVC and HEVC codec strings', () => {
    assert.deepEqual(parseVideoCodecString('avc1.6e001f'), {
      codec: 'avc1.6e001f',
      settings: {
        codec: 'avc',
        profile: 'High 10',
        level: '3.1',
        bitDepth: 10,
        chromaSubsampling: '420',
      },
    });
    assert.deepEqual(parseVideoCodecString('hev1.2.6.H120.B0'), {
      codec: 'hev1.2.6.H120.B0',
      settings: {
        codec: 'hevc',
        profile: 'Main 10',
        level: '4',
        tier: 'High',
        bitDepth: 10,
        chromaSubsampling: '420',
      },
    });
  });

  it('returns null for unsupported or malformed codec strings', () => {
    assert.equal(parseVideoCodecString('mp4a.40.2'), null);
    assert.equal(parseVideoCodecString('av01.0.bad.10'), null);
    assert.equal(parseVideoCodecString('vp09.02.31.16'), null);
    assert.equal(parseVideoCodecString('hev1.2.6.X120.B0'), null);
  });
});
