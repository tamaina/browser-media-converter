// Independent stock libjxl decoder: read a codestream from stdin and report
// headers plus fully decoded, coalesced RGBA pixels for every displayed frame.
#include <jxl/decode.h>
#include <cstdio>
#include <iostream>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <vector>
int main() {
  try {
    std::vector<uint8_t> input((std::istreambuf_iterator<char>(std::cin)), {});
    std::unique_ptr<JxlDecoder, decltype(&JxlDecoderDestroy)> dec(JxlDecoderCreate(nullptr), JxlDecoderDestroy);
    if (!dec) throw std::runtime_error("decoder allocation");
    auto check=[](JxlDecoderStatus s) {if(s!=JXL_DEC_SUCCESS)throw std::runtime_error("decoder API");};
    check(JxlDecoderSubscribeEvents(dec.get(), JXL_DEC_BASIC_INFO | JXL_DEC_FRAME | JXL_DEC_FULL_IMAGE));
    check(JxlDecoderSetInput(dec.get(), input.data(), input.size()));
    JxlDecoderCloseInput(dec.get());
    JxlBasicInfo info{};
    JxlFrameHeader frame{};
    JxlPixelFormat format{4, JXL_TYPE_FLOAT, JXL_NATIVE_ENDIAN, 0};
    std::vector<float> pixels;
    size_t count=0;
    for (;;) {
      auto status=JxlDecoderProcessInput(dec.get());
      if(status==JXL_DEC_BASIC_INFO) {
        check(JxlDecoderGetBasicInfo(dec.get(), &info));
        if(uint64_t(info.xsize)*info.ysize>4194304)throw std::runtime_error("image too large");
        std::printf("{\"haveAnimation\":%s,\"tpsNumerator\":%u,\"tpsDenominator\":%u,\"loops\":%u,\"frames\":[",
          info.have_animation?"true":"false", info.animation.tps_numerator, info.animation.tps_denominator, info.animation.num_loops);
      } else if(status==JXL_DEC_FRAME) {
        check(JxlDecoderGetFrameHeader(dec.get(), &frame));
      } else if(status==JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
        size_t bytes;
        check(JxlDecoderImageOutBufferSize(dec.get(), &format, &bytes));
        pixels.resize(bytes/sizeof(float));
        check(JxlDecoderSetImageOutBuffer(dec.get(), &format, pixels.data(), bytes));
      } else if(status==JXL_DEC_FULL_IMAGE) {
        std::printf("%s{\"duration\":%u,\"last\":%s,\"pixels\":[", count++?",":"", frame.duration, frame.is_last?"true":"false");
        for(size_t i=0;i<pixels.size();i++)std::printf("%s%.9g", i?",":"", pixels[i]);
        std::printf("]}");
      } else if(status==JXL_DEC_SUCCESS) {
        if(!count)throw std::runtime_error("no frames");
        std::printf("]}\n");
        return 0;
      } else throw std::runtime_error("decode failed/truncated");
    }
  } catch(const std::exception& e) {std::fprintf(stderr,"%s\n",e.what());return 1;}
}
