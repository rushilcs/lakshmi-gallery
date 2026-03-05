import { Navigate, Route, Routes } from "react-router-dom";
import { AdminGalleryPage } from "./pages/AdminGalleryPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminPreviewPage } from "./pages/AdminPreviewPage";
import { AdminUploadPage } from "./pages/AdminUploadPage";
import { PublicGalleryPage } from "./pages/PublicGalleryPage";

function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/gallery/:id" element={<AdminGalleryPage />} />
      <Route path="/admin/gallery/:id/upload" element={<AdminUploadPage />} />
      <Route path="/admin/gallery/:id/preview" element={<AdminPreviewPage />} />
      <Route path="/g/:share_token" element={<PublicGalleryPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default App;
