export default function CareersPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-6xl mx-auto px-6 py-20">

        <div className="text-center">

          <h1 className="text-5xl font-bold">
            Careers At WorkflowOS
          </h1>

          <p className="text-slate-600 text-lg mt-6 max-w-3xl mx-auto">
            Join our mission to transform productivity and workflow management using AI.
          </p>

        </div>


        <div className="grid md:grid-cols-2 gap-8 mt-20">

          <div className="bg-white rounded-2xl shadow-sm border p-8">

            <h3 className="text-2xl font-bold">
              Frontend Developer
            </h3>

            <p className="text-slate-500 mt-4">
              Build scalable user experiences using React and TailwindCSS.
            </p>

            <button className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl">
              Apply Now
            </button>

          </div>


          <div className="bg-white rounded-2xl shadow-sm border p-8">

            <h3 className="text-2xl font-bold">
              AI Engineer
            </h3>

            <p className="text-slate-500 mt-4">
              Develop intelligent productivity systems and analytics engines.
            </p>

            <button className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl">
              Apply Now
            </button>

          </div>

        </div>

      </section>

    </div>
  );
}