export interface BeadColor {
  id: string;
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export interface GridSize {
  width: number;
  height: number;
}

export interface ProcessingResult {
  canvas_spec: string;
  bead_spec: string;
  grid_size: GridSize;
  used_colors_summary: {
    color_id: string;
    color_name: string;
    hex: string;
    count: number;
  }[];
  pixel_matrix: string[][];
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}
