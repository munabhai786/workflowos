export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-5xl mx-auto px-6 py-20">

        <h1 className="text-5xl font-bold">
          Terms Of Service
        </h1>

        <p className="text-slate-500 mt-6">
          Last updated: January 2026
        </p>


        <div className="bg-white rounded-2xl shadow-sm border p-10 mt-12 space-y-10">

          <div>

            <h2 className="text-2xl font-bold">
              Acceptance Of Terms
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              By using WorkflowOS, users agree to comply with
              platform guidelines, policies, and usage requirements.
            </p>

          </div>


          <div>

            <h2 className="text-2xl font-bold">
              User Responsibilities
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              Users are responsible for maintaining account security
              and ensuring proper use of workflow management features.
            </p>

          </div>


          <div>

            <h2 className="text-2xl font-bold">
              Platform Availability
            </h2>

            <p className="text-slate-600 mt-4 leading-relaxed">
              WorkflowOS may update, modify, or improve services
              to maintain platform performance and reliability.
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}