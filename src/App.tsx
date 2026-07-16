/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BeadColor, ProcessingResult } from './types';
import { processImage } from './engine';
import { rawCsvData } from './data';
import { Upload, Download, Copy, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [canvasPreset, setCanvasPreset] = useState<string>('210');
  const [customCanvasSize, setCustomCanvasSize] = useState<number>(40);
  const [beadSize, setBeadSize] = useState<number>(2.6);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [palette, setPalette] = useState<BeadColor[]>([]);
  const [copied, setCopied] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeCanvasSize = canvasPreset === 'custom' ? customCanvasSize * 10 : Number(canvasPreset);

  useEffect(() => {
    // Parse CSV data on load
    Papa.parse(rawCsvData, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedColors: BeadColor[] = results.data.map((row: any) => {
          const rgbStr = row['RGB 数值'] as string;
          let r = 0, g = 0, b = 0;
          if (rgbStr) {
            const parts = rgbStr.split(',').map(s => parseInt(s.trim()));
            if (parts.length === 3) {
              [r, g, b] = parts;
            }
          }
          return {
            id: row['色号'],
            name: row['色号'], // Name matching ID as per prompt's JSON example if needed
            hex: row['HEX 色值'],
            r, g, b
          };
        }).filter(c => c.id && c.hex);
        setPalette(parsedColors);
      }
    });
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target?.result as string);
        setResult(null); // clear previous result
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProcess = () => {
    if (!imageRef.current || palette.length === 0) return;
    
    try {
      const output = processImage(imageRef.current, activeCanvasSize, beadSize, palette);
      setResult(output);
      drawPreview(output);
    } catch (err) {
      console.error(err);
      alert('处理图像时出错');
    }
  };

  const drawPreview = (output: ProcessingResult) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const { width, height } = output.grid_size;
    // Ensure pixels are large enough to contain legible text (min 28px)
    const PIXEL_SIZE = Math.max(28, Math.floor(800 / width));
    
    canvasRef.current.width = width * PIXEL_SIZE;
    canvasRef.current.height = height * PIXEL_SIZE;

    // Create a color map for fast lookup
    const colorMap = new Map<string, string>();
    palette.forEach(c => colorMap.set(c.id, c.hex));

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colorId = output.pixel_matrix[y][x];
        const hex = colorMap.get(colorId) || '#ffffff';
        ctx.fillStyle = hex;
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);

        // Draw color ID text
        ctx.fillStyle = '#d1d5db'; // Opaque light gray
        ctx.font = `bold ${Math.floor(PIXEL_SIZE * 0.35)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(colorId, x * PIXEL_SIZE + PIXEL_SIZE / 2, y * PIXEL_SIZE + PIXEL_SIZE / 2);
      }
    }
  };

  const copyJson = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex flex-col items-center text-center space-y-4">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">拼豆大王</h1>
          <p className="text-slate-500 max-w-2xl">
            上传图像，将其转换为完美匹配的拼豆矩阵。使用精确的物理尺寸、最近邻缩放、3D 欧氏距离颜色匹配和孤立点去噪算法。
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Controls & Input */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">上传原图</label>
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-3 text-slate-400" />
                  <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">点击上传</span> 或拖拽至此处</p>
                  <p className="text-xs text-slate-400">支持 PNG, JPG, WEBP</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            </div>

            {imageSrc && (
              <div className="space-y-4">
                <div className="flex justify-center bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                  <img 
                    ref={imageRef} 
                    src={imageSrc} 
                    alt="Source" 
                    className="max-h-64 object-contain"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">画布尺寸</label>
                    <select 
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2.5 border bg-white"
                      value={canvasPreset}
                      onChange={(e) => setCanvasPreset(e.target.value)}
                    >
                      <option value="210">21 × 21 厘米</option>
                      <option value="280">28 × 28 厘米</option>
                      <option value="350">35 × 35 厘米</option>
                      <option value="custom">自定义 (cm)</option>
                    </select>
                    {canvasPreset === 'custom' && (
                      <input 
                        type="number"
                        min="1"
                        step="1"
                        className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2.5 border bg-white mt-2"
                        placeholder="输入正方形画布边长(厘米)"
                        value={customCanvasSize}
                        onChange={(e) => setCustomCanvasSize(Number(e.target.value))}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">拼豆规格</label>
                    <select 
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2.5 border bg-white"
                      value={beadSize}
                      onChange={(e) => setBeadSize(Number(e.target.value))}
                    >
                      <option value={2.6}>2.6mm (小豆)</option>
                      <option value={5.0}>5.0mm (大豆)</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleProcess}
                  className="w-full flex items-center justify-center py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                  生成图纸
                </button>
              </div>
            )}
          </div>

          {/* Right Column: JSON Output & Preview */}
          <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden flex flex-col h-[700px]">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
              <span className="text-sm font-mono text-slate-300">result.json</span>
              <button 
                onClick={copyJson}
                disabled={!result}
                className="flex items-center space-x-2 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-50 transition-colors bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-md"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? '已复制！' : '复制 JSON'}</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-sm text-emerald-400">
              {result ? (
                <pre>{JSON.stringify(result, null, 2)}</pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 italic">
                  上传并处理图像以生成 JSON
                </div>
              )}
            </div>
          </div>
          
        </div>

        {/* Visual Preview Section */}
        {result && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-8 space-y-4">
            <h2 className="text-xl font-semibold text-slate-800">视觉预览 (附带色号)</h2>
            <div className="flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-auto">
              <canvas ref={canvasRef} className="max-w-full shadow-sm rounded bg-white" />
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-lg font-medium text-slate-800 mb-4">使用色号及数量统计</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {result.used_colors_summary.map((color) => (
                  <div key={color.color_id} className="flex items-center space-x-2 bg-slate-50 p-2 rounded border border-slate-200">
                    <div 
                      className="w-4 h-4 rounded-sm shadow-inner border border-slate-300 shrink-0" 
                      style={{ backgroundColor: color.hex }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">{color.color_id}</div>
                      <div className="text-[10px] text-slate-500">× {color.count}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
