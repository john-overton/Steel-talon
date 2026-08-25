// Duck-types module exports into explorer entries so new sprites appear
// with zero registration. Fed by import.meta.glob (dev-only).
import type { LayeredSprite, PixelGrid, SpriteDef } from '../../engine/sprite';

export type CatalogEntry =
  | { name: string; file: string; kind: 'def'; def: SpriteDef }
  | { name: string; file: string; kind: 'layered'; layered: LayeredSprite }
  | { name: string; file: string; kind: 'strip'; frames: PixelGrid[] };

function isPixelGrid(v: unknown): v is PixelGrid {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as PixelGrid).width === 'number' &&
    typeof (v as PixelGrid).height === 'number' &&
    (v as PixelGrid).rgba instanceof Uint8ClampedArray
  );
}

function isSpriteDef(v: unknown): v is SpriteDef {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as SpriteDef;
  return Array.isArray(d.frames) && d.frames.length > 0 && d.frames.every(isPixelGrid) &&
    typeof d.anchors === 'object' && d.anchors !== null;
}

function isLayered(v: unknown): v is LayeredSprite {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as LayeredSprite;
  return Array.isArray(s.layers) && s.layers.length > 0 && isSpriteDef(s.layers[0]?.def);
}

function isGridStrip(v: unknown): v is PixelGrid[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPixelGrid);
}

export function buildCatalog(modules: Record<string, Record<string, unknown>>): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const file of Object.keys(modules).sort()) {
    const mod = modules[file];
    for (const name of Object.keys(mod).sort()) {
      const value = mod[name];
      if (isSpriteDef(value)) entries.push({ name, file, kind: 'def', def: value });
      else if (isLayered(value)) entries.push({ name, file, kind: 'layered', layered: value });
      else if (isGridStrip(value)) entries.push({ name, file, kind: 'strip', frames: value });
    }
  }
  return entries;
}
