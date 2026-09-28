/**
 * Event-driven squad radio.
 * AI state changes enqueue structured callouts; the channel plays one line at a time.
 */

import { tacticalAudio } from '../audio/tacticalAudio';

export type RadioCalloutKind =
  | 'contact'
  | 'suppression'
  | 'reloading'
  | 'squad_leader_casualty'
  | 'wounded'
  | 'neutralized'
  | 'flanking'
  | 'status';

export interface RadioCallout {
  kind: RadioCalloutKind;
  speakerId: string;
  callsign: string;
  isBluefor: boolean;
  from?: { x: number; z: number } | null;
  to?: { x: number; z: number } | null;
  targetCallsign?: string;
  side?: 'left' | 'right';
  text?: string;
  delaySec?: number;
}

interface QueuedTransmission {
  kind: RadioCalloutKind;
  speakerId: string;
  callsign: string;
  isBluefor: boolean;
  text: string;
  readyAt: number;
}

const COOLDOWN_MS: Record<RadioCalloutKind, number> = {
  contact: 8000,
  suppression: 6500,
  reloading: 4500,
  squad_leader_casualty: 12000,
  wounded: 5000,
  neutralized: 3200,
  flanking: 7000,
  status: 2800,
};

const CHANNEL_GAP_MS = 1700;
const MAX_QUEUE = 6;

export function compassBearing(
  from: { x: number; z: number } | null | undefined,
  to: { x: number; z: number } | null | undefined
): number | null {
  if (!from || !to) return null;
  if (!Number.isFinite(from.x) || !Number.isFinite(from.z) || !Number.isFinite(to.x) || !Number.isFinite(to.z)) {
    return null;
  }
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return null;
  const degrees = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function formatBearing(degrees: number | null | undefined): string | null {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const snapped = Math.round(degrees / 5) * 5 % 360;
  return String(snapped).padStart(3, '0');
}

export function composeCallout(event: RadioCallout): string {
  if (event.text && event.text.trim()) return event.text.trim();
  const bearing = formatBearing(compassBearing(event.from, event.to));
  const target = event.targetCallsign?.trim();
  switch (event.kind) {
    case 'contact':
      return bearing
        ? `Contact, bearing ${bearing}${target ? `! ${target} spotted` : ''}!`
        : 'Contact! Hostile movement on the line!';
    case 'suppression':
      return bearing
        ? `Suppressing bearing ${bearing}! Heads down!`
        : 'Laying suppression! Stay low!';
    case 'reloading':
      return 'Reloading! Cover me!';
    case 'squad_leader_casualty':
      return event.isBluefor
        ? `${target || 'Squad leader'} is down! We lost the squad leader!`
        : `${target || 'Commander'} is down! Squad leader is KIA! Break and attack!`;
    case 'wounded':
      return 'I am hit! Taking heavy fire!';
    case 'neutralized':
      return bearing
        ? `Target down, bearing ${bearing}.`
        : 'Hostile neutralized. Clean hit.';
    case 'flanking':
      return bearing
        ? `Flanking ${event.side === 'right' ? 'right' : 'left'}, bearing ${bearing}.`
        : `Flanking ${event.side === 'right' ? 'right' : 'left'}!`;
    default:
      return 'Status green. Holding position.';
  }
}

export class RadioChatterSystem {
  public onTransmission?: (callsign: string, text: string, isBluefor: boolean) => void;

  private queue: QueuedTransmission[] = [];
  private lastSpoken = new Map<string, number>();
  private channelFreeAt = 0;

  public callout(event: RadioCallout | null | undefined, now = performance.now()): boolean {
    if (!event?.callsign || !event.speakerId || !event.kind) return false;
    const key = this.cooldownKey(event);
    const previous = this.lastSpoken.get(key) ?? -Infinity;
    const cooldown = COOLDOWN_MS[event.kind] ?? 3000;
    if (now - previous < cooldown) return false;

    const text = composeCallout(event);
    if (!text) return false;
    this.lastSpoken.set(key, now);
    const line: QueuedTransmission = {
      kind: event.kind,
      speakerId: event.speakerId,
      callsign: event.callsign,
      isBluefor: event.isBluefor,
      text,
      readyAt: now + Math.max(0, event.delaySec ?? 0) * 1000,
    };
    if (event.kind === 'squad_leader_casualty') this.queue.unshift(line);
    else this.queue.push(line);
    if (this.queue.length > MAX_QUEUE) {
      const overflow = this.queue.findIndex((entry) => entry.kind !== 'squad_leader_casualty');
      if (overflow >= 0) this.queue.splice(overflow, 1);
      else this.queue.pop();
    }
    return true;
  }

  public submitLine(
    line: {
      speakerId: string;
      callsign: string;
      text: string;
      isBluefor: boolean;
      delaySec?: number;
    },
    now = performance.now()
  ): boolean {
    return this.callout(
      {
        kind: 'status',
        speakerId: line.speakerId,
        callsign: line.callsign,
        isBluefor: line.isBluefor,
        text: line.text,
        delaySec: line.delaySec,
      },
      now
    );
  }

  public update(now = performance.now()): void {
    if (now < this.channelFreeAt) return;
    const index = this.queue.findIndex((line) => line.readyAt <= now);
    if (index < 0) return;
    const [next] = this.queue.splice(index, 1);
    if (!next?.text || !next.callsign) return;
    this.channelFreeAt = now + CHANNEL_GAP_MS;
    try {
      tacticalAudio.playRadioSquelchChirp();
    } catch {
      // Audio context can be closed during teardown.
    }
    this.onTransmission?.(next.callsign, next.text, next.isBluefor);
  }

  public resetKind(kind: RadioCalloutKind): void {
    for (const key of this.lastSpoken.keys()) {
      if (key.endsWith(`:${kind}`)) this.lastSpoken.delete(key);
    }
  }

  public clearQueue(): void {
    this.queue = [];
  }

  private cooldownKey(event: RadioCallout): string {
    if (event.kind === 'squad_leader_casualty') {
      return `global:${event.isBluefor ? 'blue' : 'red'}:squad_leader_casualty`;
    }
    if (event.kind === 'contact') {
      return `global:${event.isBluefor ? 'blue' : 'red'}:contact`;
    }
    return `${event.speakerId}:${event.kind}`;
  }
}

export const radioChatter = new RadioChatterSystem();
