// MIT Linux-only guard-page test for the experimental source callback ABI.
// Each raw YUV plane ends immediately before PROT_NONE. No Rust compact copy.
#include "bridge.cc"
#include <sys/mman.h>
#include <unistd.h>
struct Guard {
  uint8_t* allocation; uint8_t* data; size_t page,size;
  explicit Guard(size_t bytes):page(size_t(sysconf(_SC_PAGESIZE))),size(bytes) {
    if(bytes>page) throw std::runtime_error("guard input too large");
    allocation=static_cast<uint8_t*>(mmap(nullptr,page*2,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0));
    if(allocation==MAP_FAILED || mprotect(allocation+page,page,PROT_NONE)) throw std::runtime_error("mmap/mprotect");
    data=allocation+page-bytes;
  }
  ~Guard() { munmap(allocation,page*2); }
};
int main() {
  try {
    size_t cases=0;
    setenv("JXL_EXPERIMENT_CAPTURE_XYB","1",1);
    setenv("JXL_EXPERIMENT_OBSERVE_REFERENCE","1",1);
    for(uint32_t depth:{8u,10u,12u}) for(uint32_t sx:{1u,2u}) for(uint32_t sy:{1u,2u}) {
      for(bool clipped:{false,true}) for(uint32_t width=1;width<=33;++width) {
        const uint32_t height=3;
        const size_t bytes=depth==8?1:2,cw=(width+sx-1)/sx,ch=(height+sy-1)/sy;
        Guard y(width*height*bytes),u(cw*ch*bytes),v(cw*ch*bytes);
        const uint32_t value=1u<<(depth-1);
        for(auto* g:{&y,&u,&v}) for(size_t i=0;i<g->size;i+=bytes) {
          const uint32_t sample=!clipped?value:g!=&y?(1u<<depth)-1:(i/bytes/width==0?0:i/bytes/width==1?value:(1u<<depth)-1);
          g->data[i]=uint8_t(sample);if(bytes==2) g->data[i+1]=uint8_t(sample>>8);
        }
        JxlExperimentalYuv raw{{{y.data,y.size,width*bytes,width,height},
                                {u.data,u.size,cw*bytes,cw,ch},
                                {v.data,v.size,cw*bytes,cw,ch}},width,height,depth,1,1,sx,sy};
        Config config{width,height,1,13,255};Encoded out{};char error[256]{};
        auto unused=[](void*,size_t,size_t,size_t,size_t,float*,size_t)->int{return 1;};
        if(hdr_jxl_encode(&config,nullptr,unused,nullptr,&raw,&out,error,sizeof(error))) throw std::runtime_error(error);
        if(out.simd_lanes!=4 || out.callbacks || out.peak_rgb_bytes || !out.size) throw std::runtime_error("fused path not used");
        const double maximum=(1u<<depth)-1;
        const double chroma=clipped?(maximum-value)/maximum:0;
        std::vector<float> rgb(width*height*3);
        for(size_t i=0;i<width*height;++i) {
          const double luma=!clipped?value/maximum:i/width==0?0:i/width==1?value/maximum:1;
          const double red=luma+2*(1-.2126)*chroma, blue=luma+2*(1-.0722)*chroma;
          const double green=(luma-.2126*red-.0722*blue)/(1-.2126-.0722);
          rgb[3*i]=std::clamp(red,0.,1.);rgb[3*i+1]=std::clamp(green,0.,1.);rgb[3*i+2]=std::clamp(blue,0.,1.);
        }
        Encoded reference{};
        if(hdr_jxl_encode(&config,nullptr,nullptr,rgb.data(),nullptr,&reference,error,sizeof(error)))throw std::runtime_error(error);
        if(out.xyb_count!=reference.xyb_count || !out.xyb_count)throw std::runtime_error("missing XYB capture");
        for(size_t i=0;i<out.xyb_count;++i)if(std::abs(out.xyb_data[i]-reference.xyb_data[i])>3e-6f)throw std::runtime_error("clipped scalar/SIMD mismatch");
        hdr_jxl_free(&reference);hdr_jxl_free(&out);++cases;
      }
    }
    std::printf("%zu 4-lane Highway guard-page tail encodes passed\n",cases);
  } catch(const std::exception& e) { std::fprintf(stderr,"%s\n",e.what());return 1; }
}
