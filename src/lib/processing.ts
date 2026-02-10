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

                    // ... (Quantize logic above)

                    // Apply Layer Visibility Mask
                    let isVisible = true;
                    if (options.layerVisibility && options.layerVisibility.length === levels) {
                        // Be careful with index bounds
                        if (layerIdx >= 0 && layerIdx < levels) {
                            isVisible = options.layerVisibility[layerIdx];
                        }
                    }

                    let depth = val;
                    if (options.invert) {
                        depth = 1.0 - val;
                    }

                    // --- BORDER GENERATION LOGIC ---
                    if (options.border && options.border.type !== 'none') {
                        const bWidthMm = options.border.widthMm;
                        const bDepthMm = options.border.depthMm;

                        // Convert border width from mm to pixels
                        const pixelSizeMm = options.pixelSize || 0.15;
                        const borderPixels = Math.round(bWidthMm / pixelSizeMm);

                        // Current pixel coordinates
                        const px = (i / 4) % targetWidth;
                        const py = Math.floor((i / 4) / targetWidth);

                        // Distance from nearest edge
                        const distLeft = px;
                        const distRight = targetWidth - 1 - px;
                        const distTop = py;
                        const distBottom = targetHeight - 1 - py;
                        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

                        if (minDist < borderPixels) {
                            // We are in the border region
                            // Normalized position within border (0 = outside edge, 1 = inside edge)
                            const t = minDist / borderPixels;

                            // Calculate Physical Height of Border
                            // The image heights range from [minHeight, maxHeight]
                            // The border depthMm is "Height above base". 
                            // We need to map this back to the "0-1" depth scale used here? 
                            // WAIT: The depth array stores 0-1 values which are LATER mapped to [min, max].
                            // It's cleaner to calculate the ACTUAL Z desired, then reverse-map to 0-1?
                            // Or just store the Z override directly?
                            // The depthData array is Float32. It currently stores 0-1.
                            // The mesh gen step does: z = base + min + depth * (max - min)
                            // So: depth = (TargetZ - base - min) / (max - min)

                            const zMin = options.minHeight;
                            const zMax = options.maxHeight;
                            const range = zMax - zMin;

                            let targetBorderZ = 0;

                            if (options.border.type === 'flat') {
                                targetBorderZ = bDepthMm;
                            } else if (options.border.type === 'chamfer') {
                                // Linear ramp: 0 at inside, full depth at outside? 
                                // Actually usually borders are thicker than image.
                                // Let's make it: Outside edge = bDepth, Inside edge = Image Pixel? 
                                // Or Inside edge = bDepth too?
                                // "Chamfer" usually means angled. 
                                // Let's try: Outside = bDepth, Inside = bDepth, but maybe allow a bevel?
                                // Let's stick to simple profiles first. 
                                // Chamfer here will mean: Ramps from 0 (at image join) up to bDepth (at outside)?
                                // No, that's a frame. 
                                // Let's make "Chamfer" = Angled Profile.
                                // Height at outside = bDepth. Height at inside = bDepth.
                                // Wait, standard frame is just flat.

                                // Let's define:
                                // Flat: Constant height = bDepth.
                                // Chamfer: Angled from bDepth (inner) to 0 (outer)? No.
                                // Let's do: Inner Edge = Matches Image? No, that's hard.
                                // Let's do: Constant Height `bDepth` but with a 45-degree chamfer on the VERY edge or the join?
                                // Let's simplify:
                                // Chamfer: Linear ramp from Base (0) at outside, to bDepth at (borderWidth).
                                targetBorderZ = t * bDepthMm;
                            } else if (options.border.type === 'rounded') {
                                // Circular profile
                                // sin(t * PI/2) * depth?
                                targetBorderZ = Math.sin(t * (Math.PI / 2)) * bDepthMm;
                            }

                            // Ensure border sits on base
                            // The loop below adds baseMm/minHeight. 
                            // If user specifies 3mm border depth, they likely mean "Total height 3mm".
                            // But our Z calc is: zVal = baseMm + minHeight + depth * range.
                            // This is getting complex to mix relative 0-1 image data with absolute border mm.

                            // Let's encode a "Literal Z Override" signal? 
                            // Or just map it back. 

                            // If we want total height = targetBorderZ (ignoring base for now? No, border includes base?)
                            // Let's say bDepth is "Height ABOVE Base".
                            // So Total Z = baseMm + targetBorderZ.

                            // We need: baseMm + min + val*range = baseMm + targetBorderZ
                            // min + val*range = targetBorderZ
                            // val = (targetBorderZ - min) / range

                            let borderVal = (targetBorderZ - zMin) / range;

                            // Clamp? Maybe not, allow it to stick out.
                            depth = borderVal;

                            // Borders are always solid/visible
                            isVisible = true;
                        }
                    }
                    // --- END BORDER LOGIC ---

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
                        // Visualization needs to handle values > 1 or < 0 if the border is huge
                        let displayGray = Math.floor(depth * 255);
                        // Clamp for display
                        displayGray = Math.max(0, Math.min(255, displayGray));

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
