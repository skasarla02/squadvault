import { motion } from "framer-motion";

interface FundingGaugeProps {
  percent: number;
  size?: number;
}

export function FundingGauge({ percent, size = 120 }: FundingGaugeProps) {
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-muted" fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        className="stroke-primary"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: circumference - (clamped / 100) * circumference }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        className="fill-foreground font-serif text-2xl"
      >
        {clamped}%
      </text>
    </svg>
  );
}
