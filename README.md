# Prompt Bench

Prompt Bench is a small app for comparing prompt styles side by side on the
same task. It runs real Claude calls, then shows latency, token usage, cost,
efficiency, and quality so you can see which prompting strategy performs best
for a given question.

## Quick Start

### 1. Clone The Repository

```bash
git clone https://github.com/AITestingMastery/prompt_engineering_lab.git
```

### 2. Create A Virtual Environment

```bash
cd backend
python -m venv .venv
```

### 3. Activate The Virtual Environment

Windows:

```bash
.\.venv\Scripts\activate
```

macOS / Linux:

```bash
source .venv/bin/activate
```

### 4. Install Dependencies

Backend:

```bash
pip install -r requirements.txt
```

Frontend:

```bash
cd ../frontend
npm install
```

### 5. Run The App

Start the backend:

```bash
cd backend
python app.py
```

In a second terminal, start the frontend:

```bash
cd frontend
npm start
```

Then open `http://localhost:5000` in your browser.

## What It Compares

The UI can compare these prompt styles:

- Zero-shot
- Chain-of-thought
- Role / persona
- Few-shot
- Structured JSON

The app uses one setup call to generate task-specific text for the dynamic
styles:

- Chain-of-thought
- Role / persona
- Few-shot

That means those prompts are tailored to the task instead of using a fixed
generic template.

## What The Comparison Shows

After a run, the results table shows:

- Time per prompt style
- Input and output tokens
- Tokens per second
- Estimated cost
- Efficiency score
- Quality score from a judge pass

The backend also marks the fastest, cheapest, best-efficiency, and best-quality
rows.

## Structure

```text
prompt_lab/
├── .env
├── backend/
│   ├── app.py              # FastAPI entrypoint kept for `python app.py`
│   ├── main.py             # FastAPI app assembly + CORS
│   ├── routes.py           # /api/health, /api/complete, /api/generate-templates
│   ├── anthropic_client.py  # one place that talks to Anthropic
│   ├── prompts.py          # task-specific prompt rules and meta-prompt builder
│   └── requirements.txt
└── frontend/
    ├── server.js           # Node static server + /api proxy to backend
    ├── package.json
    ├── index.html
    ├── style.css
    └── app.js              # calls the backend, never calls Anthropic directly
```

The API key lives only in `.env`, read only by the backend. The browser never
sees it. The frontend talks to the Node server, and the Node server proxies API
calls to the backend.

## 1. Configure

Edit `.env` in the project root and set your real key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Leave the ports as-is unless something else on your machine already uses
5000 or 5001.

You can also override the model if needed:

```env
ANTHROPIC_MODEL=claude-sonnet-4-6
```

## 2. Run The Backend (Port 5001 By Default)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Check it's alive:

```bash
curl http://localhost:5001/api/health
```

## 3. Run The Frontend (Port 5000 By Default)

```bash
cd frontend
npm start
```

Open **http://localhost:5000** in a browser.

## API Flow

The frontend uses these backend endpoints:

- `GET /api/health` - health check
- `POST /api/complete` - run one prompt through Claude
- `POST /api/generate-templates` - generate task-specific dynamic prompts
- `POST /api/score-results` - compute cost, speed, and efficiency rankings
- `POST /api/judge-results` - score answer quality with Claude as a judge

LLM is used to: 

- 1 time for task-specific prompt  generation if you selected any dynamic styles
  (`cot`, `role`, `few`)
- 1 time for each selected style to generate the answer
- 1 time for judging quality if the run finishes successfully

## Notes

- Both ports are read from the one `.env` at the project root. Change
  `BACKEND_PORT` / `FRONTEND_PORT` / `BACKEND_URL` there, not in the code.
- The frontend Node server reads `.env`, serves the static files, and proxies
  `/api` requests to the backend.
- CORS is enabled on the backend since the two servers run on different
  origins.
- The frontend comparison is purely client-driven: it sends the task once,
  runs each selected style, then renders the scored results.
