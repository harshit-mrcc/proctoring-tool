import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/static": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/device_check": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/speed_probe": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/register_face": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/registration_pose_check": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/verify_face": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      },
      "/analyze_frame": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: ""
      }
    }
  }
});
