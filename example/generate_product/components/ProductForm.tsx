import React from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { STYLE_PRESETS } from '../constants';
import { ProductState } from '../types';

interface ProductFormProps {
  product: ProductState;
  setProduct: React.Dispatch<React.SetStateAction<ProductState>>;
  onGenerate: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ProductForm: React.FC<ProductFormProps> = ({ 
  product, 
  setProduct, 
  onGenerate,
  onImageUpload
}) => {
  return (
    <div className="space-y-6 p-6 bg-slate-800/50 rounded-2xl border border-slate-700 backdrop-blur-sm">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Define Product
        </h2>
        <p className="text-sm text-slate-400">Describe your product to generate a master asset, or upload your own.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
            Product Name
          </label>
          <input
            type="text"
            value={product.name}
            onChange={(e) => setProduct(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. ChronoMax Watch"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
            Visual Description
          </label>
          <textarea
            value={product.description}
            onChange={(e) => setProduct(p => ({ ...p, description: e.target.value }))}
            placeholder="A matte black stainless steel analog watch with gold indices and a leather strap..."
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
            Artistic Style
          </label>
          <select
            value={product.style}
            onChange={(e) => setProduct(p => ({ ...p, style: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none cursor-pointer"
          >
            {STYLE_PRESETS.map(style => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            onClick={onGenerate}
            disabled={!product.description || product.isGeneratingBase}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
          >
            {product.isGeneratingBase ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate Master
              </>
            )}
          </button>
          
           <div className="relative">
             <input
                type="file"
                accept="image/*"
                onChange={onImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={product.isGeneratingBase}
              />
             <button
               className="h-full px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center"
               title="Upload existing product image"
             >
               <Upload className="w-5 h-5" />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};
