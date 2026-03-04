"use client";

import { useEffect, useRef } from "react";

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  opacity: number;
  drift: number;
}

export function SnowOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const flakesRef = useRef<Flake[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      // Re-seed so flakes fill the new size
      const count = Math.min(Math.floor((canvas.width * canvas.height) / 7000), 180);
      flakesRef.current = Array.from({ length: count }, () => ({
        x:       Math.random() * canvas.width,
        y:       Math.random() * canvas.height,
        r:       Math.random() * 2.2 + 0.4,
        speed:   Math.random() * 1.1 + 0.4,
        opacity: Math.random() * 0.45 + 0.15,
        drift:   (Math.random() - 0.5) * 0.35,
      }));
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const f of flakesRef.current) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 235, 255, ${f.opacity})`;
        ctx.fill();

        f.y += f.speed;
        f.x += f.drift;
        if (f.y > canvas.height + 5) { f.y = -5; f.x = Math.random() * canvas.width; }
        if (f.x > canvas.width  + 5) f.x = -5;
        if (f.x < -5)                f.x = canvas.width + 5;
      }
      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
