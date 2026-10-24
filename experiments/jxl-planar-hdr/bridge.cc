// MIT experiment: small C ABI over unmodified BSD libjxl, no image-file IO.
#include <jxl/encode.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <stdexcept>
#include <vector>
struct Config { uint32_t width,height,primaries,transfer; float intensity; };
struct Encoded { uint8_t* data; size_t size,callbacks,peak_rgb_bytes; };
using Fill = int (*)(void*,size_t,size_t,size_t,size_t,float*,size_t);
struct Source {
  void* opaque; Fill fill; Encoded& result;
  bool failed=false; size_t live=0;
  std::map<const void*,std::vector<float>> buffers;
};
static void format(void*,JxlPixelFormat* f) { *f={3,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0}; }
static const void* get(void* opaque,size_t x,size_t y,size_t w,size_t h,size_t* stride) noexcept {
  auto& s=*static_cast<Source*>(opaque);
  try {
    std::vector<float> pixels(w*h*3);
    if (s.fill(s.opaque,x,y,w,h,pixels.data(),pixels.size())) { s.failed=true; return nullptr; }
    s.live+=pixels.size()*sizeof(float);
    ++s.result.callbacks;
    s.result.peak_rgb_bytes=std::max(s.result.peak_rgb_bytes,s.live);
    *stride=w*3*sizeof(float); const void* p=pixels.data();
    s.buffers.emplace(p,std::move(pixels)); return p;
  } catch (...) { s.failed=true; return nullptr; }
}
static void release(void* opaque,const void* p) noexcept {
  auto& s=*static_cast<Source*>(opaque); auto it=s.buffers.find(p);
  if(it!=s.buffers.end()) { s.live-=it->second.size()*sizeof(float); s.buffers.erase(it); }
}
extern "C" int hdr_jxl_encode(const Config* c,void* opaque,Fill fill,const float* rgb,
                               Encoded* result,char* error,size_t error_size) {
  if(!c || !result || (!fill && !rgb)) return 1;
  *result={};
  try {
    auto check=[](JxlEncoderStatus s) { if(s!=JXL_ENC_SUCCESS) throw std::runtime_error("libjxl API/encoding failed"); };
    Source source{opaque,fill,*result,false,0,{}};
    std::unique_ptr<JxlEncoder,decltype(&JxlEncoderDestroy)> enc(JxlEncoderCreate(nullptr),JxlEncoderDestroy);
    if(!enc) throw std::runtime_error("encoder allocation failed");
    JxlBasicInfo info; JxlEncoderInitBasicInfo(&info);
    info.xsize=c->width; info.ysize=c->height; info.bits_per_sample=32;
    info.exponent_bits_per_sample=8; info.num_color_channels=3;
    info.uses_original_profile=JXL_TRUE; info.intensity_target=c->intensity;
    check(JxlEncoderSetBasicInfo(enc.get(),&info));
    JxlColorEncoding color; JxlColorEncodingSetToSRGB(&color,JXL_FALSE);
    color.primaries=static_cast<JxlPrimaries>(c->primaries);
    color.transfer_function=static_cast<JxlTransferFunction>(c->transfer);
    check(JxlEncoderSetColorEncoding(enc.get(),&color));
    auto* settings=JxlEncoderFrameSettingsCreate(enc.get(),nullptr);
    if(!settings) throw std::runtime_error("frame settings allocation failed");
    check(JxlEncoderSetFrameLossless(settings,JXL_TRUE));
    check(JxlEncoderFrameSettingsSetOption(settings,JXL_ENC_FRAME_SETTING_EFFORT,1));
    if(rgb) {
      JxlPixelFormat f{3,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0};
      check(JxlEncoderAddImageFrame(settings,&f,rgb,size_t(c->width)*c->height*3*sizeof(float)));
      JxlEncoderCloseInput(enc.get());
    } else {
      JxlChunkedFrameInputSource input{};
      input.opaque=&source; input.get_color_channels_pixel_format=format;
      input.get_color_channel_data_at=get; input.release_buffer=release;
      check(JxlEncoderAddChunkedFrame(settings,JXL_TRUE,input));
      if(source.failed) throw std::runtime_error("planar region conversion failed");
    }
    std::vector<uint8_t> out(4096); size_t used=0;
    for(;;) {
      auto* next=out.data()+used; size_t available=out.size()-used;
      auto status=JxlEncoderProcessOutput(enc.get(),&next,&available); used=out.size()-available;
      if(status==JXL_ENC_SUCCESS) break;
      if(status!=JXL_ENC_NEED_MORE_OUTPUT) throw std::runtime_error("libjxl output failed");
      out.resize(out.size()*2);
    }
    result->data=static_cast<uint8_t*>(std::malloc(used));
    if(!result->data) throw std::runtime_error("output allocation failed");
    std::memcpy(result->data,out.data(),used); result->size=used; return 0;
  } catch(const std::exception& e) {
    if(error && error_size) std::snprintf(error,error_size,"%s",e.what());
    return 1;
  }
}
extern "C" void hdr_jxl_free(Encoded* result) { if(result) { std::free(result->data); *result={}; } }
