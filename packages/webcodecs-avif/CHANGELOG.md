# @browser-mc/webcodecs-avif

## 0.3.0

### Minor Changes

- Add browser capability helpers for AVIF encoding and image decode checks, including `VideoEncoder.isConfigSupported()` based AVIF variant detection.

## 0.2.0

### Minor Changes

- Default AVIF encoding to 4:4:4 chroma, add an explicit `chromaSubsampling` AVIF option, and preserve source `VideoFrame.colorSpace` metadata in AVIF `colr` output.

### Patch Changes

- Updated dependencies
  - @browser-mc/media-container@0.2.0

## 0.1.0

### Minor Changes

- Support `alpha: 'keep'` by encoding and muxing AVIF auxiliary alpha images.

### Patch Changes

- Updated dependencies
  - @browser-mc/media-container@0.1.0

## 0.0.1

### Patch Changes

- first release
- Updated dependencies
  - @browser-mc/binary@0.0.1
  - @browser-mc/media-container@0.0.1
