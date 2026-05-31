export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-5xl mx-auto px-6 py-20">

        <h1 className="text-5xl font-bold">
          Security
        </h1>

        <p className="text-slate-500 mt-6">
          WorkflowOS security infrastructure and protection policies.
        </p>


        <div className="grid md:grid-cols-3 gap-8 mt-16">

          <div className="bg-white rounded-2xl shadow-sm border p-8">

            <h2 className="text-2xl font-bold">
              Data Protection
            </h2>

            <p className="text-slate-500 mt-4">
              User information is protected using secure authentication
              and encrypted database infrastructure.
            </p>

          </div>


          <div className="bg-white rounded-2xl shadow-sm border p-8">

            <h2 className="text-2xl font-bold">
              Authentication
            </h2>

            <p className="text-slate-500 mt-4">
              Secure JWT authentication ensures protected access
              to user workflows and productivity data.
            </p>

          </div>


          <div className="bg-white rounded-2xl shadow-sm border p-8">

            <h2 className="text-2xl font-bold">
              Infrastructure
            </h2>

            <p className="text-slate-500 mt-4">
              WorkflowOS uses modern cloud-based infrastructure
              to maintain performance, scalability, and reliability.
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}