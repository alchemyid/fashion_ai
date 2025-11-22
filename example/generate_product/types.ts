export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "3:4",
  LANDSCAPE = "4:3",
  WIDE = "16:9",
}

export interface ProductState {
  name: string;
  description: string;
  style: string;
  baseImage: string | null; // Base64 string
  isGeneratingBase: boolean;
}

export interface Scenario {
  id: string;
  prompt: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  resultImage: string | null; // Base64 string
}

export interface GenerationConfig {
  aspectRatio: AspectRatio;
}
