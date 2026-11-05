"use client";

import { useEffect, useRef } from "react";
import { FOOTER_HEIGHT, FOOTER_POINTS, FOOTER_WIDTH } from "../lib/footer-points";

type Dot = {
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  tone: number;
  bucket: number;
};

const GOLD: Array<[number, number, number]> = [
  [96, 52, 14],
  [138, 78, 18],
  [176, 108, 28],
  [206, 140, 42],
  [226, 168, 64],
  [240, 198, 102],
  [250, 224, 150],
  [255, 242, 206],
];

// Paper-theme ramp: the field reads as ink on --bg #f4f0e6 — sparse
// edge dots stay a soft warm grey, the dense crest resolves to black.
const GOLD_LIGHT: Array<[number, number, number]> = [
  [120, 113, 104],
  [100, 94, 86],
  [80, 74, 67],
  [62, 57, 51],
  [48, 44, 39],
  [36, 33, 29],
  [28, 26, 22],
  [20, 18, 15],
];

function decode(): Array<{ x: number; y: number; tone: number }> {
  const binary = atob(FOOTER_POINTS);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const dots: Array<{ x: number; y: number; tone: number }> = [];
  for (let i = 0; i + 5 <= view.byteLength; i += 5) {
    dots.push({
      x: view.getUint16(i, true),
      y: view.getUint16(i + 2, true),
      tone: bytes[i + 4] / 255,
    });
  }
  return dots;
}

export function FooterWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const ctx = context;
    const samples = decode();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let points: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = 0;
    let visible = true;
    let alive = true;
    let mouse: { x: number; y: number } | null = null;
    let ripple: { x: number; y: number; born: number } | null = null;
    let ramp = GOLD;

    const refreshRamp = () => {
      const explicit = document.documentElement.dataset.theme;
      const dark = explicit ? explicit === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      ramp = dark ? GOLD : GOLD_LIGHT;
    };
    refreshRamp();

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (!nextW || !nextH) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (nextW === width && nextH === height && nextDpr === dpr && points.length) return;
      width = nextW;
      height = nextH;
      dpr = nextDpr;
      canvas.width = Math.round(nextW * dpr);
      canvas.height = Math.round(nextH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const skip = width < 720 ? 2 : 1;
      const scaleX = width / FOOTER_WIDTH;
      const scaleY = height / FOOTER_HEIGHT;
      points = [];
      for (let i = 0; i < samples.length; i += skip) {
        const sample = samples[i];
        const x = (sample.x + 0.5) * scaleX;
        const y = (sample.y + 0.5) * scaleY;
        points.push({
          x,
          y,
          hx: x,
          hy: y,
          vx: 0,
          vy: 0,
          tone: sample.tone,
          bucket: Math.min(GOLD.length - 1, (sample.tone * GOLD.length) | 0),
        });
      }
    };

    const paint = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const reduced = motion.matches;
      const pointer = reduced ? null : mouse;
      const reach = Math.max(72, Math.min(120, Math.min(width, height) * 0.22));
      let moving = false;
      const age = ripple ? now - ripple.born : Infinity;
      const rippleOn = !reduced && ripple && age < 700;
      if (age >= 700) ripple = null;
      const groups: Dot[][] = GOLD.map(() => []);

      for (const point of points) {
        let tx = point.hx;
        let ty = point.hy;
        if (pointer) {
          const dx = point.hx - pointer.x;
          const dy = point.hy - pointer.y;
          const distance = Math.hypot(dx, dy) || 0.001;
          if (distance < reach) {
            const falloff = (1 - distance / reach) ** 2;
            const push = falloff * 34;
            const twist = falloff * 22;
            tx += (dx / distance) * push - (dy / distance) * twist;
            ty += (dy / distance) * push + (dx / distance) * twist;
            moving = true;
          }
        }
        if (rippleOn && ripple) {
          const dx = point.hx - ripple.x;
          const dy = point.hy - ripple.y;
          const distance = Math.hypot(dx, dy) || 0.001;
          const ring = age * 0.55;
          const wave = Math.max(0, 1 - Math.abs(distance - ring) / 42);
          const forceOut = wave * (1 - age / 700) * 26;
          tx += (dx / distance) * forceOut;
          ty += (dy / distance) * forceOut;
          moving = true;
        }
        if (reduced) {
          point.x = point.hx;
          point.y = point.hy;
        } else {
          point.vx = (point.vx + (tx - point.x) * 0.085) * 0.76;
          point.vy = (point.vy + (ty - point.y) * 0.085) * 0.76;
          point.x += point.vx;
          point.y += point.vy;
          if (Math.abs(point.vx) + Math.abs(point.vy) > 0.08) moving = true;
        }
        groups[point.bucket].push(point);
      }

      for (let bucket = 0; bucket < groups.length; bucket += 1) {
        const [r, g, b] = ramp[bucket];
        const alpha = 0.55 + (bucket / (GOLD.length - 1)) * 0.45;
        const radius = 0.72 + (bucket / (GOLD.length - 1)) * 0.55;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        const side = radius * 2;
        for (const point of groups[bucket]) {
          ctx.fillRect(point.x - radius, point.y - radius, side, side);
        }
      }
      return reduced || !moving;
    };

    const tick = (now: number) => {
      frame = 0;
      if (!alive || !visible || document.visibilityState === "hidden") return;
      if (now - last < 22) {
        frame = requestAnimationFrame(tick);
        return;
      }
      last = now;
      if (!paint(now)) frame = requestAnimationFrame(tick);
    };

    const request = () => {
      if (!alive || !visible || document.visibilityState === "hidden" || frame || !points.length) return;
      frame = requestAnimationFrame(tick);
    };

    const pointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      mouse = inside ? { x, y } : null;
      request();
    };

    const leave = () => {
      mouse = null;
      request();
    };

    const press = (event: PointerEvent) => {
      if (event.pointerType === "touch" || motion.matches) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      ripple = { x, y, born: performance.now() };
      request();
    };

    const resize = () => {
      layout();
      paint(performance.now());
      request();
    };

    const themeObserver = new MutationObserver(() => {
      refreshRamp();
      paint(performance.now());
      request();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      refreshRamp();
      paint(performance.now());
      request();
    };
    scheme.addEventListener?.("change", onScheme);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const seen = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) {
        request();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    seen.observe(canvas);
    const onMotion = () => request();
    motion.addEventListener?.("change", onMotion);
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    canvas.addEventListener("pointermove", pointer);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", press);
    resize();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      seen.disconnect();
      themeObserver.disconnect();
      scheme.removeEventListener?.("change", onScheme);
      motion.removeEventListener?.("change", onMotion);
      document.removeEventListener("visibilitychange", onVisible);
      canvas.removeEventListener("pointermove", pointer);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerdown", press);
    };
  }, []);

  return <canvas ref={canvasRef} className="footer-wave" aria-hidden="true" />;
}
