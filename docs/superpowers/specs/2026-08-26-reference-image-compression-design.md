# Reference Image Compression Design

## Goal

Prepare a browser-side submission copy of every reference image so all image-generation routes receive an image whose longest edge is at most 2048 pixels and whose encoded size is at most 5 MB.

## Scope

- Apply processing only when a reference image is submitted for generation.
- Keep the original `ReferenceImage` and canvas/thumbnail preview unchanged.
- Reuse the processed Data URLs for all image routes, including Vison's `/api/reference/images` upload.
- Retain the server-side 10 MB validation as a defence-in-depth limit for Vison uploads.

## Processing Contract

1. Read a `ReferenceImage` from its in-memory blob when available; otherwise obtain its existing Data URL.
2. Decode the image in the browser and preserve its aspect ratio.
3. Scale images down only when the longest edge exceeds 2048 pixels.
4. Detect alpha content. Encode images with alpha as WebP and opaque images as JPEG.
5. Encode at quality 0.92. If the result remains above 5 MB, progressively lower quality; if the lowest quality still exceeds 5 MB, reduce the scaled dimensions and repeat.
6. If a decodable image cannot satisfy 5 MB, reject the generation before any upstream request and state that the reference image cannot be compressed to the supported size.
7. If a cross-origin source cannot be read or decoded, reject it with a clear reference-image processing error instead of falling back to its uncompressed source.

## Data Flow

`ControlPanel` will convert the selected references through one shared compression service before selecting a line-specific payload shape. The service returns Data URLs in the original reference order. The Vison payload preparation service receives those Data URLs for upload, while the remaining model branches receive the same Data URLs or their base64 payload equivalents.

## Error Handling

- A failed decode, canvas encode, or size-target failure stops submission and uses the existing control-panel error surface.
- A warning is logged with the original and processed dimensions/byte sizes for browser diagnostics, without logging image content.
- The existing Vison upload error remains responsible for unavailable public URLs and server upload failures.

## Tests

- Verify that oversized dimensions are scaled while preserving aspect ratio.
- Verify that an opaque image is encoded as JPEG and an alpha image as WebP.
- Verify that images already within both limits are not needlessly re-encoded.
- Verify the quality/dimension retry loop returns a result no greater than 5 MB.
- Verify an unreadable or uncompressible reference produces a submit-blocking error.
