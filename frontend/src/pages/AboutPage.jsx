import { Link } from "react-router-dom";


export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-6xl mx-auto px-6 py-20">

        <div className="text-center">

          <h1 className="text-5xl font-bold">
            About WorkflowOS
          </h1>

          <p className="text-slate-600 text-lg mt-6 max-w-3xl mx-auto leading-relaxed">
            WorkflowOS is an AI-powered workflow and productivity platform
            designed to help modern teams manage projects,
            optimize workflows, and improve collaboration using intelligent insights.
          </p>

        </div>


        <div className="grid md:grid-cols-3 gap-8 mt-20">

          <div className="bg-white p-8 rounded-2xl shadow-sm border">

            <h3 className="text-2xl font-bold">
              Our Mission
            </h3>

            <p className="text-slate-500 mt-4 leading-relaxed">
              To simplify team productivity using intelligent automation,
              visual workflow management, and AI-powered analytics.
            </p>

          </div>


          <div className="bg-white p-8 rounded-2xl shadow-sm border">

            <h3 className="text-2xl font-bold">
              Our Vision
            </h3>

            <p className="text-slate-500 mt-4 leading-relaxed">
              To become the next-generation productivity platform
              for startups, enterprises, and modern digital teams.
            </p>

          </div>


          <div className="bg-white p-8 rounded-2xl shadow-sm border">

            <h3 className="text-2xl font-bold">
              Our Values
            </h3>

            <p className="text-slate-500 mt-4 leading-relaxed">
              Innovation, simplicity, collaboration, transparency,
              and continuous productivity improvement.
            </p>

          </div>

        </div>


        <div className="text-center mt-20">

          <Link
            to="/signup"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl transition"
          >
            Get Started
          </Link>

        </div>

      </section>

    </div>
  );
}