import { useState } from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  ArrowLeft,
  Brain,
  Mail,
  ShieldCheck,
} from "lucide-react";

import toast from "react-hot-toast";

import api from "../services/api";


export default function ForgotPasswordPage() {

  const navigate = useNavigate();

  const [loading, setLoading] =
    useState(false);

  const [email, setEmail] =
    useState("");

  const [emailNotFound, setEmailNotFound] =
    useState(false);


  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);

      setEmailNotFound(false);

      await api.post(
        "/auth/forgot-password",
        {
          email,
        }
      );

      toast.success(
        "OTP sent to your email"
      );

      navigate(
        "/verify-otp",
        {
          state: { email },
        }
      );

    } catch (error) {

      console.error(error);

      if (
        error?.response?.status === 404
      ) {

        setEmailNotFound(true);

        toast.error(
          "Email not found"
        );

      } else {

        toast.error(
          "Failed to send OTP"
        );

      }

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

              <Mail
                size={42}
                className="text-blue-600"
              />

            </div>


            <h2 className="text-4xl font-bold text-slate-900 mt-8">
              Password Recovery
            </h2>

            <p className="text-slate-500 text-lg leading-relaxed mt-5">
              Recover access to your account securely using email verification and OTP confirmation.
            </p>


            {/* MOCK STEPS */}

            <div className="mt-10 space-y-4 text-left">

              <div className="bg-slate-100 rounded-xl p-4 flex items-center gap-4">

                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  1
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900">
                    Verify Email
                  </h4>

                  <p className="text-sm text-slate-500">
                    Confirm your registered account email.
                  </p>
                </div>

              </div>


              <div className="bg-slate-100 rounded-xl p-4 flex items-center gap-4">

                <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
                  2
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900">
                    Receive OTP
                  </h4>

                  <p className="text-sm text-slate-500">
                    Get a secure 6-digit verification code.
                  </p>
                </div>

              </div>


              <div className="bg-slate-100 rounded-xl p-4 flex items-center gap-4">

                <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                  3
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900">
                    Reset Password
                  </h4>

                  <p className="text-sm text-slate-500">
                    Create a brand-new secure password.
                  </p>
                </div>

              </div>

            </div>

          </div>

        </div>


        {/* FOOTER */}

        <div className="relative z-10 text-blue-100 text-sm">

          Secure authentication and encrypted password recovery system.

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
              Forgot Password?
            </h2>

            <p className="text-slate-500 mt-4 leading-relaxed">
              Enter your registered email address to receive a secure OTP verification code.
            </p>

          </div>


          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6"
          >


            {/* EMAIL */}

            <div>

              <label className="text-sm font-medium text-slate-700">
                Email Address
              </label>

              <div className="mt-2 relative">

                <Mail
                  size={18}
                  className="absolute left-4 top-4 text-slate-400"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="your@example.com"
                  className="w-full border border-slate-300 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

              </div>

            </div>


            {/* EMAIL NOT FOUND */}

            {
              emailNotFound && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">

                  <p className="text-red-600 font-medium">
                    No account found with this email address.
                  </p>

                  <Link
                    to="/signup"
                    className="inline-block mt-3 text-blue-600 font-medium hover:underline"
                  >
                    Create New Account
                  </Link>

                </div>
              )
            }


            {/* BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition"
            >

              {
                loading
                  ? "Sending OTP..."
                  : "Send Verification Code"
              }

            </button>

          </form>


          {/* BACK TO LOGIN */}

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
              Secure password recovery with encrypted verification.
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}