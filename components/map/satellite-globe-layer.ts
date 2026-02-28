/**
 * Custom Mapbox GL JS layer that renders satellite orbital positions as
 * coloured 3D dots at their true altitude above the Earth's surface.
 *
 * Works with Mapbox GL JS v3 globe projection.  The same mercator matrix
 * that Mapbox passes to CustomLayerInterface.render() handles the
 * globe → clip-space transformation automatically when globe projection
 * is active, so we only need MercatorCoordinate.fromLngLat(lngLat, altMeters)
 * to position each dot at the correct 3D elevation.
 */

import mapboxgl from "mapbox-gl";
import type { SatellitePosition } from "@/stores/map-store";

// ── GLSL shaders ─────────────────────────────────────────────────────────────

// Mercator (x,y,z) → clip space; renders each vertex as a point sprite.
const VERT_SRC = `
precision highp float;
attribute vec3 a_pos;
attribute vec4 a_color;
uniform   mat4 u_matrix;
varying   vec4 v_color;
void main() {
  gl_Position  = u_matrix * vec4(a_pos, 1.0);
  gl_PointSize = 2.5;
  v_color      = a_color;
}`;

// Discard pixels outside the unit circle to draw round dots.
const FRAG_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  if (dot(cxy, cxy) > 1.0) discard;
  gl_FragColor = v_color;
}`;

// ── Altitude → colour ─────────────────────────────────────────────────────────
// Linear RGB values matching the 2D circle-layer palette.
function altRgba(altKm: number): [number, number, number, number] {
  if (altKm <   600) return [0.29, 0.86, 0.50, 0.9]; // VLEO/LEO — green
  if (altKm <  2000) return [0.13, 0.83, 0.93, 0.9]; // LEO      — cyan
  if (altKm < 35586) return [0.98, 0.80, 0.08, 0.9]; // MEO/GNSS — yellow
  if (altKm < 35986) return [0.97, 0.53, 0.32, 0.9]; // GEO      — orange-red
  return               [0.75, 0.51, 0.99, 0.9];       // HEO      — purple
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

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (this.vertCount === 0) return;
    // Only draw in globe / zoomed-out view
    if (this.map.getZoom() > 4.5) return;

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.program, "u_matrix"),
      false,
      new Float32Array(matrix),
    );

    const aPos = gl.getAttribLocation(this.program, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    const aCol = gl.getAttribLocation(this.program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuffer);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.vertCount);

    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aCol);
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
      const { latitude: lat, longitude: lng, altKm } = this._positions[i];
      // Position each dot at true altitude above the Earth's surface.
      // MercatorCoordinate.fromLngLat accepts altitude in metres.
      const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, altKm * 1000);
      pa[i * 3]     = mc.x;
      pa[i * 3 + 1] = mc.y;
      pa[i * 3 + 2] = mc.z;

      const [r, g, b, a] = altRgba(altKm);
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
// Projects a lat/lng/altitude coordinate to screen (px) using the same
// mercator→clip-space matrix Mapbox uses during rendering.
// Falls back to the 2-D map.project() if the internal matrix is unavailable.

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
    const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, altKm * 1000);
    // Access the internal camera matrix — same one passed to render()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tr     = (map as any).transform;
    const matrix: number[] | undefined =
      tr?.mercatorMatrix ?? tr?.projMatrix ?? tr?.pixelMatrix;
    if (!matrix || matrix.length < 16) throw new Error("no matrix");

    const [cx, cy, , cw] = mat4MulVec4(matrix, [mc.x, mc.y, mc.z, 1]);
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
