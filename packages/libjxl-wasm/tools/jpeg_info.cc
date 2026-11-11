// Verify the un-oriented codestream header independently of the JS encoder.
#include <jxl/decode.h>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>
int main(int argc,char** argv) {
  if(argc!=2) return 2;
  std::ifstream file(argv[1],std::ios::binary);
  if(!file) {std::fprintf(stderr,"cannot open input: %s\n",argv[1]);return 2;}
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)),{});
  JxlDecoder* dec=JxlDecoderCreate(nullptr);
  if(!dec) return 1;
  int result=1;
  if(JxlDecoderSetKeepOrientation(dec,JXL_TRUE)==JXL_DEC_SUCCESS &&
     JxlDecoderSubscribeEvents(dec,JXL_DEC_BASIC_INFO)==JXL_DEC_SUCCESS &&
     JxlDecoderSetInput(dec,bytes.data(),bytes.size())==JXL_DEC_SUCCESS &&
     JxlDecoderProcessInput(dec)==JXL_DEC_BASIC_INFO) {
    JxlBasicInfo info;
    if(JxlDecoderGetBasicInfo(dec,&info)==JXL_DEC_SUCCESS) {
      std::printf("%u %u %u %d\n",info.xsize,info.ysize,
                  static_cast<unsigned>(info.orientation),info.uses_original_profile);
      result=0;
    }
  }
  JxlDecoderDestroy(dec);
  return result;
}
