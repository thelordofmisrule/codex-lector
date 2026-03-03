import { Routes, Route } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Header from "./components/Header";
import OnboardingModal from "./components/OnboardingModal";
import HomePage from "./pages/HomePage";
import ReaderPage from "./pages/ReaderPage";
import ForumPage from "./pages/ForumPage";
import ForumThreadPage from "./pages/ForumThreadPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import SearchPage from "./pages/SearchPage";
import ProfilePage from "./pages/ProfilePage";
import MyAnnotationsPage from "./pages/MyAnnotationsPage";
import MyBookmarksPage from "./pages/MyBookmarksPage";
import MyLibraryPage from "./pages/MyLibraryPage";
import LayersPage from "./pages/LayersPage";
import LayerDetailPage from "./pages/LayerDetailPage";
import AnnotationDetailPage from "./pages/AnnotationDetailPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import HowToPage from "./pages/HowToPage";

export default function App() {
  const { user, refreshUser } = useAuth();

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <Header />
      {user?.needsOnboarding && (
        <OnboardingModal user={user} onComplete={()=>refreshUser()} />
      )}
      <main style={{ flex:1 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/read/:slug" element={<ReaderPage />} />
          <Route path="/forum" element={<ForumPage />} />
          <Route path="/forum/:id" element={<ForumThreadPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:id" element={<BlogPostPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/my-annotations" element={<MyAnnotationsPage />} />
          <Route path="/my-bookmarks" element={<MyBookmarksPage />} />
          <Route path="/my-library" element={<MyLibraryPage />} />
          <Route path="/layers" element={<LayersPage />} />
          <Route path="/layers/:id" element={<LayerDetailPage />} />
          <Route path="/annotation/:id" element={<AnnotationDetailPage />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/admin-reports" element={<AdminReportsPage />} />
          <Route path="/admin-analytics" element={<AdminAnalyticsPage />} />
          <Route path="/how-to" element={<HowToPage />} />
        </Routes>
      </main>
      <footer style={{ textAlign:"center", padding:"24px", borderTop:"1px solid var(--border-light)", color:"var(--text-light)", fontSize:13, fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
        Codex Lector · Texts from <a href="https://www.playshakespeare.com/" target="_blank" rel="noopener" style={{color:"var(--gold)"}}>PlayShakespeare.com</a> · GFDL Licensed
      </footer>
    </div>
  );
}
