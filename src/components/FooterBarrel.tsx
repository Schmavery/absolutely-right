import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'built with irony using';
const TOOLS = ['cursor', 'figma'] as const;
const TOOL_CH = Math.max(...TOOLS.map((t) => t.length));

const FACE_DEG = 180;
const RADIUS_PX = 10;
const HIT_PAD_PX = 14;
const HOVER_IMPULSE = 5.5;
const WHEEL_IMPULSE = 0.4;
const PASS_PX = 8;
const HARD_SPIN_SPEED = 200;
const FLIP_SPEED = 820;
const COAST_FRICTION = 0.45;
const DAMP_FRICTION = 5;
const MAX_SPEED = 1400;

function nearestFaceDeg(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return n < 90 || n >= 270 ? 0 : FACE_DEG;
}

function shortestDelta(from: number, to: number): number {
  let d = to - from;
  if (d > FACE_DEG) d -= 360;
  if (d < -FACE_DEG) d += 360;
  return d;
}

function normalizeDeg(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return n === 360 ? 0 : n;
}

/** Next face (0 or 180) ahead in the direction of spin */
function targetFaceAlongVelocity(angle: number, velocity: number): number {
  if (velocity === 0) return nearestFaceDeg(angle);
  const n = normalizeDeg(angle);
  if (velocity > 0) return n < 180 ? FACE_DEG : 0;
  return n > 0 ? 0 : FACE_DEG;
}

const SNAP_EPS = 0.75;
const LOCK_SPEED = 4;

export function FooterBarrel() {
  const startFace = useRef(Math.random() < 0.5 ? 0 : 1).current;
  const [staticIndex, setStaticIndex] = useState(startFace);
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const drumRef = useRef<HTMLSpanElement>(null);
  const hitRef = useRef<HTMLSpanElement>(null);
  const angleRef = useRef(startFace * FACE_DEG);
  const velocityRef = useRef(0);
  const lastYRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef<number | null>(null);
  const entryAngleRef = useRef(startFace * FACE_DEG);
  const gestureDyRef = useRef(0);
  const commitTargetRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const trackingRef = useRef(false);
  const rafRef = useRef<number>();

  const paint = useCallback(() => {
    if (!drumRef.current) return;
    drumRef.current.style.transform = `rotateX(${angleRef.current}deg)`;
  }, []);

  const pointerInsideHit = useCallback((x: number, y: number) => {
    const el = hitRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return (
      x >= r.left - HIT_PAD_PX &&
      x <= r.right + HIT_PAD_PX &&
      y >= r.top - HIT_PAD_PX &&
      y <= r.bottom + HIT_PAD_PX
    );
  }, []);

  const lockToFace = useCallback(
    (target?: number) => {
      const face = target ?? nearestFaceDeg(angleRef.current);
      angleRef.current = face;
      velocityRef.current = 0;
      commitTargetRef.current = null;
      paint();
    },
    [paint],
  );

  const kickToward = useCallback(
    (target: number, speed = FLIP_SPEED) => {
      const face = normalizeDeg(target);
      const delta = shortestDelta(angleRef.current, face);
      if (Math.abs(delta) < SNAP_EPS) {
        lockToFace(face);
        return;
      }
      commitTargetRef.current = face;
      velocityRef.current = Math.sign(delta) * speed;
    },
    [lockToFace],
  );

  const endInteraction = useCallback(() => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    hoveringRef.current = false;
    lastYRef.current = null;

    const passed = Math.abs(gestureDyRef.current) >= PASS_PX;
    if (!passed) {
      kickToward(nearestFaceDeg(angleRef.current));
      return;
    }

    const dir = Math.sign(velocityRef.current) || Math.sign(gestureDyRef.current) || 1;
    if (Math.abs(velocityRef.current) >= HARD_SPIN_SPEED) {
      kickToward(
        targetFaceAlongVelocity(angleRef.current, velocityRef.current),
        Math.abs(velocityRef.current),
      );
      return;
    }

    kickToward(normalizeDeg(entryAngleRef.current + FACE_DEG * dir));
  }, [kickToward]);

  const startInteraction = useCallback((clientX: number, clientY: number) => {
    trackingRef.current = true;
    hoveringRef.current = true;
    entryAngleRef.current = nearestFaceDeg(angleRef.current);
    gestureDyRef.current = 0;
    commitTargetRef.current = null;
    lastYRef.current = clientY;
    lastPointerRef.current = { x: clientX, y: clientY };
  }, []);

  const nudge = useCallback((deltaY: number) => {
    if (deltaY === 0) return;
    const push = -deltaY;
    gestureDyRef.current += push;
    velocityRef.current = Math.max(
      -MAX_SPEED,
      Math.min(MAX_SPEED, velocityRef.current + push * HOVER_IMPULSE),
    );
  }, []);

  const onWindowPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!trackingRef.current) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pointerInsideHit(e.clientX, e.clientY)) {
        endInteraction();
        return;
      }
      if (lastYRef.current != null) nudge(e.clientY - lastYRef.current);
      lastYRef.current = e.clientY;
    },
    [endInteraction, nudge, pointerInsideHit],
  );

  const onWindowPointerEnd = useCallback(() => {
    endInteraction();
  }, [endInteraction]);

  useEffect(() => {
    if (reducedMotion) return;
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
    };
  }, [onWindowPointerEnd, onWindowPointerMove, reducedMotion]);

  const step = useCallback(
    (now: number) => {
      const last = lastTimeRef.current ?? now;
      lastTimeRef.current = now;
      const dt = Math.min((now - last) / 1000, 0.05);

      let v = velocityRef.current;
      let a = angleRef.current;
      const commit = commitTargetRef.current;
      const before = a;

      if (commit != null) {
        const delta = shortestDelta(a, commit);
        if (Math.abs(v) < FLIP_SPEED * 0.6) {
          v = Math.sign(delta) * FLIP_SPEED;
        }
        v *= Math.exp(-COAST_FRICTION * dt);
      } else if (Math.abs(v) >= HARD_SPIN_SPEED) {
        v *= Math.exp(-COAST_FRICTION * dt);
        if (Math.abs(v) < HARD_SPIN_SPEED * 0.35) {
          kickToward(targetFaceAlongVelocity(a, v), Math.abs(v) + 200);
        }
      } else if (hoveringRef.current || trackingRef.current) {
        v *= Math.exp(-1.2 * dt);
      } else if (Math.abs(v) > 35) {
        v *= Math.exp(-DAMP_FRICTION * dt);
      } else {
        const target = nearestFaceDeg(a);
        const delta = shortestDelta(a, target);
        v = Math.abs(delta) < SNAP_EPS ? 0 : delta * 14;
      }

      v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
      a += v * dt;

      if (commit != null) {
        const deltaAfter = shortestDelta(a, commit);
        const crossed =
          Math.sign(shortestDelta(before, commit)) !== 0 &&
          Math.sign(shortestDelta(before, commit)) !== Math.sign(deltaAfter);
        if (Math.abs(deltaAfter) < SNAP_EPS || crossed) {
          a = commit;
          v = 0;
          commitTargetRef.current = null;
        }
      } else if (
        !hoveringRef.current &&
        !trackingRef.current &&
        Math.abs(v) < LOCK_SPEED
      ) {
        const target = nearestFaceDeg(a);
        if (Math.abs(shortestDelta(a, target)) < 90) {
          a = target;
          v = 0;
        }
      }

      angleRef.current = a;
      velocityRef.current = v;
      paint();
      rafRef.current = requestAnimationFrame(step);
    },
    [kickToward, paint],
  );

  useEffect(() => {
    if (reducedMotion) return;
    paint();
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [paint, reducedMotion, step]);

  const onBarrelPointerEnter = (e: React.PointerEvent) => {
    startInteraction(e.clientX, e.clientY);
  };

  const onBarrelPointerLeave = (e: React.PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (e.buttons > 0) return;

    requestAnimationFrame(() => {
      if (!trackingRef.current) return;
      const { x, y } = lastPointerRef.current;
      if (pointerInsideHit(x, y)) return;
      endInteraction();
    });
  };

  const onBarrelWheel = (e: React.WheelEvent) => {
    if (reducedMotion) return;
    e.preventDefault();
    if (!trackingRef.current) startInteraction(e.clientX, e.clientY);
    gestureDyRef.current += e.deltaY;
    nudge(e.deltaY * WHEEL_IMPULSE);
  };

  const barrel = (
    <span
      ref={hitRef}
      className="inline-flex items-center justify-center overflow-visible shrink-0 touch-none"
      style={{
        margin: `-${HIT_PAD_PX}px -6px`,
        padding: `${HIT_PAD_PX}px 6px`,
      }}
      onPointerEnter={onBarrelPointerEnter}
      onPointerLeave={onBarrelPointerLeave}
      onWheel={onBarrelWheel}
    >
      <span
        className="relative inline-flex items-center justify-center"
        style={{
          width: `${TOOL_CH}ch`,
          height: '1em',
          perspective: '400px',
          perspectiveOrigin: 'center center',
        }}
      >
        <span
          ref={drumRef}
          className="absolute inset-0 [transform-style:preserve-3d] will-change-transform"
          style={{ transform: `rotateX(${startFace * FACE_DEG}deg)` }}
        >
          {TOOLS.map((tool, i) => (
            <span
              key={tool}
              className="absolute inset-0 flex items-center justify-center whitespace-nowrap [backface-visibility:hidden] pointer-events-none"
              style={{
                transform: `rotateX(${i * FACE_DEG}deg) translateZ(${RADIUS_PX}px)`,
              }}
            >
              {tool}
            </span>
          ))}
        </span>
      </span>
    </span>
  );

  if (reducedMotion) {
    return (
      <button
        type="button"
        onClick={() => setStaticIndex((i) => (i + 1) % TOOLS.length)}
        className="py-3 pb-5 w-full bg-transparent border-0 cursor-default text-footer text-[11px] italic flex justify-center items-center gap-[0.35em]"
        style={{ font: 'inherit' }}
      >
        <span>{PREFIX}</span>
        <span>{TOOLS[staticIndex]}</span>
      </button>
    );
  }

  return (
    <div className="pt-3 pb-5 text-footer text-[11px] italic flex-shrink-0 select-none overflow-visible flex justify-center items-center">
      <span className="inline-flex items-center justify-center gap-[0.35em]">
        <span>{PREFIX}</span>
        {barrel}
      </span>
    </div>
  );
}
