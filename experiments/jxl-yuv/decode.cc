// Separate decoder process; no wrapper/conversion code is linked here.
#include <jxl/decode.h>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <vector>
int main(int argc, char** argv) {
  try {
    if (argc != 3) throw std::runtime_error("usage: decode in.jxl out.rgb");
    std::ifstream file(argv[1], std::ios::binary);
    if (!file) throw std::runtime_error("input open failed");
    std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)), {}), pixels;
    std::unique_ptr<JxlDecoder, decltype(&JxlDecoderDestroy)> dec(JxlDecoderCreate(nullptr), JxlDecoderDestroy);
    auto check = [](JxlDecoderStatus s) { if (s != JXL_DEC_SUCCESS) throw std::runtime_error("decoder API failure"); };
    check(JxlDecoderSubscribeEvents(dec.get(), JXL_DEC_BASIC_INFO | JXL_DEC_COLOR_ENCODING | JXL_DEC_FULL_IMAGE));
    check(JxlDecoderSetInput(dec.get(), bytes.data(), bytes.size()));
    JxlDecoderCloseInput(dec.get());
    JxlPixelFormat fmt{3, JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0};
    JxlBasicInfo info{};
    bool complete = false;
    for (;;) {
      auto s = JxlDecoderProcessInput(dec.get());
      if (s == JXL_DEC_BASIC_INFO) {
        check(JxlDecoderGetBasicInfo(dec.get(), &info));
        if (info.bits_per_sample != 8 || info.num_color_channels != 3 || info.alpha_bits ||
            uint64_t(info.xsize)*info.ysize > 16777216) throw std::runtime_error("unexpected basic info");
      } else if (s == JXL_DEC_COLOR_ENCODING) {
        JxlColorEncoding c{};
        check(JxlDecoderGetColorAsEncodedProfile(dec.get(), JXL_COLOR_PROFILE_TARGET_ORIGINAL, &c));
        std::printf("%u %u primaries=%d transfer=%d white=%d\n", info.xsize, info.ysize,
                    int(c.primaries), int(c.transfer_function), int(c.white_point));
      } else if (s == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
        size_t size;
        check(JxlDecoderImageOutBufferSize(dec.get(), &fmt, &size));
        pixels.resize(size);
        check(JxlDecoderSetImageOutBuffer(dec.get(), &fmt, pixels.data(), size));
      } else if (s == JXL_DEC_FULL_IMAGE) complete = true;
      else if (s == JXL_DEC_SUCCESS) break;
      else throw std::runtime_error("invalid or truncated JXL");
    }
    if (!complete) throw std::runtime_error("missing full image");
    std::ofstream out(argv[2], std::ios::binary);
    out.write(reinterpret_cast<const char*>(pixels.data()), pixels.size());
    if (!out) throw std::runtime_error("output write failed");
  } catch (const std::exception& e) { std::fprintf(stderr, "%s\n", e.what()); return 1; }
}
