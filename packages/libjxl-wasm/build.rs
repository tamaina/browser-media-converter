use std::{env, path::PathBuf, process::Command};
fn main() {
    let target = env::var("TARGET").unwrap();
    let host = env::var("HOST").unwrap();
    println!("cargo:rerun-if-env-changed=PLANAR_SESSION_ONLY");
    println!("cargo:rerun-if-env-changed=JXL_INCLUDE");
    println!("cargo:rerun-if-env-changed=JXL_LIBRARY");
    println!("cargo:rerun-if-env-changed=LIBJXL_WASM_DIR");
    if target == "wasm32-unknown-emscripten" || env::var_os("PLANAR_SESSION_ONLY").is_some() || env::var_os("JXL_INCLUDE").is_none() {
        // Session/CMS staticlib only (build-wasm.sh, tail-guard): the C++ side
        // compiles bridge.cc itself and links libjxl (Wasm: without libjxl_cms).
        return;
    }
    assert_eq!(
        target, host,
        "This native build does not configure a C++ Wasm toolchain; use a matching Emscripten build before cross-linking."
    );
    let include =
        env::var("JXL_INCLUDE").expect("set JXL_INCLUDE to matching libjxl development headers");
    let library =
        env::var("JXL_LIBRARY").expect("set JXL_LIBRARY to the matching patched native libjxl.so (see README native tests)");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let src =
        PathBuf::from(env::var("LIBJXL_WASM_DIR").unwrap_or_else(|_| env::var("CARGO_MANIFEST_DIR").unwrap()))
            .join("cpp");
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
    // The patched libjxl embeds a rejecting default CMS. bridge.cc always
    // installs the complete Rust CMS; no external C CMS is linked.
    println!(
        "cargo:rustc-link-arg=-Wl,-rpath,{}",
        PathBuf::from(&library).parent().unwrap().display()
    );
    println!("cargo:rerun-if-changed={}", src.join("bridge.cc").display());
    println!("cargo:rerun-if-changed={}", src.join("planar_session.h").display());
    println!("cargo:rerun-if-changed={include}/jxl/encode.h");
}
