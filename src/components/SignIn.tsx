import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

/** The token, typed once. The server answers with a session cookie that lasts 30 days. */
export function SignIn() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    setBusy(false)
    if (res.ok) await navigate({ to: '/' })
    else setError('That is not the token of this memory.')
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-wash px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border-2 border-black bg-white p-8">
        <p className="font-display text-xl font-extrabold tracking-tight text-black">openmemfs</p>
        <h1 className="mt-6 text-3xl">
          Open your <span className="marker">memory</span>
        </h1>
        <p className="mt-2 text-sm text-ink-2">Type the access token this server was started with.</p>
        <label className="mt-6 block text-sm font-medium text-black" htmlFor="token">
          Token
        </label>
        <input
          id="token"
          type="password"
          autoComplete="current-password"
          autoFocus
          className="field mt-1.5 font-mono"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <button type="submit" className="btn btn-primary mt-6 w-full" disabled={busy || !token}>
          Sign in
        </button>
      </form>
    </main>
  )
}
