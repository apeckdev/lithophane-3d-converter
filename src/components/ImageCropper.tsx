import React, { useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Check, X } from 'lucide-react';

interface ImageCropperProps {
    imageUrl: string;
    onCropComplete: (croppedUrl: string) => void;
    onCancel: () => void;
}

// Helper to center initial crop
function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect?: number) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect || mediaWidth / mediaHeight,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

export function ImageCropper({ imageUrl, onCropComplete, onCancel }: ImageCropperProps) {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [aspect] = useState<number | undefined>(undefined);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        setCrop(centerAspectCrop(width, height, aspect));
    }

    const getCroppedImg = async () => {
        const image = imgRef.current;
        if (!image || !completedCrop) return;

        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        // Low-level cropping
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
        canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(pixelRatio, pixelRatio);
        ctx.imageSmoothingQuality = 'high';

        const cropX = completedCrop.x * scaleX;
        const cropY = completedCrop.y * scaleY;

        ctx.save();

        // Translate to center of canvas
        ctx.translate(-cropX, -cropY);
        ctx.drawImage(
            image,
            0,
            0,
            image.naturalWidth,
            image.naturalHeight,
            0,
            0,
            image.naturalWidth,
            image.naturalHeight,
        );

        ctx.restore();

        // As Base64
        const base64Image = canvas.toDataURL('image/png');
        onCropComplete(base64Image);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8 max-h-screen">
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-white/10 shadow-2xl flex flex-col gap-4 max-h-full">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Crop Image</h3>
                    <div className="flex gap-2">
                        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                        <button onClick={getCroppedImg} className="px-4 py-2 bg-primary text-background font-semibold rounded-lg hover:bg-white transition-colors flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Apply Crop
                        </button>
                    </div>
                </div>

                <div className="overflow-auto flex-1 flex items-center justify-center bg-black/50 rounded-lg p-4 min-h-[300px]">
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={undefined} // Free aspect ratio
                    >
                        <img
                            ref={imgRef}
                            alt="Crop me"
                            src={imageUrl}
                            onLoad={onImageLoad}
                            className="max-h-[70vh] object-contain"
                        />
                    </ReactCrop>
                </div>
                <div className="text-xs text-white/30 text-center">
                    Drag to crop.
                </div>
            </div>
        </div>
    );
}
