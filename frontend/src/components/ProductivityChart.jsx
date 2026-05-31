import {
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";


export default function ProductivityChart({
  analytics,
}) {

  const chartData = [
    {
      name: "Projects",
      value:
        analytics.total_projects,
    },
    {
      name: "Tasks",
      value:
        analytics.total_tasks,
    },
    {
      name: "Completed",
      value:
        analytics.completed_tasks,
    },
    {
      name: "Deadlines",
      value:
        analytics.upcoming_deadlines,
    },
  ];


  return (
    <div className="min-w-0 rounded-xl bg-white p-4 shadow-sm sm:p-6">

      <h2 className="mb-4 text-lg font-bold sm:mb-6 sm:text-2xl">
        Productivity Overview
      </h2>

      <div className="h-[260px] min-w-0 sm:h-[350px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <BarChart data={chartData}>

            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="name" />

            <YAxis />

            <Tooltip />

            <Bar
              dataKey="value"
              fill="#2563EB"
              radius={[8, 8, 0, 0]}
            />

          </BarChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}
