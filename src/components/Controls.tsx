import { Ruler, Layers, MoveVertical } from 'lucide-react';
import type { ProcessingOptions } from '../lib/types';
import { twMerge } from 'tailwind-merge';
import { useEffect } from 'react';

interface ControlsProps {
    options: ProcessingOptions;
    onChange: (options: ProcessingOptions) => void;
    className?: string;
}

export function Controls({ options, onChange, className }: ControlsProps) {
    // Ensure visibility array matches layer count
    useEffect(() => {
        if (!options.layerVisibility || options.layerVisibility.length !== options.layerCount) {
            // Create new array, preserving old values if possible
            const newVis = new Array(options.layerCount).fill(true);
            if (options.layerVisibility) {
                for (let i = 0; i < Math.min(options.layerVisibility.length, options.layerCount); i++) {
                    newVis[i] = options.layerVisibility[i];
                }
            }
            onChange({ ...options, layerVisibility: newVis });
        }
    }, [options.layerCount]); // Only check when layer count changes (or on mount)

    const updateOption = <K extends keyof ProcessingOptions>(key: K, value: number | boolean | boolean[]) => {
        // Special handling for layerCount to resize visibility
        if (key === 'layerCount') {
            const count = value as number;
            const newVis = new Array(count).fill(true);
            // Preserve old
            if (options.layerVisibility) {
                for (let i = 0; i < Math.min(options.layerVisibility.length, count); i++) {
                    newVis[i] = options.layerVisibility[i];
                }
            }
            onChange({ ...options, layerCount: count, layerVisibility: newVis });
        } else {
            onChange({ ...options, [key]: value });
        }
    };

    const toggleLayer = (index: number) => {
        if (!options.layerVisibility) return;
        const newVis = [...options.layerVisibility];
        newVis[index] = !newVis[index];
        updateOption('layerVisibility', newVis);
    };

    return (
        <div className={twMerge("space-y-6", className)}>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                        <Layers className="w-4 h-4 text-primary" />
                        Layer Count
                    </label>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-primary">
                        {options.layerCount} layers
                    </span>
                </div>
                <input
                    type="range"
                    min="2"
                    max="20"
                    step="1"
                    value={options.layerCount}
                    onChange={(e) => updateOption('layerCount', parseInt(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />

                {/* Layer Visibility Toggles */}
                {options.layerVisibility && options.layerVisibility.length === options.layerCount && (
                    <div className="grid grid-cols-5 gap-1 mt-2">
                        {options.layerVisibility.map((isVisible, idx) => (
                            <button
                                key={idx}
                                onClick={() => toggleLayer(idx)}
                                className={twMerge(
                                    "h-8 rounded flex items-center justify-center text-xs font-mono border transition-all",
                                    isVisible
                                        ? "bg-primary/20 border-primary/50 text-primary hover:bg-primary/30"
                                        : "bg-white/5 border-transparent text-white/20 hover:bg-white/10"
                                )}
                                title={`Toggle Layer ${idx + 1}`}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>
                )}
                <p className="text-xs text-white/40">Toggle specific layers on/off.</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                        <span className="text-primary">~</span>
                        Smoothing
                    </label>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-primary">
                        {Math.round(options.smoothing * 100)}%
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={options.smoothing}
                    onChange={(e) => updateOption('smoothing', parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-white/40">Blur image to reduce noise before processing.</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                        <span className="text-primary">_</span>
                        Base Thickness
                    </label>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-primary">
                        {options.baseMm}mm
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.2"
                    value={options.baseMm}
                    onChange={(e) => updateOption('baseMm', parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-white/40">Solid base layer underneath the lithophane.</p>
            </div>

            <div className="space-y-4">
                <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                    <MoveVertical className="w-4 h-4 text-primary" />
                    Thickness Range (mm)
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <span className="text-xs text-white/50">Min Height</span>
                        <input
                            type="number"
                            min="0.2"
                            max="5"
                            step="0.1"
                            value={options.minHeight}
                            onChange={(e) => updateOption('minHeight', parseFloat(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:border-primary/50 outline-none transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <span className="text-xs text-white/50">Max Height</span>
                        <input
                            type="number"
                            min="0.2"
                            max="10"
                            step="0.1"
                            value={options.maxHeight}
                            onChange={(e) => updateOption('maxHeight', parseFloat(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:border-primary/50 outline-none transition-colors"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                        <span className="text-primary">#</span>
                        Resolution (mm/px)
                    </label>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-primary">
                        {options.pixelSize || 0.15}mm
                    </span>
                </div>
                <input
                    type="range"
                    min="0.1"
                    max="0.4"
                    step="0.05"
                    value={options.pixelSize || 0.15}
                    onChange={(e) => updateOption('pixelSize', parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-white/40">Lower is sharper. Higher is faster.</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2 text-white/90">
                        <Ruler className="w-4 h-4 text-primary" />
                        Print Width (mm)
                    </label>
                    <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-primary">
                        {options.widthMm}mm
                    </span>
                </div>
                <input
                    type="range"
                    min="20"
                    max="300"
                    step="5"
                    value={options.widthMm}
                    onChange={(e) => updateOption('widthMm', parseInt(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
            </div>

            <div className="pt-4 border-t border-white/10">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={options.invert}
                        onChange={(e) => updateOption('invert', e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 checked:bg-primary transition-colors cursor-pointer"
                    />
                    <span className="text-sm text-white/80 group-hover:text-white transition-colors">Invert Heights (Darker = Higher)</span>
                </label>
            </div>
        </div >
    );
}
