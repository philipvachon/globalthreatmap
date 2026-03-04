/**
 * Custom Mapbox GL JS layer that renders satellite orbital positions as
 * coloured 3D dots at their true altitude above the Earth's surface.
 *
 * In Mapbox GL JS v3 globe mode the `matrix` arg passed to render() is the
 * mercatorMatrix, which maps (x,y) in Mercator [0,1] world units to clip
 * space.  In that coordinate system, the z-axis always points toward the
 * camera — it is NOT radial to the Earth's surface.  Using mercatorMatrix
 * therefore makes every satellite appear glued to the globe surface.
 *
 * The globeMatrix (the internal `Ah(…)` transform) expects ECEF coordinates
 * in "tile units" (globe radius = 8192/(2π) ≈ 1304 tile units, globe centre
 * at the origin).  Its rotation order is Rx(-lng) · Ry(-lat), giving:
 *
 *   x =  R · sin(lat)
 *   y = -R · cos(lat) · sin(lng)     ← negative: screen y increases southward
 *   z =  R · cos(lat) · cos(lng)     ← toward viewer when lat=0, lng=0
 *
 * We access `transform.globeMatrix` directly and use these ECEF coordinates
 * so that altitude produces a true radial displacement for every satellite.
 */

import mapboxgl from "mapbox-gl";
import type { SatellitePosition } from "@/stores/map-store";

// ── GLSL shaders ─────────────────────────────────────────────────────────────

const VERT_SRC = `
precision highp float;
attribute vec3 a_pos;
attribute vec4 a_color;
uniform   mat4 u_matrix;
varying   vec4 v_color;
void main() {
  gl_Position  = u_matrix * vec4(a_pos, 1.0);
  gl_PointSize = 4.0;
  v_color      = a_color;
}`;

const FRAG_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  if (dot(cxy, cxy) > 1.0) discard;
  gl_FragColor = v_color;
}`;

// ── Globe geometry constants ──────────────────────────────────────────────────
// Globe radius in Mapbox tile units (the input space for globeMatrix).
// Derived from Mapbox source: scale factor = worldSize/8192, globe radius in
// world pixels = worldSize/(2π), so tile-unit radius = 8192/(2π).
const R_GLOBE_TILES = 8192 / (2 * Math.PI); // ≈ 1303.7

const EARTH_R_KM = 6371;

// Multiply true altitude by this factor so low-Earth-orbit shells (≈400 km,
// only 6 % above the surface) are clearly separated visually at globe zoom.
// Exported so the hit-test helper uses the same scale.
export const VISUAL_ALT_SCALE = 6;

// ── ECEF tile-unit position with radial altitude ───────────────────────────
// Converts (lng °, lat °, altKm) → 3-D ECEF position in tile units that the
// globeMatrix correctly projects to clip space in globe mode.
function toSpherePos(lng: number, lat: number, altKm: number): [number, number, number] {
  const φ = (lat * Math.PI) / 180;
  const λ = (lng * Math.PI) / 180;
  // Scale the globe radius by the visual altitude factor
  const r = R_GLOBE_TILES * (1 + (altKm * VISUAL_ALT_SCALE) / EARTH_R_KM);
  return [
    r * Math.sin(φ),                  // x: latitude axis (north pole → +x)
    -r * Math.cos(φ) * Math.sin(λ),  // y: neg longitude (screen y south = -y)
    r * Math.cos(φ) * Math.cos(λ),   // z: toward viewer at (lat=0, lng=0)
  ];
}

// ── Category → colour ─────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, [number, number, number, number]> = {
  stations: [1.00, 0.95, 0.70, 1.0], // warm white  — space stations (ISS)
  visual:   [0.60, 0.90, 1.00, 0.9], // light blue  — visually observable sats
  gps:      [0.13, 0.83, 0.93, 0.9], // cyan        — GPS (USA)
  glonass:  [0.97, 0.53, 0.32, 0.9], // orange      — GLONASS (Russia)
  galileo:  [0.29, 0.86, 0.50, 0.9], // green       — Galileo (EU)
  beidou:   [0.93, 0.26, 0.26, 0.9], // red         — BeiDou (China)
  weather:  [0.98, 0.90, 0.20, 0.9], // yellow      — weather sats
  starlink: [0.75, 0.51, 0.99, 0.9], // purple      — Starlink mega-constellation
};
const DEFAULT_COLOR: [number, number, number, number] = [0.70, 0.70, 0.70, 0.8];

function categoryRgba(category: string): [number, number, number, number] {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
}

// ── Layer class ───────────────────────────────────────────────────────────────

export class SatelliteGlobeLayer {
  readonly id             = "satellite-3d-orbits";
  readonly type           = "custom" as const;
  readonly renderingMode  = "3d" as const;

  private map!:         mapboxgl.Map;
  private gl!:          WebGLRenderingContext;
  private program!:     WebGLProgram;
  private posBuffer!:   WebGLBuffer;
  private colBuffer!:   WebGLBuffer;
  private vertCount     = 0;
  private _positions:   SatellitePosition[] = [];

  // ── CustomLayerInterface lifecycle ─────────────────────────────────────────

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl  = gl;

    const vs = this.compile(gl.VERTEX_SHADER,   VERT_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER,  FRAG_SRC);
    this.program   = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.posBuffer = gl.createBuffer()!;
    this.colBuffer = gl.createBuffer()!;

    if (this._positions.length) this.upload();
  }

  onRemove() {
    if (!this.gl) return;
    this.gl.deleteBuffer(this.posBuffer);
    this.gl.deleteBuffer(this.colBuffer);
    this.gl.deleteProgram(this.program);
  }

  render(gl: WebGLRenderingContext, _matrix: number[]) {
    if (this.vertCount === 0) return;
    // Only draw in globe / zoomed-out view
    if (this.map.getZoom() > 4.5) return;

    // Use the globeMatrix which transforms ECEF tile-unit coords to clip space.
    // The _matrix param (mercatorMatrix) cannot represent radial altitude on a
    // globe — it only offsets z toward the camera, making all satellites appear
    // glued to the surface regardless of altitude.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globeMatrix: number[] | undefined = (this.map as any).transform?.globeMatrix;
    if (!globeMatrix || globeMatrix.length < 16) return; // not in globe mode

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.program, "u_matrix"),
      false,
      new Float32Array(globeMatrix),
    );

    const aPos = gl.getAttribLocation(this.program, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    const aCol = gl.getAttribLocation(this.program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuffer);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    // Depth test so satellites occluded by the Earth globe are hidden.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.vertCount);

    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aCol);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
  }

  // ── Public update API ───────────────────────────────────────────────────────

  setPositions(positions: SatellitePosition[]) {
    this._positions = positions;
    if (this.gl) {
      this.upload();
      this.map.triggerRepaint();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private compile(type: number, src: string): WebGLShader {
    const s = this.gl.createShader(type)!;
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    return s;
  }

  private upload() {
    const gl = this.gl;
    const n  = this._positions.length;
    const pa = new Float32Array(n * 3);
    const ca = new Float32Array(n * 4);

    for (let i = 0; i < n; i++) {
      const { latitude: lat, longitude: lng, altKm, category } = this._positions[i];
      const [px, py, pz] = toSpherePos(lng, lat, altKm);
      pa[i * 3]     = px;
      pa[i * 3 + 1] = py;
      pa[i * 3 + 2] = pz;

      const [r, g, b, a] = categoryRgba(category);
      ca[i * 4]     = r;
      ca[i * 4 + 1] = g;
      ca[i * 4 + 2] = b;
      ca[i * 4 + 3] = a;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pa, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ca, gl.DYNAMIC_DRAW);

    this.vertCount = n;
  }
}

// ── 3-D hit-test ─────────────────────────────────────────────────────────────
// Projects a lat/lng/altitude coordinate to screen (px) using the globeMatrix.

function mat4MulVec4(
  m: number[],
  v: [number, number, number, number],
): [number, number, number, number] {
  return [
    m[0]*v[0] + m[4]*v[1] + m[ 8]*v[2] + m[12]*v[3],
    m[1]*v[0] + m[5]*v[1] + m[ 9]*v[2] + m[13]*v[3],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
    m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3],
  ];
}

export function projectSatToScreen(
  map: mapboxgl.Map,
  lng: number,
  lat: number,
  altKm: number,
): { x: number; y: number } | null {
  try {
    const [px, py, pz] = toSpherePos(lng, lat, altKm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tr = (map as any).transform;
    const matrix: number[] | undefined = tr?.globeMatrix;
    if (!matrix || matrix.length < 16) throw new Error("no globe matrix");

    const [cx, cy, , cw] = mat4MulVec4(matrix, [px, py, pz, 1]);
    if (cw <= 0) return null; // behind camera / inside Earth

    const canvas = map.getCanvas();
    return {
      x: ((cx / cw + 1) / 2) * canvas.width,
      y: ((1 - cy / cw) / 2) * canvas.height,
    };
  } catch {
    // Graceful fallback: ignore altitude, use 2-D projection
    const pt = map.project([lng, lat]);
    return { x: pt.x, y: pt.y };
  }
}
