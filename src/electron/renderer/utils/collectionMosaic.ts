/**
 * Compose a 2x2 mosaic from up to 4 cover dataURLs, returning a JPEG
 * dataURL suitable for an <img src=...>.
 *
 * Renders entirely in the renderer via an offscreen <canvas> so we don't pay
 * an IPC round-trip per collection thumbnail. Output is 200x200 (matches the
 * grid thumbnail size). Tiles fewer than 4 sources tile-and-stretch the
 * available covers; 0 sources returns null so the caller can render a
 * placeholder.
 */
export async function composeCollectionMosaic(
  coverDataUrls: string[],
  size = 200
): Promise<string | null> {
  const sources = coverDataUrls.filter(Boolean).slice(0, 4);
  if (sources.length === 0) return null;

  const images = await Promise.all(sources.map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const half = size / 2;
  // Layout: 1 cover → fills full square. 2 covers → top half / bottom half.
  // 3 covers → top-left big, two stacked on the right. 4 covers → 2x2 grid.
  if (images.length === 1) {
    drawCover(ctx, images[0], 0, 0, size, size);
  } else if (images.length === 2) {
    drawCover(ctx, images[0], 0, 0, size, half);
    drawCover(ctx, images[1], 0, half, size, half);
  } else if (images.length === 3) {
    drawCover(ctx, images[0], 0, 0, half, size);
    drawCover(ctx, images[1], half, 0, half, half);
    drawCover(ctx, images[2], half, half, half, half);
  } else {
    drawCover(ctx, images[0], 0, 0, half, half);
    drawCover(ctx, images[1], half, 0, half, half);
    drawCover(ctx, images[2], 0, half, half, half);
    drawCover(ctx, images[3], half, half, half, half);
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  // object-fit: cover behaviour — scale to fully cover the tile and crop.
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}
