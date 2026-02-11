import { useState, useEffect, useCallback } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { Controls } from './components/Controls';
import { ImageCropper } from './components/ImageCropper';
import { Preview3D } from './components/Preview3D';
import { Layers, Cuboid, Download, Loader2, ArrowLeft, Crop } from 'lucide-react';
import { DEFAULT_OPTIONS } from './lib/types';
import type { ProcessingOptions } from './lib/types';
import { processImage } from './lib/processing';
import type { ProcessResult } from './lib/processing';
import { generateStand } from './lib/standGenerator';


function App() {
  const [file, setFile] = useState<File | null>(null);
  // Source preview (original)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Processing state
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [isGeneratingStand, setIsGeneratingStand] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');


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

  // Persistence: Load options on mount
  useEffect(() => {
    const saved = localStorage.getItem('lithophane_options');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure new fields (like mounting) are present
        setOptions(() => ({ ...DEFAULT_OPTIONS, ...parsed }));
      } catch (e) {
        console.warn("Failed to load options", e);
      }
    }
  }, []);

  const handleNewImage = () => {
    if (window.confirm("Start over with a new image?")) {
      setFile(null);
      setSourceUrl(null);
      setResult(null);
      setIsCropping(false);
    }
  };

  const handleResetSettings = () => {
    if (window.confirm("Reset all processing settings to default?")) {
      setOptions(DEFAULT_OPTIONS);
    }
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

  const handleDownloadStand = async () => {
    setIsGeneratingStand(true);
    try {
      const thickness = options.baseMm + options.maxHeight;
      const blob = await generateStand(thickness);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stand-${thickness.toFixed(1)}mm.stl`;
      link.click();
    } catch (e) {
      console.error("Failed to generate stand", e);
    } finally {
      setIsGeneratingStand(false);
    }
  };


  return (
    <div className="h-screen bg-background text-foreground selection:bg-primary/20 flex flex-col overflow-hidden">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-md z-50 shrink-0">
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

      <main className="container mx-auto px-6 py-4 flex-1 overflow-hidden h-full">
        {isCropping && sourceUrl && (
          <ImageCropper
            imageUrl={sourceUrl}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}

        {!file ? (
          <div className="max-w-2xl mx-auto mt-20 fade-in overflow-y-auto max-h-full pb-20">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full pb-20 lg:pb-0">
            {/* Sidebar Controls - Scrollable */}
            <div className="lg:col-span-4 flex flex-col h-full overflow-hidden min-h-0">
              {/* Wrapper to ensure height constraint */}
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex flex-col h-full overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0 bg-black/20">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Cuboid className="w-5 h-5 text-primary" />
                    Settings
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetSettings}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors mr-2"
                      title="Reset parameters to defaults"
                    >
                      Defaults
                    </button>
                    <button
                      onClick={() => setIsCropping(true)}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                      title="Recrop Image"
                    >
                      <Crop className="w-3 h-3" />
                      Crop
                    </button>
                    <button
                      onClick={handleNewImage}
                      className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                      title="Start Over"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      New
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  <Controls
                    options={options}
                    onChange={setOptions}
                    className=""
                  />

                  <div className="pt-6 border-t border-white/10 space-y-4">
                    {isProcessing ? (
                      <div className="w-full py-3 bg-white/5 rounded-lg flex items-center justify-center gap-2 text-white/50 cursor-not-allowed">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing Model...
                      </div>
                    ) : (
                      <button
                        onClick={handleDownload}
                        disabled={!result}
                        className="w-full py-3 bg-primary text-background font-semibold rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                      >
                        <Download className="w-4 h-4" />
                        Download STL
                      </button>
                    )}
                    <p className="text-xs text-center text-white/30">
                      Includes {result ? (result.stlBlob.size / 1024 / 1024).toFixed(1) : 0}MB mesh
                    </p>
                  </div>

                  {/* Stand Generator Section */}
                  <div className="pt-6 border-t border-white/10 space-y-3">
                    <h4 className="text-sm font-semibold text-white/80">Accessories</h4>
                    <p className="text-xs text-white/50 mb-2">
                      Generate a custom stand optimized for your current settings.
                      Perfect for back-lighting.
                    </p>
                    {isGeneratingStand ? (
                      <div className="w-full py-2 bg-white/5 rounded-lg flex items-center justify-center gap-2 text-white/50 cursor-not-allowed">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-sm">Building Stand...</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleDownloadStand}
                        className="w-full py-2 bg-white/10 hover:bg-white/20 text-white/80 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 border border-white/5"
                        title="Download a stand fitted for this lithophane"
                      >
                        <Cuboid className="w-4 h-4" />
                        Download Fitted Stand
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Preview Area - Takes remaining height */}
            <div className="lg:col-span-8 h-full rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="bg-black/60 backdrop-blur px-3 py-1 rounded text-xs text-white/70 border border-white/5">
                  {isProcessing ? 'Generating...' : (viewMode === '2d' ? '2D Layer Preview' : '3D Mesh Preview')}
                </div>

                {/* View Toggle */}
                <div className="flex bg-black/60 backdrop-blur rounded border border-white/5 p-0.5">
                  <button
                    onClick={() => setViewMode('2d')}
                    className={`px-3 py-0.5 text-xs rounded transition-colors ${viewMode === '2d' ? 'bg-primary text-background font-medium' : 'text-white/50 hover:text-white'}`}
                  >
                    2D
                  </button>
                  <button
                    onClick={() => setViewMode('3d')}
                    className={`px-3 py-0.5 text-xs rounded transition-colors ${viewMode === '3d' ? 'bg-primary text-background font-medium' : 'text-white/50 hover:text-white'}`}
                  >
                    3D
                  </button>
                </div>
              </div>

              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                  <p className="text-white/70 animate-pulse">Computing Geometry...</p>
                </div>
              )}

              {result ? (
                <div className="w-full h-full">
                  {viewMode === '3d' && result.geometry ? (
                    <Preview3D geometry={result.geometry} imageUrl={result.previewUrl} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-8">
                      <img
                        src={result.previewUrl}
                        alt="2D Preview"
                        className="max-w-full max-h-full object-contain rounded shadow-2xl border border-white/10"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-white/30 text-sm">Waiting for parameters...</div>
              )}
            </div>
          </div>
        )
        }
      </main >
    </div >
  );
}

export default App;
