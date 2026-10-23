// PNG export of the chart view or the gauge preview at a chosen scale.

import type { CompiledChart, PatternDoc, StitchLayout } from '../core/types';
import { LIGHT_THEME, MARKER_STRIP, NUMBER_STRIP, chartBitmap, drawChart } from './chart';
import { RULER, drawGauge, physicalSize } from './gauge';

const MAX_SIDE = 16000;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

/** `cell`: pixels per chart cell. */
export function chartPng(doc: PatternDoc, chart: CompiledChart, cell: number, grayscale: boolean): Promise<Blob> {
  const pad = 12;
  const width = Math.min(MAX_SIDE, Math.ceil(chart.width * cell + NUMBER_STRIP + MARKER_STRIP + pad * 2));
  const height = Math.min(MAX_SIDE, Math.ceil(chart.height * cell + NUMBER_STRIP + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawChart(canvas.getContext('2d')!, {
    chart,
    doc,
    bitmap: chartBitmap(chart, doc, grayscale),
    theme: LIGHT_THEME,
    cell,
    ox: pad,
    oy: pad,
    width,
    height,
  });
  return toBlob(canvas);
}

/** `scale`: pixels per centimetre. */
export function gaugePng(doc: PatternDoc, chart: CompiledChart, layout: StitchLayout, scale: number, grayscale: boolean): Promise<Blob> {
  const size = physicalSize(layout, chart);
  const pad = 16;
  const width = Math.min(MAX_SIDE, Math.ceil(size.width * scale + RULER + pad * 2));
  const height = Math.min(MAX_SIDE, Math.ceil(size.height * scale + RULER + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawGauge(canvas.getContext('2d')!, {
    chart,
    doc,
    layout,
    grayscale,
    theme: LIGHT_THEME,
    scale,
    ox: RULER + pad,
    oy: height - RULER - 4,
    width,
    height,
    showSquare: false,
  });
  return toBlob(canvas);
}
