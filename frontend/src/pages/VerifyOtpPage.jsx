import { useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  ArrowLeft,
  Brain,
  ShieldCheck,
} from "lucide-react";

import toast from "react-hot-toast";

import api from "../services/api";


export default function VerifyOtpPage() {

  const navigate = useNavigate();

  const location = useLocation();

  const email =
    location.state?.email || "";

  const [loading, setLoading] =
    useState(false);

  const [otp, setOtp] =
    useState("");


  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);

      await api.post(
        "/auth/verify-otp",
        {
          email,
          otp,
        }
      );

      toast.success(
        "OTP verified successfully"
      );

      navigate(
        "/reset-password",
        {
          state: { email },
        }
      );

    } catch (error) {

      console.error(error);

      toast.error(
        error?.response?.data?.detail ||
        "Invalid OTP"
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

            <div className="w-24 h-24 rounded-full bg-blue-100 mx-auto flex items-center justify-center">

              <ShieldCheck
                size={42}
                className="text-blue-600"
              />

            </div>


            <h2 className="text-4xl font-bold text-slate-900 mt-8">
              OTP Verification
            </h2>

            <p className="text-slate-500 text-lg leading-relaxed mt-5">
              Enter the secure 6-digit verification code sent to your registered email address.
            </p>


            {/* OTP MOCK */}

            <div className="flex justify-center gap-4 mt-10">

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

              <div className="w-14 h-16 rounded-xl bg-slate-100"></div>

            </div>


            <div className="mt-10 bg-slate-100 rounded-xl p-5 text-left">

              <h4 className="font-semibold text-slate-900">
                Security Verification
              </h4>

              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                This OTP expires in 10 minutes for your account protection and security.
              </p>

            </div>

          </div>

        </div>


        {/* FOOTER */}

        <div className="relative z-10 text-blue-100 text-sm">

          Advanced encrypted identity verification system.

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
              Verify OTP
            </h2>

            <p className="text-slate-500 mt-4 leading-relaxed">
              Enter the 6-digit code sent to your email address.
            </p>

          </div>


          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6"
          >


            {/* OTP */}

            <div>

              <label className="text-sm font-medium text-slate-700">
                Verification Code
              </label>

              <input
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value)
                }
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="mt-2 w-full border border-slate-300 rounded-xl py-4 px-4 text-center text-2xl tracking-[5px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />

            </div>


            {/* BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition"
            >

              {
                loading
                  ? "Verifying..."
                  : "Verify OTP"
              }

            </button>

          </form>


          {/* RESEND */}

          <div className="text-center mt-6 text-sm text-slate-500">

            Didn't receive the code?

            <button className="ml-2 text-blue-600 hover:underline">

              Resend OTP

            </button>

          </div>


          {/* BACK */}

          <div className="mt-8 flex justify-center">

            <Link
              to="/forgot-password"
              className="flex items-center gap-2 text-slate-500 hover:text-black transition"
            >

              <ArrowLeft size={16} />

              Back

            </Link>

          </div>


          {/* SECURITY */}

          <div className="flex items-center justify-center gap-2 mt-8 text-sm text-slate-400">

            <ShieldCheck size={16} />

            <span>
              Secure OTP verification system enabled.
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}