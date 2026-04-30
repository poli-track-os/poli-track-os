import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeModeProvider } from "./components/ThemeModeProvider";
import { useThemeMode } from "./hooks/use-theme-mode";

const Index = lazy(() => import("./pages/Index.tsx"));
const Proposals = lazy(() => import("./pages/Proposals.tsx"));
const ProposalDetail = lazy(() => import("./pages/ProposalDetail.tsx"));
const Actors = lazy(() => import("./pages/Actors.tsx"));
const ActorDetail = lazy(() => import("./pages/ActorDetail.tsx"));
const Explore = lazy(() => import("./pages/Explore.tsx"));
const CountryDetail = lazy(() => import("./pages/CountryDetail.tsx"));
const PartyDetail = lazy(() => import("./pages/PartyDetail.tsx"));
const Relationships = lazy(() => import("./pages/Relationships.tsx"));
const About = lazy(() => import("./pages/About.tsx"));
const Data = lazy(() => import("./pages/Data.tsx"));
const Budgets = lazy(() => import("./pages/Budgets.tsx"));
const Lobby = lazy(() => import("./pages/Lobby.tsx"));
const Influence = lazy(() => import("./pages/Influence.tsx"));
const InfluenceOrgDetail = lazy(() => import("./pages/InfluenceOrgDetail.tsx"));
const InfluencePersonDetail = lazy(() => import("./pages/InfluencePersonDetail.tsx"));
const InfluenceCountryDetail = lazy(() => import("./pages/InfluenceCountryDetail.tsx"));
const InfluenceNetwork = lazy(() => import("./pages/InfluenceNetwork.tsx"));
const Timeline = lazy(() => import("./pages/Timeline.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const App = () => {
  const { theme, toggleTheme } = useThemeMode();
  const routerBase = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider theme={theme} toggleTheme={toggleTheme}>
        <BrowserRouter basename={routerBase} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense
            fallback={
              <div className="container py-8 font-mono text-sm text-muted-foreground">
                Loading...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/country/:id" element={<CountryDetail />} />
              <Route path="/country/:countryId/party/:partyId" element={<PartyDetail />} />
              <Route path="/proposals" element={<Proposals />} />
              <Route path="/proposals/:id" element={<ProposalDetail />} />
              <Route path="/actors" element={<Actors />} />
              <Route path="/actors/:id" element={<ActorDetail />} />
              <Route path="/relationships" element={<Relationships />} />
              <Route path="/data" element={<Data />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/lobby" element={<Lobby />} />
              <Route path="/influence" element={<Influence />} />
              <Route path="/influence/org/:id" element={<InfluenceOrgDetail />} />
              <Route path="/influence/person/:id" element={<InfluencePersonDetail />} />
              <Route path="/influence/country/:code" element={<InfluenceCountryDetail />} />
              <Route path="/influence/network" element={<InfluenceNetwork />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeModeProvider>
    </QueryClientProvider>
  );
};

export default App;
