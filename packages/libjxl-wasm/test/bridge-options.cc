// Standalone parser regression test: include the implementation to exercise its
// internal option readers. Compile with function sections and --gc-sections so
// the unused codec entry points do not require a native libjxl/Rust link.
#include "../cpp/bridge.cc"
#include <cassert>
#include <string>
template<class F> static void rejects(F read,const char* message) {
  try {read();assert(false);} catch(const std::runtime_error& e) {
    assert(std::string(e.what()).find(message)!=std::string::npos);
  }
}
int main() {
  unsetenv("JXL_EXPERIMENT_DISTANCE");unsetenv("JXL_EXPERIMENT_EFFORT");
  bridge_encode_options_reset();
  assert(frame_distance()==1 && frame_effort()==3);
  for(const char* bad:{"", "garbage", "1junk", "-1", "26", "nan", "inf", "1e-9999"}) {
    setenv("JXL_EXPERIMENT_DISTANCE",bad,1);
    rejects(frame_distance,"distance must be");
  }
  setenv("JXL_EXPERIMENT_DISTANCE","1e-46",1);
  assert(frame_distance()==0.01f);
  for(const char* bad:{"", "garbage", "3junk", "0", "11", "1.5", "9999999999999999999999999"}) {
    setenv("JXL_EXPERIMENT_EFFORT",bad,1);
    rejects(frame_effort,"effort must be");
  }
  setenv("JXL_EXPERIMENT_DISTANCE","0",1);setenv("JXL_EXPERIMENT_EFFORT","8",1);
  bridge_encode_options(1,3);
  assert(frame_distance()==1 && frame_effort()==3);
  bridge_encode_options_reset();
  assert(frame_distance()==0 && frame_effort()==8);
  bridge_encode_options(-1,11);
  rejects(frame_distance,"distance must be");rejects(frame_effort,"effort must be");
}
