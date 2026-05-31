import api from "./api";


export const uploadAvatar = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(
    "/users/upload-avatar",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
};


export const updateProfile = async (data) => {
  const response = await api.put(
    "/users/profile",
    data
  );

  return response.data;
};
