import type { FaceProvider } from "./FaceProvider.js";
import { RekognitionFaceProvider } from "./RekognitionFaceProvider.js";

let defaultProvider: FaceProvider | null = null;

export function getFaceProvider(): FaceProvider {
  if (!defaultProvider) {
    defaultProvider = new RekognitionFaceProvider();
  }
  return defaultProvider;
}

export function setFaceProvider(provider: FaceProvider): void {
  defaultProvider = provider;
}

export type { FaceCluster, FaceProvider } from "./FaceProvider.js";
export { RekognitionFaceProvider } from "./RekognitionFaceProvider.js";
