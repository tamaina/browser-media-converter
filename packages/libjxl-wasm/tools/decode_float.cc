// Independent process using the unmodified libjxl decoder; no adapter linked.
#include <jxl/decode.h>
#include <jxl/cms.h>
#include <jxl/encode.h>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <vector>
int main(int argc,char** argv) {
  try {
    if(argc!=3 && argc!=4) throw std::runtime_error("usage: decode input.jxl output.f32le");
    std::ifstream file(argv[1],std::ios::binary);
    if(!file) throw std::runtime_error("input open");
    std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),{});std::vector<float> rgb;
    std::unique_ptr<JxlDecoder,decltype(&JxlDecoderDestroy)> dec(JxlDecoderCreate(nullptr),JxlDecoderDestroy);
    auto check=[](JxlDecoderStatus s) {if(s!=JXL_DEC_SUCCESS) throw std::runtime_error("decoder API");};
    check(JxlDecoderSubscribeEvents(dec.get(),JXL_DEC_BASIC_INFO|JXL_DEC_COLOR_ENCODING|JXL_DEC_FULL_IMAGE));
    check(JxlDecoderSetInput(dec.get(),data.data(),data.size()));JxlDecoderCloseInput(dec.get());
    JxlBasicInfo info{};JxlPixelFormat fmt{3,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0};bool complete=false;
    for(;;) {
      auto status=JxlDecoderProcessInput(dec.get());
      if(status==JXL_DEC_BASIC_INFO) {
        check(JxlDecoderGetBasicInfo(dec.get(),&info));
        if(uint64_t(info.xsize)*info.ysize>4194304 || (info.num_color_channels!=3 && info.num_color_channels!=1) || info.alpha_bits) throw std::runtime_error("shape");
      } else if(status==JXL_DEC_COLOR_ENCODING) {
        if(argc==4 && std::strcmp(argv[3],"--icc")==0) {
          size_t n=0;check(JxlDecoderGetICCProfileSize(dec.get(),JXL_COLOR_PROFILE_TARGET_ORIGINAL,&n));
          std::vector<uint8_t> icc(n);check(JxlDecoderGetColorAsICCProfile(dec.get(),JXL_COLOR_PROFILE_TARGET_ORIGINAL,icc.data(),icc.size()));
          std::ofstream out(argv[2],std::ios::binary);out.write(reinterpret_cast<const char*>(icc.data()),icc.size());
          if(!out)throw std::runtime_error("ICC output write");
          return 0;
        }
        JxlColorEncoding original{},pixels{};
        const bool enum_header=JxlDecoderGetColorAsEncodedProfile(dec.get(),JXL_COLOR_PROFILE_TARGET_ORIGINAL,&original)==JXL_DEC_SUCCESS;
        const bool source_icc=argc==4 && std::strcmp(argv[3],"--source-icc")==0;
        JxlColorEncoding desired=original;
        if(source_icc) {
          size_t n=0;check(JxlDecoderGetICCProfileSize(dec.get(),JXL_COLOR_PROFILE_TARGET_ORIGINAL,&n));
          std::vector<uint8_t> icc(n);check(JxlDecoderGetColorAsICCProfile(dec.get(),JXL_COLOR_PROFILE_TARGET_ORIGINAL,icc.data(),n));
          check(JxlDecoderSetCms(dec.get(),*JxlGetDefaultCms()));
          check(JxlDecoderSetOutputColorProfile(dec.get(),nullptr,icc.data(),n));
        }
        if(argc==4 && !source_icc) {
          if(std::strcmp(argv[3],"--linear-source")==0) {if(!enum_header)throw std::runtime_error("linear-source requires enum header");desired.transfer_function=JXL_TRANSFER_FUNCTION_LINEAR;}
          else if(std::strcmp(argv[3],"--linear709")==0) JxlColorEncodingSetToLinearSRGB(&desired,info.num_color_channels==1);
          else if(std::strcmp(argv[3],"--srgb")==0) JxlColorEncodingSetToSRGB(&desired,info.num_color_channels==1);
          else throw std::runtime_error("unknown output encoding");
        }
        if(!source_icc && (argc==4 || enum_header))check(JxlDecoderSetPreferredColorProfile(dec.get(),&desired));
        const bool enum_data=JxlDecoderGetColorAsEncodedProfile(dec.get(),JXL_COLOR_PROFILE_TARGET_DATA,&pixels)==JXL_DEC_SUCCESS;
        if(!enum_data && argc==4 && !source_icc)throw std::runtime_error("requested enum data profile unavailable");
        if(!enum_header)std::fprintf(stderr,"Original header: ICC\n");
        std::printf("{\"width\":%u,\"height\":%u,\"bits\":%u,\"exponent\":%u,\"primaries\":%d,\"transfer\":%d,\"dataPrimaries\":%d,\"dataTransfer\":%d,\"intensity\":%.9g}\n",info.xsize,info.ysize,info.bits_per_sample,info.exponent_bits_per_sample,int(original.primaries),int(original.transfer_function),int(pixels.primaries),int(pixels.transfer_function),info.intensity_target);
      } else if(status==JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
        size_t size;check(JxlDecoderImageOutBufferSize(dec.get(),&fmt,&size));rgb.resize(size/sizeof(float));
        check(JxlDecoderSetImageOutBuffer(dec.get(),&fmt,rgb.data(),size));
      } else if(status==JXL_DEC_FULL_IMAGE) complete=true;
      else if(status==JXL_DEC_SUCCESS) break;
      else throw std::runtime_error("decode failed/truncated");
    }
    if(!complete) throw std::runtime_error("no complete image");
    std::ofstream out(argv[2],std::ios::binary);
    for(float value:rgb) {uint32_t bits;std::memcpy(&bits,&value,4);for(int b=0;b<4;++b) out.put(char((bits>>(b*8))&255));}
    if(!out) throw std::runtime_error("output write");
  } catch(const std::exception& e) {std::fprintf(stderr,"%s\n",e.what());return 1;}
}
