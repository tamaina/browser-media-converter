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
      for(uint32_t transfer:{13u,1u}) for(uint32_t siting:{0u,1u,2u})
      for(uint32_t matrix:{1u,6u}) for(bool full:{false,true})
      for(uint32_t pattern:{0u,1u,2u}) for(uint32_t width=1;width<=33;++width) {
        const uint32_t height=3;
        const size_t bytes=depth==8?1:2,cw=(width+sx-1)/sx,ch=(height+sy-1)/sy;
        Guard y(width*height*bytes),u(cw*ch*bytes),v(cw*ch*bytes);
        const uint32_t value=1u<<(depth-1);
        for(auto* g:{&y,&u,&v}) for(size_t i=0;i<g->size;i+=bytes) {
          uint32_t sample=value;
          if(pattern==1) {
            sample=g!=&y?(1u<<depth)-1:
                (i/bytes/width==0?0:i/bytes/width==1?value:(1u<<depth)-1);
          } else if(pattern==2) {
            // Vary low bits in all planes, including across subsampling edges.
            sample=value+((i/bytes*13+(g==&v?19:0))%61)-30;
          }
          g->data[i]=uint8_t(sample);if(bytes==2) g->data[i+1]=uint8_t(sample>>8);
        }
        JxlExperimentalYuv raw{{{y.data,y.size,width*bytes,width,height},
                                {u.data,u.size,cw*bytes,cw,ch},
                                {v.data,v.size,cw*bytes,cw,ch}},width,height,depth,matrix,uint32_t(full),sx,sy,transfer,siting};
        Config config{width,height,1,transfer,255,depth};Encoded out{};char error[256]{};
        auto unused=[](void*,size_t,size_t,size_t,size_t,float*,size_t)->int{return 1;};
        if(hdr_jxl_encode(&config,nullptr,unused,nullptr,&raw,&out,error,sizeof(error))) throw std::runtime_error(error);
        if(out.simd_lanes!=4 || out.callbacks || out.peak_rgb_bytes || !out.size) throw std::runtime_error("fused path not used");
        const double maximum=(1u<<depth)-1;
        const double scale=1u<<(depth-8),denom=full?maximum:224*scale;
        auto sample=[&](const Guard& p,size_t x,size_t row,size_t stride) {
          const uint8_t* a=p.data+(row*stride+x)*bytes;
          return double(bytes==1?a[0]:uint32_t(a[0])|(uint32_t(a[1])<<8));
        };
        auto chroma=[&](const Guard& p,size_t x,size_t row) {
          const double fx=std::clamp(double(x)/sx+(siting==1?.5/sx-.5:0.),0.,double(cw-1));
          const double fy=std::clamp(double(row)/sy+(siting!=2?.5/sy-.5:0.),0.,double(ch-1));
          const size_t x0=size_t(fx),y0=size_t(fy),x1=std::min(x0+1,cw-1),y1=std::min(y0+1,ch-1);
          const double tx=fx-x0,ty=fy-y0;
          return ((1-ty)*((1-tx)*sample(p,x0,y0,cw)+tx*sample(p,x1,y0,cw))+ty*((1-tx)*sample(p,x0,y1,cw)+tx*sample(p,x1,y1,cw))-value)/denom;
        };
        const double kr=matrix==1?.2126:.299,kb=matrix==1?.0722:.114;
        std::vector<float> rgb(width*height*3);
        for(size_t i=0;i<width*height;++i) {
          const double yy=sample(y,i%width,i/width,width);
          const double luma=full?yy/maximum:(yy-16*scale)/(219*scale);
          const double red=luma+2*(1-kr)*chroma(v,i%width,i/width), blue=luma+2*(1-kb)*chroma(u,i%width,i/width);
          const double green=(luma-kr*red-kb*blue)/(1-kr-kb);
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
