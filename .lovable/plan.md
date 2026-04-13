## Plan

### 1. Expand data model globally
- Add `Country`, `Continent`, `City` types
- Generalize `Actor` with country/city/continent fields
- Add `ActorEvent` timeline entries (votes, speeches, committee joins, scandals, elections)
- Add `Relationship` type for actor-actor and party-party connections

### 2. Create rich mock data
- Politicians from CH, US, DE, FR, BR across continents
- Parties with cross-country ideological links
- Timeline events per actor

### 3. Actor provenance page (git-like)
- Commit-log style timeline showing every tracked event
- Each entry has hash, timestamp, type, diff-like description
- Filter by event type
- Visual commit graph on the left (like `git log --graph`)

### 4. Relationship explorer page
- Interactive cluster view showing party families across countries
- Tree view for political hierarchies
- Connection lines between related actors/parties

### 5. Global navigation
- Add continent/country/city browsing
- Update header nav with "Explore" dropdown
- Country detail pages

### 6. Update routing in App.tsx
