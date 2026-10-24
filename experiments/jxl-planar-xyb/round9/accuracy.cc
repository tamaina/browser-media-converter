// Same Highway FastPowf and opsin formula as the fused/built-in RGB path.
#include <hwy/highway.h>
#include "lib/jxl/base/fast_math-inl.h"
#include "lib/jxl/cms/opsin_params.h"
#include <jxl/encode.h>
#include <jxl/color_encoding.h>
#include <cmath>
#include <cstdio>
#include <vector>
#include <fstream>
#include <algorithm>
#include <stdexcept>
using namespace hwy::HWY_NAMESPACE;
void encode(const std::vector<float>& pixels,bool gamma,const char* name){
 auto* enc=JxlEncoderCreate(nullptr);if(!enc)throw std::runtime_error("create");
 auto check=[](JxlEncoderStatus s){if(s!=JXL_ENC_SUCCESS)throw std::runtime_error("encode");};
 JxlBasicInfo info;JxlEncoderInitBasicInfo(&info);info.xsize=4096;info.ysize=8;info.bits_per_sample=32;info.exponent_bits_per_sample=8;info.uses_original_profile=JXL_FALSE;check(JxlEncoderSetBasicInfo(enc,&info));
 JxlColorEncoding c;JxlColorEncodingSetToSRGB(&c,JXL_FALSE);c.transfer_function=gamma?JXL_TRANSFER_FUNCTION_GAMMA:JXL_TRANSFER_FUNCTION_LINEAR;c.gamma=1.0/2.4;check(JxlEncoderSetColorEncoding(enc,&c));
 auto* s=JxlEncoderFrameSettingsCreate(enc,nullptr);check(JxlEncoderSetFrameDistance(s,.1));check(JxlEncoderFrameSettingsSetOption(s,JXL_ENC_FRAME_SETTING_EFFORT,3));JxlPixelFormat fmt{3,JXL_TYPE_FLOAT,JXL_NATIVE_ENDIAN,0};check(JxlEncoderAddImageFrame(s,&fmt,pixels.data(),pixels.size()*4));JxlEncoderCloseInput(enc);
 std::vector<uint8_t> out(4096);size_t used=0;for(;;){auto* next=out.data()+used;size_t avail=out.size()-used;auto status=JxlEncoderProcessOutput(enc,&next,&avail);used=out.size()-avail;if(status==JXL_ENC_SUCCESS)break;if(status!=JXL_ENC_NEED_MORE_OUTPUT)throw std::runtime_error("output");out.resize(out.size()*2);}std::ofstream f(name,std::ios::binary);f.write((char*)out.data(),used);JxlEncoderDestroy(enc);
}
int main(int argc,char** argv){
 const HWY_FULL(float) d;constexpr size_t count=1048577;const size_t n=Lanes(d);HWY_ALIGN float input[MaxLanes(d)],output[MaxLanes(d)];double maxlin=0,maxxyb=0,maxquant=0;
 for(size_t i=0;i<count;i+=n){for(size_t j=0;j<n;j++)input[j]=float(std::min(i+j,count-1))/float(count-1);Store(jxl::HWY_NAMESPACE::FastPowf(d,Load(d,input),Set(d,2.4f)),d,output);
 for(size_t j=0;j<n;j++){
 double ref=std::pow(double(input[j]),2.4);maxlin=std::max(maxlin,std::abs(output[j]-ref));
 maxquant=std::max(maxquant,std::abs(std::pow(double(input[j]),1.0/.4166667)-ref));
 // Neutral and two deterministic nonneutral opsin inputs; isolate power error.
 double exact[3],approx[3];for(size_t k=0;k<3;k++){
 double base=jxl::cms::kOpsinAbsorbanceBias[k],a=base,b=base;
 for(size_t c=0;c<3;c++){double scale=c==0?1.0:c==1?.6:.2; a+=jxl::cms::kOpsinAbsorbanceMatrix[k][c]*ref*scale;b+=jxl::cms::kOpsinAbsorbanceMatrix[k][c]*output[j]*scale;}
 exact[k]=std::cbrt(a)-std::cbrt(base);approx[k]=std::cbrt(b)-std::cbrt(base);}
 for(double e:{.5*((approx[0]-approx[1])-(exact[0]-exact[1])),.5*((approx[0]+approx[1])-(exact[0]+exact[1])),approx[2]-exact[2]})maxxyb=std::max(maxxyb,std::abs(e));
 }}
 printf("{\"samples\":%zu,\"lanes\":%zu,\"linearMaxAbs\":%.12g,\"xybPowerOnlyMaxAbs\":%.12g,\"headerGammaQuantizationLinearMaxAbs\":%.12g}\n",count,n,maxlin,maxxyb,maxquant);
 if(argc==3){std::vector<float> nonlinear(4096*8*3),linear(nonlinear.size());for(size_t i=0;i<nonlinear.size();i++){nonlinear[i]=float((i/3)%4096)/4095;linear[i]=std::pow(double(nonlinear[i]),2.4);}encode(nonlinear,true,argv[1]);encode(linear,false,argv[2]);}
}
