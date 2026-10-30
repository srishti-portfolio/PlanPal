import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loading } from './components/Feedback.jsx';
import { Layout } from './components/Layout.jsx';
import { PublicOnly, RequireAuth } from './components/RouteGuards.jsx';
import Home from './pages/Home.jsx';
import SignIn from './pages/auth/SignIn.jsx';

// Code-split the heavier screens so the first paint (sign-in / home) stays small.
const SignUp = lazy(() => import('./pages/auth/SignUp.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const Assistant = lazy(() => import('./pages/Assistant.jsx'));
const Events = lazy(() => import('./pages/Events.jsx'));
const CreateEvent = lazy(() => import('./pages/CreateEvent.jsx'));
const EventDetail = lazy(() => import('./pages/EventDetail.jsx'));
const You = lazy(() => import('./pages/You.jsx'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="events" element={<Events />} />
            <Route path="events/new" element={<CreateEvent />} />
            <Route path="events/:eventId" element={<EventDetail />} />
            <Route path="you" element={<You />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
