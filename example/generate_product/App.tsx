import React, { useState, useCallback } from 'react';
import { ProductForm } from './components/ProductForm';
import { VariationManager } from './components/VariationManager';
import { ProductState, Scenario } from './types';
import { DEFAULT_ANGLES, DEFAULT_ASPECT_RATIO } from './constants';
import { generateBaseProduct, generateScenarioVariation } from './services/gemini';
import { Box, Layers, Download, RefreshCw, Camera, Plus, Play, Loader2, Aperture } from 'lucide-react';

const App: React.FC = () => {
  // Product State
  const [product, setProduct] = useState<ProductState>({
    name: '',
    description: '',
    style: 'Photorealistic, 8k, studio lighting',
    baseImage: null,
    isGeneratingBase: false
  });

  // Scenarios State
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedAngle, setSelectedAngle] = useState(DEFAULT_ANGLES[0]);
  const [isProcessingVariations, setIsProcessingVariations] = useState(false);

  // Handlers
  const handleGenerateBase = async () => {
    if (!product.description) return;
    
    setProduct(prev => ({ ...prev, isGeneratingBase: true }));
    
    try {
      const fullPrompt = `${product.name ? `Product: ${product.name}. ` : ''}${product.description}. Style: ${product.style}`;
      const base64 = await generateBaseProduct(fullPrompt, DEFAULT_ASPECT_RATIO);
      
      setProduct(prev => ({ ...prev, baseImage: base64, isGeneratingBase: false }));
    } catch (error) {
      console.error(error);
      alert("Failed to generate base image. Please try again.");
      setProduct(prev => ({ ...prev, isGeneratingBase: false }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const rawBase64 = base64String.replace(/^data:image\/[a-z]+;base64,/, "");
        setProduct(prev => ({ ...prev, baseImage: rawBase64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addScenario = () => {
    if (!selectedAngle) return;
    const newScenario: Scenario = {
      id: crypto.randomUUID(),
      prompt: selectedAngle,
      status: 'idle',
      resultImage: null
    };
    setScenarios([...scenarios, newScenario]);
  };

  const handleGenerateVariations = useCallback(async () => {
    if (!product.baseImage) return;
    
    setIsProcessingVariations(true);
    
    const pendingScenarios = scenarios.filter(s => !s.resultImage);

    for (const scenario of pendingScenarios) {
      setScenarios(prev => prev.map(s => s.id === scenario.id ? { ...s, status: 'loading' } : s));

      try {
        const resultBase64 = await generateScenarioVariation(product.baseImage!, scenario.prompt, DEFAULT_ASPECT_RATIO);
        setScenarios(prev => prev.map(s => s.id === scenario.id ? { ...s, status: 'success', resultImage: resultBase64 } : s));
      } catch (error) {
        console.error(`Failed scenario: ${scenario.prompt}`, error);
        setScenarios(prev => prev.map(s => s.id === scenario.id ? { ...s, status: 'error' } : s));
      }
    }

    setIsProcessingVariations(false);
  }, [product.baseImage, scenarios]);

  const handleDownloadBase = () => {
    if (product.baseImage) {
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${product.baseImage}`;
      link.download = `product-master.png`;
      link.click();
    }
  };

  const handleResetBase = () => {
    if(confirm("Are you sure you want to clear the master image? This will reset your variations.")) {
        setProduct(prev => ({ ...prev, baseImage: null }));
        setScenarios([]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center px-6 justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            ProductGenius
          </h1>
        </div>
        <div className="text-xs font-medium px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
          Powered by Gemini 2.5 Flash
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: Controls */}
        <aside className="w-[420px] bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
           <div className="p-6 space-y-8">
             
             {/* 1. Define Product */}
             <ProductForm 
                product={product}
                setProduct={setProduct}
                onGenerate={handleGenerateBase}
                onImageUpload={handleImageUpload}
              />

             {/* 2. Master Asset */}
             <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Box className="w-4 h-4 text-blue-400" />
                      Master Asset
                    </h2>
                    {product.baseImage && (
                        <div className="flex gap-1">
                            <button onClick={handleResetBase} title="Reset" className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors">
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                             <button onClick={handleDownloadBase} title="Download" className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">
                                <Download className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                 </div>

                 <div className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden aspect-square flex items-center justify-center group shadow-inner">
                    {product.baseImage ? (
                      <img 
                        src={`data:image/png;base64,${product.baseImage}`} 
                        alt="Master Product" 
                        className="w-full h-full object-contain p-4"
                      />
                    ) : (
                      <div className="text-center p-6 opacity-50">
                        <Box className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-xs text-slate-500">
                          Generate or upload a master asset to begin.
                        </p>
                      </div>
                    )}
                    
                    {product.isGeneratingBase && (
                       <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center z-10 backdrop-blur-sm">
                         <div className="flex flex-col items-center gap-3">
                           <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                           <span className="text-indigo-400 font-medium tracking-wider text-xs">GENERATING ASSET...</span>
                         </div>
                       </div>
                    )}
                 </div>
             </div>

             {/* 3. Camera Angles Control */}
             <div className="space-y-3 pt-2 border-t border-slate-800/50">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  Camera Angles
                </h2>
                
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Select Angle / Perspective</label>
                    <div className="relative">
                      <div className="absolute left-3 top-3 pointer-events-none">
                        <Aperture className="w-4 h-4 text-slate-500" />
                      </div>
                      <select
                        value={selectedAngle}
                        onChange={(e) => setSelectedAngle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none cursor-pointer transition-all hover:border-slate-600"
                      >
                        {DEFAULT_ANGLES.map((angle, index) => (
                          <option key={index} value={angle}>
                            {angle.split('-')[0].trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 px-1 leading-relaxed">
                       {DEFAULT_ANGLES.find(a => a === selectedAngle)?.split('-')[1] || selectedAngle}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <button 
                        onClick={addScenario}
                        disabled={!product.baseImage}
                        className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add to Queue
                      </button>
                      
                      <button
                        onClick={handleGenerateVariations}
                        disabled={!product.baseImage || isProcessingVariations || scenarios.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                       >
                         {isProcessingVariations ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5 fill-current" />}
                         Run Photoshoot
                       </button>
                  </div>
                </div>
             </div>

           </div>
        </aside>

        {/* RIGHT CONTENT: Results Gallery */}
        <main className="flex-1 overflow-hidden bg-[#0b1120] p-8 flex flex-col">
           <VariationManager 
               scenarios={scenarios}
               setScenarios={setScenarios}
           />
        </main>

      </div>
    </div>
  );
};

export default App;