// Bound retained artwork size before saving it for the entire library.
export async function resizeArtwork(blob) {
  if (!blob || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return blob;
  let image;
  try {
    image = await createImageBitmap(blob);
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch { return blob; }
  finally { image?.close(); }
}
