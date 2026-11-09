// Verify the un-oriented codestream header independently of the JS encoder.
#include <jxl/decode.h>
#include <jxl/encode.h>
#include <memory>
#include <string>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>
int main(int argc,char** argv) {
  const bool encode=argc==4 && std::string(argv[1])=="--encode";
  if(argc!=2 && !encode) return 2;
  std::ifstream file(argv[encode?2:1],std::ios::binary);
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)),{});
  if(encode) {
    std::unique_ptr<JxlEncoder,decltype(&JxlEncoderDestroy)> enc(JxlEncoderCreate(nullptr),JxlEncoderDestroy);
    if(!enc || JxlEncoderStoreJPEGMetadata(enc.get(),JXL_TRUE)!=JXL_ENC_SUCCESS) return 1;
    auto* settings=JxlEncoderFrameSettingsCreate(enc.get(),nullptr);
    if(!settings || JxlEncoderAddJPEGFrame(settings,bytes.data(),bytes.size())!=JXL_ENC_SUCCESS) return 1;
    JxlEncoderCloseInput(enc.get());
    std::vector<uint8_t> output(4096);
    size_t used=0;
    for(;;) {
      auto* next=output.data()+used;
      size_t available=output.size()-used;
      auto status=JxlEncoderProcessOutput(enc.get(),&next,&available);
      used=output.size()-available;
      if(status==JXL_ENC_SUCCESS) break;
      if(status!=JXL_ENC_NEED_MORE_OUTPUT) return 1;
      output.resize(output.size()*2);
    }
    std::ofstream destination(argv[3],std::ios::binary);
    destination.write(reinterpret_cast<const char*>(output.data()),used);
    return destination?0:1;
  }
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
