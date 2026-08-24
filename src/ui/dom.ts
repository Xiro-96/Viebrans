type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Reagiert sofort auf Berührung — ohne die 300ms-Verzögerung mobiler Browser. */
export function tap(node: HTMLElement, handler: (ev: Event) => void): void {
  let touched = false;
  node.addEventListener('touchstart', (ev) => {
    touched = true;
    ev.preventDefault();
    handler(ev);
  }, { passive: false });
  node.addEventListener('click', (ev) => {
    if (touched) { touched = false; return; }
    handler(ev);
  });
}

export function toast(text: string, ms = 1800): void {
  const t = el('div', { class: 'toast', text });
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}
