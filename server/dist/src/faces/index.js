import { RekognitionFaceProvider } from "./RekognitionFaceProvider.js";
let defaultProvider = null;
export function getFaceProvider() {
    if (!defaultProvider) {
        defaultProvider = new RekognitionFaceProvider();
    }
    return defaultProvider;
}
export function setFaceProvider(provider) {
    defaultProvider = provider;
}
export { RekognitionFaceProvider } from "./RekognitionFaceProvider.js";
