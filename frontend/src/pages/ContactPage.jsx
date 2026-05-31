import { useState } from "react";

import toast from "react-hot-toast";


export default function ContactPage() {
  const [formData, setFormData] =
    useState({
      full_name: "",
      email: "",
      message: "",
    });


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]:
        e.target.value,
    });
  };


  const handleSubmit = (e) => {
    e.preventDefault();

    toast.success(
      "Message sent successfully"
    );

    setFormData({
      full_name: "",
      email: "",
      message: "",
    });
  };


  return (
    <div className="min-h-screen bg-slate-50">

      <section className="max-w-4xl mx-auto px-6 py-20">

        <div className="text-center">

          <h1 className="text-5xl font-bold">
            Contact Us
          </h1>

          <p className="text-slate-600 text-lg mt-6">
            We'd love to hear from you.
          </p>

        </div>


        <div className="bg-white rounded-2xl shadow-sm border p-10 mt-16">

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            <div>

              <label className="block mb-2 font-medium">
                Full Name
              </label>

              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                className="w-full border p-4 rounded-xl"
                required
              />

            </div>


            <div>

              <label className="block mb-2 font-medium">
                Email Address
              </label>

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full border p-4 rounded-xl"
                required
              />

            </div>


            <div>

              <label className="block mb-2 font-medium">
                Message
              </label>

              <textarea
                rows="6"
                name="message"
                value={formData.message}
                onChange={handleChange}
                className="w-full border p-4 rounded-xl"
                required
              />

            </div>


            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl transition"
            >
              Send Message
            </button>

          </form>

        </div>

      </section>

    </div>
  );
}