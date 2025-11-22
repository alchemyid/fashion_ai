import React, { useState } from 'react';
import { Trash2, Download, Maximize2, X, Loader2, Camera } from 'lucide-react';
import { Scenario } from '../types';

interface VariationManagerProps {
  scenarios: Scenario[];
  setScenarios: React.Dispatch<React.SetStateAction<Scenario[]>>;
}

export const VariationManager: React.FC<VariationManagerProps> = ({
  scenarios,
  setScenarios,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const removeScenario = (id: string) => {
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const handleDownload = (base64Data: string, filename: string) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = filename;
    link.click();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header for the Right Panel */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Camera className="w-6 h-6 text-emerald-400" />
          Production Gallery
        </h2>
        <div className="text-sm text-slate-400">
          {scenarios.length} {scenarios.length === 1 ? 'Asset' : 'Assets'}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pr-2 pb-10 min-h-0 flex-1">
        {scenarios.map((scenario) => (
          <div 
            key={scenario.id} 
            className="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden aspect-square flex flex-col shadow-lg shadow-black/20 hover:border-emerald-500/30 transition-colors"
          >
            {/* Image/Status Area */}
            <div className="flex-1 relative w-full h-full bg-black/20">
               {scenario.resultImage ? (
                 <img 
                   src={`data:image/png;base64,${scenario.resultImage}`} 
                   alt={scenario.prompt}
                   className="w-full h-full object-cover"
                 />
               ) : (
                 <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    {scenario.status === 'loading' ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        <span className="text-xs font-medium tracking-wide text-emerald-500/80 uppercase">Developing...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 opacity-40">
                         <Camera className="w-8 h-8" />
                         <span className="text-xs uppercase tracking-widest">Queued</span>
                      </div>
                    )}
                 </div>
               )}

               {/* Overlay Actions */}
               {scenario.resultImage && (
                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                   <button 
                    onClick={() => setSelectedImage(scenario.resultImage)}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                   >
                     <Maximize2 className="w-5 h-5" />
                   </button>
                   <button 
                    onClick={() => handleDownload(scenario.resultImage!, `angle-${scenario.id}.png`)}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                   >
                     <Download className="w-5 h-5" />
                   </button>
                 </div>
               )}
            </div>

            {/* Prompt Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-between items-center gap-2 h-12">
              <p className="text-[10px] text-slate-300 line-clamp-2 font-medium flex-1 leading-tight opacity-80">{scenario.prompt}</p>
              <button 
                onClick={() => removeScenario(scenario.id)}
                className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        
        {scenarios.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center h-[400px] text-slate-600 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
            <Camera className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-slate-500 mb-2">Gallery is Empty</h3>
            <p className="text-sm max-w-xs text-center opacity-60">Use the controls on the left to generate your Master Asset and add Camera Angles.</p>
          </div>
        )}
      </div>

      {/* Modal for Fullscreen */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-8" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
            <X className="w-10 h-10" />
          </button>
          <img 
            src={`data:image/png;base64,${selectedImage}`} 
            alt="Full screen view" 
            className="max-w-full max-h-full rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};