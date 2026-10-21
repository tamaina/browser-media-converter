// Native harness for the patched libjxl API. No pixel conversion here.
#include <jxl/encode.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>
struct Result { uint8_t* data; size_t size; };
extern "C" int direct_encode(const JxlExperimentalYUVInput* input, Result* result,
                              char* error, size_t error_size) {
  if (!input || !result) return 1;
  *result = {};
  try {
    std::unique_ptr<JxlEncoder, decltype(&JxlEncoderDestroy)> enc(JxlEncoderCreate(nullptr), JxlEncoderDestroy);
    if (!enc) throw std::runtime_error("encoder allocation");
    const auto check = [&](JxlEncoderStatus s) {
      if (s != JXL_ENC_SUCCESS) throw std::runtime_error("libjxl rejected input/configuration");
    };
    JxlBasicInfo info;
    JxlEncoderInitBasicInfo(&info);
    info.xsize = input->width; info.ysize = input->height;
    info.bits_per_sample = 8; info.num_color_channels = 3;
    info.uses_original_profile = JXL_TRUE;
    check(JxlEncoderSetBasicInfo(enc.get(), &info));
    JxlColorEncoding color;
    JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
    check(JxlEncoderSetColorEncoding(enc.get(), &color));
    check(JxlEncoderAddExperimentalYUVFrame(enc.get(), input));
    std::vector<uint8_t> output(4096);
    size_t used = 0;
    for (;;) {
      auto* next = output.data() + used;
      size_t available = output.size() - used;
      auto status = JxlEncoderProcessOutput(enc.get(), &next, &available);
      used = output.size() - available;
      if (status == JXL_ENC_SUCCESS) break;
      if (status != JXL_ENC_NEED_MORE_OUTPUT) throw std::runtime_error("libjxl encode failed");
      output.resize(output.size() * 2);
    }
    result->data = static_cast<uint8_t*>(std::malloc(used));
    if (!result->data) throw std::runtime_error("output allocation");
    std::memcpy(result->data, output.data(), used); result->size = used;
    return 0;
  } catch (const std::exception& e) {
    if (error && error_size) std::snprintf(error, error_size, "%s", e.what());
    return 1;
  }
}
extern "C" void direct_free(Result* result) {
  if (result) { std::free(result->data); *result = {}; }
}
