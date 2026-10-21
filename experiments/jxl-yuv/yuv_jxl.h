#pragma once
#include <stddef.h>
#include <stdint.h>

// Prototype ABI. All buffers remain borrowed until encode returns.
struct Plane { const uint8_t* data; size_t size, offset, stride, width, height; };
struct Input {
  uint32_t width, height, bit_depth;
  // format: 0 I420, 1 I422, 2 I444, 3 NV12
  uint32_t format;
  // Only BT.709 matrix/primaries, sRGB or BT.709 transfer, centered chroma.
  uint32_t matrix, primaries, transfer, full_range, centered, origin_x, origin_y;
  Plane planes[3];
};
struct Result {
  uint8_t* data;
  size_t size, callback_count, peak_rgb_bytes, max_rectangle_bytes;
};
extern "C" int encode_yuv(const Input*, Result*, char* error, size_t error_size);
extern "C" void free_result(Result*);
