# Wiki sources

The pages in this directory are the source-of-truth for the [Poli-Track GitHub wiki](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/wiki). They live in-repo so they're version-controlled alongside the code they describe.

## Pushing to the GitHub wiki

GitHub wikis are backed by a separate git repository at `<repo>.wiki.git`. It is created lazily the first time someone saves a page through the web UI.

### One-time bootstrap

1. Open https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/wiki and click **Create the first page**.
2. Paste the contents of `Home.md` and save. This creates the underlying wiki repo.

### Syncing the rest

Once the wiki repo exists:

```bash
git clone git@github.com:BlueVelvetSackOfGoldPotatoes/poli-track.wiki.git /tmp/poli-track-wiki
cp wiki/*.md /tmp/poli-track-wiki/
cd /tmp/poli-track-wiki
git add .
git commit -m "Sync wiki from main repo"
git push
```

## Pages

- `Home.md` — wiki index and navigation.
- `Architecture.md` — system topology and provider stack.
- `Data-Model.md` — schema walkthrough.
- `Ingestion-Pipeline.md` — edge functions summary + manual curl recipes.
- `Running-Locally.md` — environment setup.
- `Page-*.md` — one per route in the app.

When editing, keep the cross-reference links intact. Internal wiki links use bare page names (e.g. `[Actor detail](Page-Actor-Detail)`); external links into the main repo use absolute GitHub URLs.
