// Silhouette masks for reference/capture comparison. A pixel is craft when it
// departs from the panel background strongly, or moderately with colour (so
// soft grey ground shadows stay background). The largest 8-connected region is
// kept and its enclosed holes filled, so canopy glass and fan grilles count.

const backgroundOf = (image, rect) => {
  const [x0, y0, x1, y1] = rect, samples = [];
  for (const [x, y] of [[x0 + 3, y0 + 3], [x1 - 4, y0 + 3], [x0 + 3, y1 - 4], [x1 - 4, y1 - 4]]) {
    const i = (y * image.width + x) * 4;samples.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  }
  return [0, 1, 2].map(c => samples.map(s => s[c]).sort((a, b) => a - b)[1]);
};

/** @returns {{width:number,height:number,mask:Uint8Array,bbox:[number,number,number,number]|null,area:number,background:number[]}} */
export function silhouette(image, rect = [0, 0, image.width, image.height], { strong = 46, weak = 20, saturation = .14, background } = {}) {
  const [x0, y0, x1, y1] = rect, width = x1 - x0, height = y1 - y0, bg = background ?? backgroundOf(image, rect);
  let mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = ((y0 + y) * image.width + x0 + x) * 4, r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    const diff = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])), hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    const sat = hi ? (hi - lo) / hi : 0;
    mask[y * width + x] = diff > strong || diff > weak && sat > saturation ? 1 : 0;
  }
  // Largest 8-connected component.
  const label = new Int32Array(width * height).fill(-1), stack = [];let best = -1, bestSize = 0, id = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    let size = 0;stack.push(start);label[start] = id;
    while (stack.length) {
      const p = stack.pop(), px = p % width, py = (p - px) / width;size++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;if (mask[q] && label[q] < 0) { label[q] = id;stack.push(q); }
      }
    }
    if (size > bestSize) { bestSize = size;best = id; }
    id++;
  }
  for (let i = 0; i < mask.length; i++) mask[i] = label[i] === best ? 1 : 0;
  // Fill holes: background not reachable from the border becomes craft.
  const outside = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) for (const y of [0, height - 1]) if (!mask[y * width + x] && !outside[y * width + x]) { outside[y * width + x] = 1;stack.push(y * width + x); }
  for (let y = 0; y < height; y++) for (const x of [0, width - 1]) if (!mask[y * width + x] && !outside[y * width + x]) { outside[y * width + x] = 1;stack.push(y * width + x); }
  while (stack.length) {
    const p = stack.pop(), px = p % width, py = (p - px) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;if (!mask[q] && !outside[q]) { outside[q] = 1;stack.push(q); }
    }
  }
  let area = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;mask[i] = outside[i] ? 0 : 1;
    if (mask[i]) { area++;minX = Math.min(minX, x);maxX = Math.max(maxX, x);minY = Math.min(minY, y);maxY = Math.max(maxY, y); }
  }
  return { width, height, mask, bbox: area ? [minX, minY, maxX + 1, maxY + 1] : null, area, background: bg };
}

// A rendered capture's exact silhouette from its alpha channel (transparent
// background), holes filled the same way.
export function alphaSilhouette(image, threshold = 8) {
  const opaque = { ...image, data: new Uint8Array(image.data.length) };
  for (let i = 0; i < image.data.length; i += 4) { const on = image.data[i + 3] > threshold ? 0 : 255;opaque.data.set([on, on, on, 255], i); }
  return silhouette(opaque, [0, 0, image.width, image.height], { strong: 128, weak: 255, background: [255, 255, 255] });
}

// Resample a mask's bounding box into a size x size frame, preserving aspect
// (centred), so two silhouettes compare by shape rather than by framing.
export function normalized(sil, size = 256) {
  const out = new Uint8Array(size * size);if (!sil.bbox) return out;
  const [x0, y0, x1, y1] = sil.bbox, w = x1 - x0, h = y1 - y0, scale = size / Math.max(w, h), ox = (size - w * scale) / 2, oy = (size - h * scale) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor((x - ox) / scale) + x0, sy = Math.floor((y - oy) / scale) + y0;
    if (sx >= x0 && sx < x1 && sy >= y0 && sy < y1) out[y * size + x] = sil.mask[sy * sil.width + sx];
  }
  return out;
}

export function iou(a, b) {
  let both = 0, either = 0;for (let i = 0; i < a.length; i++) { both += a[i] & b[i];either += a[i] | b[i]; }
  return either ? both / either : 0;
}

// Overlay of two normalised masks: reference only red, capture only cyan, both grey.
export function overlay(a, b, size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < a.length; i++) {
    const c = a[i] && b[i] ? [120, 120, 120] : a[i] ? [230, 40, 70] : b[i] ? [20, 190, 220] : [252, 250, 246];
    data.set([...c, 255], i * 4);
  }
  return { width: size, height: size, data };
}

export const aspect = sil => sil.bbox ? (sil.bbox[2] - sil.bbox[0]) / (sil.bbox[3] - sil.bbox[1]) : 0;
