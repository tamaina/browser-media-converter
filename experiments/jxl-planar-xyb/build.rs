use std::{env, path::PathBuf, process::Command};
fn main() {
    let target = env::var("TARGET").unwrap();
    let host = env::var("HOST").unwrap();
    println!("cargo:rerun-if-env-changed=PLANAR_SESSION_ONLY");
    if target == "wasm32-unknown-emscripten" || env::var_os("PLANAR_SESSION_ONLY").is_some() {
        // Session/CMS staticlib only (build-wasm.sh, tail-guard): the C++ side
        // compiles bridge.cc itself and links libjxl + libjxl_cms.
        return;
    }
    assert_eq!(
        target, host,
        "This native proof does not configure a C++ Wasm toolchain; use a matching Emscripten build before cross-linking."
    );
    let include =
        env::var("JXL_INCLUDE").expect("set JXL_INCLUDE to matching libjxl development headers");
    let library =
        env::var("JXL_LIBRARY").unwrap_or("/usr/lib/x86_64-linux-gnu/libjxl.so.0.11".into());
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let src =
        PathBuf::from(env::var("LIBJXL_WASM_DIR").unwrap_or("../../packages/libjxl-wasm".into()))
            .join("src");
    assert!(
        Command::new(env::var("CXX").unwrap_or("/usr/bin/g++".into()))
            .args([
                "-std=c++17",
                "-O2",
                "-fPIC",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-I",
                &include,
                "-I",
                &format!("{include}/../../../native/lib/include"),
                "-c",
            ])
            .arg(src.join("bridge.cc"))
            .arg("-o")
            .arg(out.join("bridge.o"))
            .status()
            .unwrap()
            .success()
    );
    assert!(
        Command::new("/usr/bin/ar")
            .arg("crs")
            .arg(out.join("libhdr_bridge.a"))
            .arg(out.join("bridge.o"))
            .status()
            .unwrap()
            .success()
    );
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=hdr_bridge");
    println!("cargo:rustc-link-lib=dylib=stdc++");
    println!("cargo:rustc-link-arg={library}");
    // JxlGetDefaultCms (fallback of the Rust CMS for PQ/HLG etc.).
    let cms = env::var("JXL_CMS_LIBRARY").unwrap_or_else(|_| {
        let lib = PathBuf::from(&library);
        let name = lib.file_name().unwrap().to_string_lossy().replace("libjxl.", "libjxl_cms.");
        lib.with_file_name(name).display().to_string()
    });
    println!("cargo:rustc-link-arg={cms}");
    println!(
        "cargo:rustc-link-arg=-Wl,-rpath,{}",
        PathBuf::from(&library).parent().unwrap().display()
    );
    println!("cargo:rerun-if-changed={}", src.join("bridge.cc").display());
    println!("cargo:rerun-if-changed={include}/jxl/encode.h");
    println!("cargo:rerun-if-env-changed=JXL_INCLUDE");
    println!("cargo:rerun-if-env-changed=JXL_LIBRARY");
    println!("cargo:rerun-if-env-changed=JXL_CMS_LIBRARY");
    println!("cargo:rerun-if-env-changed=LIBJXL_WASM_DIR");
}
