import { BeadColor, GridSize, ProcessingResult } from './types';

export function calculateGridSize(canvasMm: number, beadMm: number): GridSize {
  // Hardcoded rules as per instructions
  if (canvasMm === 29 && beadMm === 2.6) return { width: 11, height: 11 };
  if (canvasMm === 50 && beadMm === 2.6) return { width: 19, height: 19 };
  if (canvasMm === 58 && beadMm === 2.6) return { width: 22, height: 22 };
  if (canvasMm === 100 && beadMm === 2.6) return { width: 38, height: 38 };
  if (canvasMm === 29 && beadMm === 5.0) return { width: 5, height: 5 };
  if (canvasMm === 50 && beadMm === 5.0) return { width: 10, height: 10 };
  if (canvasMm === 58 && beadMm === 5.0) return { width: 11, height: 11 };
  if (canvasMm === 100 && beadMm === 5.0) return { width: 20, height: 20 };

  // Fallback formula
  const size = Math.floor(canvasMm / beadMm);
  return { width: size, height: size };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

function findClosestColor(r: number, g: number, b: number, palette: BeadColor[]): BeadColor {
  let closest = palette[0];
  let minDistance = Infinity;

  for (const color of palette) {
    const dist = colorDistance(r, g, b, color.r, color.g, color.b);
    if (dist < minDistance) {
      minDistance = dist;
      closest = color;
    }
  }

  return closest;
}

export function processImage(
  imageElement: HTMLImageElement,
  canvasMm: number,
  beadMm: number,
  palette: BeadColor[]
): ProcessingResult {
  const grid = calculateGridSize(canvasMm, beadMm);
  const { width, height } = grid;

  // 1. Draw image to offscreen canvas to get pixel data
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  // Disable smoothing for nearest neighbor scaling
  ctx.imageSmoothingEnabled = false;

  // Fill background with white for padding
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Calculate scaling to fit within the square without changing aspect ratio
  const imgWidth = imageElement.naturalWidth;
  const imgHeight = imageElement.naturalHeight;
  const scale = Math.min(width / imgWidth, height / imgHeight);
  
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  ctx.drawImage(imageElement, offsetX, offsetY, drawWidth, drawHeight);
  const imageData = ctx.getImageData(0, 0, width, height).data;

  // 2. Initial color matching
  let matrix: BeadColor[][] = [];
  for (let y = 0; y < height; y++) {
    const row: BeadColor[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const a = imageData[idx + 3];

      // Handle transparency by making it white (or we could add a transparent bead concept, but prompt doesn't specify)
      // Assuming white background for transparency
      let pixelColor = { r, g, b };
      if (a < 128) {
         pixelColor = { r: 255, g: 255, b: 255 };
      }

      const closest = findClosestColor(pixelColor.r, pixelColor.g, pixelColor.b, palette);
      row.push(closest);
    }
    matrix.push(row);
  }

  // 3. Denoising (孤立的单点杂色修正)
  const denoisedMatrix: BeadColor[][] = JSON.parse(JSON.stringify(matrix)); // Deep copy doesn't work well for object references, but we just need IDs. Let's do it manually.
  const tempMatrix: BeadColor[][] = matrix.map(row => [...row]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const currentColor = tempMatrix[y][x];
      
      // Get 8 neighbors
      const neighbors: BeadColor[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            neighbors.push(tempMatrix[ny][nx]);
          }
        }
      }

      // Check if current color is isolated (no neighbors share the same color ID)
      const hasSameNeighbor = neighbors.some(n => n.id === currentColor.id);
      
      if (!hasSameNeighbor && neighbors.length > 0) {
        // Find most frequent color among neighbors
        const counts = new Map<string, number>();
        let maxCount = 0;
        let dominantColorId = neighbors[0].id;
        
        for (const n of neighbors) {
          const count = (counts.get(n.id) || 0) + 1;
          counts.set(n.id, count);
          if (count > maxCount) {
            maxCount = count;
            dominantColorId = n.id;
          }
        }
        
        // Replace isolated pixel with dominant neighbor color
        const replacementColor = palette.find(p => p.id === dominantColorId)!;
        denoisedMatrix[y][x] = replacementColor;
      }
    }
  }

  // 4. Build Result
  const colorCounts = new Map<string, { name: string, hex: string, count: number }>();
  const jsonMatrix: string[][] = [];

  for (let y = 0; y < height; y++) {
    const rowIds: string[] = [];
    for (let x = 0; x < width; x++) {
      const color = denoisedMatrix[y][x];
      rowIds.push(color.id);
      
      const existing = colorCounts.get(color.id) || { name: color.name, hex: color.hex, count: 0 };
      existing.count++;
      colorCounts.set(color.id, existing);
    }
    jsonMatrix.push(rowIds);
  }

  const used_colors_summary = Array.from(colorCounts.entries()).map(([id, data]) => ({
    color_id: id,
    color_name: data.name,
    hex: data.hex,
    count: data.count
  })).sort((a, b) => {
    const matchA = a.color_id.match(/^([a-zA-Z]+)(\d+)$/);
    const matchB = b.color_id.match(/^([a-zA-Z]+)(\d+)$/);
    if (matchA && matchB) {
      if (matchA[1] !== matchB[1]) return matchA[1].localeCompare(matchB[1]);
      return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
    }
    return a.color_id.localeCompare(b.color_id);
  });

  return {
    canvas_spec: canvasMm % 10 === 0 ? `${canvasMm/10}cmx${canvasMm/10}cm` : `${canvasMm}mmx${canvasMm}mm`,
    bead_spec: `${beadMm}mmx${beadMm}mm`,
    grid_size: grid,
    used_colors_summary,
    pixel_matrix: jsonMatrix
  };
}
