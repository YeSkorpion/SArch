import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../../components/Brand'
import { Button, Field, Input } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { User } from '../../lib/types'

export function LoginPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api<User>('/api/v1/auth/login', { method: 'POST', body: { email, password } }),
    onSuccess: async (user) => {
      client.setQueryData(['me'], user)
      await navigate('/projekte')
    },
  })

  return (
    <AuthCard title="Anmelden">
      <form className="grid gap-4" onSubmit={(event) => submit(event, () => login.mutate())}>
        <Field label="E-Mail">
          <Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Passwort">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {login.isError ? <p role="alert" className="text-sm text-danger">{errorText(login.error)}</p> : null}
        <Button type="submit" variant="primary" disabled={login.isPending}>Anmelden</Button>
      </form>
      <p className="text-sm text-muted">
        Noch kein Konto? <Link className="underline" to="/registrieren">Registrieren</Link>
      </p>
    </AuthCard>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const register = useMutation({
    mutationFn: async () => {
      await api('/api/v1/auth/register', { method: 'POST', body: { displayName, email, password } })
      return api<User>('/api/v1/auth/login', { method: 'POST', body: { email, password } })
    },
    onSuccess: async (user) => {
      client.setQueryData(['me'], user)
      await navigate('/projekte')
    },
  })

  return (
    <AuthCard title="Konto anlegen" subtitle="Mindestens 12 Zeichen, Groß- und Kleinbuchstaben, Ziffer und Sonderzeichen.">
      <form className="grid gap-4" onSubmit={(event) => submit(event, () => register.mutate())}>
        <Field label="Name">
          <Input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <Field label="E-Mail">
          <Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Passwort">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {register.isError ? <p role="alert" className="text-sm text-danger">{errorText(register.error)}</p> : null}
        <Button type="submit" variant="primary" disabled={register.isPending}>Registrieren</Button>
      </form>
      <p className="text-sm text-muted">
        Bereits ein Konto? <Link className="underline" to="/anmelden">Anmelden</Link>
      </p>
    </AuthCard>
  )
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4">
      <div>
        <Brand />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <section className="grid gap-4 rounded-xl border border-line bg-card p-5">{children}</section>
    </main>
  )
}

function submit(event: FormEvent, action: () => void) {
  event.preventDefault()
  action()
}
