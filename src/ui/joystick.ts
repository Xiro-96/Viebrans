/**
 * Virtueller Steuerknüppel für den linken Daumen. Er erscheint dort, wo der
 * Finger aufsetzt — das trifft auf einem Handy zuverlässiger als ein fester
 * Kreis am Bildschirmrand.
 */
import { el } from './dom';

export class Joystick {
  root: HTMLElement;
  private knob: HTMLElement;
  private originX = 0;
  private originY = 0;
  private pointerId: number | null = null;
  /** Ausschlag von -1 bis 1. */
  x = 0;
  y = 0;
  get active(): boolean {
    return this.pointerId !== null;
  }

  constructor(private radius = 54) {
    this.knob = el('i', { class: 'stick-knob' });
    this.root = el('div', { class: 'stick' }, [this.knob]);
    this.root.style.display = 'none';
  }

  start(id: number, x: number, y: number): void {
    this.pointerId = id;
    this.originX = x;
    this.originY = y;
    this.root.style.display = 'block';
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.move(x, y);
  }

  move(x: number, y: number): void {
    if (this.pointerId === null) return;
    let dx = x - this.originX;
    let dy = y - this.originY;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.x = dx / this.radius;
    this.y = dy / this.radius;
  }

  end(): void {
    this.pointerId = null;
    this.x = 0;
    this.y = 0;
    this.root.style.display = 'none';
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  owns(id: number): boolean {
    return this.pointerId === id;
  }
}
