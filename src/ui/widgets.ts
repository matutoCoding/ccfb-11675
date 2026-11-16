/** 轻量 DOM 控件工具 */

type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label', text: label }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  );
}

export function numberInput(
  value: number,
  opts: { min?: number; max?: number; step?: number; onchange: (v: number) => void },
): HTMLInputElement {
  const input = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.step = String(opts.step ?? 1);
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) opts.onchange(v);
  });
  return input;
}

export function slider(
  value: number,
  min: number,
  max: number,
  step: number,
  oninput: (v: number) => void,
): { wrap: HTMLElement; input: HTMLInputElement; valueLabel: HTMLElement } {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  const valueLabel = el('span', { class: 'slider-value', text: String(value) });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueLabel.textContent = String(v);
    oninput(v);
  });
  return { wrap: el('div', { class: 'slider' }, input, valueLabel), input, valueLabel };
}

export function button(label: string, onclick: () => void, cls = ''): HTMLButtonElement {
  return el('button', { class: `btn ${cls}`, text: label, onclick }) as HTMLButtonElement;
}

export function select<T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onchange: (v: T) => void,
): HTMLSelectElement {
  const sel = el('select', {},
    ...options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value ? '' : null })),
  ) as HTMLSelectElement;
  sel.value = value;
  sel.addEventListener('change', () => onchange(sel.value as T));
  return sel;
}

export function checkbox(label: string, checked: boolean, onchange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onchange(input.checked));
  return el('label', { class: 'checkbox' }, input, el('span', { text: label }));
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', { text: title }),
    ...children,
  );
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
