import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface ImageUploadProps {
    onImageSelect: (file: File) => void;
    className?: string;
}

export function ImageUpload({ onImageSelect, className }: ImageUploadProps) {
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            onImageSelect(file);
        }
    }, [onImageSelect]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
    }, [onImageSelect]);

    return (
        <div
            className={twMerge(
                "relative group cursor-pointer border-2 border-dashed border-white/20 rounded-xl p-8 transition-colors hover:border-primary/50 hover:bg-white/5",
                className
            )}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            <input
                type="file"
                accept="image/*"
                onChange={handleChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 rounded-full bg-white/5 group-hover:bg-primary/10 transition-colors">
                    <Upload className="w-8 h-8 text-white/50 group-hover:text-primary transition-colors" />
                </div>
                <div className="space-y-1">
                    <p className="text-lg font-medium">Drop an image here</p>
                    <p className="text-sm text-white/50">Supports PNG, JPG, WEBP</p>
                </div>
            </div>
        </div>
    );
}
