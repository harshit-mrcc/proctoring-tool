import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  AdminDashboardPage,
  AdminLoginPage,
  AdminUserDetailPage,
  ExamPage,
  FaceRegisterPage,
  ScreenSharePage,
  SetupPage,
  ThankYouPage
} from "./pages";

export function App() {
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={3200}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/face_register" element={<FaceRegisterPage />} />
        <Route path="/screen_share" element={<ScreenSharePage />} />
        <Route path="/exam" element={<ExamPage />} />
        <Route path="/thank_you" element={<ThankYouPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/user/:userKey" element={<AdminUserDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
