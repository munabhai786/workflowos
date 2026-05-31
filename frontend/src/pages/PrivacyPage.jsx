export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-5xl mx-auto px-6 py-20">

        <h1 className="text-5xl font-bold">
          Privacy Policy
        </h1>

        <p className="text-slate-500 mt-6">
          Last updated: January 2026
        </p>


        <div className="bg-white rounded-2xl shadow-sm border p-10 mt-12 space-y-10">

          <div>

            <h2 className="text-2xl font-bold">
              Information We Collect
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              WorkflowOS collects user information such as
              account details, project data, workflow analytics,
              and productivity metrics to improve platform functionality.
            </p>

          </div>


          <div>

            <h2 className="text-2xl font-bold">
              How We Use Data
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              We use collected information to improve productivity insights,
              optimize workflow experiences, provide analytics,
              and enhance platform performance.
            </p>

          </div>


          <div>

            <h2 className="text-2xl font-bold">
              Data Security
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              WorkflowOS implements modern security practices
              to protect user information and platform data.
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}