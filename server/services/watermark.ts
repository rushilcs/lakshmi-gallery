import sharp from "sharp";

export async function createThumbnail(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    })
    .sharpen(0.5)
    .jpeg({
      quality: 85,
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
    })
    .toBuffer();
}

export async function createPreview(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize({ width: 2048, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function applyWatermarkOverlay(input: {
  image: Buffer;
  watermark: Buffer;
  scale?: number;
  x_pct?: number;
  y_pct?: number;
  scale_portrait?: number;
  x_pct_portrait?: number;
  y_pct_portrait?: number;
}): Promise<Buffer> {
  const info = await sharp(input.image).metadata();
  const width = info.width ?? 1200;
  const height = info.height ?? 800;
  const isPortrait = height > width;
  const usePortrait =
    isPortrait &&
    (input.scale_portrait != null || input.x_pct_portrait != null || input.y_pct_portrait != null);
  const scale = Math.max(
    0.05,
    Math.min(
      0.6,
      usePortrait ? (input.scale_portrait ?? 0.2) : (input.scale ?? 0.2),
    ),
  );
  const xPct = usePortrait ? (input.x_pct_portrait ?? 100) : (input.x_pct ?? 100);
  const yPct = usePortrait ? (input.y_pct_portrait ?? 100) : (input.y_pct ?? 100);

  const wmWidth = Math.max(60, Math.floor(width * scale));

  const wm = await sharp(input.watermark)
    .resize({ width: wmWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
  const wmMeta = await sharp(wm).metadata();
  const wmW = wmMeta.width ?? wmWidth;
  const wmH = wmMeta.height ?? Math.floor(wmW * 0.5);
  const left = Math.round(((width - wmW) / 100) * xPct);
  const top = Math.round(((height - wmH) / 100) * yPct);

  return sharp(input.image)
    .composite([{ input: wm, left: Math.max(0, left), top: Math.max(0, top) }])
    .jpeg({ quality: 86 })
    .toBuffer();
}
