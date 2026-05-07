"use client";
import { Line, LineChart, ResponsiveContainer } from "recharts";

export default function Sparkline({
  data,
  color = "#a87dff",
}: {
  data: number[];
  color?: string;
}) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
