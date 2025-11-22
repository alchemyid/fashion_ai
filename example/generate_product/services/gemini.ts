import { GoogleGenAI } from "@google/genai";
import { AspectRatio } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the initial "Master" product image based on description.
 */
export const generateBaseProduct = async (
  prompt: string, 
  aspectRatio: AspectRatio = AspectRatio.SQUARE
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `Professional product photography of ${prompt}. High quality, sharp focus, isolated subject, commercial aesthetic.`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        }
      }
    });

    // Extract image
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part && part.inlineData && part.inlineData.data) {
      return part.inlineData.data;
    }
    
    throw new Error("No image data returned from API");
  } catch (error) {
    console.error("Base generation error:", error);
    throw error;
  }
};

/**
 * Generates a variation of the product using the base image and a new angle/scenario prompt.
 */
export const generateScenarioVariation = async (
  baseImageBase64: string,
  anglePrompt: string,
  aspectRatio: AspectRatio = AspectRatio.SQUARE
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: baseImageBase64
            }
          },
          {
            text: `Generate a photorealistic image of this exact product from the following camera angle/perspective: ${anglePrompt}. Ensure the product details, logos, materials, and identity remain 100% consistent with the input image. Use professional studio lighting on a neutral or complementary background unless specified otherwise.`
          }
        ]
      },
      config: {
         imageConfig: {
          aspectRatio: aspectRatio,
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part && part.inlineData && part.inlineData.data) {
      return part.inlineData.data;
    }

    throw new Error("No variation image returned");
  } catch (error) {
    console.error("Variation generation error:", error);
    throw error;
  }
};