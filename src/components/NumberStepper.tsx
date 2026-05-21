import { motion } from 'motion/react';

// TICKET-015 §A — Q0 'custom' 家庭组合双 stepper 组件。±按钮 + 数字显示，
// 约束在 [min, max] 之间。受控组件 — value/onChange 由父组件管。

export interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}

export default function NumberStepper({ label, value, onChange, min, max, unit = '' }: NumberStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex-1 flex flex-col items-center py-4 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }}>
      <span className="text-white/65 mb-3" style={{ fontSize: 13, letterSpacing: '0.04em' }}>{label}</span>
      <div className="flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={dec}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: value <= min ? 'rgba(255,255,255,0.05)' : 'rgba(255,90,31,0.22)', color: value <= min ? 'rgba(255,255,255,0.3)' : '#fff' }}
          disabled={value <= min}>
          <span style={{ fontSize: 22, fontWeight: 300, lineHeight: 1 }}>−</span>
        </motion.button>
        <span className="text-white font-bold tabular-nums" style={{ fontSize: 28, lineHeight: 1, minWidth: 32, textAlign: 'center' }}>{value}</span>
        <motion.button whileTap={{ scale: 0.9 }} onClick={inc}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: value >= max ? 'rgba(255,255,255,0.05)' : 'rgba(255,90,31,0.22)', color: value >= max ? 'rgba(255,255,255,0.3)' : '#fff' }}
          disabled={value >= max}>
          <span style={{ fontSize: 22, fontWeight: 300, lineHeight: 1 }}>+</span>
        </motion.button>
      </div>
      {unit && <span className="text-white/35 mt-2" style={{ fontSize: 11 }}>{unit}</span>}
    </div>
  );
}
