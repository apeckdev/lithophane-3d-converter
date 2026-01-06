import { useState, useEffect, useCallback } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { Controls } from './components/Controls';
import { ImageCropper } from './components/ImageCropper';
import { Layers, Cuboid, Download, Loader2, ArrowLeft, Crop } from 'lucide-react';
import { DEFAULT_OPTIONS } from './lib/types';
import type { ProcessingOptions } from './lib/types';
import { processImage } from './lib/processing';
import type { ProcessResult } from './lib/processing';

function App() {
  const [file, setFile] = useState<File | null>(null);
  // Source preview (original)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Processing state
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);

  const handleImageSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setSourceUrl(url);
    setIsCropping(true);
  };

  const handleCropComplete = (croppedUrl: string) => {
    setSourceUrl(croppedUrl);
    setIsCropping(false);
  };

  const handleCropCancel = () => {
    setIsCropping(false);
  };

  const handleReset = () => {
    setFile(null);
    setSourceUrl(null);
    setResult(null);
    setIsCropping(false);
  };

  const process = useCallback(async () => {
    if (!sourceUrl || isCropping) return;

    setIsProcessing(true);
    try {
      const res = await processImage(sourceUrl, options);
      setResult(res);
    } catch (err) {
      console.error("Processing failed", err);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceUrl, options, isCropping]);

  // Debounced processing effect
  useEffect(() => {
    if (!file || !sourceUrl || isCropping) return;

    const timer = setTimeout(() => {
      process();
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [process, file, sourceUrl, isCropping]);

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.stlBlob);
    link.download = `lithophane-${options.layerCount}layers.stl`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 flex flex-col">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layers className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Lithophane 3D Converter</h1>
          </div>
          <div className="text-sm text-white/50 font-medium">
            v0.1.0
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 flex-1 overflow-hidden">
        {isCropping && sourceUrl && (
          <ImageCropper
            imageUrl={sourceUrl}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}

        {!file ? (
          <div className="max-w-2xl mx-auto mt-20 fade-in">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
                Turn Images into 3D Prints
              </h2>
              <p className="text-lg text-white/60">
                Create stunning multi-layer lithophanes optimized for white filament.
                <br />
                Simple drag & drop workflow.
              </p>
            </div>
            <ImageUpload onImageSelect={handleImageSelect} />

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: 'Upload', desc: 'Drag & drop any image' },
                { title: 'Process', desc: 'Auto-convert to grayscale layers' },
                { title: 'Print', desc: 'Download STL & print' }
              ].map((step, i) => (
                <div key={i} className="p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                  <div className="text-3xl font-bold text-white/10 mb-2">0{i + 1}</div>
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-sm text-white/50">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-[600px]">
            {/* Sidebar Controls */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-white/10">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Cuboid className="w-5 h-5 text-primary" />
                    Settings
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCropping(true)}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                      title="Recrop Image"
                    >
                      <Crop className="w-3 h-3" />
                      Crop
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                </div>

                <Controls
                  options={options}
                  onChange={setOptions}
                  className="flex-1"
                />

                <div className="pt-6 border-t border-white/10 mt-6 space-y-4">
                  {isProcessing ? (
                    <div className="w-full py-3 bg-white/5 rounded-lg flex items-center justify-center gap-2 text-white/50 cursor-not-allowed">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Model...
                    </div>
                  ) : (
                    <button
                      onClick={handleDownload}
                      disabled={!result}
                      className="w-full py-3 bg-primary text-background font-semibold rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                      Download STL
                    </button>
                  )}
                  <p className="text-xs text-center text-white/30">
                    Includes {result ? (result.stlBlob.size / 1024 / 1024).toFixed(1) : 0}MB mesh
                  </p>
                </div>
              </div>
            </div>

            {/* Main Preview Area */}
            <div className="lg:col-span-8 p-6 rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded text-xs text-white/70 border border-white/5">
                {isProcessing ? 'Generating Mesh...' : '2D Layer Preview'}
              </div>

              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                  <p className="text-white/70 animate-pulse">Computing Geometry...</p>
                </div>
              )}

              {result?.previewUrl ? (
                <img
                  src={result.previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-500"
                />
              ) : (
                <div className="text-white/30 text-sm">Waiting for parameters...</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
