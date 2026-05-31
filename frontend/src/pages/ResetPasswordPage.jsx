import { useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  ArrowLeft,
  Brain,
  CheckCircle,
  Lock,
  ShieldCheck,
} from "lucide-react";

import toast from "react-hot-toast";

import api from "../services/api";


export default function ResetPasswordPage() {

  const navigate = useNavigate();

  const location = useLocation();

  const email =
    location.state?.email || "";


  const [loading, setLoading] =
    useState(false);

  const [formData, setFormData] =
    useState({
      new_password: "",
      confirm_password: "",
    });


  const handleChange = (e) => {

    setFormData({
      ...formData,
      [e.target.name]:
        e.target.value,
    });

  };


  const handleSubmit = async (e) => {

    e.preventDefault();

    if (
      formData.new_password !==
      formData.confirm_password
    ) {

      toast.error(
        "Passwords do not match"
      );

      return;
    }


    try {

      setLoading(true);

      await api.post(
        "/auth/reset-password",
        {
          email,
          new_password:
            formData.new_password,
        }
      );

      toast.success(
        "Password reset successful"
      );

      navigate("/login");

    } catch (error) {

      console.error(error);

      toast.error(
        error?.response?.data?.detail ||
        "Failed to reset password"
      );

    } finally {

      setLoading(false);

    }

  };


  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-100">


      {/* LEFT SIDE */}

      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-10 relative overflow-hidden">


        {/* BACKGROUND */}

        <div className="absolute top-[-100px] right-[-100px] w-[320px] h-[320px] rounded-full bg-white/10"></div>

        <div className="absolute bottom-[-120px] left-[-120px] w-[320px] h-[320px] rounded-full bg-white/10"></div>


        {/* LOGO */}

        <div className="relative z-10 flex items-center gap-3">

          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">

            <Brain size={28} />

          </div>

          <h1 className="text-3xl font-bold">
            WorkflowOS
          </h1>

        </div>


        {/* CONTENT */}

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center">

          <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-xl w-full">

            <div className="w-24 h-24 rounded-full bg-green-100 mx-auto flex items-center justify-center">

              <CheckCircle
                size={42}
                className="text-green-600"
              />

            </div>


            <h2 className="text-4xl font-bold text-slate-900 mt-8">
              Create New Password
            </h2>

            <p className="text-slate-500 text-lg leading-relaxed mt-5">
              Your identity has been verified successfully. Create a new secure password to continue.
            </p>


            {/* SECURITY INFO */}

            <div className="mt-10 space-y-4 text-left">

              <div className="bg-slate-100 rounded-xl p-4 flex items-center gap-4">

                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center">

                  <Lock size={18} />

                </div>

                <div>

                  <h4 className="font-semibold text-slate-900">
                    Strong Password
                  </h4>

                  <p className="text-sm text-slate-500">
                    Use uppercase, lowercase, and numbers.
                  </p>

                </div>

              </div>


              <div className="bg-slate-100 rounded-xl p-4 flex items-center gap-4">

                <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center">

                  <ShieldCheck size={18} />

                </div>

                <div>

                  <h4 className="font-semibold text-slate-900">
                    Encrypted Security
                  </h4>

                  <p className="text-sm text-slate-500">
                    Your password is securely encrypted and protected.
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>


        {/* FOOTER */}

        <div className="relative z-10 text-blue-100 text-sm">

          Enterprise-grade account protection and password security.

        </div>

      </div>


      {/* RIGHT SIDE */}

      <div className="flex items-center justify-center px-6 py-10">

        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-10">


          {/* MOBILE LOGO */}

          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">

            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center">

              <Brain size={28} />

            </div>

            <h1 className="text-3xl font-bold text-blue-600">
              WorkflowOS
            </h1>

          </div>


          {/* HEADER */}

          <div className="text-center">

            <h2 className="text-4xl font-bold text-slate-900">
              Reset Password
            </h2>

            <p className="text-slate-500 mt-4 leading-relaxed">
              Create a new secure password for your account.
            </p>

          </div>


          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6"
          >


            {/* NEW PASSWORD */}

            <div>

              <label className="text-sm font-medium text-slate-700">
                New Password
              </label>

              <div className="mt-2 relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-4 text-slate-400"
                />

                <input
                  type="password"
                  name="new_password"
                  value={formData.new_password}
                  onChange={handleChange}
                  placeholder="Enter new password"
                  className="w-full border border-slate-300 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

              </div>

            </div>


            {/* CONFIRM PASSWORD */}

            <div>

              <label className="text-sm font-medium text-slate-700">
                Confirm Password
              </label>

              <div className="mt-2 relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-4 text-slate-400"
                />

                <input
                  type="password"
                  name="confirm_password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                  className="w-full border border-slate-300 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

              </div>

            </div>


            {/* BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition"
            >

              {
                loading
                  ? "Updating Password..."
                  : "Reset Password"
              }

            </button>

          </form>


          {/* BACK */}

          <div className="mt-8 flex justify-center">

            <Link
              to="/login"
              className="flex items-center gap-2 text-slate-500 hover:text-black transition"
            >

              <ArrowLeft size={16} />

              Back To Login

            </Link>

          </div>


          {/* SECURITY */}

          <div className="flex items-center justify-center gap-2 mt-8 text-sm text-slate-400">

            <ShieldCheck size={16} />

            <span>
              Secure password encryption enabled.
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}