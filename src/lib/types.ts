export type BorderType = 'none' | 'flat' | 'rounded' | 'chamfer';

export interface BorderSettings {
    type: BorderType;
    widthMm: number;
    depthMm: number;
}

export interface ProcessingOptions {
    layerCount: number; // Number of gray levels (e.g. 5-7)
    minHeight: number; // Minimum thickness in mm
    maxHeight: number; // Maximum thickness in mm
    widthMm: number; // Physical width of the print in mm
    invert: boolean; // Invert brightness (darker = higher vs brighter = higher)
    smoothing: number; // 0-1 smoothing factor
    layerVisibility?: boolean[]; // Array of flags for each layer
    baseMm: number; // Solid base thickness
    pixelSize: number; // mm per pixel (resolution)
    border: BorderSettings;
}

export const DEFAULT_OPTIONS: ProcessingOptions = {
    layerCount: 6,
    minHeight: 0.6, // Base thickness
    maxHeight: 3.0, // Max thickness
    widthMm: 100, // 10cm wide
    invert: false,
    smoothing: 0,
    baseMm: 0,
    pixelSize: 0.15,
    border: {
        type: 'none',
        widthMm: 3,
        depthMm: 3
    }
};
