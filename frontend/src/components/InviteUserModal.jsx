import { useEffect, useState } from "react";

import api from "../services/api";


export default function InviteUserModal({
  isOpen,
  onClose,
}) {

  const [projects, setProjects] =
    useState([]);

  const [email, setEmail] =
    useState("");

  const [role, setRole] =
    useState("Viewer");

  const [projectId, setProjectId] =
    useState("");

  const [loading, setLoading] =
    useState(false);


  // =====================================
  // FETCH PROJECTS
  // =====================================

  async function fetchProjects() {

    try {

      const response = await api.get(
        "/projects"
      );


      // FIXED RESPONSE HANDLING

      if (Array.isArray(response.data)) {

        setProjects(response.data);

      } else if (
        Array.isArray(response.data.data)
      ) {

        setProjects(response.data.data);

      } else {

        setProjects([]);
      }

    } catch (error) {

      console.error(
        "Failed to load projects",
        error
      );

      setProjects([]);
    }
  }


  useEffect(() => {

    if (isOpen) {
      const timer = window.setTimeout(fetchProjects, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;

  }, [isOpen]);


  // =====================================
  // SEND INVITATION
  // =====================================

  const handleInvite = async () => {

    if (!email) {

      alert("Please enter email");

      return;
    }

    if (!projectId) {

      alert("Please select project");

      return;
    }


    try {

      setLoading(true);


      await api.post(
        "/invitations/create",
        {
          email,
          role,
          project_id: Number(projectId),
        }
      );


      alert(
        "Invitation sent successfully"
      );


      // RESET FORM

      setEmail("");

      setRole("Viewer");

      setProjectId("");


      onClose();

    } catch (error) {

      console.error(error);

      alert(
        error.response?.data?.detail ||
        "Failed to send invitation"
      );

    } finally {

      setLoading(false);
    }
  };


  // =====================================
  // CLOSE MODAL
  // =====================================

  if (!isOpen) return null;


  return (

    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">

      <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl animate-fadeIn">

        {/* HEADER */}

        <div className="flex items-center justify-between mb-8">

          <div>

            <h2 className="text-3xl font-bold text-slate-900">

              Invite User

            </h2>

            <p className="text-slate-500 mt-1">

              Collaborate with your team

            </p>

          </div>


          <button
            onClick={onClose}
            className="
              w-10
              h-10
              rounded-full
              bg-slate-100
              hover:bg-slate-200
              transition
              text-xl
            "
          >
            ×
          </button>

        </div>


        {/* EMAIL */}

        <div className="mb-5">

          <label className="block text-sm font-medium text-slate-700 mb-2">

            User Email

          </label>

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            placeholder="Enter email address"
            className="
              w-full
              border
              border-slate-200
              rounded-2xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-blue-500
            "
          />

        </div>


        {/* ROLE */}

        <div className="mb-5">

          <label className="block text-sm font-medium text-slate-700 mb-2">

            Access Role

          </label>

          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value)
            }
            className="
              w-full
              border
              border-slate-200
              rounded-2xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-blue-500
            "
          >

            <option value="Viewer">
              Viewer
            </option>

            <option value="Team Member">
              Team Member
            </option>

            <option value="Manager">
              Manager
            </option>

          </select>

        </div>


        {/* PROJECT */}

        <div className="mb-8">

          <label className="block text-sm font-medium text-slate-700 mb-2">

            Select Project

          </label>

          <select
            value={projectId}
            onChange={(e) =>
              setProjectId(e.target.value)
            }
            className="
              w-full
              border
              border-slate-200
              rounded-2xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-blue-500
            "
          >

            <option value="">
              Choose project
            </option>


            {Array.isArray(projects) &&
              projects.map((project) => (

                <option
                  key={project.id}
                  value={project.id}
                >

                  {project.name}

                </option>

              ))}

          </select>

        </div>


        {/* FOOTER */}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-4">

          <button
            onClick={onClose}
            className="
              px-5
              py-3
              rounded-2xl
              border
              border-slate-200
              hover:bg-slate-100
              transition
            "
          >
            Cancel
          </button>


          <button
            onClick={handleInvite}
            disabled={loading}
            className="
              bg-blue-600
              hover:bg-blue-700
              transition
              text-white
              px-6
              py-3
              rounded-2xl
              font-medium
            "
          >

            {loading
              ? "Sending..."
              : "Send Invitation"}

          </button>

        </div>

      </div>

    </div>
  );
}
