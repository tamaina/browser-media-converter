// Explicit Round 8 policy. Importing this module changes no existing API defaults.
// This deliberately interprets BT.709 nonlinear RGB as display sRGB.
export function encodeForChromeVideoDisplay(encoder, input, options = {}) {
  if (!['bt709', 'smpte170m'].includes(input.transfer)) {
    throw new TypeError('Round 8 display policy requires explicit BT.709-like transfer');
  }
  return encoder.encodePlanarYuv({...input, transfer:'srgb'}, options);
}
