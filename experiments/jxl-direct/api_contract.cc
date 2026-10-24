#include <jxl/encode.h>
#include <cstdio>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <vector>
using Encoder = std::unique_ptr<JxlEncoder, decltype(&JxlEncoderDestroy)>;
void need(bool ok) { if (!ok) throw std::runtime_error("API contract failed"); }
Encoder encoder(int variant) {
  Encoder enc(JxlEncoderCreate(nullptr), JxlEncoderDestroy);
  need(bool(enc));
  if (variant == 1) return enc;  // uninitialized
  JxlBasicInfo b; JxlEncoderInitBasicInfo(&b);
  b.xsize = variant == 2 ? 2 : 1; b.ysize = 1;
  b.uses_original_profile = variant == 3 ? JXL_FALSE : JXL_TRUE;
  if (variant == 4) { b.alpha_bits = 8; b.num_extra_channels = 1; }
  if (variant == 5) b.have_animation = JXL_TRUE;
  if (variant == 6) b.orientation = JXL_ORIENT_ROTATE_180;
  if (variant == 8) b.intensity_target = 1000;
  need(JxlEncoderSetBasicInfo(enc.get(), &b) == JXL_ENC_SUCCESS);
  JxlColorEncoding color; JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
  if (variant == 7) color.transfer_function = JXL_TRANSFER_FUNCTION_709;
  need(JxlEncoderSetColorEncoding(enc.get(), &color) == JXL_ENC_SUCCESS);
  return enc;
}
int main(int argc, char** argv) {
  try {
    need(argc == 2);
    uint8_t y=128, u=128, v=128;
    JxlExperimentalYUVInput in{};
    in.width=in.height=1; in.bit_depth=8; in.format=2;
    in.matrix=6; in.primaries=1; in.transfer=13; in.full_range=in.centered=1;
    in.planes[0]={&y,1,0,1,1,1}; in.planes[1]={&u,1,0,1,1,1}; in.planes[2]={&v,1,0,1,1,1};
    need(JxlEncoderAddExperimentalYUVFrame(nullptr,&in)==JXL_ENC_ERROR);
    for (int variant=1;variant<=8;++variant) {
      auto enc=encoder(variant);
      need(JxlEncoderAddExperimentalYUVFrame(enc.get(),&in)==JXL_ENC_ERROR);
    }
    auto enc=encoder(0);
    need(JxlEncoderAddExperimentalYUVFrame(enc.get(),nullptr)==JXL_ENC_ERROR);
    need(JxlEncoderAddExperimentalYUVFrame(enc.get(),&in)==JXL_ENC_SUCCESS);
    // API must own copies; mutate all caller samples before encoding starts.
    y=0; u=0; v=255;
    need(JxlEncoderAddExperimentalYUVFrame(enc.get(),&in)==JXL_ENC_ERROR);
    std::vector<uint8_t> out(4096); auto* next=out.data(); size_t available=out.size();
    need(JxlEncoderProcessOutput(enc.get(),&next,&available)==JXL_ENC_SUCCESS);
    std::ofstream file(argv[1],std::ios::binary);
    file.write(reinterpret_cast<const char*>(out.data()),out.size()-available);
    need(bool(file));
    std::puts("API metadata/state/ownership checks passed");
  } catch(const std::exception& e) { std::fprintf(stderr,"%s\n",e.what()); return 1; }
}
