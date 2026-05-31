import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";


const COLORS = [
  "#3B82F6",
  "#F59E0B",
  "#8B5CF6",
  "#10B981",
];


export default function TaskDistributionChart({
  data,
}) {

  const chartData = [
    {
      name: "Todo",
      value: data.todo,
    },
    {
      name: "In Progress",
      value: data.in_progress,
    },
    {
      name: "Review",
      value: data.review,
    },
    {
      name: "Completed",
      value: data.completed,
    },
  ];


  return (
    <div className="min-w-0 rounded-xl bg-white p-4 shadow-sm sm:p-6">

      <h2 className="mb-4 text-lg font-bold sm:mb-6 sm:text-2xl">
        Task Distribution
      </h2>

      <div className="h-[260px] min-w-0 sm:h-[350px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <PieChart>

            <Pie
              data={chartData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius="72%"
              label
            >

              {chartData.map(
                (entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      COLORS[
                        index % COLORS.length
                      ]
                    }
                  />
                )
              )}

            </Pie>

            <Tooltip />

          </PieChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}
