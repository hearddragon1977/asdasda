import React, { useEffect, useRef } from 'react';
import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import { tacticalLayout } from '../systems/mapGenerator';

interface TopoMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerPos: { x: number; z: number; rotationY: number };
  friendlies: FriendlyCombatant[];
  enemies: EnemyCombatant[];
}

export const TopoMapModal: React.FC<TopoMapModalProps> = ({
  isOpen,
  onClose,
  playerPos,
  friendlies,
  enemies,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderMap = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Coordinate Transform: Three.js World (-50 to 50) -> Canvas (0 to w, 0 to h)
      const toCanvasX = (worldX: number) => ((worldX + 50) / 100) * w;
      const toCanvasY = (worldZ: number) => ((worldZ + 50) / 100) * h;

      // Background: Dark tactical grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Topographic contour rings
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let r = 40; r < Math.max(w, h); r += 45) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 10m Tactical Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.8;
      for (let x = -50; x <= 50; x += 10) {
        const cx = toCanvasX(x);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
      }
      for (let z = -50; z <= 50; z += 10) {
        const cy = toCanvasY(z);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
      }

      // Outer Perimeter Wall (-45 to 45)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(toCanvasX(-45), toCanvasY(-45), (90 / 100) * w, (90 / 100) * h);

      const blueSpawn = tacticalLayout?.spawns?.find((spawn) => spawn.faction === 'bluefor');
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      for (const spawn of tacticalLayout?.spawns ?? []) {
        if (!spawn || spawn.faction !== 'opfor' || !blueSpawn) continue;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(blueSpawn.position.x), toCanvasY(blueSpawn.position.z));
        ctx.lineTo(toCanvasX(spawn.position.x), toCanvasY(spawn.position.z));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.font = '10px monospace';
      for (const placement of tacticalLayout?.placements ?? []) {
        if (!placement?.position || !placement.size) continue;
        const swapped = Math.abs(Math.sin(placement.rotationY || 0)) > 0.5;
        const pw = ((swapped ? placement.size.z : placement.size.x) / 100) * w;
        const ph = ((swapped ? placement.size.x : placement.size.z) / 100) * h;
        const px = toCanvasX(placement.position.x) - pw / 2;
        const py = toCanvasY(placement.position.z) - ph / 2;
        ctx.fillStyle = placement.kind === 'ruined_brick'
          ? '#9a3412'
          : placement.kind === 'shipping_container'
          ? '#c2410c'
          : placement.kind === 'trench'
          ? '#3f6212'
          : placement.kind === 'crate'
          ? '#d97706'
          : '#64748b';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);
      }

      ctx.fillStyle = '#94a3b8';
      for (const spawn of tacticalLayout?.spawns ?? []) {
        if (!spawn?.position) continue;
        ctx.fillStyle = spawn.faction === 'bluefor' ? '#34d399' : '#fca5a5';
        ctx.fillText(spawn.label, toCanvasX(spawn.position.x) + 4, toCanvasY(spawn.position.z) - 4);
      }

      // Southern extraction lane
      ctx.font = '10px monospace';
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(toCanvasX(-10), toCanvasY(18), (20 / 100) * w, (14 / 100) * h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#10b981';
      ctx.fillText('EXTRACTION LZ DUSTOFF', toCanvasX(-9), toCanvasY(26));

      // Draw Hostile Enemies (RED BLIPS)
      enemies.forEach((enemy) => {
        if (!enemy?.position || enemy.health <= 0) return;
        const ex = toCanvasX(enemy.position.x);
        const ey = toCanvasY(enemy.position.z);

        // Ping ring
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ex, ey, 9, 0, Math.PI * 2);
        ctx.stroke();

        // Enemy marker
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.font = '9px monospace';
        ctx.fillText(enemy.callsign, ex + 7, ey + 3);
      });

      // Draw Friendly AI Operators (BLUE BLIPS)
      friendlies.forEach((friendly) => {
        if (!friendly?.position || friendly.status === 'KIA') return;
        const fx = toCanvasX(friendly.position.x);
        const fy = toCanvasY(friendly.position.z);

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(fx, fy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '9px monospace';
        ctx.fillText(friendly.callsign, fx + 7, fy + 3);
      });

      // Draw Player Position & Orientation Cone (VIBRANT GREEN)
      const px = toCanvasX(playerPos.x);
      const py = toCanvasY(playerPos.z);

      // Vision cone
      const coneLength = 26;
      const angle = playerPos.rotationY + Math.PI / 2;
      const spread = 0.45;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, coneLength, angle - spread, angle + spread);
      ctx.closePath();
      ctx.fill();

      // Player Green Arrow
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#86efac';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('YOU (OPERATOR)', px + 9, py + 4);

      animId = requestAnimationFrame(renderMap);
    };

    renderMap();
    return () => cancelAnimationFrame(animId);
  }, [isOpen, playerPos, friendlies, enemies]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 p-5 rounded-sm font-mono text-slate-100 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-sky-400 block">
              LIVE SATELLITE TACTICAL GRID // SECTOR 44-B
            </span>
            <span className="text-xs text-slate-400">
              Real-Time Dynamic Sensor Feed · Coordinates: [{Math.round(playerPos.x)}, {Math.round(playerPos.z)}]
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-600 rounded transition-colors cursor-pointer"
          >
            STOW MAP [M / ESC]
          </button>
        </div>

        {/* Live Canvas Map */}
        <div className="relative aspect-[16/10] bg-slate-950 border border-slate-800 rounded overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-full object-contain"
          />

          {/* Real Coordinates Overlay */}
          <div className="absolute bottom-3 left-3 bg-black/85 px-3 py-1.5 border border-slate-700 rounded text-xs font-mono text-slate-200">
            <span>GRID: 34S 482 192 · OPERATOR COORD: [X: {playerPos.x.toFixed(1)}, Z: {playerPos.z.toFixed(1)}]</span>
          </div>

          <div className="absolute top-3 right-3 bg-black/85 px-3 py-1.5 border border-slate-700 rounded text-xs font-mono text-amber-400">
            <span>LIVE RADAR · SATELLITE OVERWATCH ↑ NORTH</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-slate-800">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>You (Operator)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
              <span>Friendly AI (Bluefor)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span>Hostile Insurgents (Opfor)</span>
            </span>
          </div>
          <span className="text-emerald-400 font-bold">1 Grid Unit = 1 Meter</span>
        </div>
      </div>
    </div>
  );
};
