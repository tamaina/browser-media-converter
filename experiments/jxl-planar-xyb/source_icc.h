// MIT. Bounded matrix/TRC evaluator. ICC XYZ colorants are already in D50 PCS:
// applying inverse(chad) and then readapting would add rounding, not information.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>
namespace source_icc {
struct Curve {
  int type=-1;
  std::array<double,7> p{};
  std::vector<double> table;
  std::array<float,256> u8{};
  double Eval(double x) const {
    const int code=int(x*255+.5);
    if(code>=0 && code<256 && float(code/255.0)==float(x))return u8[code];
    return EvalRaw(x);
  }
  double EvalRaw(double x) const {
    if(type==-1) {
      if(table.empty()) return x;
      const double f=std::clamp(x,0.0,1.0)*(table.size()-1);
      const size_t i=size_t(f),j=std::min(i+1,table.size()-1);
      return table[i]+(table[j]-table[i])*(f-i);
    }
    const double g=p[0],a=p[1],b=p[2],c=p[3],d=p[4],e=p[5],f=p[6];
    switch(type) {
      case 0:return std::pow(std::max(0.0,x),g);
      case 1:return x>=-b/a?std::pow(std::max(0.0,a*x+b),g):0;
      case 2:return x>=-b/a?std::pow(std::max(0.0,a*x+b),g)+c:c;
      case 3:return x>=d?std::pow(std::max(0.0,a*x+b),g):c*x;
      default:return x>=d?std::pow(std::max(0.0,a*x+b),g)+e:c*x+f;
    }
  }
};
struct Profile {
  bool matrix=false, gray=false;
  std::string error;
  std::array<Curve,3> curves;
  std::array<float,9> to709{};
  Profile(const uint8_t* bytes,size_t length) {
#define SOURCE_ICC_BAD(s) do { error=s; return; } while(0)
    if(!bytes || length<132 || length>4*1024*1024)SOURCE_ICC_BAD("ICC size must be 132 bytes..4 MiB");
    auto u32=[&](size_t p)->uint32_t {return uint32_t(bytes[p])<<24|uint32_t(bytes[p+1])<<16|uint32_t(bytes[p+2])<<8|bytes[p+3];};
    auto u16=[&](size_t p)->unsigned {return unsigned(bytes[p])<<8|bytes[p+1];};
    auto fixed=[&](size_t p)->double{return int32_t(u32(p))/65536.0;};
    const size_t declared=u32(0);
    if(declared!=length || std::memcmp(bytes+36,"acsp",4))SOURCE_ICC_BAD("Invalid ICC signature/declared size");
    if(std::memcmp(bytes+12,"mntr",4) && std::memcmp(bytes+12,"scnr",4) && std::memcmp(bytes+12,"prtr",4) && std::memcmp(bytes+12,"spac",4))SOURCE_ICC_BAD("Unsupported ICC class (device-link/abstract not accepted)");
    gray=!std::memcmp(bytes+16,"GRAY",4);
    if(!gray && std::memcmp(bytes+16,"RGB ",4))SOURCE_ICC_BAD("ICC must describe RGB or GRAY (CMYK/Lab unsupported)");
    if(std::memcmp(bytes+20,"XYZ ",4) && std::memcmp(bytes+20,"Lab ",4))SOURCE_ICC_BAD("Unsupported ICC PCS");
    const size_t count=u32(128);
    if(count>(length-132)/12)SOURCE_ICC_BAD("Truncated ICC tag table");
    struct Tag{size_t offset,size;};std::map<uint32_t,Tag> tags;
    for(size_t i=0;i<count;i++) {
      const size_t q=132+i*12,o=u32(q+4),n=u32(q+8);
      if(o<132+count*12 || o>length || n<8 || n>length-o)SOURCE_ICC_BAD("ICC tag out of bounds");
      if(!tags.emplace(u32(q),Tag{o,n}).second)SOURCE_ICC_BAD("Duplicate ICC tag");
    }
    // LUT profiles must be handled by the CMS even if fallback matrix tags exist.
    for(uint32_t tag:{0x41324230u,0x41324231u,0x41324232u,0x44324230u,0x44324231u,0x44324232u,0x44324233u})if(tags.count(tag))return;
    if(std::memcmp(bytes+20,"XYZ ",4))return;
    std::array<double,9> xyz{};
    for(size_t c=0;c<3;c++) {
      const uint32_t xt[]={0x7258595a,0x6758595a,0x6258595a},tt[]={0x72545243,0x67545243,0x62545243};
      if(!tags.count(gray?0x6b545243:tt[c]) || (!gray && !tags.count(xt[c])))return;
      const auto t=tags.at(gray?0x6b545243:tt[c]);
      if(gray) {
        // Gray PCS is neutral D50, independent of the media white tag.
        constexpr double white[3]={.9642,1,.8249};
        xyz[c*3+c]=white[c];
      } else {
        const auto x=tags.at(xt[c]);
        if(x.size<20 || u32(x.offset)!=0x58595a20)SOURCE_ICC_BAD("Invalid ICC XYZ tag");
        for(size_t r=0;r<3;r++)xyz[r*3+c]=fixed(x.offset+8+r*4);
      }
      auto& curve=curves[c];
      if(u32(t.offset)==0x63757276) {
        if(t.size<12)SOURCE_ICC_BAD("Truncated ICC curv");
        const size_t n=u32(t.offset+8);
        if(n>(t.size-12)/2)SOURCE_ICC_BAD("Truncated ICC curve table");
        if(n==1){curve.type=0;curve.p[0]=u16(t.offset+12)/256.0;if(curve.p[0]<=0)SOURCE_ICC_BAD("Invalid ICC gamma");}
        else for(size_t k=0;k<n;k++){const double v=u16(t.offset+12+k*2)/65535.0;if(k && v<curve.table.back())SOURCE_ICC_BAD("Nonmonotonic ICC TRC");curve.table.push_back(v);}
      } else if(u32(t.offset)==0x70617261) {
        if(t.size<12)SOURCE_ICC_BAD("Truncated ICC para");
        curve.type=u16(t.offset+8);
        if(curve.type>4)return;
        const size_t n[]={1,3,4,5,7};if(t.size<12+n[curve.type]*4)SOURCE_ICC_BAD("Truncated ICC parametric curve");
        for(size_t k=0;k<n[curve.type];k++)curve.p[k]=fixed(t.offset+12+k*4);
        if(curve.p[0]<=0 || (curve.type && curve.p[1]<=0))SOURCE_ICC_BAD("Invalid ICC parametric gamma/scale");
      } else return;
    }
    // Inverse of Bradford-adapted D65 BT.709 -> D50 PCS, computed independently
    // from published xy values. Matches relative-colorimetric ICC PCS semantics.
    constexpr double inverse[9]={3.13418636423682,-1.61720895899828,-0.490694064006384,-0.978748504190694,1.91613009677359,0.0334333991599956,0.0719639278022467,-0.228993873453203,1.40575373289644};
    for(size_t r=0;r<3;r++)for(size_t c=0;c<3;c++){
      double v=0;for(size_t k=0;k<3;k++)v+=inverse[r*3+k]*xyz[k*3+c];
      if(!std::isfinite(v) || std::abs(v)>100)SOURCE_ICC_BAD("Invalid ICC primary matrix");
      to709[r*3+c]=float(v);
    }
    const auto& m=to709;
    const double det=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
    if(std::abs(det)<1e-10)SOURCE_ICC_BAD("Singular ICC primary matrix");
    for(auto& curve:curves)for(size_t k=0;k<256;k++) {
      const float v=float(curve.EvalRaw(double(float(k/255.0))));
      if(!std::isfinite(v))SOURCE_ICC_BAD("Non-finite ICC TRC output");
      curve.u8[k]=v;
    }
    matrix=true;
#undef SOURCE_ICC_BAD
  }
};
} // namespace source_icc
