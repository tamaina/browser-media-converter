#include "yuv_jxl.h"
#include <jxl/encode.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
void require(bool ok, const char* message) {
  if (!ok) throw std::runtime_error(message);
}
void check(JxlEncoderStatus s) { require(s == JXL_ENC_SUCCESS, "libjxl rejected encoding"); }
void validate(const Input& in) {
  // Explicit admission limit also bounds arithmetic and allocation sizes.
  require(in.width && in.height && in.width <= 16384 && in.height <= 16384 &&
          uint64_t(in.width) * in.height <= 16777216, "dimension limit (16 megapixels)");
  require(in.bit_depth == 8, "only 8-bit storage supported");
  require(in.format <= 3, "unsupported format");
  require(in.matrix == 1 && in.primaries == 1, "only BT.709 matrix and primaries supported");
  require(in.transfer == 1 || in.transfer == 13, "only BT.709 or sRGB transfer supported");
  require(in.full_range <= 1 && in.centered == 1, "range or chroma siting unsupported");
  require(in.origin_x == 0 && in.origin_y == 0, "cropped origins unsupported: copy an aligned visible frame first");
  size_t cw = in.format == 2 ? in.width : (in.width + 1) / 2;
  size_t ch = in.format == 0 || in.format == 3 ? (in.height + 1) / 2 : in.height;
  for (size_t i = 0; i < (in.format == 3 ? 2u : 3u); ++i) {
    const auto& p = in.planes[i];
    size_t w = i ? cw : in.width, h = i ? ch : in.height;
    size_t row = w * (i && in.format == 3 ? 2 : 1);
    require(p.data && p.width == w && p.height == h, "plane dimensions mismatch");
    require(p.stride >= row && p.offset <= p.size, "plane stride/offset invalid");
    // Subtraction/division avoids overflow for hostile offsets or strides.
    require(row <= p.size - p.offset && (h - 1) <= (p.size - p.offset - row) / p.stride,
            "plane bounds invalid");
  }
  if (in.format == 3) require(in.planes[2].size == 0, "NV12 requires exactly two planes");
}
struct Source {
  const Input& in;
  Result& stats;
  size_t live = 0;
  bool failed = false;
  std::map<const void*, std::vector<uint8_t>> buffers;
};
uint8_t quantize(double v) { return uint8_t(std::floor(std::clamp(v, 0.0, 1.0) * 255 + 0.5)); }
void pixel(const Input& in, size_t x, size_t y, uint8_t* out) {
  size_t cx = in.format == 2 ? x : x / 2;
  size_t cy = in.format == 0 || in.format == 3 ? y / 2 : y;
  const auto sample = [&](size_t plane, size_t px, size_t py) {
    const auto& p = in.planes[plane];
    return double(p.data[p.offset + py * p.stride + px]);
  };
  double yy = sample(0, x, y);
  double cb = sample(1, in.format == 3 ? cx * 2 : cx, cy) - 128;
  double cr = sample(in.format == 3 ? 1 : 2, in.format == 3 ? cx * 2 + 1 : cx, cy) - 128;
  yy = in.full_range ? yy / 255 : (yy - 16) / 219;
  cb /= in.full_range ? 255 : 224;
  cr /= in.full_range ? 255 : 224;
  // Inverse BT.709 non-constant-luminance matrix, in nonlinear R'G'B'.
  out[0] = quantize(yy + 1.5748 * cr);
  out[1] = quantize(yy - (0.0722 * 1.8556 / 0.7152) * cb - (0.2126 * 1.5748 / 0.7152) * cr);
  out[2] = quantize(yy + 1.8556 * cb);
}
void format(void*, JxlPixelFormat* f) { *f = {3, JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0}; }
const void* get(void* opaque, size_t x, size_t y, size_t w, size_t h, size_t* stride) noexcept {
  auto& s = *static_cast<Source*>(opaque);
  try {
    require(x <= s.in.width && y <= s.in.height && w && h &&
            w <= s.in.width - x && h <= s.in.height - y, "invalid callback rectangle");
    std::vector<uint8_t> b(w * h * 3);
    for (size_t j = 0; j < h; ++j)
      for (size_t i = 0; i < w; ++i) pixel(s.in, x+i, y+j, &b[(j*w+i)*3]);
    *stride = w * 3;
    s.live += b.size();
    ++s.stats.callback_count;
    s.stats.peak_rgb_bytes = std::max(s.stats.peak_rgb_bytes, s.live);
    s.stats.max_rectangle_bytes = std::max(s.stats.max_rectangle_bytes, b.size());
    const void* ptr = b.data();
    s.buffers.emplace(ptr, std::move(b));
    return ptr;
  } catch (...) { s.failed = true; return nullptr; }
}
void release(void* opaque, const void* p) noexcept {
  auto& s = *static_cast<Source*>(opaque);
  auto it = s.buffers.find(p);
  if (it != s.buffers.end()) { s.live -= it->second.size(); s.buffers.erase(it); }
}
}
extern "C" int encode_yuv(const Input* input, Result* result, char* error, size_t n) {
  if (!input || !result) return 1;
  *result = {};
  try {
    validate(*input);
    require(JxlEncoderVersion() >= 11000, "libjxl >= 0.11 required");
    Source source{*input, *result, 0, false, {}};
    // Encoder is destroyed before source (callbacks borrow it).
    std::unique_ptr<JxlEncoder, decltype(&JxlEncoderDestroy)> enc(JxlEncoderCreate(nullptr), JxlEncoderDestroy);
    require(bool(enc), "encoder allocation failed");
    JxlBasicInfo info;
    JxlEncoderInitBasicInfo(&info);
    info.xsize = input->width; info.ysize = input->height;
    info.bits_per_sample = 8; info.num_color_channels = 3; info.uses_original_profile = JXL_TRUE;
    check(JxlEncoderSetBasicInfo(enc.get(), &info));
    JxlColorEncoding color;
    JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
    color.transfer_function = static_cast<JxlTransferFunction>(input->transfer);
    check(JxlEncoderSetColorEncoding(enc.get(), &color));
    auto* settings = JxlEncoderFrameSettingsCreate(enc.get(), nullptr);
    require(settings, "frame settings allocation failed");
    check(JxlEncoderSetFrameLossless(settings, JXL_TRUE));
    check(JxlEncoderFrameSettingsSetOption(settings, JXL_ENC_FRAME_SETTING_EFFORT, 1));
    JxlChunkedFrameInputSource callbacks{};
    callbacks.opaque = &source; callbacks.get_color_channels_pixel_format = format;
    callbacks.get_color_channel_data_at = get; callbacks.release_buffer = release;
    check(JxlEncoderAddChunkedFrame(settings, JXL_TRUE, callbacks));
    require(!source.failed, "input callback failed");
    std::vector<uint8_t> output(4096);
    size_t used = 0;
    for (;;) {
      auto* next = output.data() + used; size_t available = output.size() - used;
      auto status = JxlEncoderProcessOutput(enc.get(), &next, &available);
      used = output.size() - available;
      if (status == JXL_ENC_SUCCESS) break;
      require(status == JXL_ENC_NEED_MORE_OUTPUT, "output encoding failed");
      output.resize(output.size() * 2);
    }
    result->data = static_cast<uint8_t*>(std::malloc(used));
    require(result->data, "output allocation failed");
    std::memcpy(result->data, output.data(), used); result->size = used;
    return 0;
  } catch (const std::exception& e) {
    if (error && n) std::snprintf(error, n, "%s", e.what());
    return 1;
  } catch (...) {
    if (error && n) std::snprintf(error, n, "unknown native failure");
    return 1;
  }
}
extern "C" void free_result(Result* result) {
  if (result) { std::free(result->data); *result = {}; }
}
