import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, useHref, useNavigate } from 'react-router';
import { RouterProvider } from 'react-aria-components';
import { AppShell } from './components/layout/appShell';
import { HomePage } from './pages/homePage';
import { PlacesPage } from './pages/placesPage';
import { PlaceDetailPage } from './pages/placeDetailPage';
import { ChecklistPage } from './pages/checklistPage';
import { SavedPage } from './pages/savedPage';
import { NotFoundPage } from './pages/notFoundPage';

// 지도는 leaflet 까지 끌고 와서 무겁다. 지도 탭을 누를 때만 받는다.
const MapPage = lazy(() =>
  import('./pages/mapPage').then((module) => ({ default: module.MapPage })),
);

/**
 * react-aria-components 의 Link·Tab 이 href 를 쓸 때 전체 새로고침 대신
 * react-router 로 이동하게 잇는다. BrowserRouter 안쪽이어야 훅을 쓸 수 있다.
 */
function AriaRouterProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      {children}
    </RouterProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AriaRouterProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/places/:type" element={<PlacesPage />} />
            <Route path="/place/:id" element={<PlaceDetailPage />} />
            <Route
              path="/map"
              element={
                <Suspense
                  fallback={<p className="px-5 pt-10 text-sm text-tertiary">지도를 불러오는 중이에요</p>}
                >
                  <MapPage />
                </Suspense>
              }
            />
            <Route path="/checklist" element={<ChecklistPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AriaRouterProvider>
    </BrowserRouter>
  );
}
