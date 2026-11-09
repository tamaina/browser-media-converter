---
"@browser-mc/browser-image-resizer-ex": minor
---

Preserve PNG iCCP and cICP source color metadata in compatible AVIF output. Source colour metadata is now read with the asynchronous `readImageColorMetadata` from `@browser-mc/media-container`; malformed metadata is still ignored.
