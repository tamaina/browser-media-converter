// MIT. Narrow JS-facing ABI; the existing Rust session owns/validates the planes.
#include "../proof.h"
#include <hwy/targets.h>
#include <hwy/detect_targets.h>
#include <cstdlib>
// Internal transfer codes: 1 = BT.1886 Lb=0; 13 = sRGB; 1001 = inverse709.
static PlanarInput input{};
static PlanarEncoded output{};
static char error[512]{};
float wasm_distance=1;
int wasm_effort=3;
static double times[6]{};
static int validation=0;
static int output_depth=8;
extern "C" void bridge_diagnostics(int);
extern "C" void bridge_icc(const uint8_t*,size_t);
extern "C" int bridge_icc_path();
extern "C" int bridge_icc_header();
extern "C" void bridge_icc_header_mode(int);
extern "C" int bridge_rgb_integer(const PlanarRgbConfig*,const void*,size_t,int,int,PlanarEncoded*,char*,size_t);
extern "C" {
void w_icc_header_mode(int mode) {bridge_icc_header_mode(mode);}
void w_icc(const uint8_t* p,size_t n) {bridge_icc(p,n);}
int w_icc_path() {return bridge_icc_path();}
int w_icc_header() {return bridge_icc_header();}
void w_diagnostics(int enabled) { bridge_diagnostics(enabled); }
const float* w_xyb_data(){return output.xyb_data;}
size_t w_xyb_count(){return output.xyb_count;}
void w_options(int observe,int option) {planar_instrumentation(observe);validation=option;}
double w_time(int i){return i==6?output.conversion_ms:times[i];}
void w_init(int w,int h,int format,int matrix,int full,float distance,int effort,int depth,int out_depth,int transfer,int siting,int primaries) {
  planar_free(&output); input={}; error[0]=0;
  bridge_icc(nullptr,0);bridge_icc_header_mode(0);
  input.width=w;input.height=h;input.format=format;input.matrix=matrix;
  input.depth=depth;input.storage=depth==8?0:1;output_depth=out_depth;input.primaries=primaries;input.transfer=transfer;input.intensity=255;
  input.full_range=full;input.siting=siting;wasm_distance=distance;wasm_effort=effort;
}
void w_plane(int c,const uint8_t* p,size_t size,size_t offset,size_t stride) {
  size_t sx=input.format==2?1:2, sy=(input.format==0||input.format==3)?2:1;
  input.planes[c]={p,size,offset,stride,c? (input.width+sx-1)/sx:input.width,
                   c?(input.height+sy-1)/sy:input.height};
}
// mode 0 fused; mode 1 rounded RGB; diagnostic mode 2 unrounded scalar RGB.
int w_encode(int mode) {
  PlanarSession* session=nullptr;
  for(auto& t:times)t=0;
  double start=planar_clock_ms();
  int status=planar_create_profile(&input,&session,mode!=0 && validation==0?2:validation,times,error,sizeof(error));
  if(!status) status=planar_set_bit_depth(session,output_depth);
  times[5]=times[2];
  times[2]=planar_clock_ms()-start;
  float* rgb=nullptr;
  if(!status && mode!=0) {
    start=planar_clock_ms();
    size_t count=size_t(input.width)*input.height*3;
    rgb=static_cast<float*>(std::malloc(count*sizeof(float)));
    status=!rgb || planar_region(session,0,0,input.width,input.height,rgb,count);
    if(!status && mode==1) planar_quantize_rgb_depth(rgb,count,input.depth);
    times[3]=planar_clock_ms()-start;
  }
  start=planar_clock_ms();
  if(!status) {
    if(mode!=0) {
      PlanarRgbConfig c{input.width,input.height,input.primaries,input.transfer,255,uint32_t(output_depth)};
      status=rgb_encode(&c,rgb,size_t(input.width)*input.height*3,&output,error,sizeof(error));
    } else status=planar_encode(session,&output,error,sizeof(error));
  }
  times[4]=planar_clock_ms()-start;
  std::free(rgb);planar_destroy(session);return status;
}
int w_rgb(const float* p,size_t count) {
  PlanarRgbConfig c{input.width,input.height,input.primaries,input.transfer,255,uint32_t(output_depth)};
  for(auto& t:times)t=0;
  double start=planar_clock_ms();
  int status=rgb_encode(&c,p,count,&output,error,sizeof(error));
  times[4]=planar_clock_ms()-start;return status;
}
int w_rgb_integer(const void* p,size_t count,int depth,int channels) {
  PlanarRgbConfig c{input.width,input.height,input.primaries,input.transfer,255,uint32_t(output_depth)};
  for(auto& t:times)t=0;
  const double start=planar_clock_ms();
  const int status=bridge_rgb_integer(&c,p,count,depth,channels,&output,error,sizeof(error));
  times[4]=planar_clock_ms()-start;return status;
}
const char* w_error(){return error;}
const uint8_t* w_data(){return output.data;}
size_t w_size(){return output.size;}
size_t w_lanes(){return output.simd_lanes;}
const char* w_target(){return hwy::TargetName(HWY_STATIC_TARGET);}
void w_free(){planar_free(&output);bridge_icc(nullptr,0);}
}
