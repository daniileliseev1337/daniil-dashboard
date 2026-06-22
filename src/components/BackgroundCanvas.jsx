import { useEffect, useRef } from "react";

// Живой золотой фон: aurora-блобы + сеть-созвездие с импульсами + плавающие искры.
// Один глобальный canvas под всем UI. Уважает prefers-reduced-motion (один кадр).
// Перенос из утверждённого эталона (docs/superpowers/specs/km-etalon-black-gold.html).
export default function BackgroundCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let stopped = false;
    let onResize = null;
    try {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ctx = canvas.getContext("2d");
      let W = window.innerWidth, H = window.innerHeight;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      let nodes = [], sparks = [];
      const blobs = [
        { x: 0.16, y: 0.20, r: 340, a: 0.10, sx: 0.00007, sy: 0.00005, p: 0 },
        { x: 0.82, y: 0.30, r: 300, a: 0.08, sx: 0.00005, sy: 0.00008, p: 2.1 },
        { x: 0.55, y: 0.85, r: 380, a: 0.07, sx: 0.00006, sy: 0.00004, p: 4.0 },
      ];
      function build() {
        nodes = [];
        const n = Math.min(Math.round((W * H) / 26000), 46);
        for (let i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: Math.random() * 1.4 + 0.6 });
        sparks = [];
        const m = Math.min(Math.round((W * H) / 16000), 70);
        for (let j = 0; j < m; j++) sparks.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.3, base: Math.random() * 0.5 + 0.2, tw: Math.random() * 6.28, sp: Math.random() * 0.8 + 0.3, dy: -(Math.random() * 0.25 + 0.05) });
      }
      function resize() {
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        build();
      }
      function frame(t) {
        if (stopped) return;
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#0a0a0a"); bg.addColorStop(1, "#0c0b08");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";
        for (const b of blobs) {
          const cx = (b.x + Math.sin(t * b.sx + b.p) * 0.06) * W;
          const cy = (b.y + Math.cos(t * b.sy + b.p) * 0.06) * H;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
          g.addColorStop(0, "rgba(212,175,55," + b.a + ")");
          g.addColorStop(0.5, "rgba(240,216,120," + b.a * 0.5 + ")");
          g.addColorStop(1, "rgba(212,175,55,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, b.r, 0, 6.2832); ctx.fill();
        }
        for (const nd of nodes) { nd.x += nd.vx; nd.y += nd.vy; if (nd.x < 0 || nd.x > W) nd.vx *= -1; if (nd.y < 0 || nd.y > H) nd.vy *= -1; }
        ctx.lineWidth = 1;
        for (let a = 0; a < nodes.length; a++) {
          for (let c = a + 1; c < nodes.length; c++) {
            const dx = nodes[a].x - nodes[c].x, dy = nodes[a].y - nodes[c].y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 150) {
              const al = (1 - d / 150) * 0.14;
              const pulse = 0.5 + 0.5 * Math.sin(t * 0.0015 + (a + c));
              ctx.strokeStyle = "rgba(212,175,55," + al * (0.5 + pulse * 0.5) + ")";
              ctx.beginPath(); ctx.moveTo(nodes[a].x, nodes[a].y); ctx.lineTo(nodes[c].x, nodes[c].y); ctx.stroke();
            }
          }
        }
        for (const nd of nodes) { ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, 6.2832); ctx.fillStyle = "rgba(240,216,120,0.5)"; ctx.fill(); }
        for (const sp of sparks) {
          sp.y += sp.dy; if (sp.y < 0) { sp.y = H; sp.x = Math.random() * W; }
          let tw = sp.base + Math.sin(t * 0.001 * sp.sp + sp.tw) * 0.35; if (tw < 0) tw = 0;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, 6.2832); ctx.fillStyle = "rgba(245,230,170," + tw + ")"; ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        if (!reduce) raf = requestAnimationFrame(frame);
      }
      onResize = resize;
      window.addEventListener("resize", resize);
      resize();
      if (reduce) frame(4000); else raf = requestAnimationFrame(frame);
    } catch (e) {
      // фон не критичен — UI работает и без него
    }
    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, []);
  return <canvas ref={ref} id="bg" aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, display: "block", pointerEvents: "none" }} />;
}
