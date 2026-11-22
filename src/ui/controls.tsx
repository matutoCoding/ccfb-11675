import { ReactNode } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}

export const NumberField = ({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: NumberFieldProps) => (
  <div className="field">
    <label>{label}</label>
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
    {suffix && <small className="muted">{suffix}</small>}
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  decimals?: number;
}

export const Slider = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
  decimals = 2,
}: SliderProps) => (
  <div className="row">
    <label>{label}</label>
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
    <span className="val mono">
      {value.toFixed(decimals)}
      {unit}
    </span>
  </div>
);

export const Card = ({
  title,
  children,
  extra,
}: {
  title?: string;
  children: ReactNode;
  extra?: ReactNode;
}) => (
  <div className="card">
    {title && (
      <h2>
        {title}
        {extra && <span style={{ float: 'right' }}>{extra}</span>}
      </h2>
    )}
    {children}
  </div>
);

export const Pill = ({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'ok' | 'err';
}) => <span className={`pill ${tone ?? ''}`}>{children}</span>;
