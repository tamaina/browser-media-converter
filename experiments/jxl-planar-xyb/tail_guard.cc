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
    for(uint32_t depth:{8u,10u,12u}) for(uint32_t sx:{1u,2u}) for(uint32_t sy:{1u,2u}) {
      for(uint32_t width=1;width<=33;++width) {
        const uint32_t height=3;
        const size_t bytes=depth==8?1:2,cw=(width+sx-1)/sx,ch=(height+sy-1)/sy;
        Guard y(width*height*bytes),u(cw*ch*bytes),v(cw*ch*bytes);
        const uint32_t value=1u<<(depth-1);
        for(auto* g:{&y,&u,&v}) for(size_t i=0;i<g->size;i+=bytes) {
          g->data[i]=uint8_t(value);if(bytes==2) g->data[i+1]=uint8_t(value>>8);
        }
        JxlExperimentalYuv raw{{{y.data,y.size,width*bytes,width,height},
                                {u.data,u.size,cw*bytes,cw,ch},
                                {v.data,v.size,cw*bytes,cw,ch}},width,height,depth,1,1,sx,sy};
        Config config{width,height,1,13,255};Encoded out{};char error[256]{};
        auto unused=[](void*,size_t,size_t,size_t,size_t,float*,size_t)->int{return 1;};
        if(hdr_jxl_encode(&config,nullptr,unused,nullptr,&raw,&out,error,sizeof(error))) throw std::runtime_error(error);
        if(out.simd_lanes!=4 || out.callbacks || out.peak_rgb_bytes || !out.size) throw std::runtime_error("fused path not used");
        hdr_jxl_free(&out);++cases;
      }
    }
    std::printf("%zu 4-lane Highway guard-page tail encodes passed\n",cases);
  } catch(const std::exception& e) { std::fprintf(stderr,"%s\n",e.what());return 1; }
}
