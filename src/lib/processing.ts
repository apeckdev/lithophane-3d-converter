import type { ProcessingOptions } from './types';
import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';

export interface ProcessResult {
    previewUrl: string;
    stlBlob: Blob;
    geometry: THREE.BufferGeometry;
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

                // Apply Image Adjustments (Contrast, Brightness, Gamma)
                applyImageAdjustments(data, options);

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

                    // Background Removal
                    // If enabled and pixel is brighter than threshold (assuming white background)
                    // Or we could trigger on alpha?
                    // Let's stick to luminance threshold for now (e.g., remove white)
                    let isBackground = false;
                    if (options.backgroundRemoval && gray > (options.backgroundThreshold ?? 250)) {
                        isBackground = true;
                    }

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
                    let isVisible = !isBackground;
                    if (isVisible && options.layerVisibility && options.layerVisibility.length === levels) {
                        // Be careful with index bounds
                        if (layerIdx >= 0 && layerIdx < levels) {
                            isVisible = options.layerVisibility[layerIdx];
                        }
                    }

                    let depth = val;
                    if (options.invert) {
                        depth = 1.0 - val;
                    }

                    // --- MOUNTING HOLE LOGIC ---
                    if (options.mounting && options.mounting.enabled) {
                        const pixelSizeMm = options.pixelSize || 0.15;
                        const holeRadiusPx = (options.mounting.diameterMm / 2) / pixelSizeMm;
                        const holeOffsetPx = options.mounting.offsetMm / pixelSizeMm;

                        // Hole is at Top-Center
                        const centerX = targetWidth / 2;
                        const centerY = holeOffsetPx; // From top (y=0)

                        // Distance to hole center
                        const px = (i / 4) % targetWidth;
                        const py = Math.floor((i / 4) / targetWidth);
                        const dx = px - centerX;
                        const dy = py - centerY;
                        const distToHole = Math.sqrt(dx * dx + dy * dy);

                        if (distToHole < holeRadiusPx) {
                            // Inside hole -> Transparent
                            depth = -1;
                        }
                    }

                    // --- BORDER GENERATION LOGIC ---
                    if (depth !== -1 && options.border && options.border.type !== 'none') {
                        const bWidthMm = options.border.widthMm;
                        const bDepthMm = options.border.depthMm;
                        const pixelSizeMm = options.pixelSize || 0.15;
                        const borderPixels = Math.round(bWidthMm / pixelSizeMm);

                        const px = (i / 4) % targetWidth;
                        const py = Math.floor((i / 4) / targetWidth);

                        let isInBorder = false;
                        let t = 0; // 0=Outer Edge, 1=Inside (Touch Image) -> Wait, logic below used t=minDist/borderPixels (0=in, 1=out? No 0=edge)

                        if (options.border.type === 'oval') {
                            // --- OVAL MODE ---
                            // Normalized coordinates -1 to +1
                            const u = (px / (targetWidth - 1)) * 2 - 1;
                            const v = (py / (targetHeight - 1)) * 2 - 1;

                            // Distance from center (Elliptical)
                            // d = sqrt(u^2 + v^2). If d > 1, outside.
                            const d = Math.sqrt(u * u + v * v);

                            if (d > 1.0) {
                                // Strictly outside the oval -> Transparent? 
                                // Or should the border be *within* the square?
                                // "Oval" usually means the whole lithophane is oval.
                                // So pixels > 1.0 are transparent (cut away).
                                depth = -1;
                            } else {
                                // Check if in border region
                                // Border Width in UV space?
                                // This is tricky because aspect ratio means Width != Height.
                                // Border is defined in mm.
                                // Calculate distance to edge in mm approx?
                                // Let's simplify: map borderPixels to approx UV width?
                                // uWidth = 2.0. widthPx = targetWidth.
                                // borderU = (borderPixels / targetWidth) * 2;
                                const borderU = (borderPixels / targetWidth) * 2;

                                // Simple radial check: if d > (1.0 - borderU) -> In Border
                                // Note: varies for X vs Y if rectangle, but ellipse scales nicely.
                                // This produces a uniform thickness border in UV space, 
                                // which means physically it might be thicker on X or Y if aspect ratio is not 1.
                                // For true constant thickness, we need Signed Distance Field of Ellipse, expensive.
                                // Let's scale V by aspect ratio? 
                                // Let's Stick to UV metric for now, it's "good enough" for an "Oval Frame" look.

                                if (d > (1.0 - borderU)) {
                                    isInBorder = true;
                                    // t: 0 at outer edge (d=1), 1 at inner edge (d=1-borderU)
                                    // (1 - d) is dist from outer edge.
                                    // t = (1 - d) / borderU;
                                    t = (1.0 - d) / borderU;
                                }
                            }

                        } else {
                            // --- RECTANGULAR MODES ---
                            const distLeft = px;
                            const distRight = targetWidth - 1 - px;
                            const distTop = py;
                            const distBottom = targetHeight - 1 - py;
                            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

                            if (minDist < borderPixels) {
                                isInBorder = true;
                                // t: 0 at edge, 1 at inner
                                t = minDist / borderPixels;
                            }
                        }

                        if (isInBorder && depth !== -1) {
                            // Calculate Profile Height
                            const zMin = options.minHeight;
                            const zMax = options.maxHeight;
                            const range = zMax - zMin;

                            // All profiles: t is 0 (OUTER EDGE) to 1 (INNER EDGE/IMAGE START)
                            // We want border to usually be high at outer, maybe low at inner?
                            // Or just override.

                            let targetBorderZ = 0;

                            switch (options.border.type) {
                                case 'flat':
                                    targetBorderZ = bDepthMm;
                                    break;
                                case 'oval': // Oval uses rounded profile by default, or flat? 
                                case 'rounded':
                                    // Rounded: sin(t * PI/2). 0->0, 1->1 ? 
                                    // We want t=0 (edge) to be low? or high?
                                    // Usually frame is thickest?
                                    // Let's say: Rounded means half-pipe.
                                    // 0 -> 0, 0.5 -> 1, 1 -> 0?
                                    // Or Quarter pipe: 0 -> 1, 1 -> Image?
                                    // Let's do Quarter Pipe: High at edge (t=0), Low at image (t=1).
                                    // cos(t * PI/2)? t=0->1, t=1->0.
                                    targetBorderZ = Math.cos(t * Math.PI / 2) * bDepthMm;
                                    break;
                                case 'chamfer':
                                    // Linear ramp. High at edge (0), Low at image (1)
                                    targetBorderZ = (1 - t) * bDepthMm;
                                    break;
                                case 'frame':
                                    // Decorative Profile
                                    // High at edge, dip, bead, chamfer.
                                    // t: 0 -> 1
                                    if (t < 0.2) {
                                        // Outer Lip (Flat High)
                                        targetBorderZ = bDepthMm;
                                    } else if (t < 0.4) {
                                        // Dip (Grove)
                                        // Normalize t2 from 0 to 1 over 0.2-0.4
                                        const t2 = (t - 0.2) / 0.2;
                                        // Cosine dip?
                                        targetBorderZ = bDepthMm * (0.8 - (Math.sin(t2 * Math.PI) * 0.2));
                                    } else if (t < 0.8) {
                                        // Bead (Round bump)
                                        const t3 = (t - 0.4) / 0.4;
                                        // sin 0->PI
                                        targetBorderZ = bDepthMm * (0.6 + (Math.sin(t3 * Math.PI) * 0.4));
                                    } else {
                                        // Inner Chamfer (Slope down to image)
                                        // t 0.8 -> 1.0
                                        // Height: 0.6 -> 0 (or image height?)
                                        const t4 = (t - 0.8) / 0.2;
                                        targetBorderZ = bDepthMm * 0.6 * (1 - t4);
                                    }
                                    break;
                            }

                            // Convert MM Z to 0-1 Depth
                            let borderVal = (targetBorderZ - zMin) / range;

                            // Blend if transparency? No, border is solid.
                            depth = borderVal;
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
                // Vertices
                const shape = options.shape || { type: 'flat', angle: 180 };

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const pixelIdx = (y * w) + x;
                        const depth = depthData[pixelIdx];

                        // Base Layer support
                        let thickness = options.baseMm;
                        if (depth >= 0) {
                            thickness += options.minHeight + (depth * (options.maxHeight - options.minHeight));
                        }

                        // Normalized coordinates (0 to 1)
                        const u = x / (w - 1);
                        const v = y / (h - 1);

                        // --- Shape Generation ---
                        let vx = 0, vy = 0, vz = 0; // Surface vertex
                        let bx = 0, by = 0, bz = 0; // Base vertex (thickness 0, or inner radius)

                        if (shape.type === 'cylinder') {
                            // Cylindrical Wrap
                            // Width matches circumference? Or Diameter? 
                            // Let's assume WidthMm = Circumference of the base cylinder. 
                            // Radius = Width / 2PI
                            const baseRadius = widthMm / (2 * Math.PI);
                            const rOuter = baseRadius + thickness;
                            const rInner = baseRadius; // Flat base is now the inner cylinder wall

                            // Angle from 0 to 2PI
                            // We might want to offset by -PI/2 to center front?
                            const theta = u * 2 * Math.PI;

                            // Map Y to Y (height)
                            // Centered vertically
                            const yPos = -((y * cellH) - (heightMm / 2));

                            vx = rOuter * Math.cos(theta);
                            vz = rOuter * Math.sin(theta);
                            vy = yPos;

                            bx = rInner * Math.cos(theta);
                            bz = rInner * Math.sin(theta);
                            by = yPos;

                        } else if (shape.type === 'arc') {
                            // Arc Segment
                            // WidthMm = Arc Length
                            // Angle specified in options (e.g. 90, 120, 180)
                            const angleRad = (shape.angle * Math.PI) / 180;
                            // ArcLength = Radius * Angle
                            // Radius = ArcLength / Angle
                            const baseRadius = widthMm / angleRad;

                            const rOuter = baseRadius + thickness;
                            const rInner = baseRadius;

                            // Remap U (0..1) to (-Angle/2 .. +Angle/2) to center it
                            const theta = (u - 0.5) * angleRad;
                            // Rotate so the center of the arc faces "Back" (or front)?
                            // Usually lithophanes are viewed from the "flat" side if inverted?
                            // Let's say center is at Z=Radius, facing origin?
                            // Standard math: cos(0)=1 (X axis). sin(0)=0.
                            // Let's rotate by -PI/2 so center is at (0, -R)?? No.
                            // Let's just use standard polar, but adding PI/2 to rotate face to camera?
                            const offset = -Math.PI / 2;

                            const yPos = -((y * cellH) - (heightMm / 2));

                            vx = rOuter * Math.cos(theta + offset);
                            vz = rOuter * Math.sin(theta + offset);
                            vy = yPos;

                            bx = rInner * Math.cos(theta + offset);
                            bz = rInner * Math.sin(theta + offset);
                            by = yPos;

                        } else if (shape.type === 'sphere') {
                            // Sphere / Moon Mode
                            // WidthMm = Circumference (Equator)
                            const baseRadius = widthMm / (2 * Math.PI);
                            const rOuter = baseRadius + thickness;
                            const rInner = baseRadius;

                            // U -> Longitude (0 to 2PI)
                            const theta = u * 2 * Math.PI;
                            // V -> Latitude (0 to PI) - North Pole to South Pole
                            const phi = v * Math.PI;

                            // Spherical conversion
                            // x = r * sin(phi) * cos(theta)
                            // z = r * sin(phi) * sin(theta) // Swapped Y/Z for ThreeJS up-axis?
                            // y = r * cos(phi)

                            vx = rOuter * Math.sin(phi) * Math.cos(theta);
                            vz = rOuter * Math.sin(phi) * Math.sin(theta);
                            vy = rOuter * Math.cos(phi);

                            bx = rInner * Math.sin(phi) * Math.cos(theta);
                            bz = rInner * Math.sin(phi) * Math.sin(theta);
                            by = rInner * Math.cos(phi);

                        } else {
                            // --- FLAT (Default) ---
                            const pX = (x * cellW) - (widthMm / 2);
                            const pY = -((y * cellH) - (heightMm / 2));

                            vx = pX; vy = pY; vz = thickness;
                            bx = pX; by = pY; bz = 0;
                        }

                        // Top Vertex
                        vertices.push(vx, vy, vz);
                        // Bottom Vertex
                        vertices.push(bx, by, bz);
                    }
                }

                // Indices helper
                const getIdx = (x: number, y: number, layer: 0 | 1) => {
                    return ((y * w) + x) * 2 + layer;
                };

                const isValid = (x: number, y: number) => {
                    if (x < 0 || x >= w || y < 0 || y >= h) return false;
                    return depthData[y * w + x] !== -1; // -1 means transparent/hole
                };

                // Helper for topological edge tracking (to detect boundaries)
                const boundaryEdges = new Map<string, number>();
                const addEdge = (u: number, v: number) => {
                    // We only track edges for the TOP surface.
                    // If an edge u->v is shared by two triangles (e.g. u->v and v->u),
                    // it is internal.
                    const key = `${u}_${v}`;
                    const revKey = `${v}_${u}`;

                    if (boundaryEdges.has(revKey)) {
                        // Found the mate, so this is an internal edge -> remove it
                        boundaryEdges.delete(revKey);
                    } else {
                        // New candidate for boundary
                        boundaryEdges.set(key, 1);
                    }
                };

                // 1. Generate Surface and Base Faces
                for (let y = 0; y < h - 1; y++) {
                    for (let x = 0; x < w - 1; x++) {
                        // Four corners
                        const vTL = isValid(x, y);
                        const vTR = isValid(x + 1, y);
                        const vBL = isValid(x, y + 1);
                        const vBR = isValid(x + 1, y + 1);

                        // Indices
                        const tTL = getIdx(x, y, 0);
                        const tTR = getIdx(x + 1, y, 0);
                        const tBL = getIdx(x, y + 1, 0);
                        const tBR = getIdx(x + 1, y + 1, 0);

                        const bTL = getIdx(x, y, 1);
                        const bTR = getIdx(x + 1, y, 1);
                        const bBL = getIdx(x, y + 1, 1);
                        const bBR = getIdx(x + 1, y + 1, 1);

                        // Triangle 1: TL, BL, TR
                        if (vTL && vBL && vTR) {
                            // Top Surface
                            indices.push(tTL, tBL, tTR);
                            addEdge(tTL, tBL);
                            addEdge(tBL, tTR);
                            addEdge(tTR, tTL);

                            // Bottom Surface (Clockwise / Inverted)
                            indices.push(bTL, bTR, bBL);
                        }

                        // Triangle 2: TR, BL, BR
                        if (vTR && vBL && vBR) {
                            // Top
                            indices.push(tTR, tBL, tBR);
                            addEdge(tTR, tBL);
                            addEdge(tBL, tBR);
                            addEdge(tBR, tTR);

                            // Bottom
                            indices.push(bTR, bBR, bBL);
                        }
                    }
                }

                // 2. Generate Walls from Boundary Edges
                // Any edge remaining in the map is a boundary edge on the Top Surface.
                // We must drop a wall from this edge down to the Bottom Surface.
                for (const key of boundaryEdges.keys()) {
                    const [uStr, vStr] = key.split('_');
                    const u = parseInt(uStr, 10);
                    const v = parseInt(vStr, 10);

                    // Top indices are u, v.
                    // Bottom indices are u+1, v+1 (since we pushed Top then Bottom for each pixel).
                    // Verify: getIdx(x,y,0) is even. getIdx(x,y,1) is getIdx(x,y,0)+1.
                    const uBot = u + 1;
                    const vBot = v + 1;

                    // Wall Quad: Top Edge (u->v) connects to Bottom Edge (vBot->uBot).
                    // We need to maintain winding order (CCW outside).
                    // Top Surface edge u->v represents the boundary, with "valid" to the left.
                    // So the wall should face "out" (to the right of u->v).
                    // Quad sequence: u, v, vBot, uBot.

                    // Triangle 1: u, v, vBot
                    indices.push(u, v, vBot);
                    // Triangle 2: u, vBot, uBot
                    indices.push(u, vBot, uBot);
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
                    geometry: geom, // Return the geometry
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

function applyImageAdjustments(data: Uint8ClampedArray, options: ProcessingOptions) {
    const { contrast = 1.0, brightness = 1.0, gamma = 1.0 } = options;

    // Create lookup tables for speed if needed, but per-pixel is fine for this size
    for (let i = 0; i < data.length; i += 4) {
        // Normalize 0-1
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;

        // Apply Brightness
        r *= brightness;
        g *= brightness;
        b *= brightness;

        // Apply Contrast
        // factor = (259 * (contrast + 255)) / (255 * (259 - contrast)) ? No, simple usually works:
        // centered at 0.5: color = (color - 0.5) * contrast + 0.5
        r = (r - 0.5) * contrast + 0.5;
        g = (g - 0.5) * contrast + 0.5;
        b = (b - 0.5) * contrast + 0.5;

        // Apply Gamma
        // val = val ^ (1/gamma)
        if (gamma !== 1.0 && gamma > 0) {
            r = Math.pow(Math.max(0, r), 1 / gamma);
            g = Math.pow(Math.max(0, g), 1 / gamma);
            b = Math.pow(Math.max(0, b), 1 / gamma);
        }

        // Clamp
        data[i] = Math.min(255, Math.max(0, r * 255));
        data[i + 1] = Math.min(255, Math.max(0, g * 255));
        data[i + 2] = Math.min(255, Math.max(0, b * 255));
    }
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
