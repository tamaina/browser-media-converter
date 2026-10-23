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
extern "C" {
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
int w_encode() {
  PlanarSession* session=nullptr;
  int status=planar_create(&input,&session,error,sizeof(error));
  if(!status) status=planar_encode(session,&output,error,sizeof(error));
  planar_destroy(session);return status;
}
int w_rgb(const float* p,size_t count) {
  PlanarRgbConfig c{input.width,input.height,1,13,255};
  return rgb_encode(&c,p,count,&output,error,sizeof(error));
}
const char* w_error(){return error;}
const uint8_t* w_data(){return output.data;}
size_t w_size(){return output.size;}
size_t w_lanes(){return output.simd_lanes;}
const char* w_target(){return hwy::TargetName(HWY_STATIC_TARGET);}
void w_free(){planar_free(&output);}
}
