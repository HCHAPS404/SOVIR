"use client";

import { useEffect, useRef } from "react";
import { LOGO_HEIGHT, LOGO_POINTS, LOGO_WIDTH } from "../lib/logo-points";

type Dot = {
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  tone: number;
};

const LINES = ["En el dispositivo", "La política decide", "Lo remoto es excepcional"];

function decodeSamples() {
  const binary = atob(LOGO_POINTS);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const samples: Array<[number, number]> = [];
  for (let i = 0; i < view.byteLength; i += 4) {
    samples.push([view.getUint16(i, true), view.getUint16(i + 2, true)]);
  }
  return samples;
}

export function HeroField() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!host || !canvas || !context) return;

    const ctx = context;
    const samples = decodeSamples();
    let points: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = 0;
    let visible = true;
    let mouse: { x: number; y: number } | null = null;
    let ripple: { x: number; y: number; born: number } | null = null;
    let alive = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const build = () => {
      const mobile = width < 520;
      const aspect = LOGO_WIDTH / LOGO_HEIGHT;
      const fitW = Math.min(width * 0.98, height * aspect * 0.96);
      const fitH = fitW / aspect;
      const cx = width * 0.5;
      const cy = height * 0.5;
      let seed = 142197;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const reduced = motion.matches;
      points = [];
      for (const [sx, sy] of samples) {
        if (mobile && rand() < 0.28) continue;
        const x = cx + ((sx - LOGO_WIDTH / 2) / LOGO_WIDTH) * fitW + (rand() - 0.5) * 0.6;
        const y = cy + ((sy - LOGO_HEIGHT / 2) / LOGO_HEIGHT) * fitH + (rand() - 0.5) * 0.6;
        const scatter = reduced ? 0 : 8 + rand() * 6;
        const angle = rand() * Math.PI * 2;
        points.push({
          hx: x,
          hy: y,
          x: x + Math.cos(angle) * scatter,
          y: y + Math.sin(angle) * scatter,
          vx: 0,
          vy: 0,
          radius: 0.72 + rand() * 0.38,
          opacity: 0.72 + rand() * 0.28,
          tone: rand(),
        });
      }
    };

    const resize = () => {
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
      build();
      paint(performance.now(), motion.matches);
      request();
    };

    const paint = (now: number, force: boolean) => {
      ctx.clearRect(0, 0, width, height);
      const reduced = motion.matches || force;
      const pointer = reduced ? null : mouse;
      const reach = Math.max(72, Math.min(120, Math.min(width, height) * 0.22));
      let moving = !reduced && points.some((point) => Math.abs(point.x - point.hx) + Math.abs(point.y - point.hy) > 0.4);
      const age = ripple ? now - ripple.born : Infinity;
      const rippleOn = !reduced && ripple && age < 700;
      if (age >= 700) ripple = null;

      const bright: Dot[] = [];
      const mid: Dot[] = [];
      const soft: Dot[] = [];

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
          point.vx = 0;
          point.vy = 0;
        } else {
          point.vx = (point.vx + (tx - point.x) * 0.085) * 0.76;
          point.vy = (point.vy + (ty - point.y) * 0.085) * 0.76;
          point.x += point.vx;
          point.y += point.vy;
          if (Math.abs(point.vx) + Math.abs(point.vy) > 0.08) moving = true;
        }
        if (point.tone < 0.16) bright.push(point);
        else if (point.tone < 0.4) mid.push(point);
        else soft.push(point);
      }

      const draw = (group: Dot[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const point of group) {
          ctx.moveTo(point.x + point.radius, point.y);
          ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        }
        ctx.fill();
      };
      draw(soft, "rgba(214,206,192,0.78)");
      draw(mid, "rgba(236,230,218,0.9)");
      draw(bright, "rgba(247,243,234,0.98)");
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
      if (!paint(now, false)) frame = requestAnimationFrame(tick);
    };

    const request = () => {
      if (!alive || !visible || document.visibilityState === "hidden" || frame || !points.length) return;
      frame = requestAnimationFrame(tick);
    };

    const pointer = (event: PointerEvent) => {
      const field = host.getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const inside =
        event.clientX >= field.left &&
        event.clientX <= field.right &&
        event.clientY >= field.top &&
        event.clientY <= field.bottom;
      mouse = inside ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
      request();
    };

    const leave = () => {
      mouse = null;
      request();
    };

    const press = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height || motion.matches) return;
      ripple = { x, y, born: performance.now() };
      request();
    };

    const onResize = () => resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    const seen = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) request();
      else cancelAnimationFrame(frame);
    });
    seen.observe(host);
    const onMotion = () => request();
    motion.addEventListener?.("change", onMotion);
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    host.addEventListener("pointermove", pointer);
    host.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", press);
    resize();
    request();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      seen.disconnect();
      motion.removeEventListener?.("change", onMotion);
      document.removeEventListener("visibilitychange", onVisible);
      host.removeEventListener("pointermove", pointer);
      host.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerdown", press);
    };
  }, []);

  return (
    <div className="hero-field" ref={hostRef}>
      <canvas className="hero-field-canvas" ref={canvasRef} aria-hidden="true" />
      <ul>
        {LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
