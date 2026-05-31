import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";


export default function AcceptInvitationPage() {

  const { token } = useParams();

  const navigate = useNavigate();


  const [loading, setLoading] =
    useState(true);

  const [invitation, setInvitation] =
    useState(null);

  const [error, setError] =
    useState("");


  const validateInvitation = useCallback(async () => {

    try {

      const response = await api.get(
        `/invitations/validate/${token}`
      );


      setInvitation(
        response.data.data
      );

    } catch (error) {

      console.error(error);

      setError(
        "Invalid or expired invitation"
      );

    } finally {

      setLoading(false);
    }
  }, [token]);


  useEffect(() => {

    const timer = window.setTimeout(validateInvitation, 0);

    return () => window.clearTimeout(timer);

  }, [validateInvitation]);


  const handleContinue = () => {

    navigate(

      `/signup?token=${token}&role=${invitation.role}&email=${invitation.email}`
    );
  };


  if (loading) {

    return (

      <div className="min-h-screen flex items-center justify-center">

        Loading invitation...

      </div>
    );
  }


  if (error) {

    return (

      <div className="min-h-screen flex items-center justify-center">

        <div className="bg-white p-10 rounded-3xl shadow-xl">

          <h1 className="text-2xl font-bold text-red-600 mb-4">

            Invitation Error

          </h1>

          <p className="text-slate-600">

            {error}

          </p>

        </div>

      </div>
    );
  }


  return (

    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">

      <div className="bg-white w-full max-w-xl rounded-3xl p-10 shadow-xl border border-slate-100">

        <div className="mb-8">

          <h1 className="text-4xl font-bold text-slate-900 mb-4">

            Collaboration Invitation

          </h1>

          <p className="text-slate-600 text-lg">

            You were invited to join WorkflowOS

          </p>

        </div>


        <div className="space-y-5 mb-8">

          <div className="bg-slate-50 rounded-2xl p-5">

            <p className="text-sm text-slate-500 mb-1">

              Email

            </p>

            <h2 className="font-semibold text-lg">

              {invitation.email}

            </h2>

          </div>


          <div className="bg-slate-50 rounded-2xl p-5">

            <p className="text-sm text-slate-500 mb-1">

              Assigned Role

            </p>

            <h2 className="font-semibold text-lg text-blue-600">

              {invitation.role}

            </h2>

          </div>

        </div>


        <button
          onClick={handleContinue}
          className="
            w-full
            bg-blue-600
            hover:bg-blue-700
            transition
            text-white
            py-4
            rounded-2xl
            font-semibold
            text-lg
          "
        >

          Continue To Signup

        </button>

      </div>

    </div>
  );
}
