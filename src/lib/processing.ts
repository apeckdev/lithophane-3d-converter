import type { ProcessingOptions } from './types';
import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';

export interface ProcessResult {
    previewUrl: string;
    stlBlob: Blob;
    width: number;
    height: number;
}

export async function processImage(
    imageUrl: string,
    options: ProcessingOptions
): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                // 1. Calculate dimensions
                // Target resolution: ~0.1mm per pixel for high quality
                const pixelSizeMm = options.pixelSize || 0.15;
                const targetWidth = Math.round(options.widthMm / pixelSizeMm);
                const scale = targetWidth / img.width;
                const targetHeight = Math.round(img.height * scale);

                // 2. Setup Canvas
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");

                // Draw and get data
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                const data = imageData.data;

                // Apply smoothing if requested
                if (options.smoothing > 0) {
                    // max radius ~3px for reasonable blur
                    const radius = Math.max(1, Math.round(options.smoothing * 3));
                    const smoothed = applyBlur(data, targetWidth, targetHeight, radius);
                    data.set(smoothed);
                }

                // 3. Process Pixels (Grayscale + Quantize)
                const depthData = new Float32Array(targetWidth * targetHeight); // Store 0-1 values

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    // Luminance
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                    // Quantize
                    const levels = options.layerCount;
                    // Normalize to 0-1
                    let val = gray / 255;
                    let layerIdx = 0;

                    if (levels > 1) {
                        // Find nearest bucket
                        const step = 1 / (levels - 1);
                        layerIdx = Math.round(val / step);
                        val = layerIdx * step;
                    }

                    // Apply Layer Visibility Mask
                    let isVisible = true;
                    if (options.layerVisibility && options.layerVisibility.length === levels) {
                        // Be careful with index bounds
                        if (layerIdx >= 0 && layerIdx < levels) {
                            isVisible = options.layerVisibility[layerIdx];
                        }
                    }

                    // Invert just affects depth, but not layerIdx?
                    // Usually "Dark" is Layer 0 in a lithophane context unless inverted.
                    // If we invert, "Dark" maps to High Z (Layer N-1).
                    // So if we invert, the layerIdx maps to (levels - 1 - layerIdx)?
                    // Or does the user think "Layer 1 = Black"?
                    // Let's assume Layer 1 is always Lowest (Z=0).
                    // If Inverted, White is Lowest (Z=0).
                    // So Layer 1 means "The Stuff at the Bottom".
                    // The logic below calculates `depth` then sets Z.
                    // If `options.invert` is true, `val` (gray) 0 -> `depth` 1.
                    // Which "Layer" is that? High Layer.
                    // If user toggles "Layer 1" (Bottom), they want to remove the Bottom.
                    // If Inverted, Bottom is White.
                    // So we should calculate `physicalLayerIdx` roughly proportional to `depth`.

                    let depth = val;
                    if (options.invert) {
                        depth = 1.0 - val;
                    }

                    // Re-calculate effective layer index based on final depth for masking?
                    // If user says "Toggle Layer 1", they mean Z=0 layer.
                    // So index = Math.round(depth * (levels - 1))

                    const physicalLayerIdx = Math.round(depth * (levels - 1));
                    if (options.layerVisibility && options.layerVisibility.length === levels) {
                        if (options.layerVisibility[physicalLayerIdx] !== undefined) {
                            isVisible = options.layerVisibility[physicalLayerIdx];
                        }
                    }

                    if (!isVisible) {
                        depth = -1; // Sentinel for "removed"
                    }

                    depthData[i / 4] = depth;

                    // Update ImageData for preview (grayscale)
                    if (depth === -1) {
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = 0; // Transparent
                    } else {
                        const displayGray = Math.floor(depth * 255);
                        data[i] = displayGray;
                        data[i + 1] = displayGray;
                        data[i + 2] = displayGray;
                        data[i + 3] = 255;
                    }
                }

                ctx.putImageData(imageData, 0, 0);
                const previewUrl = canvas.toDataURL('image/png');

                // 4. Generate Geometry
                const geom = new THREE.BufferGeometry();
                const vertices: number[] = [];
                const indices: number[] = [];

                const w = targetWidth;
                const h = targetHeight;
                const widthMm = options.widthMm;
                const heightMm = (h / w) * widthMm;
                const cellW = widthMm / (w - 1);
                const cellH = heightMm / (h - 1);

                // Vertices
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const pixelIdx = (y * w) + x;
                        const depth = depthData[pixelIdx];

                        // Base Layer support
                        // If masked (depth < 0), collapses to just the base layer thickness.
                        // If active, stacks on top of base layer + minHeight.
                        let zVal = options.baseMm;

                        if (depth >= 0) {
                            zVal += options.minHeight + (depth * (options.maxHeight - options.minHeight));
                        }

                        // Coordinate centered
                        const pX = (x * cellW) - (widthMm / 2);
                        const pY = -((y * cellH) - (heightMm / 2));

                        // Top Vertex
                        vertices.push(pX, pY, zVal);
                        // Bottom Vertex (Flat Base at 0)
                        vertices.push(pX, pY, 0);
                    }
                }

                // Indices helper
                const getIdx = (x: number, y: number, layer: 0 | 1) => {
                    return ((y * w) + x) * 2 + layer;
                };

                // Faces (Surface and Bottom)
                for (let y = 0; y < h - 1; y++) {
                    for (let x = 0; x < w - 1; x++) {
                        // Top Surface
                        const tTL = getIdx(x, y, 0);
                        const tTR = getIdx(x + 1, y, 0);
                        const tBL = getIdx(x, y + 1, 0);
                        const tBR = getIdx(x + 1, y + 1, 0);

                        indices.push(tTL, tBL, tTR);
                        indices.push(tTR, tBL, tBR);

                        // Bottom Surface (Clockwise)
                        const bTL = getIdx(x, y, 1);
                        const bTR = getIdx(x + 1, y, 1);
                        const bBL = getIdx(x, y + 1, 1);
                        const bBR = getIdx(x + 1, y + 1, 1);

                        indices.push(bTL, bTR, bBL);
                        indices.push(bTR, bBR, bBL);
                    }
                }

                // Stitch Edges to make solid
                // Top Edge
                for (let x = 0; x < w - 1; x++) {
                    const top = getIdx(x, 0, 0);
                    const topNext = getIdx(x + 1, 0, 0);
                    const bot = getIdx(x, 0, 1);
                    const botNext = getIdx(x + 1, 0, 1);
                    indices.push(top, topNext, bot);
                    indices.push(bot, topNext, botNext);
                }
                // Bottom Edge
                for (let x = 0; x < w - 1; x++) {
                    const top = getIdx(x, h - 1, 0);
                    const topNext = getIdx(x + 1, h - 1, 0);
                    const bot = getIdx(x, h - 1, 1);
                    const botNext = getIdx(x + 1, h - 1, 1);
                    indices.push(top, bot, topNext);
                    indices.push(bot, botNext, topNext);
                }
                // Left Edge
                for (let y = 0; y < h - 1; y++) {
                    const top = getIdx(0, y, 0);
                    const topNext = getIdx(0, y + 1, 0);
                    const bot = getIdx(0, y, 1);
                    const botNext = getIdx(0, y + 1, 1);
                    indices.push(top, bot, topNext);
                    indices.push(bot, botNext, topNext);
                }
                // Right Edge
                for (let y = 0; y < h - 1; y++) {
                    const top = getIdx(w - 1, y, 0);
                    const topNext = getIdx(w - 1, y + 1, 0);
                    const bot = getIdx(w - 1, y, 1);
                    const botNext = getIdx(w - 1, y + 1, 1);
                    indices.push(top, topNext, bot);
                    indices.push(bot, topNext, botNext);
                }

                geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                geom.setIndex(indices);
                geom.computeVertexNormals();

                // 5. Encapsulate in Mesh and Export
                const mesh = new THREE.Mesh(geom);
                const exporter = new STLExporter();
                const stlResult = exporter.parse(mesh, { binary: true });

                const blob = new Blob([stlResult as BlobPart], { type: 'application/octet-stream' });

                resolve({
                    previewUrl,
                    stlBlob: blob,
                    width: targetWidth,
                    height: targetHeight
                });

            } catch (err) {
                reject(err);
            }
        };
        img.src = imageUrl;
    });
}

function applyBlur(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(src.length);
    // Simple box blur kernel
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, count = 0;

            for (let ky = -radius; ky <= radius; ky++) {
                const ny = y + ky;
                if (ny < 0 || ny >= h) continue;
                for (let kx = -radius; kx <= radius; kx++) {
                    const nx = x + kx;
                    if (nx < 0 || nx >= w) continue;

                    const idx = (ny * w + nx) * 4;
                    r += src[idx];
                    g += src[idx + 1];
                    b += src[idx + 2];
                    count++;
                }
            }

            const i = (y * w + x) * 4;
            output[i] = r / count;
            output[i + 1] = g / count;
            output[i + 2] = b / count;
            output[i + 3] = src[i + 3];
        }
    }
    return output;
}
