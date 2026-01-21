'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
  Paperclip,
  Upload,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import type { Plan, Ticket } from '@/lib/schema'

// Sample PRDs (portfolio-friendly)
const SAMPLE_PRD_1 = `Product: AI Language Tutor - Conversation Practice Feature

Problem
Users struggle to practice real conversations in their target language. Flashcards do not prepare them for fluid, natural dialogue.

Target Users
Intermediate language learners (B1-B2) who want to improve conversational fluency

Goals
- Enable realistic conversation practice with an AI tutor
- Provide feedback on grammar and vocabulary usage
- Track topics and difficulty progression

Platform
Mobile (iOS/Android)

Constraints
- Response time < 2s for natural flow
- Start with 5 languages: Spanish, French, German, Japanese, Mandarin
- Basic mode should work in low-connectivity environments

Success Metrics
- 60%+ of users complete 3+ conversations per week
- Avg conversation length > 5 minutes
- Conversation quality rating 4.5+ / 5

Release Date
Q2 2025`

const SAMPLE_PRD_2 = `Product: AI Support Chatbot - Intelligent Triage

Problem
Support tickets are manually categorized, slowing routing and resolution. Many tickets are miscategorized at first pass.

Target Users
- Support agents (internal)
- End customers (external)

Goals
- Auto-categorize and route 80%+ of incoming tickets
- Suggest relevant KB articles before creating a ticket
- Reduce first response time from 4h to 30min

Platform
Web (embeddable widget + admin dashboard)

Constraints
- Integrate with Zendesk and Intercom
- GDPR compliant (EU)
- Fallback to human routing if confidence < 70%

Non-goals
- Not a full conversational AI in v1 (keep to triage)
- Not handling voice/phone

Release Date
End of Q1 2025`

type CopyId = 'json' | 'markdown' | `ticket:${string}` | 'linearLinks'


function confidenceLabel(score: number) {
  if (score >= 85) return 'High'
  if (score >= 70) return 'Medium'
  if (score >= 50) return 'Low'
  return 'Very low'
}

function confidenceColor(score: number) {
  // Light blue theme requested
  if (score >= 70) return 'border-sky-200 bg-sky-50 text-sky-900'
  if (score >= 50) return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-rose-200 bg-rose-50 text-rose-900'
}

function confidenceRange(score: number) {
  if (score >= 85) return '85–100'
  if (score >= 70) return '70–84'
  if (score >= 50) return '50–69'
  return '0–49'
}

function priorityPill(priority: Ticket['priority']) {
  const map: Record<Ticket['priority'], string> = {
    P0: 'border-red-200 bg-red-50 text-red-800',
    P1: 'border-orange-200 bg-orange-50 text-orange-800',
    P2: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    P3: 'border-zinc-200 bg-zinc-50 text-zinc-800',
  }
  return map[priority]
}

function typeEmoji(type: Ticket['type']) {
  const map: Record<Ticket['type'], string> = {
    story: '📖',
    task: '✅',
    bug: '🐛',
    spike: '🔬',
  }
  return map[type]
}

function ticketToMarkdown(t: Ticket) {
  const ac = t.acceptanceCriteria.map((x) => `- [ ] ${x}`).join('\n')
  const deps = (t.dependencies?.length ? t.dependencies : []).map((x) => `- ${x}`).join('\n')
  const oos = (t.outOfScope?.length ? t.outOfScope : []).map((x) => `- ${x}`).join('\n')
  const qa = (t.qa?.testCases?.length ? t.qa.testCases : []).map((x) => `- ${x}`).join('\n')
  const events = (t.analytics?.events?.length ? t.analytics.events : [])
    .map((e) => `- ${e.name} (${(e.properties ?? []).join(', ')})`)
    .join('\n')

  return `## ${t.ticketId} - ${t.title}

Type: ${t.type} | Priority: ${t.priority} | Estimate: ${t.estimate} | Epic: ${t.epicId}

User story:
${t.userStory}

Description:
${t.description}

Acceptance criteria:
${ac}

Dependencies:
${deps || '- None'}

Out of scope:
${oos || '- None'}

QA test cases:
${qa || '- None'}

Analytics:
${events || '- None'}
`
}

export default function PrdPage() {
  const [prd, setPrd] = useState('')
  const [productName, setProductName] = useState('')
  const [targetUser, setTargetUser] = useState('')
  const [platform, setPlatform] = useState<'web' | 'mobile' | 'api' | 'other'>('web')
  const [constraints, setConstraints] = useState('')
  const [releaseDate, setReleaseDate] = useState('')

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'epics' | 'tickets' | 'qa' | 'analytics' | 'export'>(
    'overview'
  )

  const [copyId, setCopyId] = useState<CopyId | null>(null)
  const [showConfidence, setShowConfidence] = useState(false)

  const canGenerate = prd.trim().length >= 20

  const flattenedAnalytics = useMemo(() => {
    if (!plan) return []
    return plan.tickets.flatMap((t) =>
      (t.analytics?.events ?? []).map((e) => ({
        ticketId: t.ticketId,
        ticketTitle: t.title,
        name: e.name,
        properties: e.properties ?? [],
      }))
    )
  }, [plan])


  const handleUploadFile = async (file: File) => {
    setExtractError(null)
    setExtracting(true)
    setUploadedFileName(file.name)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const isText =
        file.type.startsWith('text/') ||
        ['txt', 'md', 'markdown', 'csv', 'json'].includes(ext || '')

      if (isText) {
        const text = await file.text()
        setPrd(text)
        setPlan(null)
        setError(null)
        setShowConfidence(false)
        return
      }

      // PDFs and DOCX are extracted server-side
      const form = new FormData()
      form.append('file', file)

      const res = await fetch('/api/extract', { method: 'POST', body: form })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to extract file text')
      }

      const text = (data?.text || '').toString()
      if (text.trim().length < 20) {
        throw new Error('Extracted text was too short. Try a different file or paste the PRD directly.')
      }

      setPrd(text)
      setPlan(null)
      setError(null)
      setShowConfidence(false)
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'File extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const clearUploadedFile = () => {
    setUploadedFileName(null)
    setExtractError(null)
    setFileInputKey((k) => k + 1)
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setPlan(null)
    setShowConfidence(false)

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd,
          productName: productName || undefined,
          targetUser: targetUser || undefined,
          platform,
          constraints: constraints || undefined,
          releaseDate: releaseDate || undefined,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const msg = data?.message || data?.error || `API error: ${response.statusText}`
        throw new Error(msg)
      }

      setPlan(data as Plan)
      setActiveTab('overview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const loadSample = (sample: string) => {
    setPrd(sample)
    setPlan(null)
    setError(null)
    setShowConfidence(false)
  }

  const handleClear = () => {
    setPrd('')
    setProductName('')
    setTargetUser('')
    setPlatform('web')
    setConstraints('')
    setReleaseDate('')
    setPlan(null)
    setError(null)
    setShowConfidence(false)
  }

  const copyToClipboard = async (text: string, id: CopyId) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyId(id)
      window.setTimeout(() => setCopyId(null), 1400)
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="mx-auto max-w-7xl p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              PRD → Tickets
            </h1>
          </div>
          <p className="text-muted-foreground">
            Turn PRDs into implementation-ready tickets with acceptance criteria, QA, and analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <Card className="bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  PRD Input
                </CardTitle>
                <CardDescription>
                  Paste a PRD or messy brief. The agent will infer missing details and ask clarifying questions.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Upload a file (.txt, .md, .pdf, .docx) or paste text
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      key={fileInputKey}
                      type="file"
                      accept=".txt,.md,.markdown,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      id="prd-file"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUploadFile(f)
                      }}
                      disabled={loading || extracting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-white/70 dark:bg-slate-950/40"
                      onClick={() => document.getElementById('prd-file')?.click()}
                      disabled={loading || extracting}
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload
                        </>
                      )}
                    </Button>

                    {uploadedFileName && (
                      <div className="flex items-center gap-2 rounded-md border bg-white/70 px-2 py-1 text-xs dark:bg-slate-950/40">
                        <Paperclip className="h-3.5 w-3.5 opacity-70" />
                        <span className="max-w-[180px] truncate">{uploadedFileName}</span>
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted"
                          onClick={clearUploadedFile}
                          aria-label="Clear file"
                          title="Clear file"
                        >
                          <X className="h-3.5 w-3.5 opacity-70" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {extractError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <div className="flex-1">{extractError}</div>
                  </div>
                )}


                <Textarea
  value={prd}
  onChange={(e) => setPrd(e.target.value)}
  className="h-[320px] resize-none overflow-y-auto"
  rows={14}
/>



                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Product Name</label>
                    <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Optional" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Target User</label>
                    <Input value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="Optional" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Platform</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as 'web' | 'mobile' | 'api' | 'other')}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="web">Web</option>
                      <option value="mobile">Mobile</option>
                      <option value="api">API</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Release Date</label>
                    <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium">Constraints</label>
                    <Input
                      value={constraints}
                      onChange={(e) => setConstraints(e.target.value)}
                      placeholder="e.g., GDPR, response time, integrations, budget"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
  {/* Generate + Clear row */}
  <div className="flex gap-2">
    <Button
      onClick={handleGenerate}
      disabled={!canGenerate || loading}
      className="flex-[4] bg-emerald-500 hover:bg-emerald-700 text-white active:scale-[0.99] transition"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Wand2 className="mr-2 h-4 w-4" />
          Generate Tickets
        </>
      )}
    </Button>

    <Button
      variant="outline"
      onClick={handleClear}
      className="flex-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 active:scale-[0.99] transition"
      disabled={loading}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Clear
    </Button>
  </div>

  {/* Sample PRDs row */}
  <div className="grid grid-cols-2 gap-2">
    <Button
      variant="outline"
      onClick={() => loadSample(SAMPLE_PRD_1)}
      disabled={loading}
      className="active:scale-[0.99] transition"
    >
      Sample: AI Tutor
    </Button>
    <Button
      variant="outline"
      onClick={() => loadSample(SAMPLE_PRD_2)}
      disabled={loading}
      className="active:scale-[0.99] transition"
    >
      Sample: Support Triage
    </Button>
  </div>

  {!canGenerate && prd.trim().length > 0 && (
    <p className="text-xs text-destructive">PRD must be at least 20 characters.</p>
  )}

  {error && (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4" />
      <div className="flex-1">{error}</div>
    </div>
  )}
</div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {!plan && !loading && (
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardContent className="flex min-h-[540px] flex-col items-center justify-center gap-3 pt-6 text-center">
                  <Sparkles className="h-14 w-14 text-muted-foreground/30" />
                  <div>
                    <p className="text-sm text-muted-foreground">Enter a PRD and generate a plan to see results here.</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">Powered by Groq + structured JSON outputs.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading && (
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Generated Plan</CardTitle>
                  <CardDescription>This usually takes a few seconds.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border bg-background p-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating plan...
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {plan && (
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Generated Plan</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{plan.meta.productName}</span>
                    <Badge variant="outline" className="bg-white/60">
                      {plan.meta.platform}
                    </Badge>
                  </CardDescription>

                  {/* Confidence pill-button */}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowConfidence((v) => !v)}
                      className={[
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
                        'transition active:scale-[0.99]',
                        confidenceColor(plan.meta.confidence),
                      ].join(' ')}
                    >
                      <span>
                      Confidence {confidenceRange(plan.meta.confidence)} · {confidenceLabel(plan.meta.confidence)}
                      </span>

                      {showConfidence ? <ChevronUp className="h-4 w-4 opacity-70" /> : <ChevronDown className="h-4 w-4 opacity-70" />}
                    </button>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    {showConfidence && (
                      <div className={['rounded-lg border p-4', confidenceColor(plan.meta.confidence)].join(' ')}>
                        <div className="text-sm font-semibold">What this confidence means</div>
                        <p className="mt-1 text-sm opacity-90">
                          This is a rough completeness score. Higher means the PRD has clearer goals, constraints, and measurable outcomes,
                          so the tickets are less assumption-heavy.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold opacity-80">Signals used</div>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm opacity-90">
                              <li>Goals, non-goals, success metrics present</li>
                              <li>Constraints and platform specified</li>
                              <li>Fewer unanswered open questions</li>
                            </ul>
                          </div>
                          <div>
                            <div className="text-xs font-semibold opacity-80">How to improve</div>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm opacity-90">
                              <li>Answer the open questions below (if any)</li>
                              <li>Add edge cases and failure states</li>
                              <li>Specify integrations, data sources, and performance targets</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'epics' | 'tickets' | 'qa' | 'analytics' | 'export')}>
                      <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                        <TabsTrigger value="epics" className="text-xs">Epics</TabsTrigger>
                        <TabsTrigger value="tickets" className="text-xs">Tickets</TabsTrigger>
                        <TabsTrigger value="qa" className="text-xs">QA</TabsTrigger>
                        <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
                        <TabsTrigger value="export" className="text-xs">Export</TabsTrigger>
                      </TabsList>

                      {/* OVERVIEW */}
                      <TabsContent value="overview" className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Problem</div>
                          <p className="text-sm text-muted-foreground break-words">{plan.summary.problem}</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 min-w-0">
                            <div className="text-sm font-semibold">Target users</div>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                              {plan.summary.targetUsers.map((u, i) => (
                                <li key={i} className="break-words">{u}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-2 min-w-0">
                            <div className="text-sm font-semibold">Success metrics</div>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">

                              {plan.summary.successMetrics.map((m, i) => (
                                <li key={i} className="break-words">{m}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Goals</div>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                              {plan.summary.goals.map((g, i) => (
                                <li key={i} className="break-words">{g}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm font-semibold">Non-goals</div>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                              {plan.summary.nonGoals.map((g, i) => (
                                <li key={i} className="break-words">{g}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="text-sm font-semibold text-amber-900">Assumptions</div>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900/90">
                              {plan.meta.assumptions.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                            <div className="text-sm font-semibold text-sky-900">Open questions</div>
                            {plan.meta.openQuestions.length ? (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-sky-900/90">
                                {plan.meta.openQuestions.map((q, i) => (
                                  <li key={i}>{q}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-sm text-sky-900/80">None. The PRD was complete enough for a best-effort plan.</p>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      {/* EPICS */}
                      <TabsContent value="epics" className="mt-4 space-y-3">
                        {plan.epics.map((epic) => (
                          <Card key={epic.epicId} className="border bg-white/60">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-mono text-muted-foreground">{epic.epicId}</div>
                                  <div className="truncate text-sm font-semibold">{epic.title}</div>
                                  <p className="mt-1 text-sm text-muted-foreground">{epic.outcome}</p>
                                </div>
                                <Badge variant="outline" className="bg-white/70">
                                  {epic.tickets.length} tickets
                                </Badge>
                              </div>

                              <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3">
                                <div className="text-xs font-semibold text-orange-900">Edge cases</div>
                                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-orange-900/90">
                                  {epic.edgeCases.map((e, i) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </TabsContent>

                      {/* TICKETS */}
                      <TabsContent value="tickets" className="mt-4 space-y-3">
                        {plan.tickets.map((t) => {
                          const linearUrl = plan.exports.linear.find((l) => l.ticketId === t.ticketId)?.linearNewUrl
                          return (
                            <Card key={t.ticketId} className="border bg-white/60">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base">{typeEmoji(t.type)}</span>
                                      <span className="text-xs font-mono text-muted-foreground">{t.ticketId}</span>
                                      <Badge variant="outline" className={['border', priorityPill(t.priority)].join(' ')}>
                                        {t.priority}
                                      </Badge>
                                      <Badge variant="secondary" className="bg-white/70">
                                        {t.estimate}
                                      </Badge>
                                      <Badge variant="secondary" className="bg-white/70">
                                        {t.type}
                                      </Badge>
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">{t.title}</div>
                                    <div className="mt-1 text-sm italic text-muted-foreground">{t.userStory}</div>
                                  </div>
                                </div>

                                <p className="mt-3 text-sm text-muted-foreground">{t.description}</p>

                                <div className="mt-3">
                                  <div className="text-xs font-semibold text-muted-foreground">Acceptance criteria</div>
                                  <ul className="mt-1 space-y-1">
                                    {t.acceptanceCriteria.map((ac, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm">
                                        <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                                        <span>{ac}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="active:scale-[0.99] transition"
                                    onClick={() => copyToClipboard(ticketToMarkdown(t), `ticket:${t.ticketId}`)}
                                  >
                                    {copyId === `ticket:${t.ticketId}` ? (
                                      <>
                                        <Check className="mr-2 h-4 w-4" />
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copy Markdown
                                      </>
                                    )}
                                  </Button>

                                  <Button asChild size="sm" className="active:scale-[0.99] transition" disabled={!linearUrl}>
                                    <a href={linearUrl || '#'} target="_blank" rel="noreferrer">
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Create in Linear
                                    </a>
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </TabsContent>

                      {/* QA */}
                      <TabsContent value="qa" className="mt-4 space-y-3">
                        <Card className="border border-orange-200 bg-orange-50">
                          <CardContent className="p-4">
                            <div className="text-sm font-semibold text-orange-900">Epic edge cases</div>
                            <p className="mt-1 text-sm text-orange-900/90">Quick list to drive QA and negative testing.</p>
                            <div className="mt-3 space-y-2">
                              {plan.epics.map((e) => (
                                <div key={e.epicId} className="rounded-md border border-orange-200 bg-white/60 p-3">
                                  <div className="text-xs font-mono text-orange-900/80">{e.epicId}</div>
                                  <div className="text-sm font-semibold text-orange-900">{e.title}</div>
                                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-orange-900/90">
                                    {e.edgeCases.map((x, i) => (
                                      <li key={i}>{x}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border bg-white/60">
                          <CardContent className="p-4">
                            <div className="text-sm font-semibold">Ticket test cases</div>
                            <p className="mt-1 text-sm text-muted-foreground">Generated per ticket (happy path + error states).</p>
                            <div className="mt-3 space-y-2">
                              {plan.tickets.map((t) => (
                                <div key={t.ticketId} className="rounded-md border bg-white/70 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-mono text-muted-foreground">{t.ticketId}</div>
                                      <div className="truncate text-sm font-semibold">{t.title}</div>
                                    </div>
                                    <Badge variant="secondary" className="bg-white/70">
                                      {t.qa.testCases.length} cases
                                    </Badge>
                                  </div>
                                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                                    {t.qa.testCases.map((x, i) => (
                                      <li key={i}>{x}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* ANALYTICS */}
                      <TabsContent value="analytics" className="mt-4 space-y-3">
                        <Card className="border bg-white/60">
                          <CardContent className="p-4">
                            <div className="text-sm font-semibold">Analytics events</div>
                            <p className="mt-1 text-sm text-muted-foreground">Minimal tracking plan: event names + properties.</p>

                            <div className="mt-3 space-y-2">
                              {flattenedAnalytics.map((e, idx) => (
                                <div key={`${e.ticketId}:${e.name}:${idx}`} className="rounded-md border bg-white/70 p-3">
                                  <div className="text-xs font-mono text-muted-foreground">
                                    {e.ticketId} · {e.ticketTitle}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="bg-white/70">
                                      {e.name}
                                    </Badge>
                                    {e.properties.map((p, i) => (
                                      <Badge key={i} variant="secondary" className="bg-white/70">
                                        {p}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* EXPORT */}
                      <TabsContent value="export" className="mt-4 space-y-3">
                        <Card className="border bg-white/60">
                          <CardContent className="p-4 space-y-2">
                            <Button
                              variant="outline"
                              className="w-full active:scale-[0.99] transition bg-white/70"
                              onClick={() => copyToClipboard(JSON.stringify(plan, null, 2), 'json')}
                            >
                              {copyId === 'json' ? (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  Copied JSON
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy JSON
                                </>
                              )}
                            </Button>

                            <Button
                              variant="outline"
                              className="w-full active:scale-[0.99] transition bg-white/70"
                              onClick={() => copyToClipboard(plan.exports.markdown, 'markdown')}
                            >
                              {copyId === 'markdown' ? (
                                <>
                                  <Check className="mr-2 h-4 w-4" />
                                  Copied Markdown
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy Markdown
                                </>
                              )}
                            </Button>

                            <Separator />
                            <Button
  variant="outline"
  className="w-full active:scale-[0.99] transition bg-white/70"
  onClick={() => {
    const text = plan.exports.linear
      .map((l) => `${l.ticketId} - ${l.linearNewUrl}`)
      .join("\n")
    copyToClipboard(text, "linearLinks")
  }}
>
  {copyId === "linearLinks" ? (
    <>
      <Check className="mr-2 h-4 w-4" />
      Copied Linear links
    </>
  ) : (
    <>
      <Copy className="mr-2 h-4 w-4" />
      Copy all Linear links
    </>
  )}
</Button>

                            <div className="space-y-2">
                              <div className="text-sm font-semibold">Create tickets in Linear (bulk)</div>
                              <div className="text-xs text-muted-foreground">
                                Opens pre-filled issue drafts so you can create your backlog in minutes
                                </div>

                              <div className="space-y-1">
                                {plan.exports.linear.map((l) => (
                                  <a
                                    key={l.ticketId}
                                    href={l.linearNewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-sm text-blue-700 underline-offset-4 hover:underline"
                                  >
                                    {l.ticketId} · Create in Linear
                                  </a>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
