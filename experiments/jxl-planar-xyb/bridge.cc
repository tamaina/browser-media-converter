// MIT experiment: small C ABI over patched BSD libjxl, no image-file IO.
#include <jxl/encode.h>
#include <algorithm>
#include <chrono>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif
static bool instrumentation=true;
// Experiment-only capture switch, used by the separate Chrome diagnostic runner.
static bool diagnostics=false;
extern "C" void bridge_diagnostics(int enabled) { diagnostics=enabled!=0; }
extern "C" void bridge_instrumentation(int enabled) { instrumentation=enabled!=0; }
extern "C" double planar_clock_ms() {
#ifdef __EMSCRIPTEN__
  return emscripten_get_now();
#else
  return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
#endif
}
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <stdexcept>
#include <vector>
#include "source_icc.h"
// Experiment ABI is synchronous, one caller per instance (as with diagnostics).
static thread_local const uint8_t* source_profile=nullptr;
static thread_local size_t source_profile_size=0;
static thread_local int source_profile_path=0;
static thread_local int source_profile_header=0;
static thread_local int header_mode=0;
extern "C" void bridge_icc_header_mode(int mode) {header_mode=mode;}
extern "C" void bridge_icc(const uint8_t* p,size_t n) {source_profile=p;source_profile_size=n;source_profile_path=0;}
extern "C" int bridge_icc_path() {return source_profile_path;}
extern "C" int bridge_icc_header() {return source_profile_header;}
struct Config { uint32_t width,height,primaries,transfer; float intensity; uint32_t depth; };
struct Encoded { uint8_t* data; size_t size,callbacks,peak_rgb_bytes; uint64_t xyb_hash; float* xyb_data; size_t xyb_count; double conversion_ms; size_t simd_lanes; };
using Fill = int (*)(void*,size_t,size_t,size_t,size_t,float*,size_t);
struct Source {
  void* opaque; Fill fill; Encoded& result;
  bool failed=false; size_t live=0;
  bool gray=false;
  std::vector<float> captured;
  size_t capture_width=0,capture_height=0;
  std::vector<uint8_t> captured_pixels;
  std::map<const void*,std::vector<float>> buffers;
};
#ifdef __EMSCRIPTEN__
extern float wasm_distance;
extern int wasm_effort;
#endif
static void format(void* opaque,JxlPixelFormat* f) { *f={static_cast<Source*>(opaque)->gray?1u:3u,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0}; }
static const void* get(void* opaque,size_t x,size_t y,size_t w,size_t h,size_t* stride) noexcept {
  auto& s=*static_cast<Source*>(opaque);
  try {
    std::vector<float> pixels(w*h*3);
    if (s.fill(s.opaque,x,y,w,h,pixels.data(),pixels.size())) { s.failed=true; return nullptr; }
    if(s.gray) {for(size_t i=0;i<w*h;i++)pixels[i]=pixels[i*3];pixels.resize(w*h);}
    s.live+=pixels.size()*sizeof(float);
    ++s.result.callbacks;
    s.result.peak_rgb_bytes=std::max(s.result.peak_rgb_bytes,s.live);
    *stride=w*(s.gray?1:3)*sizeof(float); const void* p=pixels.data();
    s.buffers.emplace(p,std::move(pixels)); return p;
  } catch (...) { s.failed=true; return nullptr; }
}
static int row(void* opaque,size_t x,size_t y,size_t w,float* r,float* g,float* b) noexcept {
  auto& s=*static_cast<Source*>(opaque);
  try {
    std::vector<float> pixels(w*3);
    if(s.fill(s.opaque,x,y,w,1,pixels.data(),pixels.size())) return 1;
    ++s.result.callbacks;
    // Packed row plus encoder's three planar scratch rows, excluding padding.
    s.result.peak_rgb_bytes=std::max(s.result.peak_rgb_bytes,w*6*sizeof(float));
    for(size_t i=0;i<w;++i) { r[i]=pixels[3*i];g[i]=pixels[3*i+1];b[i]=pixels[3*i+2]; }
    return 0;
  } catch(...) { return 1; }
}
static void observe(void* opaque,size_t row_x,size_t row_y,size_t w,const float* x,const float* y,const float* b) {
  auto& source=*static_cast<Source*>(opaque);
  auto& hash=source.result.xyb_hash;
  if(diagnostics || std::getenv("JXL_EXPERIMENT_CAPTURE_XYB")) {
    // Streaming patches overlap in both axes. Capture absolute pixel coordinates,
    // rather than appending callback order (which overcounts tiled images).
    if(row_x>source.capture_width || w>source.capture_width-row_x || row_y>=source.capture_height)
      throw std::runtime_error("XYB capture bounds: y="+std::to_string(row_y)+" w="+std::to_string(w)+" expected="+std::to_string(source.capture_width)+"x"+std::to_string(source.capture_height));
    if(source.captured.empty()) {
      source.captured.resize(source.capture_width*source.capture_height*3);
      source.captured_pixels.resize(source.capture_width*source.capture_height);
    }
    size_t channel=0;
    for(auto* p:{x,y,b}) {
      float* dest=source.captured.data()+(row_y*3+channel++)*source.capture_width+row_x;
      for(size_t i=0;i<w;++i) if(source.captured_pixels[row_y*source.capture_width+row_x+i] && p[i]!=dest[i])
        throw std::runtime_error("overlapping XYB capture differs");
      std::copy_n(p,w,dest);
    }
    std::fill_n(source.captured_pixels.data()+row_y*source.capture_width+row_x,w,1);
  }
  for(auto* p:{x,y,b}) for(size_t i=0;i<w;++i) {
    uint32_t bits; std::memcpy(&bits,p+i,4);
    for(int k=0;k<4;++k) { hash^=(bits>>(8*k))&255;hash*=1099511628211ULL; }
  }
}
static void release(void* opaque,const void* p) noexcept {
  auto& s=*static_cast<Source*>(opaque); auto it=s.buffers.find(p);
  if(it!=s.buffers.end()) { s.live-=it->second.size()*sizeof(float); s.buffers.erase(it); }
}
extern "C" int hdr_jxl_encode(const Config* c,void* opaque,Fill fill,const float* rgb,const JxlExperimentalYuv* yuv,
                               Encoded* result,char* error,size_t error_size) {
  if(!c || !result || (!fill && !rgb)) return 1;
  *result={}; result->xyb_hash=14695981039346656037ULL;
  try {
    auto check=[](JxlEncoderStatus s) { if(s!=JXL_ENC_SUCCESS) throw std::runtime_error("libjxl API/encoding failed"); };
    Source source{opaque,fill,*result,false,0,false,{},0,0,{}, {}};
    std::unique_ptr<source_icc::Profile> profile;
    if(source_profile) {
      profile=std::make_unique<source_icc::Profile>(source_profile,source_profile_size);
      if(!profile->error.empty())throw std::runtime_error("ICC: "+profile->error);
      source_profile_path=profile->gray?3:profile->matrix?1:2;
      source.gray=profile->gray;
      if(source.gray && header_mode>1)throw std::runtime_error("ICC: Gray profiles cannot select an RGB header target");
      if(source.gray && !profile->matrix)throw std::runtime_error("ICC: Gray requires a supported kTRC curve");
      if(source.gray && rgb)for(size_t i=0;i<size_t(c->width)*c->height;i++)
        if(rgb[i*3]!=rgb[i*3+1] || rgb[i*3]!=rgb[i*3+2])throw std::runtime_error("ICC: Gray profile requires R=G=B");
    }
    source.capture_width=c->width;source.capture_height=c->height;
    std::unique_ptr<JxlEncoder,decltype(&JxlEncoderDestroy)> enc(JxlEncoderCreate(nullptr),JxlEncoderDestroy);
    if(!enc) throw std::runtime_error("encoder allocation failed");
    JxlBasicInfo info; JxlEncoderInitBasicInfo(&info);
    info.xsize=c->width; info.ysize=c->height; info.bits_per_sample=c->depth ? c->depth : 32;
    info.exponent_bits_per_sample=c->depth ? 0 : 8; info.num_color_channels=source.gray?1:3;
    info.uses_original_profile=JXL_FALSE; info.intensity_target=c->intensity;
    check(JxlEncoderSetBasicInfo(enc.get(),&info));
    JxlColorEncoding color; JxlColorEncodingSetToSRGB(&color,JXL_FALSE);
    color.primaries=static_cast<JxlPrimaries>(c->primaries);
    if(c->primaries==5 || c->primaries==6) {
      color.primaries=JXL_PRIMARIES_CUSTOM;
      const double xy[2][6]={{.64,.33,.29,.60,.15,.06},{.630,.340,.310,.595,.155,.070}};
      const auto& p=xy[c->primaries==6];
      color.primaries_red_xy[0]=p[0];color.primaries_red_xy[1]=p[1];
      color.primaries_green_xy[0]=p[2];color.primaries_green_xy[1]=p[3];
      color.primaries_blue_xy[0]=p[4];color.primaries_blue_xy[1]=p[5];
    }
    // Internal code 1 is display-referred BT.1886 (Lb=0), not CICP 1.
    color.transfer_function=c->transfer==1 ? JXL_TRANSFER_FUNCTION_GAMMA :
        static_cast<JxlTransferFunction>(c->transfer==1001 ? 1 : c->transfer);
    if(c->transfer==1) color.gamma=1.0/2.4; // encoded = linear^gamma
    if(source_profile) {
      if(JxlEncoderSetICCProfile(enc.get(),source_profile,source_profile_size)!=JXL_ENC_SUCCESS)
        throw std::runtime_error("ICC: libjxl CMS rejected the profile");
      if(header_mode==1 || (header_mode && !source.gray))JxlEncoderExperimentalICCHeader(enc.get(),header_mode);
      source_profile_header=JxlEncoderExperimentalWantICC(enc.get());
    } else check(JxlEncoderSetColorEncoding(enc.get(),&color));
    auto* settings=JxlEncoderFrameSettingsCreate(enc.get(),nullptr);
    if(!settings) throw std::runtime_error("frame settings allocation failed");
    #ifdef __EMSCRIPTEN__
    check(JxlEncoderSetFrameDistance(settings,wasm_distance));
    check(JxlEncoderFrameSettingsSetOption(settings,JXL_ENC_FRAME_SETTING_EFFORT,wasm_effort));
#else
    check(JxlEncoderSetFrameDistance(settings,std::getenv("JXL_EXPERIMENT_DISTANCE")?std::strtof(std::getenv("JXL_EXPERIMENT_DISTANCE"),nullptr):1.0f));
    check(JxlEncoderFrameSettingsSetOption(settings,JXL_ENC_FRAME_SETTING_EFFORT,3));
#endif
    bool observed_reference=rgb && (source.gray || diagnostics || std::getenv("JXL_EXPERIMENT_OBSERVE_REFERENCE"));
    struct RGB { const float* p;size_t width; } reference{rgb,c->width};
    if(observed_reference) {
      source.opaque=&reference;
      source.fill=[](void* o,size_t x,size_t y,size_t w,size_t h,float* out,size_t)->int {
        auto& r=*static_cast<RGB*>(o);
        for(size_t j=0;j<h;++j) std::copy_n(r.p+((y+j)*r.width+x)*3,w*3,out+j*w*3);
        return 0;
      };
    }
    if(rgb && !observed_reference) {
      JxlPixelFormat f{3,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0};
      check(JxlEncoderAddImageFrame(settings,&f,rgb,size_t(c->width)*c->height*3*sizeof(float)));
      JxlEncoderCloseInput(enc.get());
    } else {
      JxlChunkedFrameInputSource input{};
      input.opaque=&source; input.get_color_channels_pixel_format=format;
      input.get_color_channel_data_at=get; input.release_buffer=release;
      input.experimental_borrowed=true;
      input.experimental_fill_row=(observed_reference || !yuv)?nullptr:row;
      input.experimental_observe_xyb=instrumentation?observe:nullptr;
      input.experimental_conversion_ms=&result->conversion_ms;
      input.experimental_simd_lanes=&result->simd_lanes;
      input.experimental_yuv=std::getenv("JXL_EXPERIMENT_DISABLE_FUSED")?nullptr:yuv;
      if(input.experimental_yuv && (c->transfer==13 || c->transfer==1 || c->transfer==1001 || c->transfer==8))
        input.experimental_fill_row=nullptr;
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
    std::memcpy(result->data,out.data(),used); result->size=used;
    if(!source.captured.empty()) {
      if(std::find(source.captured_pixels.begin(),source.captured_pixels.end(),0)!=source.captured_pixels.end())
        throw std::runtime_error("incomplete XYB capture");
      result->xyb_count=source.captured.size();
      result->xyb_data=static_cast<float*>(std::malloc(result->xyb_count*sizeof(float)));
      if(!result->xyb_data) { std::free(result->data);*result={};throw std::runtime_error("capture allocation"); }
      std::copy(source.captured.begin(),source.captured.end(),result->xyb_data);
    }
    return 0;
  } catch(const std::exception& e) {
    if(error && error_size) std::snprintf(error,error_size,"%s",e.what());
    return 1;
  }
}
extern "C" void hdr_jxl_free(Encoded* result) { if(result) { std::free(result->data); std::free(result->xyb_data); *result={}; } }

// Borrow integer samples through ProcessOutput; no full-frame float allocation.
extern "C" int bridge_rgb_integer(const Config* c,const void* data,size_t count,
    int depth,int channels,Encoded* result,char* error,size_t error_size) {
  auto bad=[&](const char* text){if(error && error_size)std::snprintf(error,error_size,"%s",text);return 1;};
  if(!c || !data || !result || (depth!=8 && depth!=16) || (channels!=3 && channels!=4) ||
     !c->width || !c->height || c->width>8192 || c->height>8192 || size_t(c->width)*c->height>4194304 ||
     count!=size_t(c->width)*c->height*channels)return bad("RGB integer layout/dimension limit");
  const bool gray=source_profile && source_profile_size>=20 && !std::memcmp(source_profile+16,"GRAY",4);
  const auto sample=[&](size_t i)->unsigned{return depth==8?static_cast<const uint8_t*>(data)[i]:static_cast<const uint16_t*>(data)[i];};
  const unsigned maximum=depth==8?255:65535;
  if(channels==4 || gray)for(size_t i=0;i<size_t(c->width)*c->height;i++) {
    if(channels==4 && sample(i*4+3)!=maximum)return bad("alpha unsupported: RGBA must be fully opaque");
    if(gray && (sample(i*channels)!=sample(i*channels+1) || sample(i*channels)!=sample(i*channels+2)))return bad("ICC: Gray profile requires R=G=B");
  }
  // Double division then float cast exactly reproduces JS Float32Array assignment.
  static const auto u8=[] {std::array<float,256> a{};for(size_t i=0;i<a.size();i++)a[i]=float(double(i)/255.0);return a;}();
  static const auto u16=[] {std::vector<float> a(65536);for(size_t i=0;i<a.size();i++)a[i]=float(double(i)/65535.0);return a;}();
  struct Integer {const void* p;size_t width;int channels,depth;const float* lut;} in{data,c->width,channels,depth,depth==8?u8.data():u16.data()};
  const auto fill=[](void* opaque,size_t x,size_t y,size_t w,size_t h,float* out,size_t)->int {
    const auto& in=*static_cast<Integer*>(opaque);
    for(size_t j=0;j<h;j++)for(size_t i=0;i<w;i++)for(size_t k=0;k<3;k++) {
      const size_t at=((y+j)*in.width+x+i)*in.channels+k;
      const unsigned v=in.depth==8?static_cast<const uint8_t*>(in.p)[at]:static_cast<const uint16_t*>(in.p)[at];
      out[(j*w+i)*3+k]=in.lut[v];
    }
    return 0;
  };
  return hdr_jxl_encode(c,&in,fill,nullptr,nullptr,result,error,error_size);
}
