export type BorderType = 'none' | 'flat' | 'rounded' | 'chamfer' | 'oval' | 'frame';

export interface BorderSettings {
    type: BorderType;
    widthMm: number;
    depthMm: number;
}

export interface MountingSettings {
    enabled: boolean;
    diameterMm: number;
    offsetMm: number; // Distance from top edge
}

export type ShapeType = 'flat' | 'cylinder' | 'arc' | 'sphere' | 'circle';

export interface ShapeSettings {
    type: ShapeType;
    angle: number; // For Arc (degrees)
}

export interface ProcessingOptions {
    layerCount: number; // Number of gray levels (e.g. 5-7)
    minHeight: number; // Minimum thickness in mm
    maxHeight: number; // Maximum thickness in mm
    widthMm: number; // Physical width of the print in mm
    invert: boolean; // Invert brightness (darker = higher vs brighter = higher)
    smoothing: number; // 0-1 smoothing factor
    layerVisibility?: boolean[]; // Array of flags for each layer

    // Image Adjustments
    contrast?: number;
    brightness?: number;
    gamma?: number;
    backgroundRemoval?: boolean;
    backgroundThreshold?: number;

    baseMm: number; // Solid base thickness
    pixelSize: number; // mm per pixel (resolution)
    border: BorderSettings;
    shape: ShapeSettings;
    mounting?: MountingSettings;
}

export const DEFAULT_OPTIONS: ProcessingOptions = {
    layerCount: 6,
    minHeight: 0.6, // Base thickness
    maxHeight: 3.0, // Max thickness
    widthMm: 100, // 10cm wide
    invert: false,
    smoothing: 0,
    layerVisibility: [],

    contrast: 1.0,
    brightness: 1.0,
    gamma: 1.0,
    backgroundRemoval: false,
    backgroundThreshold: 250,

    baseMm: 2.0,
    pixelSize: 0.15,
    border: {
        type: 'none',
        widthMm: 3,
        depthMm: 3
    },
    shape: {
        type: 'flat',
        angle: 180
    },
    mounting: {
        enabled: false,
        diameterMm: 5,
        offsetMm: 5
    }
};
