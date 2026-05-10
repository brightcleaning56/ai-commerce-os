"use client";
import { useRef, useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import * as THREE from "three";

// ─── Animated counting number ─────────────────────────────────────────────────
export function CountUp({ to, prefix = "", suffix = "", duration = 2 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return controls.stop;
  }, [to, duration]);
  if (to >= 1_000_000) return <>{prefix}{(display / 1_000_000).toFixed(2)}M{suffix}</>;
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

// ─── Vanilla Three.js Brain visualization ─────────────────────────────────────
export function HeroBrain() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene setup
    const W = mount.clientWidth || 520;
    const H = mount.clientHeight || 520;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.set(0, 0, 5);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const pointA = new THREE.PointLight(0xa78bfa, 3, 20);
    pointA.position.set(3, 3, 3);
    scene.add(pointA);
    const pointB = new THREE.PointLight(0x06b6d4, 2, 20);
    pointB.position.set(-3, -2, -3);
    scene.add(pointB);
    const pointC = new THREE.PointLight(0xffffff, 1, 20);
    pointC.position.set(0, 5, 2);
    scene.add(pointC);

    // ── Brain core sphere (distortion via shader) ──
    const coreMat = new THREE.MeshPhongMaterial({
      color: 0x5b21b6,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.5,
      shininess: 120,
      transparent: true,
      opacity: 0.92,
    });
    const coreGeo = new THREE.SphereGeometry(1, 64, 64);
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Inner glow
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.12 });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), glowMat);
    scene.add(glow);

    // ── Orbit rings ──
    const rings: { mesh: THREE.Mesh; speed: number }[] = [];
    const ringConfigs = [
      { radius: 1.85, tube: 0.008, color: 0x7c3aed, tilt: [0.3, 0, 0], speed: 0.4 },
      { radius: 2.3,  tube: 0.007, color: 0x06b6d4, tilt: [1.1, 0.2, 0], speed: -0.25 },
      { radius: 2.75, tube: 0.006, color: 0xa78bfa, tilt: [0.6, 0.8, 0], speed: 0.18 },
    ];
    ringConfigs.forEach(cfg => {
      const geo = new THREE.TorusGeometry(cfg.radius, cfg.tube, 8, 100);
      const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.4 });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.set(...(cfg.tilt as [number, number, number]));
      scene.add(ring);
      rings.push({ mesh: ring, speed: cfg.speed });
    });

    // ── Orbiting dots ──
    const dotConfigs = [
      { r: 1.85, speed: 0.7, color: 0xc4b5fd, offset: 0 },
      { r: 1.85, speed: 0.7, color: 0x22d3ee, offset: Math.PI },
      { r: 2.3,  speed: -0.5, color: 0xa78bfa, offset: 1 },
      { r: 2.75, speed: 0.3,  color: 0x22c55e, offset: 2.5 },
      { r: 2.75, speed: 0.3,  color: 0xf59e0b, offset: 4.5 },
    ];
    const orbitDots = dotConfigs.map(cfg => {
      const mat = new THREE.MeshBasicMaterial({ color: cfg.color });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat);
      scene.add(dot);
      return { mesh: dot, ...cfg };
    });

    // ── Data stream particles ──
    const streamSources: [number,number,number][] = [
      [-3.5, 2, 0], [3.5, 1.5, 0], [0, -3, 0], [-2.5, -2, 0], [2.5, -2, 0]
    ];
    const streamColors = [0xa78bfa, 0x22d3ee, 0x22c55e, 0xf59e0b, 0xec4899];
    const streams = streamSources.map((from, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: streamColors[i], transparent: true, opacity: 0.9 });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mat);
      scene.add(dot);
      return { mesh: dot, from, progress: Math.random() };
    });

    // ── Stars ──
    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPos[i] = (Math.random() - 0.5) * 60;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starGeo, starMat));

    // ── Sparkle particles ──
    const sparkleGeo = new THREE.BufferGeometry();
    const sparkleCount = 60;
    const sparklePos = new Float32Array(sparkleCount * 3);
    const sparkleSpeeds: number[] = [];
    for (let i = 0; i < sparkleCount; i++) {
      const r = 2 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      sparklePos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      sparklePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      sparklePos[i * 3 + 2] = r * Math.cos(phi);
      sparkleSpeeds.push(0.3 + Math.random() * 0.7);
    }
    sparkleGeo.setAttribute("position", new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({ color: 0xa78bfa, size: 0.06, transparent: true, opacity: 0.7 });
    const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
    scene.add(sparkles);

    // ── Animation loop ──
    let frame = 0;
    let animId: number;
    const clock = new THREE.Clock();

    // Auto-rotate group
    const group = new THREE.Group();
    group.add(core, glow);
    rings.forEach(r => group.add(r.mesh));
    // Note: orbit dots and streams stay in scene space for independent animation

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      frame++;

      // Rotate core
      core.rotation.y = t * 0.18;
      core.rotation.x = Math.sin(t * 0.3) * 0.08;
      glow.rotation.y = -t * 0.1;

      // Pulse core
      const pulse = 1 + Math.sin(t * 1.2) * 0.025;
      core.scale.setScalar(pulse);
      glowMat.opacity = 0.1 + Math.sin(t * 1.5) * 0.05;
      pointA.intensity = 2.5 + Math.sin(t * 0.8) * 0.8;

      // Rotate rings
      rings.forEach(r => { r.mesh.rotation.z += 0.016 * r.speed; });

      // Orbit dots
      orbitDots.forEach(d => {
        const angle = t * d.speed + d.offset;
        d.mesh.position.x = Math.cos(angle) * d.r;
        d.mesh.position.z = Math.sin(angle) * d.r;
        d.mesh.position.y = Math.sin(angle * 0.5) * 0.3;
      });

      // Data streams toward center
      streams.forEach(s => {
        s.progress = (s.progress + 0.006) % 1;
        const p = s.progress;
        s.mesh.position.x = s.from[0] * (1 - p);
        s.mesh.position.y = s.from[1] * (1 - p);
        s.mesh.position.z = s.from[2] * (1 - p);
      });

      // Sparkle drift
      sparkles.rotation.y = t * 0.05;
      sparkleMat.opacity = 0.5 + Math.sin(t * 0.7) * 0.2;

      // Gentle scene sway
      scene.rotation.y = Math.sin(t * 0.15) * 0.06;

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const onResize = () => {
      const W2 = mount.clientWidth;
      const H2 = mount.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative" style={{ width: "100%", height: "100%", minHeight: 520 }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {/* Radial glow overlay */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ zIndex: 0 }}
      >
        <div style={{
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(79,70,229,0.12) 40%, transparent 70%)",
          filter: "blur(48px)",
          animation: "glowPulse 3.5s ease-in-out infinite",
        }} />
      </div>
      <style>{`@keyframes glowPulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.18);opacity:1}}`}</style>
    </div>
  );
}

// ─── Animated floating stat card ─────────────────────────────────────────────
type StatCardProps = {
  label: string;
  value?: string | number;
  numericValue?: number;
  prefix?: string;
  suffix?: string;
  sub: string;
  delta?: string;
  color?: string;
  avatars?: boolean;
  style?: React.CSSProperties;
  delay?: number;
};

export function AnimatedStatCard({
  label, value, numericValue, prefix = "", suffix = "",
  sub, delta, color = "#a87dff", avatars, style, delay = 0
}: StatCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      className="absolute rounded-xl border border-white/10 shadow-2xl backdrop-blur-md cursor-default"
      style={{ minWidth: 162, background: "rgba(13,13,31,0.88)", ...style }}
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.06, y: -4 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{ boxShadow: `0 0 24px ${color}55, inset 0 0 24px ${color}11` }}
      />
      <div className="relative p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-white/40 truncate">{label}</div>
          {delta && (
            <motion.span
              className="shrink-0 text-[10px] font-bold text-emerald-400"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {delta}
            </motion.span>
          )}
        </div>
        {avatars && (
          <div className="mt-1 flex -space-x-1.5">
            {["JM", "SK", "AL"].map(i => (
              <div key={i} className="grid h-5 w-5 place-items-center rounded-full border-2 border-[#0d0d1f] bg-gradient-to-br from-violet-500 to-purple-700 text-[8px] font-bold text-white">{i}</div>
            ))}
          </div>
        )}
        <div className="mt-1 text-2xl font-black leading-none" style={{ color }}>
          {numericValue !== undefined
            ? <CountUp to={numericValue} prefix={prefix} suffix={suffix} duration={2.5} />
            : String(value)}
        </div>
        <div className="mt-0.5 text-[10px] text-white/30">{sub}</div>
        <motion.div
          className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [1, 0.2, 1], scale: [1, 1.5, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}

// ─── Agent pill ────────────────────────────────────────────────────────────────
export function AgentPill({ label, color, delay = 0 }: { label: string; color: string; delay?: number }) {
  return (
    <motion.div
      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-sm"
      style={{ borderColor: `${color}40`, background: `${color}12`, color: "#fff" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.08 }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        animate={{ opacity: [1, 0.3, 1], scale: [1, 1.6, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: delay * 0.5 }}
      />
      {label}
    </motion.div>
  );
}
