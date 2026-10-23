// MIT. Narrow JS-facing ABI; the existing Rust session owns/validates the planes.
#include "../proof.h"
#include <hwy/targets.h>
#include <hwy/detect_targets.h>
#include <cstdlib>
static PlanarInput input{};
static PlanarEncoded output{};
static char error[512]{};
float wasm_distance=1;
int wasm_effort=3;
static double times[6]{};
static int validation=0;
extern "C" {
void w_options(int observe,int option) {planar_instrumentation(observe);validation=option;}
double w_time(int i){return times[i];}
void w_init(int w,int h,int format,int matrix,int full,float distance,int effort) {
  planar_free(&output); input={}; error[0]=0;
  input.width=w;input.height=h;input.format=format;input.matrix=matrix;
  input.depth=8;input.primaries=1;input.transfer=13;input.intensity=255;
  input.full_range=full;input.centered=1;wasm_distance=distance;wasm_effort=effort;
}
void w_plane(int c,const uint8_t* p,size_t size,size_t offset,size_t stride) {
  size_t sx=input.format==2?1:2, sy=(input.format==0||input.format==3)?2:1;
  input.planes[c]={p,size,offset,stride,c? (input.width+sx-1)/sx:input.width,
                   c?(input.height+sy-1)/sy:input.height};
}
// mode 0 fused; mode 1 same owned planes -> checked Rust planar_region -> RGB.
int w_encode(int mode) {
  PlanarSession* session=nullptr;
  for(auto& t:times)t=0;
  double start=planar_clock_ms();
  int status=planar_create_profile(&input,&session,mode==1 && validation==0?2:validation,times,error,sizeof(error));
  times[5]=times[2];
  times[2]=planar_clock_ms()-start;
  float* rgb=nullptr;
  if(!status && mode==1) {
    start=planar_clock_ms();
    size_t count=size_t(input.width)*input.height*3;
    rgb=static_cast<float*>(std::malloc(count*sizeof(float)));
    status=!rgb || planar_region(session,0,0,input.width,input.height,rgb,count);
    if(!status) planar_quantize_rgb(rgb,count);
    times[3]=planar_clock_ms()-start;
  }
  start=planar_clock_ms();
  if(!status) {
    if(mode==1) {
      PlanarRgbConfig c{input.width,input.height,1,13,255};
      status=rgb_encode(&c,rgb,size_t(input.width)*input.height*3,&output,error,sizeof(error));
    } else status=planar_encode(session,&output,error,sizeof(error));
  }
  times[4]=planar_clock_ms()-start;
  std::free(rgb);planar_destroy(session);return status;
}
int w_rgb(const float* p,size_t count) {
  PlanarRgbConfig c{input.width,input.height,1,13,255};
  for(auto& t:times)t=0;
  double start=planar_clock_ms();
  int status=rgb_encode(&c,p,count,&output,error,sizeof(error));
  times[4]=planar_clock_ms()-start;return status;
}
const char* w_error(){return error;}
const uint8_t* w_data(){return output.data;}
size_t w_size(){return output.size;}
size_t w_lanes(){return output.simd_lanes;}
const char* w_target(){return hwy::TargetName(HWY_STATIC_TARGET);}
void w_free(){planar_free(&output);}
}
