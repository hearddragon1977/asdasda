import React, { useEffect, useRef } from 'react';
import { EnemyCombatant, FriendlyCombatant } from '../types/game';
import { mapBounds } from '../game/mapBounds';

interface TopoMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerPos: { x: number; z: number; rotationY: number };
  friendlies: FriendlyCombatant[];
  enemies: EnemyCombatant[];
  /** Top-down render of the loaded city, covering mapBounds. */
  overheadImage?: string | null;
}

export const TopoMapModal: React.FC<TopoMapModalProps> = ({
  isOpen,
  onClose,
  playerPos,
  friendlies,
  enemies,
  overheadImage = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!overheadImage) {
      imageRef.current = null;
      return;
    }
    const image = new Image();
    image.src = overheadImage;
    imageRef.current = image;
  }, [overheadImage]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderMap = () => {
      const w = canvas.width;
      const h = canvas.height;

      // World → canvas: a square view of mapBounds, centered and letterboxed.
      const spanX = Math.max(1, mapBounds.maxX - mapBounds.minX);
      const spanZ = Math.max(1, mapBounds.maxZ - mapBounds.minZ);
      const span = Math.max(spanX, spanZ);
      const side = Math.min(w, h);
      const originX = (w - side) / 2;
      const originY = (h - side) / 2;
      const centerX = (mapBounds.minX + mapBounds.maxX) / 2;
      const centerZ = (mapBounds.minZ + mapBounds.maxZ) / 2;
      const toCanvasX = (worldX: number) => originX + ((worldX - centerX) / span + 0.5) * side;
      const toCanvasY = (worldZ: number) => originY + ((worldZ - centerZ) / span + 0.5) * side;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      const image = imageRef.current;
      if (image && image.complete && image.naturalWidth > 0) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(image, originX, originY, side, side);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '11px monospace';
        ctx.fillText('AWAITING SATELLITE IMAGERY…', originX + 12, originY + 20);
      }

      // 10m grid over the map square
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 0.8;
      const firstX = Math.ceil((centerX - span / 2) / 10) * 10;
      for (let x = firstX; x <= centerX + span / 2; x += 10) {
        const cx = toCanvasX(x);
        ctx.beginPath();
        ctx.moveTo(cx, originY);
        ctx.lineTo(cx, originY + side);
        ctx.stroke();
      }
      const firstZ = Math.ceil((centerZ - span / 2) / 10) * 10;
      for (let z = firstZ; z <= centerZ + span / 2; z += 10) {
        const cy = toCanvasY(z);
        ctx.beginPath();
        ctx.moveTo(originX, cy);
        ctx.lineTo(originX + side, cy);
        ctx.stroke();
      }

      // Walkable boundary
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        toCanvasX(mapBounds.minX),
        toCanvasY(mapBounds.minZ),
        toCanvasX(mapBounds.maxX) - toCanvasX(mapBounds.minX),
        toCanvasY(mapBounds.maxZ) - toCanvasY(mapBounds.minZ)
      );

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
      const angle = Math.PI / 2 - playerPos.rotationY;
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
