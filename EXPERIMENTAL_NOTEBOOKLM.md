# Experimental NotebookLM workspace

This branch contains a renderer-only NotebookLM parity lab. It does not alter
the normal Memex shell or connect to production source ingestion.

## Run

```powershell
npm run dev:notebooklm
```

Open `http://127.0.0.1:5175/?experimental=notebooklm`.

The lab exercises source selection, processing status, adding a disposable demo
source, grounded answers, and clickable citations. The answer engine is a local
deterministic placeholder; the production slice will replace it with ingestion,
indexing, retrieval, and authenticated backend calls.
