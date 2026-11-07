#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct { const uint8_t* data; size_t size,offset,stride,width,height; } PlanarPlane;
typedef struct {
  uint32_t width,height,format,depth,storage,matrix,primaries,transfer,full_range,siting,origin_x,origin_y;
  float intensity;
  PlanarPlane planes[3];
} PlanarInput;
// siting=0 left (default),1 center,2 topleft; ignored on unsubsampled axes.
// format=0 I420,1 I422,2 I444,3 NV12; storage=0 U8,1 U16LE low bits.
// matrix=1 BT709,6 BT601,9 BT2020-NCL; primaries=1 BT709,5 BT470BG,6 SMPTE-C,11 P3,9 BT2020.
// Internal transfer: 1=BT.1886 gamma2.4 (BT709 default), 8=linear, 13=sRGB,
// 1001=inverse BT709 OETF; 16=PQ,18=HLG. See WASM.md for policy options.
// depth=0 retains float32 header (32 bits, 8 exponent); otherwise integer 8/10/12.
typedef struct { uint32_t width,height,primaries,transfer; float intensity; uint32_t depth; } PlanarRgbConfig;
typedef struct { uint8_t* data; size_t size,callbacks,peak_rgb_bytes; uint64_t xyb_hash; float* xyb_data; size_t xyb_count; double conversion_ms; size_t simd_lanes; } PlanarEncoded;
typedef struct PlanarSession PlanarSession;
// All caller pointer/length pairs must be valid. create copies admitted samples;
// the session owns them. One caller at a time per session; no concurrent destroy.
int planar_create(const PlanarInput*,PlanarSession**,char* error,size_t error_size);
void planar_instrumentation(int enabled);
void planar_quantize_rgb(float* rgb,size_t count);
// Caller supplies depth 8/10/12 and count writable floats.
void planar_quantize_rgb_depth(float* rgb,size_t count,uint32_t depth);
double planar_clock_ms();
// timings: three doubles: copy/layout, total preflight, stored-sample subset.
// option 0 SDR clipping; 1 strict rejection; 2 RGB conversion only (SDR clipping).
int planar_create_profile(const PlanarInput*,PlanarSession**,uint32_t option,double* timings,char* error,size_t error_size);
// Output signalling: 0=float32, or integer 8/10/12; source samples unchanged.
int planar_set_bit_depth(PlanarSession*,uint32_t depth);
void planar_destroy(PlanarSession*);
int planar_region(PlanarSession*,size_t x,size_t y,size_t width,size_t height,float* rgb,size_t float_count);
int planar_encode(PlanarSession*,PlanarEncoded*,char* error,size_t error_size);
int rgb_encode(const PlanarRgbConfig*,const float* rgb,size_t float_count,PlanarEncoded*,char* error,size_t error_size);
void planar_free(PlanarEncoded*);
#ifdef __cplusplus
}
#endif
