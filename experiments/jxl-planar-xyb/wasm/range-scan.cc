// Diagnostic only: raw compact U8 I420, centered chroma, full-range BT.709.
// Same f64 reconstruction as Rust pixel(); never clips or feeds the encoder.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <vector>
int main(int argc,char** argv) {
  if(argc!=4)return 2;
  size_t w=std::stoul(argv[2]),h=std::stoul(argv[3]),cw=(w+1)/2,ch=(h+1)/2;
  std::ifstream f(argv[1],std::ios::binary);
  std::vector<unsigned char> p{std::istreambuf_iterator<char>(f),{}};
  if(p.size()!=w*h+2*cw*ch)return 3;
  auto chroma=[&](size_t c,size_t x,size_t y) {
    double fx=std::clamp((x+0.5)/2-0.5,0.0,double(cw-1)),fy=std::clamp((y+0.5)/2-0.5,0.0,double(ch-1));
    size_t x0=std::floor(fx),y0=std::floor(fy),x1=std::min(x0+1,cw-1),y1=std::min(y0+1,ch-1);
    double tx=fx-x0,ty=fy-y0;auto s=[&](size_t a,size_t b){return p[w*h+c*cw*ch+b*cw+a];};
    double a=s(x0,y0)*(1-tx)+s(x1,y0)*tx,b=s(x0,y1)*(1-tx)+s(x1,y1)*tx;
    return a*(1-ty)+b*ty;
  };
  size_t outside=0,channels=0; double lo=1,hi=0;
  for(size_t y=0;y<h;++y)for(size_t x=0;x<w;++x) {
    double yy=p[y*w+x]/255.0,cb=(chroma(0,x,y)-128)/255,cr=(chroma(1,x,y)-128)/255;
    double r=yy+2*(1-0.2126)*cr,b=yy+2*(1-0.0722)*cb,g=(yy-0.2126*r-0.0722*b)/(1-0.2126-0.0722);
    bool bad=false;for(double v:{r,g,b}){lo=std::min(lo,v);hi=std::max(hi,v);if(v<0||v>1){bad=true;++channels;}}
    outside+=bad;
  }
  std::printf("{\"pixels\":%zu,\"outsidePixels\":%zu,\"outsideFraction\":%.12g,\"outsideChannels\":%zu,\"minRgb\":%.12g,\"maxRgb\":%.12g}\n",w*h,outside,double(outside)/(w*h),channels,lo,hi);
}
