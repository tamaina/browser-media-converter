// Independent decoder check: retain the encoded orientation, and decode all pixels.
#include <jxl/decode.h>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <stdexcept>
#include <vector>
int main(int argc,char** argv) {
  try {
    if(argc!=2 && (argc!=3 || std::strcmp(argv[2],"--apply-orientation")!=0))
      throw std::runtime_error("usage: inspect-metadata input.jxl [--apply-orientation]");
    std::ifstream file(argv[1],std::ios::binary);
    if(!file)throw std::runtime_error("input open");
    std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),{}),pixels;
    std::unique_ptr<JxlDecoder,decltype(&JxlDecoderDestroy)> dec(JxlDecoderCreate(nullptr),JxlDecoderDestroy);
    if(!dec)throw std::runtime_error("decoder allocation");
    auto check=[](JxlDecoderStatus s){if(s!=JXL_DEC_SUCCESS)throw std::runtime_error("decoder API");};
    check(JxlDecoderSetKeepOrientation(dec.get(),argc==2?JXL_TRUE:JXL_FALSE));
    check(JxlDecoderSubscribeEvents(dec.get(),JXL_DEC_BASIC_INFO|JXL_DEC_FULL_IMAGE));
    check(JxlDecoderSetInput(dec.get(),data.data(),data.size()));
    JxlDecoderCloseInput(dec.get());
    JxlBasicInfo info{};JxlPixelFormat format{3,JXL_TYPE_UINT8,JXL_NATIVE_ENDIAN,0};
    bool complete=false;
    for(;;) {
      auto status=JxlDecoderProcessInput(dec.get());
      if(status==JXL_DEC_BASIC_INFO) {
        check(JxlDecoderGetBasicInfo(dec.get(),&info));
        if(uint64_t(info.xsize)*info.ysize>4194304)throw std::runtime_error("dimension cap");
      } else if(status==JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
        size_t size;check(JxlDecoderImageOutBufferSize(dec.get(),&format,&size));
        pixels.resize(size);check(JxlDecoderSetImageOutBuffer(dec.get(),&format,pixels.data(),size));
      } else if(status==JXL_DEC_FULL_IMAGE)complete=true;
      else if(status==JXL_DEC_SUCCESS)break;
      else throw std::runtime_error("decode failed/truncated");
    }
    if(!complete)throw std::runtime_error("no complete image");
    std::printf("{\"width\":%u,\"height\":%u,\"orientation\":%d}\n",info.xsize,info.ysize,int(info.orientation));
  } catch(const std::exception& e){std::fprintf(stderr,"%s\n",e.what());return 1;}
}
