import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
const OnboardingModal = lazy(() => import("./components/OnboardingModal"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));
const ForumPage = lazy(() => import("./pages/ForumPage"));
const ForumThreadPage = lazy(() => import("./pages/ForumThreadPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const MyAnnotationsPage = lazy(() => import("./pages/MyAnnotationsPage"));
const MyBookmarksPage = lazy(() => import("./pages/MyBookmarksPage"));
const MyLibraryPage = lazy(() => import("./pages/MyLibraryPage"));
const MyResearchPage = lazy(() => import("./pages/MyResearchPage"));
const LayersPage = lazy(() => import("./pages/LayersPage"));
const LayerDetailPage = lazy(() => import("./pages/LayerDetailPage"));
const AnnotationDetailPage = lazy(() => import("./pages/AnnotationDetailPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminReportsPage = lazy(() => import("./pages/AdminReportsPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const HowToPage = lazy(() => import("./pages/HowToPage"));
const PlacesPage = lazy(() => import("./pages/PlacesPage"));
const PeoplePage = lazy(() => import("./pages/PeoplePage"));
const GenealogyPage = lazy(() => import("./pages/GenealogyPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const YearOfShakespearePage = lazy(() => import("./pages/YearOfShakespearePage"));
const LucreceSourcesPage = lazy(() => import("./pages/LucreceSourcesPage"));
const BookshelfPage = lazy(() => import("./pages/BookshelfPage"));
const SourceTextPage = lazy(() => import("./pages/SourceTextPage"));
const ChinesePage = lazy(() => import("./pages/ChinesePage"));

function RouteFallback() {
  return <div style={{ padding:60, textAlign:"center" }}><div className="spinner" /></div>;
}

export default function App() {
  const { user, authReady, refreshUser } = useAuth();

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <Header />
      {authReady && user?.needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal user={user} onComplete={()=>refreshUser()} />
        </Suspense>
      )}
      <main style={{ flex:1 }}>
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="/my-research" element={<MyResearchPage />} />
            <Route path="/layers" element={<LayersPage />} />
            <Route path="/places" element={<PlacesPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/genealogy" element={<GenealogyPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/bookshelf" element={<BookshelfPage />} />
            <Route path="/chinese" element={<ChinesePage />} />
            <Route path="/source-texts/:identifier" element={<SourceTextPage />} />
            <Route path="/year-of-shakespeare" element={<YearOfShakespearePage />} />
            <Route path="/sources/lucrece" element={<LucreceSourcesPage />} />
            <Route path="/layers/:id" element={<LayerDetailPage />} />
            <Route path="/annotation/:id" element={<AnnotationDetailPage />} />
            <Route path="/admin-login" element={<AdminLoginPage />} />
            <Route path="/admin-reports" element={<AdminReportsPage />} />
            <Route path="/admin-analytics" element={<AdminAnalyticsPage />} />
            <Route path="/how-to" element={<HowToPage />} />
          </Routes>
        </Suspense>
      </main>
      <footer style={{ textAlign:"center", padding:"24px", borderTop:"1px solid var(--border-light)", color:"var(--text-light)", fontSize:13, fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
        Codex Lector · Texts from <a href="https://www.playshakespeare.com/" target="_blank" rel="noopener" style={{color:"var(--gold)"}}>PlayShakespeare.com</a> · GFDL Licensed
      </footer>
    </div>
  );
}
